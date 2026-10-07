const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

let browser, server, page;
const rendered = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
(async () => {
  const output = path.resolve('artifacts'); fs.mkdirSync(output, { recursive: true });
  let url = process.env.GAME_URL;
  if (!url) {
    const { createServer } = await import('vite');
    server = await createServer({ server: { host: '127.0.0.1', port: 5173, watch: { ignored: () => true }, hmr: false } });
    await server.listen();
    url = server.resolvedUrls.local[0];
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')] });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', e => { errors.push(e.message); console.error('Page error:', e.message); });
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.error('Browser error:', m.text()); } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#start:not([disabled])').waitFor({ timeout: 60000 });
  await rendered(page);
  await page.screenshot({ path: path.join(output, 'desktop-intro.png') });
  await page.evaluate(() => { window.orbitDebug.headLoss.draw = () => 1; });
  await page.locator('#start').click();
  assert.equal(await page.evaluate(() => window.orbitDebug.sim.phase), 'ready');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.orbitDebug.sim.charge > 0, undefined, { timeout: 15000 });
  await page.waitForTimeout(400); await page.keyboard.up('Space');
  await page.waitForFunction(() => window.orbitDebug.sim.phase === 'playing');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(output, 'desktop-fpv.png') });
  const up = await page.evaluate(() => { const e = window.orbitDebug.view.camera.matrixWorld.elements; return [e[4], e[5], e[6]]; });
  assert.ok(Math.abs(up[0]) < 0.02 && up[1] > 0.98, 'FPV horizon is not stable');
  await page.keyboard.down('KeyA'); await page.keyboard.down('KeyD'); await page.waitForTimeout(140);
  assert.deepEqual(await page.evaluate(() => [window.orbitDebug.sim.controls.left, window.orbitDebug.sim.controls.right]), [true, true]);
  await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#modal').isVisible(), true);
  const pausePosition = await page.evaluate(() => window.orbitDebug.sim.position);
  await page.waitForTimeout(100); assert.deepEqual(await page.evaluate(() => window.orbitDebug.sim.position), pausePosition);
  await page.locator('#restart').click();
  assert.equal(await page.locator('[data-camera], #camera-controls').count(), 0);
  await rendered(page);
  await page.screenshot({ path: path.join(output, 'desktop-fpv-ready.png') });
  assert.equal(await page.evaluate(() => window.orbitDebug.view.mode), 'fpv');
  const highCalls = await page.evaluate(() => window.orbitDebug.view.renderer.info.render.calls);
  assert.equal(await page.locator('#quality').textContent(), 'FX HIGH');
  await page.locator('#quality').click(); await rendered(page);
  assert.equal(await page.evaluate(() => window.orbitDebug.view.highQuality), false);
  assert.equal(await page.evaluate(() => window.orbitDebug.view.renderer.shadowMap.enabled), false);
  assert.ok(await page.evaluate(() => window.orbitDebug.view.renderer.info.render.calls) < highCalls, 'Eco did not reduce render passes');
  await page.screenshot({ path: path.join(output, 'desktop-eco.png') });
  await page.locator('#quality').click(); await rendered(page);
  // Use a real bumper collision, then hold the simulation to inspect the resulting effects.
  await page.evaluate(() => {
    const s = window.orbitDebug.sim; s.launch(0.5);
    s.ball.setTranslation({ x: -1.8, y: 0.305, z: -6.4 }, true);
    s.ball.setLinvel({ x: 9, y: 0, z: 0 }, true); s.events.length = 0;
    for (let i = 0; i < 18; i++) s.step(); s.paused = true;
  });
  await rendered(page);
  assert.equal(await page.evaluate(() => window.orbitDebug.sim.score), 100);
  assert.ok(await page.evaluate(() => window.orbitDebug.view.effects.group.children.some(o => o.type === 'Sprite' && o.visible)), 'Collision score effect was not rendered');
  await page.evaluate(() => { const { sim, view } = window.orbitDebug; view.effects.update(0.18, sim.position, 0, false); });
  await rendered(page);
  await page.screenshot({ path: path.join(output, 'desktop-impact.png') });
  await page.evaluate(() => { window.orbitDebug.sim.controls.left = true; window.dispatchEvent(new Event('blur')); });
  assert.equal(await page.locator('#modal').isVisible(), true);
  assert.equal(await page.evaluate(() => window.orbitDebug.sim.controls.left), false, 'Blur left a flipper held');
  await page.locator('#restart').click(); await rendered(page);
  assert.equal(await page.evaluate(() => window.orbitDebug.view.effects.group.children.some(o => o.type === 'Sprite' && o.visible)), false, 'New game retained old impact effects');
  const environment = await page.evaluate(() => window.orbitDebug.view.scene.environment.uuid);
  await page.evaluate(() => {
    const debug = window.orbitDebug;
    debug.recoveryExtension = debug.view.renderer.getContext().getExtension('WEBGL_lose_context');
    debug.recoveryExtension.loseContext();
  });
  await page.locator('#modal').waitFor({ state: 'visible' });
  await page.evaluate(() => window.orbitDebug.recoveryExtension.restoreContext());
  await page.waitForFunction(old => window.orbitDebug.view.scene.environment.uuid !== old, environment, { timeout: 60000 });
  await page.locator('#resume').click(); await rendered(page);
  assert.equal(await page.evaluate(() => window.orbitDebug.sim.paused), false, 'Graphics recovery did not resume');
  await page.evaluate(() => window.orbitDebug.sim.ball.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true));
  await page.waitForFunction(() => window.orbitDebug.view.camera.matrixWorld.elements[5] > 0.98);
  const stabilized = await page.evaluate(() => window.orbitDebug.view.camera.matrixWorld.elements[5]);
  assert.ok(stabilized > 0.98, 'ball rotation leaked into stabilized FPV');
  for (const key of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) await page.keyboard.press(key);
  assert.equal(await page.evaluate(() => window.orbitDebug.view.mode), 'fpv');
  await page.evaluate(() => { const s = window.orbitDebug.sim; s.launch(0.5); s.balls = 1; s.score = 350; s.ball.setTranslation({ x: 0, y: 0.4, z: 11.6 }, true); });
  await page.waitForFunction(() => window.orbitDebug.sim.phase === 'over');
  assert.equal(await page.locator('#modal-title').textContent(), '00350');
  assert.equal(await page.locator('#best-score').textContent(), '00350');
  await page.locator('#restart').click();
  await page.waitForFunction(() => document.querySelector('#score').textContent === '00000');
  assert.equal(await page.locator('#score').textContent(), '00000');
  assert.ok(await page.evaluate(() => window.orbitDebug.view.renderer.info.render.calls > 20), '3D scene was not rendered');

  const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const phone = await mobile.newPage(); phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(url, { waitUntil: 'networkidle' });
  await phone.locator('#start:not([disabled])').waitFor({ timeout: 60000 }); await phone.locator('#start').tap();
  assert.equal(await phone.locator('#quality').textContent(), 'FX ECO', 'Touch device did not default to Eco');
  assert.equal(await phone.locator('[data-camera], #camera-controls').count(), 0);
  await rendered(phone);
  const left = await phone.locator('#left').boundingBox(), right = await phone.locator('#right').boundingBox();
  const cdp = await mobile.newCDPSession(phone);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { x: left.x + left.width / 2, y: left.y + left.height / 2, id: 1 },
    { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 2 },
  ] });
  await phone.waitForTimeout(100);
  assert.deepEqual(await phone.evaluate(() => [window.orbitDebug.sim.controls.left, window.orbitDebug.sim.controls.right]), [true, true]);
  await phone.screenshot({ path: path.join(output, 'mobile-landscape.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await phone.evaluate(() => [window.orbitDebug.sim.controls.left, window.orbitDebug.sim.controls.right]), [false, false]);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.setViewportSize({ width: 390, height: 844 }); await phone.waitForTimeout(100);
  await rendered(phone);
  await phone.screenshot({ path: path.join(output, 'mobile-portrait.png') });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, [], 'browser errors occurred');
  await phone.emulateMedia({ reducedMotion: 'reduce' }); await phone.reload({ waitUntil: 'networkidle' });
  await phone.locator('#start:not([disabled])').waitFor({ timeout: 60000 });
  assert.equal(await phone.evaluate(() => window.orbitDebug.view.effects.reducedMotion), true);
  await phone.evaluate(() => window.orbitDebug.view.effects.hit(0, -6.4, 0xffad55, 100));
  assert.equal(await phone.evaluate(() => window.orbitDebug.view.effects.group.children.some(o => o.type === 'Sprite' && o.visible)), false);
  const report = { result: 'pass', checks: ['boot', 'real keyboard launch', 'simultaneous keyboard flippers', 'pause freezes physics', 'blur releases controls and pauses', 'FPV-only player camera and removed number-key shortcuts', 'FPV independent of ball rotation', 'game-over/restart/high score', 'rendered WebGL scene', 'High/Eco rendering and lower Eco draw calls', 'real bumper collision produces impact effects', 'restart clears effects', 'WebGL context recovery rebuilds reflections', 'touch defaults to Eco', 'simultaneous touch flippers', 'mobile landscape and portrait resize', 'reduced-motion suppresses impact animations'], browserErrors: errors, screenshots: ['desktop-intro.png', 'desktop-fpv.png', 'desktop-fpv-ready.png', 'desktop-eco.png', 'desktop-impact.png', 'mobile-landscape.png', 'mobile-portrait.png'] };
  fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(async error => {
  console.error(error); process.exitCode = 1;
  if (page && !page.isClosed()) {
    console.error('Failure state:', await page.evaluate(() => {
      const s = window.orbitDebug?.sim;
      return { phase: s?.phase, paused: s?.paused, controls: s?.controls, charge: s?.charge, time: s?.time, visibility: document.visibilityState };
    }).catch(() => 'unavailable'));
    await page.screenshot({ path: 'artifacts/browser-failure.png' }).catch(() => {});
  }
}).finally(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});
