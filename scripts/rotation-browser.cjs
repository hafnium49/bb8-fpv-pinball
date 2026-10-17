const { chromium, webkit } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const engine = process.env.ROTATION_ENGINE || 'chromium';
const out = `artifacts/rotation-${engine}`;
const cases = [], errors = [];
let server, browser, page;
const released = { left: false, right: false, launch: false };
const sizes = [
  { name: 'phone', from: [390, 844], to: [844, 390], touch: true },
  { name: 'small-phone', from: [375, 667], to: [667, 375], touch: true },
  { name: 'compact-phone', from: [320, 568], to: [568, 320], touch: true },
  { name: 'tablet', from: [768, 1024], to: [1024, 768], touch: true },
  { name: 'large-tablet', from: [1024, 1366], to: [1366, 1024], touch: true },
  { name: 'hybrid-tablet', from: [768, 1024], to: [1024, 768], touch: true, hybrid: true },
  { name: 'desktop', from: [1440, 900], to: [1280, 800], touch: false },
];
const viewport = ([width, height]) => ({ width, height });
async function resize(size) {
  await page.setViewportSize(viewport(size));
  await page.waitForFunction(() => {
    const { view } = window.orbitDebug, el = document.getElementById('viewport');
    return Math.abs(view.camera.aspect - el.clientWidth / el.clientHeight) < 0.001;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function state() {
  return page.evaluate(() => {
    const { sim, view, audio } = window.orbitDebug;
    return { sameSimulation: sim === window.rotationSimulation, score: sim.score, balls: sim.balls,
      phase: sim.phase, paused: sim.paused, music: audio.musicVolume, sound: audio.enabled,
      quality: view.highQuality, controls: { ...sim.controls }, charge: sim.charge,
      modal: !document.getElementById('modal').hidden, ball: { ...sim.ball.translation() },
      velocity: { ...sim.ball.linvel() } };
  });
}
async function hold(id, target) {
  await page.evaluate(({ id, target }) => document.getElementById(target).dispatchEvent(new PointerEvent('pointerdown', {
    pointerId: id, pointerType: 'touch', button: 0, bubbles: true, cancelable: true,
  })), { id, target });
}
async function geometry(label, playing = false, safe = null) {
  const result = await page.evaluate(({ playing }) => {
    const rect = el => { const r = el.getBoundingClientRect(); return { id: el.id, x: r.x, y: r.y, width: r.width, height: r.height }; };
    const { view } = window.orbitDebug, host = document.getElementById('viewport');
    const ids = playing ? ['left', 'launch', 'right', 'quality', 'sound', 'pause', 'fullscreen'] : ['start'];
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      aspect: view.camera.aspect, host: { width: host.clientWidth, height: host.clientHeight },
      canvas: rect(view.renderer.domElement), buttons: ids.map(id => rect(document.getElementById(id))) };
  }, { playing });
  assert.ok(result.scrollWidth <= result.width + 1, `${label}: horizontal page overflow`);
  assert.ok(result.host.width > 0 && result.host.height > 0, `${label}: empty viewport`);
  assert.ok(Math.abs(result.aspect - result.host.width / result.host.height) < 0.001, `${label}: stale camera aspect`);
  assert.ok(Math.abs(result.canvas.width - result.host.width) <= 1 && Math.abs(result.canvas.height - result.host.height) <= 1, `${label}: canvas stretched`);
  for (const b of result.buttons) {
    assert.ok(b.width >= 44 && b.height >= 44, `${label}: ${b.id} below 44px touch target`);
    assert.ok(b.x >= -1 && b.y >= -1 && b.x + b.width <= result.width + 1 && b.y + b.height <= result.height + 1,
      `${label}: ${b.id} outside viewport: ${JSON.stringify(b)}`);
    if (safe) assert.ok(b.x >= safe.left - 1 && b.x + b.width <= result.width - safe.right + 1 &&
      b.y >= safe.top - 1 && b.y + b.height <= result.height - safe.bottom + 1, `${label}: ${b.id} intrudes into simulated safe area`);
  }
  for (let i = 0; i < result.buttons.length; i++) for (const b of result.buttons.slice(i + 1)) {
    const a = result.buttons[i];
    const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
    assert.equal(overlap, false, `${label}: ${a.id} overlaps ${b.id}`);
  }
  return result;
}
async function capture(label) {
  // Keep physics frozen for reproducibility, but capture actual WebGL, never a placeholder.
  const render = await page.evaluate(() => {
    const { sim, view } = window.orbitDebug;
    view.render = window.rotationRender;
    view.render(sim, 1 / 60);
    return { contextLost: view.renderer.getContext().isContextLost(), calls: view.renderer.info.render.calls };
  });
  assert.equal(render.contextLost, false, `${label}: WebGL context lost`);
  assert.ok(render.calls > 0, `${label}: no WebGL draw calls`);
  await page.screenshot({ path: `${out}/${label}.png` });
  await page.evaluate(() => { window.orbitDebug.view.render = () => {}; });
}
(async () => {
  assert.ok(['chromium', 'webkit'].includes(engine), 'ROTATION_ENGINE must be chromium or webkit');
  mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5193, strictPort: true, watch: { ignored: () => true }, hmr: false } });
  await server.listen();
  browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit'
    ? { headless: true, executablePath: process.env.WEBKIT_PATH || undefined }
    : { headless: true, executablePath: process.env.CHROME_PATH || undefined,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')] });
  for (const fixture of sizes) {
    const context = await browser.newContext({ viewport: viewport(fixture.from), hasTouch: fixture.touch && !fixture.hybrid, isMobile: fixture.touch && !fixture.hybrid, deviceScaleFactor: 1 });
    if (fixture.hybrid) await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }));
    page = await context.newPage(); page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(`${fixture.name}: ${error.message}`));
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
    await page.locator('#start:not([disabled])').waitFor();
    if (fixture.hybrid) {
      assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), false, 'Hybrid fixture must have a fine primary pointer');
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('touch-device')), true, 'Touch-capable hybrid must use touch layout');
    }
    await page.evaluate(() => {
      const { sim, view, headLoss } = window.orbitDebug;
      window.rotationSimulation = sim; window.rotationUpdate = sim.update; window.rotationRender = view.render.bind(view);
      sim.update = () => {}; view.render = () => {}; headLoss.draw = () => 1;
    });
    const checks = [];
    const playfield = await page.locator('#viewport').boundingBox();
    if (fixture.touch) assert.ok(playfield.width >= fixture.from[0] - 2, `${fixture.name}: desktop cabinet shrank touch playfield`);
    else assert.ok(playfield.width < fixture.from[0] - 400, 'Desktop cabinet layout regressed');
    checks.push(await geometry(`${fixture.name}-intro-portrait`));
    await capture(`${fixture.name}-intro-portrait`);
    await resize(fixture.to);
    checks.push(await geometry(`${fixture.name}-intro-landscape`));
    await capture(`${fixture.name}-intro-landscape`);
    // Expanded instructions must remain reachable in the intro's scroll container.
    await page.locator('#show-controls').click();
    await page.locator('#music-volume').scrollIntoViewIfNeeded();
    await page.locator('#music-volume').evaluate(el => { el.value = '37'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#show-controls').click();
    await page.locator('#start').click();
    await page.waitForFunction(() => window.orbitDebug.sim.phase === 'ready');
    await page.evaluate(() => {
      const { sim } = window.orbitDebug; sim.launch(0.5); sim.events.length = 0; sim.score = 123450; sim.balls = 2;
      sim.ball.setTranslation({ x: -4, y: 0.305, z: -1 }, true); sim.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    });
    const before = await state();
    await resize(fixture.from);
    assert.deepEqual(await state(), before, `${fixture.name}: active resize reset game/settings`);
    checks.push(await geometry(`${fixture.name}-active-portrait`, true));
    await capture(`${fixture.name}-active-portrait`);
    if (fixture.touch) { await hold(901, 'left'); await hold(902, 'right'); }
    else { await page.keyboard.down('KeyA'); await page.keyboard.down('KeyD'); }
    assert.deepEqual((await state()).controls, { left: true, right: true, launch: false });
    // Same-aspect toolbar movement/window resize must keep an ongoing hold.
    await resize([fixture.from[0], fixture.from[1] - 24]);
    assert.deepEqual((await state()).controls, { left: true, right: true, launch: false }, `${fixture.name}: toolbar resize cleared input`);
    await resize(fixture.from);
    await resize(fixture.to);
    if (fixture.touch) assert.deepEqual((await state()).controls, released, `${fixture.name}: orientation left held controls`);
    else { await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD'); }
    assert.deepEqual(await state(), before, `${fixture.name}: rotation changed game/settings`);
    checks.push(await geometry(`${fixture.name}-active-landscape`, true));
    await capture(`${fixture.name}-active-landscape`);
    await page.locator('#pause').click();
    const paused = await state(); assert.equal(paused.paused, true); assert.equal(paused.modal, true);
    await resize(fixture.from); assert.deepEqual(await state(), paused, `${fixture.name}: paused rotation resumed/reset game`);
    await resize(fixture.to); assert.deepEqual(await state(), paused);
    await capture(`${fixture.name}-paused-landscape`);
    for (const id of ['resume', 'restart', 'dialog-sound', 'music-volume']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await page.locator(`#${id}`).click({ trial: true });
    }
    await page.locator('#resume').click();
    assert.deepEqual(await state(), before);
    if (fixture.touch) {
      await page.evaluate(() => { const { begin, sim } = window.orbitDebug; begin(); sim.update = window.rotationUpdate; });
      // Native taps exercise browser touch dispatch. The hybrid fixture has a
      // fine primary pointer and no emulated touchscreen, so uses owner fixtures below.
      if (!fixture.hybrid) for (let i = 0; i < 8; i++) {
        await page.locator(i % 2 ? '#right' : '#left').tap();
        const tapped = await state();
        assert.equal(tapped.paused, false, `${fixture.name}: native tap paused play`);
        assert.equal(tapped.modal, false);
        assert.deepEqual(tapped.controls, released);
      }
      await hold(910, 'left'); await hold(911, 'right'); await hold(912, 'left');
      const holdTime = await page.evaluate(() => window.orbitDebug.sim.time);
      await page.waitForFunction(time => window.orbitDebug.sim.time > time + 0.025, holdTime);
      assert.deepEqual((await state()).controls, { left: true, right: true, launch: false }, `${fixture.name}: simultaneous hold failed`);
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 910, pointerType: 'touch' })));
      assert.deepEqual((await state()).controls, { left: true, right: true, launch: false }, `${fixture.name}: cancellation cleared another finger on the pad`);
      await hold(913, 'launch');
      await page.waitForFunction(() => window.orbitDebug.sim.charge > 0.05);
      const cancelTime = await page.evaluate(() => {
        window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 913, pointerType: 'touch' }));
        return window.orbitDebug.sim.time;
      });
      // Wait for actual fixed-step physics, not an arbitrary wall-clock delay.
      await page.waitForFunction(time => window.orbitDebug.sim.time > time + 0.025, cancelTime);
      const cancelled = await state();
      assert.equal(cancelled.phase, 'ready', `${fixture.name}: pointercancel fired charged ball before rotation`);
      assert.equal(cancelled.charge, 0, `${fixture.name}: pointercancel retained launch charge`);
      assert.deepEqual(cancelled.controls, { left: true, right: true, launch: false }, `${fixture.name}: launch cancellation cleared other fingers`);
      await page.evaluate(() => {
        for (const pointerId of [911, 912]) window.dispatchEvent(new PointerEvent('pointerup', { pointerId, pointerType: 'touch' }));
      });
      await hold(914, 'launch');
      await page.waitForFunction(() => window.orbitDebug.sim.charge > 0.05);
      await page.evaluate(() => {
        const button = document.getElementById('launch');
        // Capture loss follows ordinary release in browsers; it must not
        // turn the intentional release into a cancelled launch.
        for (const type of ['pointerup', 'lostpointercapture']) button.dispatchEvent(new PointerEvent(type, {
          pointerId: 914, pointerType: 'touch', bubbles: true,
        }));
      });
      await page.waitForFunction(() => window.orbitDebug.sim.phase === 'playing');
      assert.deepEqual((await state()).controls, released, `${fixture.name}: normal release retained input`);
      await page.evaluate(() => window.orbitDebug.begin());
      await hold(903, 'launch');
      await page.waitForFunction(() => window.orbitDebug.sim.charge > 0.05);
      await resize(fixture.from);
      assert.equal((await state()).phase, 'ready', `${fixture.name}: rotation fired charged ball`);
      assert.deepEqual((await state()).controls, released);
      assert.equal((await state()).charge, 0, `${fixture.name}: rotation retained launch charge`);
      // A late release from the old orientation must not launch either.
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 903, pointerType: 'touch' })));
      await page.waitForTimeout(100);
      assert.equal((await state()).phase, 'ready');
      await hold(904, 'left');
      await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
      assert.deepEqual((await state()).controls, released, `${fixture.name}: orientation event did not clear input`);
      await page.evaluate(() => { window.orbitDebug.sim.update = () => {}; });
      await resize(fixture.to);
      const safe = { top: 8, right: 44, bottom: 21, left: 44 };
      await page.evaluate(safe => {
        for (const [edge, value] of Object.entries(safe)) document.documentElement.style.setProperty(`--safe-${edge}`, `${value}px`);
        window.dispatchEvent(new Event('resize'));
      }, safe);
      checks.push(await geometry(`${fixture.name}-safe-area-landscape`, true, safe));
      await capture(`${fixture.name}-safe-area-landscape`);
    }
    cases.push({ ...fixture, checks, result: 'pass' });
    console.log(`${engine} ${fixture.name}: rotation checks pass`);
    await context.close(); page = undefined;
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ result: 'pass', engine, version: browser.version(), cases, errors,
    limits: ['Viewport resizing and injected orientationchange/pointer events emulate rotation, not physical sensors or browser chrome.',
      'Safe areas are CSS-variable fixtures, not a hardware-notch measurement.',
      'WebKit on Linux is engine compatibility evidence, not physical iPhone/iPad validation.',
      'Physics is frozen for state/geometry screenshots; native taps, held inputs and launch cancellation use live fixed-step physics. No device FPS claim.'] }, null, 2) + '\n');
})().catch(async error => {
  console.error(error); process.exitCode = 1; mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/failure.json`, JSON.stringify({ error: error.stack, cases, errors }, null, 2));
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
}).finally(async () => { if (browser) await browser.close(); if (server) await server.close(); });
