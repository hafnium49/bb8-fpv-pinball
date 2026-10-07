const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
let server, browser;
const out = 'artifacts/pivot';

(async () => {
  mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5179, watch: { ignored: () => true }, hmr: false } });
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')] });
  const errors = [], cases = [], screenshots = [];
  for (const [name, options, search] of [
    ['desktop-classic', { viewport: { width: 1440, height: 900 } }, ''],
    ['mobile-circuit', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, '?circuit=1'],
  ]) {
    const context = await browser.newContext(options), page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(server.resolvedUrls.local[0] + search, { waitUntil: 'networkidle' });
    await page.locator('#start:not([disabled])').waitFor();
    const activate = locator => options.hasTouch ? locator.tap() : locator.click();
    await activate(page.locator('#start'));
    // Keep the real rAF simulation and input handlers. Avoid slow software-GPU
    // frames during physics arrivals; restore actual rendering for captures.
    await page.evaluate(() => { const view = window.orbitDebug.view; window.restoreGuideRender = view.render.bind(view); view.render = () => {}; });
    const launch = await page.locator('#launch').boundingBox();
    let cdp;
    await page.evaluate(() => window.orbitDebug.sim.start());
    if (options.hasTouch) {
      cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: launch.x + launch.width / 2, y: launch.y + launch.height / 2, id: 1 }] });
    } else await page.keyboard.down('Space');
    await page.waitForFunction(() => window.orbitDebug.sim.charge > .65);
    if (options.hasTouch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.keyboard.up('Space');
    await page.waitForFunction(() => window.orbitDebug.sim.phase === 'playing' && window.orbitDebug.sim.position.x < 4.3);
    const laneExit = await page.evaluate(() => ({ phase: window.orbitDebug.sim.phase, position: window.orbitDebug.sim.position }));
    const arrivals = [];
    for (const input of [
      { name: 'left hinge', x: -2.7, z: 6.5, vx: -1.5, vz: .5 },
      { name: 'right hinge', x: 2.7, z: 6.5, vx: 1.5, vz: .5 },
      { name: 'left lower guide head', x: -5, z: 7, vx: -.8, vz: 3 },
      { name: 'right lower guide head', x: 4.13, z: 7, vx: .8, vz: 3 },
      { name: 'right upper guide / ramp heel', x: 4, z: 3.5, vx: .8, vz: 3 },
    ]) {
      console.log(`${name}: checking ${input.name}`);
      await page.evaluate(input => {
        const { sim, view } = window.orbitDebug; sim.start();
        for (let i = 0; i < 30; i++) sim.step();
        sim.launch(.5); sim.step(); sim.events.length = 0; view.resetEffects();
        sim.ball.setTranslation({ x: input.x, y: .305, z: input.z }, true);
        sim.ball.setLinvel({ x: input.vx, y: 0, z: input.vz }, true);
        sim.ball.setAngvel({ x: -30, y: 0, z: 0 }, true);
        window.guideArrivalBegan = sim.time;
      }, input);
      await page.waitForFunction(startZ => {
        const sim = window.orbitDebug.sim, p = sim.position;
        return sim.phase !== 'playing' || Math.abs(p.x) < 2.25 || p.z > 10.25 || p.z < startZ - 2;
      }, input.z, { timeout: 15000 }).catch(async error => {
        console.error('Guide arrival failure:', { name, input, state: await page.evaluate(() => {
          const sim = window.orbitDebug.sim;
          return { elapsed: sim.time - window.guideArrivalBegan, position: sim.position, velocity: sim.velocity,
            phase: sim.phase, paused: sim.paused, controls: sim.controls };
        }) });
        throw error;
      });
      const result = await page.evaluate(() => {
        const sim = window.orbitDebug.sim;
        return { duration: sim.time - window.guideArrivalBegan, position: sim.position, phase: sim.phase, completions: sim.route.completions };
      });
      assert.ok(result.duration < 12, JSON.stringify({ input, result }));
      assert.equal(result.completions, 0, 'Ground arrivals must not award an elevated circuit');
      arrivals.push({ input, ...result, result: 'cleared' });
    }
    await page.evaluate(() => {
      const { sim, view } = window.orbitDebug; sim.start(); sim.launch(.5);
      sim.ball.setTranslation({ x: 2.7, y: .305, z: 6.5 }, true);
      sim.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
      sim.paused = true; view.resetEffects(); view.render = window.restoreGuideRender;
    });
    await activate(page.locator('[data-camera="table"]'));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const fit = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      height: innerHeight, scrollHeight: document.documentElement.scrollHeight,
      quality: window.orbitDebug.view.highQuality, drawCalls: window.orbitDebug.view.renderer.info.render.calls }));
    assert.ok(fit.scrollWidth <= fit.width && fit.scrollHeight <= fit.height, JSON.stringify(fit));
    assert.ok(fit.drawCalls > 0);
    await page.screenshot({ path: `${out}/${name}-guide-table.png`, timeout: 90000 });
    screenshots.push(`${name}-guide-table.png`);
    await activate(page.locator('[data-camera="chase"]'));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `${out}/${name}-guide-hinge.png`, timeout: 90000 });
    screenshots.push(`${name}-guide-hinge.png`);
    cases.push({ name, result: 'pass', laneExit, arrivals, fit });
    await page.evaluate(() => { window.orbitDebug.view.render = () => {}; });
    console.log(`${name}: real input launch exit and all five ground arrivals pass; screenshots captured`);
    // Keep contexts alive until browser.close() for single-process Chromium.
  }
  assert.deepEqual(errors, []);
  const report = { result: 'pass', cases, screenshots, browserErrors: errors,
    limitations: ['Ground arrivals are seeded in the live app; input-only launch is checked separately.',
      'Physics/input run through the live animation loop with drawing suppressed between screenshot frames; this is not a frame-rate benchmark.',
      'Mobile viewport/touch emulation uses Chromium; physical iPhone Safari and human shot timing are unverified.'] };
  writeFileSync(`${out}/browser.json`, JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) await server.close();
});
