const { chromium, webkit } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
let server, browser, page;
const engine = process.env.TOUCH_ENGINE || 'chromium';
const out = `artifacts/touch-${engine}`;

(async () => {
  assert.ok(['chromium', 'webkit'].includes(engine), 'TOUCH_ENGINE must be chromium or webkit');
  mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5190, strictPort: true, watch: { ignored: () => true }, hmr: false } });
  await server.listen();
  const errors = [], cases = [];
  for (const [width, height] of [[390, 844], [844, 390]]) {
    browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit'
      ? { headless: true, executablePath: process.env.WEBKIT_PATH || undefined }
      : { headless: true, executablePath: process.env.CHROME_PATH || undefined,
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')] });
    const version = browser.version();
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    page = await context.newPage(); page.setDefaultTimeout(60000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.resolvedUrls.local[0] + '?circuit=1', { waitUntil: 'networkidle' });
    await page.locator('#start:not([disabled])').waitFor();
    await page.screenshot({ path: `${out}/${width}x${height}-intro.png` });
    // Keep real simulation and input active, but avoid software-GPU stalls in
    // short touch checks. Restore the actual renderer for visual evidence.
    await page.evaluate(() => {
      const { view, headLoss } = window.orbitDebug;
      headLoss.draw = () => 1; window.touchRender = view.render.bind(view); view.render = () => {};
    });
    await page.locator('#start').tap();
    const state = () => page.evaluate(() => ({ paused: window.orbitDebug.sim.paused,
      controls: { ...window.orbitDebug.sim.controls }, modal: !document.getElementById('modal').hidden,
      visibility: document.visibilityState, phase: window.orbitDebug.sim.phase }));
    for (let i = 0; i < 24; i++) {
      await page.locator(i % 2 ? '#right' : '#left').tap();
      const s = await state();
      assert.equal(s.paused, false, `Native touch ${i} paused play`); assert.equal(s.modal, false);
      assert.deepEqual(s.controls, { left: false, right: false, launch: false });
    }
    await page.keyboard.down('KeyD');
    const held = await page.evaluate(() => {
      const down = (id, target) => document.getElementById(target).dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: id, pointerType: 'touch', button: 0, bubbles: true, cancelable: true }));
      down(601, 'left'); window.dispatchEvent(new Event('blur'));
      return { ...window.orbitDebug.sim.controls };
    });
    assert.deepEqual(held, { left: true, right: false, launch: false }, 'Visible touch blur must preserve the finger and clear keyboard holds');
    assert.equal((await state()).paused, false); assert.equal((await state()).modal, false);
    await page.keyboard.up('KeyD');
    const contextCancelled = await page.evaluate(() => !document.getElementById('left').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    assert.equal(contextCancelled, true, 'Long-press browser menu is not suppressed');
    const styles = await page.locator('#left').evaluate(el => {
      const s = getComputedStyle(el); return { touch: s.touchAction, select: s.userSelect || s.webkitUserSelect,
        callout: s.webkitTouchCallout || null, calloutSupported: CSS.supports('-webkit-touch-callout', 'none') };
    });
    assert.equal(styles.touch, 'none'); assert.equal(styles.select, 'none');
    if (styles.calloutSupported) assert.equal(styles.callout, 'none');
    const before = await page.evaluate(() => window.orbitDebug.sim.time);
    await page.waitForTimeout(800);
    assert.ok(await page.evaluate(() => window.orbitDebug.sim.time) > before, 'Long flipper hold freezes simulation');
    assert.equal((await state()).controls.left, true);
    await page.evaluate(() => {
      const down = (id, target) => document.getElementById(target).dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, pointerType: 'touch', button: 0, bubbles: true, cancelable: true }));
      down(602, 'right'); down(603, 'left');
      // A second finger on the same pad must survive cancellation of the first.
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 601, pointerType: 'touch' }));
    });
    assert.deepEqual((await state()).controls, { left: true, right: true, launch: false });
    await page.evaluate(() => document.getElementById('left').dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 603, pointerType: 'touch' })));
    assert.deepEqual((await state()).controls, { left: false, right: true, launch: false });
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 602, pointerType: 'touch' })));
    assert.deepEqual((await state()).controls, { left: false, right: false, launch: false });
    await page.evaluate(() => {
      document.getElementById('left').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 604, pointerType: 'touch', button: 0, bubbles: true, cancelable: true }));
      window.dispatchEvent(new Event('pagehide'));
    });
    const background = await state(); assert.equal(background.paused, true); assert.equal(background.modal, true);
    assert.deepEqual(background.controls, { left: false, right: false, launch: false });
    await page.locator('#resume').tap(); assert.equal((await state()).paused, false);
    await page.locator('#pause').tap(); assert.equal((await state()).paused, true);
    await page.locator('#resume').tap(); await page.locator('#left').tap();
    assert.equal((await state()).paused, false);
    // A touch/coarse device can switch to a keyboard or mouse. Those visible
    // focus losses must retain desktop-style pause and release every owner.
    await page.keyboard.down('KeyA');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await state()).paused, true);
    assert.deepEqual((await state()).controls, { left: false, right: false, launch: false });
    await page.keyboard.up('KeyA'); await page.locator('#resume').tap();
    const pad = await page.locator('#left').boundingBox();
    await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2); await page.mouse.down();
    assert.equal((await state()).controls.left, true);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await state()).paused, true);
    assert.deepEqual((await state()).controls, { left: false, right: false, launch: false });
    await page.mouse.up(); await page.locator('#resume').tap(); await page.locator('#left').tap();
    assert.equal((await state()).paused, false);
    // Caption priority must also work with sound off. Freeze only physics for
    // these short cross-frame warning/reaction fixtures, then restore it.
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.enabled), false);
    await page.evaluate(() => {
      const { sim, begin } = window.orbitDebug; window.touchSimUpdate = sim.update; sim.update = () => {};
      begin(); sim.launch(0.5); sim.events.length = 0;
      sim.ball.setTranslation({ x: -1.7, y: 0.305, z: 2 }, true); sim.ball.setLinvel({ x: 0, y: 0, z: 4 }, true);
    });
    await page.waitForFunction(() => document.getElementById('droid-line').textContent === 'Left flipper!');
    await page.evaluate(() => { const { sim, headLoss } = window.orbitDebug; headLoss.draw = () => 0; sim.events.push({ type: 'launch' }); });
    await page.waitForFunction(() => window.orbitDebug.view.mode === 'spin');
    assert.equal(await page.locator('#droid-line').textContent(), 'Left flipper!', 'Muted lost-head reaction overwrites urgent instruction');
    await page.evaluate(() => {
      const { sim, begin } = window.orbitDebug; begin(); sim.launch(0.5); sim.events.length = 0;
      sim.ball.setTranslation({ x: -4, y: 0.305, z: -9 }, true); sim.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
      sim.events.push({ type: 'launch' });
    });
    await page.waitForFunction(() => document.getElementById('droid-line').textContent === 'Oh no, BB-8 lost its head!');
    await page.evaluate(() => {
      const { sim, headLoss, begin } = window.orbitDebug;
      sim.update = window.touchSimUpdate; headLoss.draw = () => 1; begin();
    });
    const bounds = await page.locator('#play-controls').evaluate(el => {
      const children = [...el.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { id: b.id, x: r.x, y: r.y, width: r.width, height: r.height }; });
      return { children, scroll: document.documentElement.scrollWidth, width: innerWidth, height: innerHeight };
    });
    assert.ok(bounds.scroll <= width);
    assert.ok(bounds.children.every(r => r.width >= 44 && r.height >= 44 && r.x >= 0 && r.x + r.width <= width && r.y >= 0 && r.y + r.height <= height));
    await page.evaluate(() => { const { sim, view } = window.orbitDebug; view.render = window.touchRender; view.render(sim, 1 / 60); });
    await page.screenshot({ path: `${out}/${width}x${height}.png` });
    // Inspect surfaces outside the launch lane at a held ground pose. This is
    // visual evidence, not a gameplay-success or device frame-rate claim.
    await page.evaluate(() => {
      const { sim, view } = window.orbitDebug;
      sim.launch(0.5); sim.update = () => {}; sim.events.length = 0;
      sim.ball.setTranslation({ x: -4, y: 0.305, z: -1 }, true); sim.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
      view.heading = 0.35; view.render(sim, 1 / 60); view.render(sim, 1 / 60);
    });
    await page.screenshot({ path: `${out}/${width}x${height}-ground.png` });
    cases.push({ viewport: { width, height }, engine, version, styles, bounds,
      checks: ['24 native alternating flipper taps never pause', 'injected visible blur preserves touch and releases keyboard only',
        'long hold keeps simulation running and suppresses context menu', 'two fingers on one pad survive independent cancellation',
        'lost capture and global pointer release clear only their owner', 'pagehide pauses and releases every hold',
        'explicit pause/resume works; subsequent flipper tap keeps playing', 'switching touch device to keyboard/mouse restores desktop blur pause',
        'muted warning survives later head reaction; new game clears caption priority',
        '44px targets fit portrait/landscape', 'actual intro/launch/held-ground WebGL frames captured'] });
    console.log(`${engine} ${version} ${width}x${height}: touch checks pass`);
    await browser.close(); browser = undefined; page = undefined;
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ result: 'pass', engine, cases, errors,
    limits: ['WebKit on Linux is a Safari-engine compatibility check, not a physical iPhone test.', 'Visible blur, pointer cancellation and pagehide regressions are injected lifecycle fixtures; repeated taps use native browser touch input.'] }, null, 2) + '\n');
})().catch(async e => {
  console.error(e); process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
}).finally(async () => { if (browser) await browser.close(); if (server) await server.close(); });
