const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');

let browser, server;
const out = 'artifacts/circuit';
const rendered = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const launchOptions = { headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')] };

(async () => {
  mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5177, watch: { ignored: () => true }, hmr: false } }); await server.listen();
  browser = await chromium.launch(launchOptions);
  const errors = [], screenshots = [], checks = [], metrics = {};
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const monitor = p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  };
  monitor(page);
  const url = server.resolvedUrls.local[0] + '?circuit=1';
  const boot = async p => { await p.goto(url, { waitUntil: 'networkidle' }); await p.locator('#start:not([disabled])').waitFor({ timeout: 60000 }); };
  const capture = async (p, name) => { await rendered(p); await p.screenshot({ path: `${out}/${name}.png`, timeout: 60000 }); screenshots.push(`${name}.png`); console.log(`Captured ${name}`); };
  const introFits = async p => {
    const layout = await p.evaluate(() => ({ width: innerWidth, height: innerHeight, buttons: ['start', 'table-variant', 'show-controls'].map(id => {
      const r = document.getElementById(id).getBoundingClientRect(); return { id, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }) }));
    for (const b of layout.buttons) assert.ok(b.width > 0 && b.height > 0 && b.top >= 0 && b.bottom <= layout.height - 4 && b.left >= 0 && b.right <= layout.width, `Opening control clipped: ${JSON.stringify(b)}`);
    return layout;
  };
  // Focused rerun after a CSS change; keeps the full gameplay report intact.
  if (process.env.CIRCUIT_MOBILE_LAYOUT_ONLY === '1') {
    const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const phone = await mobile.newPage(); monitor(phone); await boot(phone);
    const layouts = [await introFits(phone)]; await capture(phone, 'mobile-intro');
    await phone.setViewportSize({ width: 390, height: 844 }); await rendered(phone); layouts.push(await introFits(phone));
    await capture(phone, 'mobile-intro-portrait'); assert.deepEqual(errors, []);
    const report = { result: 'pass', scope: 'opening controls fit after landscape CSS correction', layouts, browserErrors: errors };
    writeFileSync(`${out}/mobile-layout.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); return;
  }
  await boot(page);
  assert.equal(await page.evaluate(() => window.orbitDebug.sim.circuitEnabled), true);
  await capture(page, 'desktop-intro');
  await page.locator('#start').click();
  await page.keyboard.down('Space'); await page.waitForFunction(() => window.orbitDebug.sim.charge > 0.1);
  await page.keyboard.up('Space'); await page.waitForFunction(() => window.orbitDebug.sim.phase === 'playing');
  await page.keyboard.down('KeyA'); await page.keyboard.down('KeyD');
  assert.deepEqual(await page.evaluate(() => [window.orbitDebug.sim.controls.left, window.orbitDebug.sim.controls.right]), [true, true]);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.locator('#modal').isVisible(), true);
  assert.deepEqual(await page.evaluate(() => [window.orbitDebug.sim.controls.left, window.orbitDebug.sim.controls.right]), [false, false]);
  const frozen = await page.evaluate(() => window.orbitDebug.sim.position);
  await rendered(page); assert.deepEqual(await page.evaluate(() => window.orbitDebug.sim.position), frozen);
  await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD');
  await page.locator('#restart').click();
  checks.push('normal keyboard launch; simultaneous flippers; blur clears input; pause freezes physics');

  const groundProbes = async p => p.evaluate(async () => {
    const { groundTrial } = await import('/scripts/circuit-harness.ts');
    const { sim, view } = window.orbitDebug; view.resetEffects();
    const reports = [
      { start: { x: 2.8, y: 0.31, z: 1.8 }, velocity: { x: 2, y: 0, z: 0.5 }, spin: { x: 0, y: 0, z: 0 } },
      { start: { x: -2.8, y: 0.31, z: -2.4 }, velocity: { x: 0, y: 0, z: 0.5 }, spin: { x: -30, y: 0, z: 0 } },
    ].map(input => groundTrial(sim, input));
    sim.paused = true; return reports;
  });
  metrics.groundApproaches = await groundProbes(page);
  for (const r of metrics.groundApproaches) { assert.equal(r.outcome, 'cleared', JSON.stringify(r)); assert.equal(r.awards, 0); }
  checks.push('real ground approaches clear both low-ramp deflectors without recovery forces or elevated awards');

  // Advance an actual free-physics entry to a section, then freeze it for a
  // screenshot. This is a contact test, distinct from the input-only launch QA.
  const stage = async (p, s, mode) => {
    await p.evaluate(async s => {
      const { frames, localPoint } = await import('/src/physics/route-geometry.ts');
      const { sim, view } = window.orbitDebug; sim.start(); sim.launch(0.5); view.resetEffects();
      const f = frames[0], p = localPoint(f, 0, 0);
      sim.ball.setTranslation({ x: p.x - f.tangent.x * 0.4, y: p.y, z: p.z - f.tangent.z * 0.4 }, true);
      sim.ball.setLinvel({ x: f.tangent.x * 20, y: 0, z: f.tangent.z * 20 }, true); sim.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      for (let i = 0; i < 2400; i++) { sim.step(); view.routeCamera.update(sim, 1 / 120, view.effects.reducedMotion); sim.events.length = 0; if (sim.route.active && sim.route.projection.s >= s) break; }
      if (!sim.route.active) throw new Error('Physical shot did not reach requested stage');
      sim.paused = true;
    }, s);
    await p.locator(`[data-camera="${mode}"]`).click(); await rendered(p);
    return p.evaluate(() => {
      const { sim, view } = window.orbitDebug, m = view.camera.matrixWorld.elements;
      return { position: sim.position, phase: sim.route.phase, s: sim.route.projection.s, roll: Math.abs(m[1]), pitchDegrees: Math.asin(-m[9]) * 180 / Math.PI, calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles };
    });
  };
  metrics.desktopTable = await stage(page, 12, 'table'); await capture(page, 'desktop-table');
  await page.locator('#quality').click(); await rendered(page);
  const measured = await page.evaluate(() => {
    const { view } = window.orbitDebug, circuit = view.scene.getObjectByName('Elevated circuit');
    const withRoute = { ...view.renderer.info.render }; circuit.visible = false; view.render(window.orbitDebug.sim, 0);
    const withoutRoute = { ...view.renderer.info.render }; circuit.visible = true; view.render(window.orbitDebug.sim, 0);
    return { withRoute, withoutRoute, addedCalls: withRoute.calls - withoutRoute.calls, addedTriangles: withRoute.triangles - withoutRoute.triangles };
  });
  assert.ok(measured.addedCalls > 0 && measured.addedCalls <= 25, JSON.stringify(measured)); metrics.ecoGeometry = measured;
  for (const [name, s] of [['desktop-climb-fpv', 5], ['desktop-bridge-fpv', 12], ['desktop-tunnel-fpv', 21], ['desktop-return-fpv', 26.2]]) {
    const result = await stage(page, s, 'fpv'); assert.ok(result.roll < 1e-6); assert.ok(Math.abs(result.pitchDegrees) <= 18.001); metrics[name] = result; await capture(page, name);
  }
  metrics.desktopChase = await stage(page, 21, 'chase'); assert.ok(metrics.desktopChase.roll < 1e-6); await capture(page, 'desktop-tunnel-chase');
  await page.evaluate(() => window.orbitDebug.sim.ball.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true));
  await page.locator('[data-camera="spin"]').click(); await rendered(page);
  assert.ok(Math.abs(await page.evaluate(() => window.orbitDebug.view.camera.matrixWorld.elements[5])) < 0.1);
  await page.locator('[data-camera="fpv"]').click(); await rendered(page);
  assert.ok(await page.evaluate(() => window.orbitDebug.view.camera.matrixWorld.elements[5] > 0.95));
  checks.push('actual ramp/bridge/tunnel/return contacts shown in FPV, Table, Chase and Spin; zero FPV/Chase roll; no spin leakage');

  // Run the same input-only launch completion in the browser's Rapier build.
  const launch = await page.evaluate(async () => {
    const { launchTrial } = await import('/scripts/circuit-harness.ts');
    const { sim, view } = window.orbitDebug; view.resetEffects(); const result = launchTrial(sim, 0.7, 6.3); sim.paused = true; return result;
  });
  assert.ok(launch.leftContact && launch.rightReturn && launch.awards === 1); metrics.inputOnlyLaunch = launch;
  await rendered(page); assert.equal(await page.locator('#score').textContent(), String(launch.score).padStart(5, '0'));
  await stage(page, 26.6, 'table');
  const actualAward = await page.evaluate(() => {
    const { sim } = window.orbitDebug; sim.paused = false;
    for (let i = 0; i < 120; i++) { sim.events.length = 0; sim.step(); const award = sim.events.find(e => e.type === 'circuit'); if (award) { sim.paused = true; return award.points; } }
    throw new Error('Final gate did not emit a circuit award');
  });
  assert.equal(actualAward, 750); await rendered(page);
  assert.equal(await page.locator('#toast').textContent(), 'CIRCUIT +750 · RIGHT FLIPPER NEXT');
  assert.equal(await page.locator('#score').textContent(), '00750');
  checks.push('browser input-only launch-to-left-flipper-to-circuit-to-moving-right-flipper; +750 score/toast');

  await page.evaluate(() => {
    const { sim } = window.orbitDebug; sim.start();
    for (let i = 0; i < 3; i++) { sim.launch(0.5); sim.ball.setTranslation({ x: 0, y: 0.4, z: 11.6 }, true); sim.step(); for (let n = 0; n < 120; n++) sim.step(); }
  });
  await page.waitForFunction(() => window.orbitDebug.sim.phase === 'over' && !document.querySelector('#modal').hidden);
  await page.locator('#restart').click();
  assert.deepEqual(await page.evaluate(() => [window.orbitDebug.sim.balls, window.orbitDebug.sim.route.completions, window.orbitDebug.sim.score]), [3, 0, 0]);
  const before = await page.evaluate(() => ({ ...window.orbitDebug.view.renderer.info.memory }));
  for (let i = 0; i < 4; i++) { await page.evaluate(() => { window.orbitDebug.sim.start(); window.orbitDebug.view.resetEffects(); }); await rendered(page); }
  const after = await page.evaluate(() => ({ ...window.orbitDebug.view.renderer.info.memory }));
  assert.deepEqual(after, before); metrics.resources = { restarts: 4, before, after };
  await page.evaluate(() => { const ext = window.orbitDebug.view.renderer.getContext().getExtension('WEBGL_lose_context'); if (!ext) throw new Error('Context-loss extension missing'); ext.loseContext(); setTimeout(() => ext.restoreContext(), 150); });
  await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Graphics restored'), undefined, { timeout: 30000 });
  await rendered(page); checks.push('three-ball lifecycle; restart resets route and pooled effects; stable resources over four restarts; WebGL recovery');

  const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const phone = await mobile.newPage(); monitor(phone); await boot(phone);
  assert.equal(await phone.locator('#quality').textContent(), 'FX ECO');
  metrics.mobileIntroLayout = await introFits(phone);
  await capture(phone, 'mobile-intro'); await phone.locator('#start').tap();
  metrics.mobileTable = await stage(phone, 12, 'table'); await capture(phone, 'mobile-table');
  metrics.mobileTunnel = await stage(phone, 21, 'fpv'); await capture(phone, 'mobile-tunnel-fpv');
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.evaluate(() => { window.orbitDebug.sim.start(); window.orbitDebug.view.resetEffects(); });
  const left = await phone.locator('#left').boundingBox(), right = await phone.locator('#right').boundingBox();
  const cdp = await mobile.newCDPSession(phone);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: left.x + left.width / 2, y: left.y + left.height / 2, id: 1 }, { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 2 }] });
  assert.deepEqual(await phone.evaluate(() => [window.orbitDebug.sim.controls.left, window.orbitDebug.sim.controls.right]), [true, true]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await phone.evaluate(() => [window.orbitDebug.sim.controls.left, window.orbitDebug.sim.controls.right]), [false, false]);
  await phone.emulateMedia({ reducedMotion: 'reduce' }); await boot(phone); await phone.locator('#start').tap();
  metrics.reducedMotion = await stage(phone, 5, 'fpv'); assert.ok(Math.abs(metrics.reducedMotion.pitchDegrees) <= 8.001);
  assert.equal(await phone.evaluate(() => window.orbitDebug.view.effects.reducedMotion), true);
  checks.push('mobile landscape fit; Eco default; simultaneous real touch flippers; reduced-motion camera/effects');
  await phone.setViewportSize({ width: 390, height: 844 }); await boot(phone);
  metrics.mobilePortraitIntroLayout = await introFits(phone); await capture(phone, 'mobile-intro-portrait');
  await phone.locator('#start').tap();
  metrics.mobilePortraitTable = await stage(phone, 12, 'table'); await capture(phone, 'mobile-table-portrait');
  metrics.mobileGroundApproaches = await groundProbes(phone);
  for (const r of metrics.mobileGroundApproaches) { assert.equal(r.outcome, 'cleared', JSON.stringify(r)); assert.equal(r.awards, 0); }
  await phone.locator('[data-camera="fpv"]').tap(); await capture(phone, 'mobile-ground-clearance');
  checks.push('portrait table and actual ground-approach recovery rendered at 390 × 844');
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/mobile-layout.json`, JSON.stringify({ result: 'pass', scope: 'opening controls fit in landscape and portrait', layouts: [metrics.mobileIntroLayout, metrics.mobilePortraitIntroLayout], browserErrors: errors }, null, 2));
  const report = { result: 'pass', checks, metrics, screenshots, browserErrors: errors, renderer: 'Chromium software WebGL; physical device FPS and human comfort unmeasured' };
  writeFileSync(`${out}/browser.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) await server.close(); });
