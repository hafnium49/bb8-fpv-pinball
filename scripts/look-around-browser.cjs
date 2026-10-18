const { chromium, webkit } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const engine = process.env.LOOK_ENGINE || 'chromium';
const out = `artifacts/look-around-${engine}`;
const cases = [], errors = [], sweep = [];
cases.push = function (...entries) { for (const entry of entries) console.log(`${engine}: ${entry.name}: ${entry.result}`); return Array.prototype.push.apply(this, entries); };
let server, browser, page;
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// These fixtures replace browser capability and sensor events, not app logic.
// They do not prove physical phone axes, real permission sheets, or GPU speed.
function installFixture(mode) {
  let resolvePermission, angle = 0, interval;
  const fixture = window.lookFixture = { requests: 0, pose: [0, 90, 0], listeners: 0, attachments: 0, emissions: 0, permissionMode: mode };
  const listeners = new Set(), add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
  window.addEventListener = (type, callback, options) => { if (type === 'deviceorientation') { listeners.add(callback); fixture.listeners = listeners.size; fixture.attachments++; } return add(type, callback, options); };
  window.removeEventListener = (type, callback, options) => { if (type === 'deviceorientation') { listeners.delete(callback); fixture.listeners = listeners.size; } return remove(type, callback, options); };
  class SyntheticOrientation extends Event {
    constructor(type, data = {}) { super(type); Object.assign(this, data); }
    static requestPermission() {
      fixture.requests++;
      if (fixture.permissionMode === 'pending') return new Promise(resolve => { resolvePermission = resolve; });
      if (fixture.permissionMode === 'throw') throw new Error('Synthetic permission failure');
      return Promise.resolve(fixture.permissionMode === 'denied' ? 'denied' : 'granted');
    }
  }
  Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: SyntheticOrientation });
  const orientation = new EventTarget();
  Object.defineProperty(orientation, 'angle', { get: () => angle });
  Object.defineProperty(screen, 'orientation', { configurable: true, value: orientation });
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  fixture.hide = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  fixture.resolve = result => resolvePermission(result);
  fixture.emit = (pose = fixture.pose) => { fixture.emissions++; return window.dispatchEvent(new SyntheticOrientation('deviceorientation', {
    alpha: pose[0], beta: pose[1], gamma: pose[2], absolute: false,
  })); };
  fixture.start = (pose = fixture.pose) => { fixture.pose = pose; clearInterval(interval); fixture.emit(); interval = setInterval(() => fixture.emit(), 30); };
  fixture.stop = () => clearInterval(interval);
  fixture.screen = value => { angle = value; orientation.dispatchEvent(new Event('change')); window.dispatchEvent(new Event('orientationchange')); };
}
async function open(mode = 'granted', viewport = { width: 844, height: 390 }, reducedMotion = 'reduce') {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1024, isMobile: viewport.width < 1024, deviceScaleFactor: 1, reducedMotion });
  await context.addInitScript(installFixture, mode);
  page = await context.newPage(); page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push(`${mode}: ${error.message}`));
  await page.goto(server.resolvedUrls.local[0] + '?look=1', { waitUntil: 'networkidle' });
  await page.locator('#start:not([disabled])').waitFor();
  assert.equal(await page.evaluate(() => window.lookFixture.requests), 0, 'Never auto-prompt');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const { sim, view, headLoss } = window.orbitDebug;
    window.lookOriginalUpdate = sim.update.bind(sim); sim.update = () => {};
    window.lookRender = view.render.bind(view); view.render = () => {};
    view.budget.enabled = false; headLoss.draw = () => 1;
  });
  await page.locator('#pause').click();
  await page.locator('#dialog-look').click();
  return context;
}
async function state() {
  return page.evaluate(() => {
    const { phoneLook, sim, view } = window.orbitDebug;
    return { state: phoneLook.state, selected: phoneLook.selected, orientation: { ...phoneLook.orientation },
      paused: sim.paused, phase: sim.phase, charge: sim.charge, controls: { ...sim.controls },
      follow: { heading: view.routeCamera.heading, pitch: view.routeCamera.pitch } };
  });
}
async function frame() {
  return page.evaluate(() => {
    const { sim, view } = window.orbitDebug; window.lookRender(sim, 1 / 60);
    const gl = view.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles,
      contextLost: gl.isContextLost(), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, size: [view.renderer.domElement.width, view.renderer.domElement.height], camera: view.camera.quaternion.toArray(),
      rightY: view.camera.matrixWorld.elements[1], position: view.camera.position.toArray(), near: view.camera.near, fov: view.camera.fov };
  });
}
async function settle(expected) {
  await page.waitForFunction(expected => {
    if (window.lookRender) window.lookRender(window.orbitDebug.sim, 1 / 60);
    return window.orbitDebug.phoneLook.state === expected;
  }, expected);
}
async function calibrate() {
  await page.locator('#look-enable').click(); await settle('waiting');
  await page.evaluate(() => window.lookFixture.start()); await settle('calibrating');
  await page.locator('#look-center').click(); await settle('active'); await frame();
}
async function hold(id, target) {
  await page.evaluate(({ id, target }) => document.getElementById(target).dispatchEvent(new PointerEvent('pointerdown', {
    pointerId: id, pointerType: 'touch', button: 0, bubbles: true, cancelable: true,
  })), { id, target });
}
async function geometry(label, ids) {
  const result = await page.evaluate(ids => {
    const rect = el => { const r = el.getBoundingClientRect(); return { id: el.id, x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      buttons: ids.map(id => {
        const el = document.getElementById(id), bounds = rect(el), hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return { ...bounds, hit: !!hit && (hit === el || el.contains(hit)) };
      }) };
  }, ids);
  assert.ok(result.scrollWidth <= result.width + 1, `${label}: overflow`);
  for (const b of result.buttons) {
    assert.ok(b.width >= 44 && b.height >= 44, `${label}: ${b.id} target below 44px`);
    assert.equal(b.hit, true, `${label}: ${b.id} obscured or not pointer-reachable`);
    assert.ok(b.x >= -1 && b.y >= -1 && b.x + b.width <= result.width + 1 && b.y + b.height <= result.height + 1, `${label}: ${b.id} outside viewport`);
  }
  for (let i = 0; i < result.buttons.length; i++) for (const b of result.buttons.slice(i + 1)) {
    const a = result.buttons[i];
    assert.ok(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) <= 1 ||
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) <= 1, `${label}: ${a.id} overlaps ${b.id}`);
  }
  return result;
}
async function capture(label) {
  const rendering = await frame();
  assert.equal(rendering.contextLost, false); assert.ok(Math.abs(rendering.rightY) < 1e-6, `${label}: camera roll is not level`); assert.ok(rendering.calls > 0, `${label}: no actual WebGL drawing`);
  await page.screenshot({ path: `${out}/${label}.png` }); return rendering;
}
(async () => {
  assert.ok(['chromium', 'webkit'].includes(engine)); mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5197, strictPort: true, watch: { ignored: () => true }, hmr: false } });
  await server.listen();
  browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit'
    ? { headless: true, executablePath: process.env.WEBKIT_PATH || undefined }
    : { headless: true, executablePath: process.env.CHROME_PATH || undefined,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')] });
  {
    const context = await browser.newContext(); await context.addInitScript(installFixture, 'granted');
    page = await context.newPage(); page.setDefaultTimeout(45000);
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
    await page.locator('#start:not([disabled])').waitFor();
    assert.equal(await page.locator('#look-settings').isVisible(), false, 'Development look flag must be opt-in');
    assert.equal(await page.evaluate(() => window.lookFixture.requests), 0);
    assert.equal(await page.evaluate(() => window.lookFixture.listeners), 0);
    cases.push({ name: 'default-follow-no-permission-or-sensors', result: 'pass' }); await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    await context.addInitScript(installFixture, 'granted'); page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on('pageerror', error => errors.push(`intro: ${error.message}`));
    await page.goto(server.resolvedUrls.local[0] + '?look=1', { waitUntil: 'networkidle' });
    await page.locator('#start:not([disabled])').waitFor();
    await page.evaluate(() => {
      const { sim, view } = window.orbitDebug;
      window.lookOriginalUpdate = sim.update.bind(sim); sim.update = () => {};
      window.lookRender = view.render.bind(view); view.render = () => {};
    });
    assert.equal((await state()).phase, 'intro');
    const audioBefore = await page.evaluate(() => window.orbitDebug.audio.enabled);
    await page.locator('#look-settings').click(); await calibrate();
    assert.equal((await state()).phase, 'ready'); assert.equal((await state()).paused, true);
    assert.equal((await state()).charge, 0);
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.enabled), audioBefore);
    assert.equal(await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement)), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resume', 'Calibration should reveal explicit Resume');
    const resumeGeometry = await geometry('intro-calibrated-resume', ['resume']);
    await capture('intro-enable-paused-calibrated');
    await page.locator('#resume').click();
    assert.equal((await state()).paused, false); assert.equal((await state()).phase, 'ready');
    cases.push({ name: 'intro-enable-calibration-explicit-resume-separate-audio-fullscreen', result: 'pass', resumeGeometry }); await context.close();
  }
  for (const mode of ['denied', 'throw', 'pending']) {
    const context = await open(mode); await page.locator('#look-enable').click();
    await settle(mode === 'pending' ? 'requesting' : 'unavailable');
    assert.equal((await state()).paused, true);
    await page.locator('#look-follow').click(); await settle('follow');
    if (mode === 'pending') { await page.evaluate(() => window.lookFixture.resolve('granted')); await page.waitForTimeout(100); }
    assert.equal((await state()).state, 'follow'); assert.equal(await page.evaluate(() => window.lookFixture.listeners), 0); assert.equal(await page.evaluate(() => window.lookFixture.requests), 1);
    cases.push({ name: `${mode}-follow-escape`, result: 'pass' }); await context.close();
  }
  for (const mode of ['denied', 'throw', 'timeout']) {
    const context = await open(mode === 'timeout' ? 'granted' : mode);
    await page.locator('#look-enable').click(); await settle('unavailable');
    const failure = await page.evaluate(() => ({ message: window.orbitDebug.phoneLook.message,
      requests: window.lookFixture.requests, attachments: window.lookFixture.attachments }));
    assert.ok(failure.message.length > 0);
    assert.equal(await page.evaluate(() => window.lookFixture.listeners), 0);
    await page.locator('#restart').click();
    // Check before any new reading, then again with a plausible unsolicited reading.
    // Attachment totals detect even a transient listener that was removed later.
    for (let i = 0; i < 3; i++) await frame();
    assert.equal((await state()).state, 'unavailable', `${mode}: new game changed the failure before any reading`);
    await page.evaluate(() => window.lookFixture.emit()); await frame();
    assert.equal((await state()).state, 'unavailable', `${mode}: new game bypassed failure`);
    assert.equal((await state()).paused, true);
    assert.equal((await state()).phase, 'ready');
    assert.equal(await page.evaluate(() => window.orbitDebug.phoneLook.message), failure.message);
    assert.deepEqual(await page.evaluate(() => ({ requests: window.lookFixture.requests,
      attachments: window.lookFixture.attachments, listeners: window.lookFixture.listeners })),
    { requests: failure.requests, attachments: failure.attachments, listeners: 0 }, `${mode}: new game acquired sensors or permission`);
    await page.waitForFunction(message => document.getElementById('look-status').textContent === message, failure.message);
    assert.equal(await page.locator('#look-enable').textContent(), 'Retry phone look');
    await page.locator('#resume').click(); await frame();
    assert.equal((await state()).state, 'unavailable', `${mode}: Resume bypassed Retry`);
    assert.equal(await page.evaluate(() => window.lookFixture.requests), failure.requests);
    assert.equal(await page.evaluate(() => window.lookFixture.attachments), failure.attachments);
    // A real Retry gesture can acquire again and restore the complete playable path.
    await page.evaluate(() => window.lookFixture.permissionMode = 'granted');
    await calibrate();
    assert.equal(await page.evaluate(() => window.lookFixture.requests), failure.requests + 1);
    assert.equal(await page.evaluate(() => window.lookFixture.attachments), failure.attachments + 1);
    await page.locator('#look-follow').click(); await settle('follow');
    assert.equal(await page.evaluate(() => window.lookFixture.listeners), 0);
    await page.locator('#resume').click();
    assert.equal((await state()).paused, false); assert.equal((await state()).phase, 'ready');
    cases.push({ name: `${mode}-restart-preserves-failure-explicit-retry-follow-playable`, result: 'pass' });
    await context.close();
  }
  {
    const context = await open('pending'); await page.locator('#look-enable').click(); await settle('requesting');
    await page.locator('#restart').click(); await settle('unavailable');
    assert.equal((await state()).paused, true); assert.equal((await state()).phase, 'ready');
    const message = await page.evaluate(() => window.orbitDebug.phoneLook.message);
    await page.evaluate(() => window.lookFixture.resolve('granted')); await page.waitForTimeout(100); await frame();
    assert.equal((await state()).state, 'unavailable', 'Restarted pending grant reactivated phone look');
    assert.equal(await page.evaluate(() => window.orbitDebug.phoneLook.message), message);
    assert.deepEqual(await page.evaluate(() => ({ requests: window.lookFixture.requests,
      attachments: window.lookFixture.attachments, listeners: window.lookFixture.listeners })),
    { requests: 1, attachments: 0, listeners: 0 }, 'Restart or late grant acquired sensors');
    assert.equal(await page.locator('#look-enable').textContent(), 'Retry phone look');
    await page.evaluate(() => window.lookFixture.permissionMode = 'granted'); await calibrate();
    assert.equal(await page.evaluate(() => window.lookFixture.requests), 2);
    assert.equal(await page.evaluate(() => window.lookFixture.attachments), 1);
    await page.locator('#resume').click();
    assert.equal((await state()).paused, false); assert.equal((await state()).phase, 'ready');
    cases.push({ name: 'pending-restart-cancels-late-grant-until-explicit-retry', result: 'pass' });
    await context.close();
  }
  {
    const context = await open('granted', { width: 844, height: 390 }, 'no-preference');
    await calibrate(); await page.locator('#resume').click();
    await page.evaluate(() => { window.lookFixture.stop(); window.lookFixture.emit([0, 125, 0]); });
    await frame();
    const before = (await state()).orientation;
    assert.ok(before.pitch > 20 * Math.PI / 180, 'Fixture must begin outside the reduced-motion range');
    assert.ok(before.pitch <= 45 * Math.PI / 180 + 1e-6);
    const emissions = await page.evaluate(() => window.lookFixture.emissions);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.orbitDebug.view.effects.reducedMotion);
    await frame();
    const clamped = (await state()).orientation;
    assert.equal((await state()).state, 'active'); assert.equal((await state()).paused, false);
    assert.ok(Math.abs(clamped.pitch) <= 20 * Math.PI / 180 + 1e-6, 'Preference change must clamp on the next render without a sensor event');
    assert.ok(Math.abs(angleDelta(clamped.heading, before.heading)) < 1e-6);
    assert.equal(await page.evaluate(() => window.lookFixture.emissions), emissions, 'Stationary clamp test accidentally emitted a new reading');
    await page.evaluate(() => window.lookFixture.emit([0, 125, 0])); await frame();
    assert.ok(Math.abs((await state()).orientation.pitch - clamped.pitch) < 1e-6, 'Repeated stationary reading caused a delayed pitch jump');
    assert.ok(Math.abs(angleDelta((await state()).orientation.heading, clamped.heading)) < 1e-6);
    cases.push({ name: 'runtime-reduced-motion-stationary-next-frame-clamp', result: 'pass' });
    await context.close();
  }
  {
    const context = await open('pending'); await page.locator('#look-enable').click(); await settle('requesting');
    await page.evaluate(() => window.lookFixture.hide(true)); await settle('suspended');
    await page.evaluate(() => window.lookFixture.resolve('granted')); await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => window.lookFixture.listeners), 0, 'Hidden late grant attached sensors');
    await page.evaluate(() => window.lookFixture.hide(false));
    assert.equal((await state()).state, 'suspended', 'Visibility alone resumed look');
    cases.push({ name: 'hidden-pending-grant-cancelled', result: 'pass' }); await context.close();
  }
  {
    const context = await open();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.getElementById('modal').contains(document.activeElement)), true, 'Pause settings focus escaped');
    }
    const audioBefore = await page.evaluate(() => window.orbitDebug.audio.enabled);
    await page.locator('#look-enable').click(); await settle('waiting');
    await page.evaluate(() => window.lookFixture.emit([null, null, null]));
    assert.equal((await state()).state, 'waiting');
    await page.evaluate(() => window.lookFixture.start()); await settle('calibrating');
    // State changes inside our explicit render precede the app's next UI refresh.
    // focus() alone does not wait for a hidden/disabled button to become usable.
    await page.locator('#look-center').click({ trial: true });
    await page.locator('#look-center').focus();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'look-center');
    await page.keyboard.press('Space'); await settle('active');
    assert.equal((await state()).phase, 'ready', 'Focused Center must not launch');
    assert.equal((await state()).charge, 0);
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.enabled), audioBefore, 'Look enable changed audio');
    assert.equal(await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement)), false, 'Look enable entered fullscreen');
    await page.locator('#resume').click(); await page.waitForFunction(() => !window.orbitDebug.sim.paused);
    await hold(801, 'left'); await hold(802, 'right');
    assert.deepEqual((await state()).controls, { left: true, right: true, launch: false });
    await page.locator('#look-center-live').click();
    assert.deepEqual((await state()).controls, { left: true, right: true, launch: false }, 'Center must not steal flipper owners');
    const geometryResult = await geometry('landscape-live', ['look-center-live', 'look-follow-live', 'left', 'right', 'launch']);
    await page.evaluate(() => { for (const pointerId of [801, 802]) window.dispatchEvent(new PointerEvent('pointerup', { pointerId, pointerType: 'touch' })); });
    await frame(); const before = await state();
    await page.evaluate(() => { const { sim } = window.orbitDebug; sim.launch(.5); sim.events.length = 0; sim.ball.setTranslation({ x: -3, y: .305, z: -2 }, true); sim.ball.setLinvel({ x: -12, y: 0, z: 9 }, true); sim.ball.setAngvel({ x: 19, y: -7, z: 11 }, true); });
    for (let i = 0; i < 15; i++) await frame();
    assert.ok(Math.abs(angleDelta((await state()).orientation.heading, before.orientation.heading)) < 1e-6, 'Ball trajectory rotated manual heading');
    assert.ok(Math.abs(angleDelta((await state()).follow.heading, before.follow.heading)) > .1, 'Trajectory fixture must actually change shadow follow target');
    for (const order of ['sample-before-screen', 'screen-before-sample']) {
      await page.evaluate(() => window.lookFixture.stop()); const held = (await state()).orientation;
      await page.evaluate(order => {
        if (order === 'sample-before-screen') window.lookFixture.emit([40, 90, 0]);
        window.lookFixture.screen(order === 'sample-before-screen' ? 90 : 270);
      }, order);
      await page.waitForTimeout(50); await frame();
      assert.ok(Math.abs(angleDelta((await state()).orientation.heading, held.heading)) < 1e-6, `${order}: stale screen reading moved view`);
      await page.evaluate(() => window.lookFixture.start([70, 90, 0])); await settle('active'); await frame();
      assert.ok(Math.abs(angleDelta((await state()).orientation.heading, held.heading)) < 1e-6, `${order}: rebase jumped`);
    }
    await page.locator('#pause').click(); await settle('suspended'); const held = (await state()).orientation;
    await page.evaluate(() => window.lookFixture.pose = [140, 70, 0]);
    await page.locator('#resume').click(); await settle('active'); await frame();
    assert.ok(Math.abs(angleDelta((await state()).orientation.heading, held.heading)) < 1e-6, 'Resume applied set-down motion');
    await page.evaluate(() => window.lookFixture.stop()); await page.waitForTimeout(1200); await frame();
    assert.equal((await state()).state, 'active'); assert.equal((await state()).paused, false, 'Stationary silence falsely paused');
    await page.evaluate(() => window.lookFixture.start([250, 90, 0])); await frame();
    assert.ok(Math.abs(angleDelta((await state()).orientation.heading, held.heading)) < 1e-6, 'Silence recovery jumped');
    await capture('landscape-active');
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150); await frame();
    const portraitGeometry = await geometry('portrait-live', ['look-center-live', 'look-follow-live', 'left', 'right', 'launch']);
    await capture('portrait-active');
    cases.push({ name: 'calibration-focus-flippers-trajectory-screen-pause-silence', result: 'pass', geometry: geometryResult, portraitGeometry });
    await context.close();
  }
  {
    const context = await open();
    await page.locator('#resume').click();
    await page.evaluate(() => window.orbitDebug.sim.update = window.lookOriginalUpdate);
    await hold(901, 'launch'); await page.waitForFunction(() => window.orbitDebug.sim.charge > .05);
    await page.locator('#pause').click();
    if (!(await page.locator('#look-panel').isVisible())) await page.locator('#dialog-look').click();
    await calibrate();
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 901, pointerType: 'touch' })));
    assert.equal((await state()).phase, 'ready'); assert.equal((await state()).charge, 0);
    cases.push({ name: 'enable-cancels-held-launch', result: 'pass' }); await context.close();
  }
  {
    const context = await open(); await calibrate(); await page.locator('#resume').click();
    // Restore the real fixed-step update so drain delay and next-ball transitions advance.
    await page.evaluate(() => window.orbitDebug.sim.update = window.lookOriginalUpdate);
    for (let ball = 1; ball <= 3; ball++) {
      await page.evaluate(() => {
        const { sim } = window.orbitDebug; sim.launch(.5);
        sim.ball.setTranslation({ x: 0, y: -3, z: 0 }, true); sim.ball.setLinvel({ x: 0, y: -1, z: 0 }, true);
      });
      if (ball < 3) {
        await page.waitForFunction(() => window.orbitDebug.sim.phase === 'draining');
        assert.equal((await state()).paused, false, 'Suspending look must not freeze drain timer');
        await page.waitForFunction(() => window.orbitDebug.sim.phase === 'ready');
        assert.equal((await state()).paused, true, 'Next ball must require calibration before launch');
        assert.equal(await page.evaluate(() => window.orbitDebug.sim.balls), 3 - ball);
        await settle('calibrating'); await page.locator('#look-center').click(); await settle('active');
        await page.locator('#resume').click();
      } else {
        await page.waitForFunction(() => window.orbitDebug.sim.phase === 'over'); await settle('suspended');
        assert.equal(await page.evaluate(() => window.orbitDebug.sim.balls), 0);
        assert.equal(await page.locator('#resume').isVisible(), false);
      }
    }
    await page.locator('#restart').click(); await settle('calibrating');
    assert.equal((await state()).phase, 'ready'); assert.equal((await state()).paused, true);
    assert.equal(await page.evaluate(() => window.orbitDebug.sim.balls), 3);
    assert.equal((await state()).charge, 0);
    cases.push({ name: 'live-three-ball-drain-over-restart-calibration', result: 'pass' }); await context.close();
  }
  {
    const context = await open(); await calibrate(); await page.locator('#resume').click();
    await page.evaluate(() => {
      const { sim, headLoss } = window.orbitDebug; headLoss.draw = () => 0;
      sim.launch(.5); sim.ball.setTranslation({ x: 0, y: .305, z: 0 }, true);
    });
    await page.waitForFunction(() => window.orbitDebug.headLoss.eventActive);
    assert.equal(await page.locator('#droid-line').textContent(), 'Oh no, BB-8 lost its head!');
    assert.equal(await page.evaluate(() => window.orbitDebug.view.mode), 'fpv');
    await capture('manual-lost-head-level');
    await page.locator('#look-follow-live').click(); await settle('follow');
    assert.equal(await page.evaluate(() => window.orbitDebug.headLoss.eventActive), true, 'Follow erased existing lost-head event');
    assert.equal(await page.evaluate(() => window.orbitDebug.view.mode), 'fpv', 'Follow entered Spin halfway through suppressed episode');
    await page.evaluate(() => window.orbitDebug.sim.time += 3.1);
    await page.waitForFunction(() => !window.orbitDebug.headLoss.eventActive);
    cases.push({ name: 'manual-lost-head-caption-retained-follow-no-mid-event-spin', result: 'pass' }); await context.close();
  }
  {
    const context = await open('granted', { width: 1440, height: 900 }); await calibrate(); await page.locator('#resume').click();
    await capture('desktop-active');
    const poses = await page.evaluate(async () => {
      const { courseRamps, pathFrame } = await import('/src/physics/reference-course.ts');
      return [{ name: 'launch', p: { ...window.orbitDebug.sim.ball.translation() } },
        { name: 'ground', p: { x: -3.5, y: .305, z: -1 } },
        ...courseRamps.map((path, pathIndex) => ({ name: path.name, pathIndex, p: { ...pathFrame(path, path.length * .45).c } })),
        { name: 'upper-deck', p: { x: 3.05, y: 1.904, z: -5.92 } }];
    });
    const neutral = (await state()).orientation;
    for (const high of [false, true]) for (const pose of poses) for (const [direction, alpha, beta] of [
      ['forward', 0, 90], ['right', -90, 90], ['back', 180, 90], ['left', 90, 90], ['up', 0, 120], ['down', 0, 60],
    ]) {
      await page.evaluate(async ({ pose, high, alpha, beta }) => {
        const { courseRamps } = await import('/src/physics/reference-course.ts');
        const { sim, view } = window.orbitDebug; sim.ball.setTranslation(pose.p, true); view.setQuality(high);
        // Frozen diagnostic fixture exercises guided clearance without changing app camera logic.
        sim.reference.active = pose.pathIndex === undefined ? undefined : courseRamps[pose.pathIndex];
        sim.reference.progress = sim.reference.active ? sim.reference.active.length * .45 : 0;
        window.lookFixture.pose = [alpha, beta, 0]; window.lookFixture.emit();
      }, { pose, high, alpha, beta });
      await page.waitForTimeout(60); const cold = await frame(); const warm = await frame();
      assert.ok(warm.calls > 0 && !warm.contextLost);
      const displayed = (await state()).orientation;
      assert.ok(Math.abs(angleDelta(displayed.heading, neutral.heading - alpha * Math.PI / 180)) < 1e-5, 'Sweep failed to apply requested yaw');
      if (direction === 'up') assert.ok(displayed.pitch > 0, 'Up sweep must display positive pitch');
      if (direction === 'down') assert.ok(displayed.pitch < 0, 'Down sweep must display negative pitch');
      assert.equal(warm.fov, 82, 'Look changed established perspective FOV');
      assert.ok(Math.abs(warm.rightY) < 1e-6, 'Directional sweep camera must stay roll-free');
      const label = `${high ? 'high' : 'eco'}-${pose.name.replace(/[^a-z0-9]/gi, '-')}-${direction}`;
      await page.screenshot({ path: `${out}/${label}.png` });
      sweep.push({ label, pose, sensor: [alpha, beta, 0], orientation: (await state()).orientation, cold, warm });
    }
    cases.push({ name: 'actual-webgl-directional-sweep', result: 'pass', rows: sweep.length }); await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ result: 'pass', commit: process.env.GITHUB_SHA || 'local-working-tree', engine, version: browser.version(), cases, sweep, errors,
    limits: ['Synthetic sensor and permission events validate app plumbing, not real device signs or permission UI.',
      'Linux WebKit is not physical iPhone Safari or Home Screen validation.',
      'Screenshots and renderer counters use actual WebGL; software-renderer timings are not hardware GPU benchmarks.',
      'Physical drift, thermal behavior, touch comfort, and sensor-to-photon latency remain unmeasured.'] }, null, 2));
})().catch(async error => {
  console.error(error); process.exitCode = 1; mkdirSync(out, { recursive: true });
  const diagnostic = page && !page.isClosed() ? await page.evaluate(() => ({
    state: window.orbitDebug?.phoneLook?.state, message: window.orbitDebug?.phoneLook?.message,
    focus: document.activeElement?.id, phase: window.orbitDebug?.sim.phase, paused: window.orbitDebug?.sim.paused,
    center: { hidden: document.getElementById('look-center')?.hidden, disabled: document.getElementById('look-center')?.disabled },
  })).catch(() => null) : null;
  writeFileSync(`${out}/failure.json`, JSON.stringify({ error: error.stack, diagnostic, cases, sweep, errors }, null, 2));
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
}).finally(async () => { if (browser) await browser.close(); if (server) await server.close(); });
