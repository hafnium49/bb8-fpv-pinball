const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5175 } });
  await server.listen();
  let browser;
  const errors = [], screenshots = [], out = 'artifacts/elevated-circuit';
  mkdirSync(out, { recursive: true });
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${server.resolvedUrls.local[0]}spikes/elevated-circuit/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.spikeDebug, undefined, { timeout: 60000 });
    const sampleTimes = await page.evaluate(() => {
      const d = window.spikeDebug, find = s => d.trace.reduce((a, b) => Math.abs(a.s - s) < Math.abs(b.s - s) ? a : b).t;
      return { climb: find(5), bridge: find((d.bridgeStartS + d.bridgeEndS) / 2), tunnel: find((d.tunnelStartS + d.tunnelEndS) / 2), exit: d.trace.at(-1).t };
    });
    const geometry = await page.evaluate(() => window.spikeDebug.measureGeometry());
    for (const [name, mode, time] of [['desktop-table', 'table', sampleTimes.bridge], ['desktop-climb-fpv', 'fpv', sampleTimes.climb], ['desktop-bridge-fpv', 'fpv', sampleTimes.bridge], ['desktop-tunnel-fpv', 'fpv', sampleTimes.tunnel]]) {
      await page.evaluate(({ time, mode }) => window.spikeDebug.renderAt(time, mode), { time, mode });
      await page.screenshot({ path: `${out}/${name}.png` }); screenshots.push(`${name}.png`);
    }
    await page.setViewportSize({ width: 844, height: 390 });
    for (const [name, mode] of [['mobile-table', 'table'], ['mobile-tunnel-fpv', 'fpv']]) {
      await page.evaluate(({ time, mode }) => window.spikeDebug.renderAt(time, mode), { time: mode === 'table' ? sampleTimes.bridge : sampleTimes.tunnel, mode });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `${out}/${name}.png` }); screenshots.push(`${name}.png`);
    }
    await page.locator('[data-mode="chase"]').click();
    assert.equal(await page.locator('[data-mode="chase"]').getAttribute('aria-pressed'), 'true');
    const roll = await page.evaluate(() => Math.abs(window.spikeDebug.camera.matrixWorld.elements[1]));
    assert.ok(roll < 1e-8); assert.deepEqual(errors, []);
    const report = { result: 'pass', scope: 'isolated replay preview, desktop and mobile landscape; no production input/lifecycle changes', sampleTimes, geometry, browserErrors: errors, screenshots, renderer: 'Chromium software WebGL, not hardware FPS validation' };
    writeFileSync(`${out}/browser.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally { if (browser) await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
