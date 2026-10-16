// Copy spikes/fidelity unchanged into a separate old-main checkout and serve
// both checkouts. Never substitute a production material toggle for old main.
'use strict';
const { mkdirSync, writeFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const { readConfig, buildMatrix, caseUrl } = require('./matrix.cjs');

async function run() {
  const config = readConfig(process.env), cases = buildMatrix(config);
  const planned = cases.map(entry => ({ ...entry, url: caseUrl(config, entry) }));
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify({ config, measurements: planned.length, cases: planned }, null, 2)); return;
  }
  const { chromium } = require('playwright');
  const root = path.resolve(__dirname, '../..');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.resolve(process.env.FIDELITY_OUT || path.join(root, 'artifacts/fidelity', runId));
  if (existsSync(path.join(out, 'manifest.json'))) throw new Error(`Refusing to overwrite an existing run: ${out}`);
  mkdirSync(out, { recursive: true });
  const manifest = { schemaVersion: 2, runId, startedAt: new Date().toISOString(), status: 'running', config,
    expectedMeasurements: planned.length, completedMeasurements: 0,
    provenance: 'Commit labels are supplied by the operator. Verify each server checkout and copy the identical harness before running.',
    workload: 'Static paused reference-course poses. No input latency, GPU timer, live-physics or audio measurement.',
    comparisons: ['main baseline vs PR baseline: wall/material integration', 'PR baseline vs baked: contact approximation', 'PR baked vs roughness: glaze roughness'],
    cases: planned };
  const rows = [];
  const save = () => {
    manifest.completedMeasurements = rows.length;
    writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(path.join(out, 'results.json'), JSON.stringify(rows, null, 2));
  };
  save();
  let browser;
  try {
    const software = config.requestedRenderer === 'software';
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
      args: software ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
    manifest.browserVersion = browser.version(); save();
    const fixedStates = new Map();
    for (const entry of planned) {
      const page = await browser.newPage({
        viewport: entry.viewport === 'mobile' ? { width: 844, height: 520 } : { width: 1000, height: 760 },
        deviceScaleFactor: config.deviceScaleFactor, reducedMotion: 'reduce',
      });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        const response = await page.goto(entry.url, { waitUntil: 'load', timeout: 120000 });
        if (!response?.ok()) throw new Error(`Harness HTTP status: ${response?.status()}`);
        const waitForStatus = status => page.waitForFunction(expected => {
          const current = document.querySelector('#report')?.getAttribute('data-status');
          return current === expected || current === 'error';
        }, status, { timeout: 120000 });
        const readReport = async () => {
          const result = JSON.parse(await page.locator('#report').innerText());
          if (result.status === 'error') throw new Error(result.error);
          return result;
        };
        await waitForStatus('ready');
        const ready = await readReport();
        for (const key of ['source', 'variant', 'pose', 'quality']) if (ready[key] !== entry[key]) throw new Error(`Harness ${key} did not match request.`);
        if (ready.viewportName !== entry.viewport || ready.dpr !== config.deviceScaleFactor ||
            ready.highQuality !== (entry.quality === 'high') || ready.adaptiveResolution !== false || ready.reducedMotion !== true) {
          throw new Error('Requested viewport, quality, DPR, reduced-motion or fixed-resolution setting did not take effect.');
        }
        const expectedViewport = entry.viewport === 'mobile' ? [844, 390] : [960, 540];
        if (JSON.stringify(ready.viewport) !== JSON.stringify(expectedViewport)) throw new Error('Unexpected stage dimensions.');
        if (config.requestedRenderer === 'hardware' && ready.softwareRendererDetected) throw new Error('Hardware was requested but the browser reports a software renderer.');
        const commit = entry.source === 'main' ? config.baselineCommit : config.prCommit;
        if (ready.commitLabel !== commit || ready.schemaVersion !== 2) throw new Error('Wrong harness version or commit label. Copy the same harness to both checkouts.');
        const key = `${entry.viewport}-${entry.quality}-${entry.pose}`;
        const state = JSON.stringify(ready.fixedState);
        if (fixedStates.has(key) && fixedStates.get(key) !== state) throw new Error(`Non-comparable camera/simulation/buffer state: ${key}`);
        fixedStates.set(key, state);
        if (entry.repeat === 0) await page.locator('#stage').screenshot({ path: path.join(out, `${key}-${entry.source}-${entry.variant}.png`) });
        await page.locator('#run').click();
        await waitForStatus('complete');
        const result = await readReport();
        if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
        if (JSON.stringify(result.fixedState) !== state) throw new Error('Fixed state changed between readiness and measurement.');
        rows.push({ ...result, repeat: entry.repeat, order: entry.order, orderIndex: entry.orderIndex,
          requestedRenderer: config.requestedRenderer, errors });
        save(); console.log(`${rows.length}/${planned.length}: ${key} ${entry.source}/${entry.variant} ${entry.order}`);
      } catch (error) {
        manifest.failedCase = entry; throw error;
      } finally { await page.close(); }
    }
    manifest.status = 'complete'; manifest.finishedAt = new Date().toISOString(); save();
    console.log(`Saved ${rows.length} measurements to ${out}`);
  } catch (error) {
    manifest.status = 'failed'; manifest.error = error instanceof Error ? error.message : String(error);
    manifest.finishedAt = new Date().toISOString(); save(); throw error;
  } finally { await browser?.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
