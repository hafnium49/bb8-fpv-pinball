const { chromium, webkit } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const engine = process.env.FULLSCREEN_ENGINE || 'chromium';
const out = `artifacts/fullscreen-${engine}`;
const cases = [], errors = [];
let server, preview, browser, page;

// Model browser capabilities before app initialization. These fixtures test app
// behavior, not whether a particular OS grants real fullscreen or installs a PWA.
function installFixture(mode) {
  const withLook = mode.endsWith('-look');
  mode = mode.replace(/-look$/, '');
  let gesture = false;
  if (withLook) {
    // Fullscreen consumes transient activation synchronously. Model that here
    // so a permission request after automatic fullscreen really fails.
    document.addEventListener('click', () => { gesture = true; }, true);
    const fixture = window.fullscreenLook = { requests: 0, deniedForActivation: 0 };
    class Orientation extends Event {
      constructor(data) { super('deviceorientation'); Object.assign(this, data); }
      static requestPermission() {
        fixture.requests++;
        if (!gesture || navigator.userActivation?.isActive === false) {
          fixture.deniedForActivation++;
          return Promise.reject(new DOMException('Motion requires user activation', 'NotAllowedError'));
        }
        return Promise.resolve('granted');
      }
    }
    Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: Orientation });
    fixture.emit = () => window.dispatchEvent(new Orientation({ alpha: 0, beta: 90, gamma: 0, absolute: false }));
  }
  let active = null;
  if (mode === 'legacy-dialog') {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: undefined });
  }
  window.fullscreenCalls = { enter: 0, exit: 0 };
  const set = (object, key, value) => Object.defineProperty(object, key, { configurable: true, value });
  for (const key of ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen']) set(Element.prototype, key, undefined);
  for (const key of ['exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen']) set(document, key, undefined);
  for (const key of ['fullscreenElement', 'webkitFullscreenElement']) Object.defineProperty(document, key, { configurable: true, get: () => active });
  set(document, 'fullscreenEnabled', mode === 'standard' || mode === 'rejected');
  set(document, 'webkitFullscreenEnabled', mode === 'prefixed');
  const event = mode === 'prefixed' ? 'webkitfullscreenchange' : 'fullscreenchange';
  window.fixtureExit = () => { active = null; document.dispatchEvent(new Event(event)); };
  if (['standard', 'prefixed', 'rejected'].includes(mode)) {
    set(Element.prototype, mode === 'prefixed' ? 'webkitRequestFullscreen' : 'requestFullscreen', function () {
      window.fullscreenCalls.enter++;
      if (withLook) gesture = false;
      if (mode === 'rejected') return Promise.reject(new DOMException('Fixture denied fullscreen', 'NotAllowedError'));
      active = this; document.dispatchEvent(new Event(event));
      return mode === 'prefixed' ? undefined : Promise.resolve();
    });
    set(document, mode === 'prefixed' ? 'webkitExitFullscreen' : 'exitFullscreen', () => {
      window.fullscreenCalls.exit++; window.fixtureExit();
      return mode === 'prefixed' ? undefined : Promise.resolve();
    });
  }
  Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => mode === 'ios-standalone' });
  const originalMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = query => {
    const result = originalMatchMedia(query);
    if (query.includes('display-mode')) Object.defineProperty(result, 'matches', { configurable: true, value:
      (mode === 'standalone' && query.includes('standalone')) || (mode === 'display-fullscreen' && query.includes('fullscreen')) });
    return result;
  };
}
async function open(mode, viewport = { width: 844, height: 390 }, mobile = true, start = true) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  if (mode !== 'native') await context.addInitScript(installFixture, mode);
  page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(`${mode}: ${error.message}`));
  await page.goto(server.resolvedUrls.local[0] + (mode.endsWith('-look') ? '?look=1' : ''), { waitUntil: 'networkidle' });
  await page.locator('#start:not([disabled])').waitFor();
  if (start) await page.locator('#start').click();
  await page.evaluate(() => {
    const { sim, view } = window.orbitDebug;
    sim.update = () => {}; window.fullscreenRender = view.render.bind(view); view.render = () => {};
  });
  return context;
}
async function capture(label) {
  const result = await page.evaluate(() => {
    const { sim, view } = window.orbitDebug; window.fullscreenRender(sim, 1 / 60);
    return { contextLost: view.renderer.getContext().isContextLost(), drawCalls: view.renderer.info.render.calls };
  });
  assert.equal(result.contextLost, false, `${label}: lost WebGL context`);
  assert.ok(result.drawCalls > 0, `${label}: no actual WebGL drawing`);
  await page.screenshot({ path: `${out}/${label}.png` });
  return result;
}
async function helpGeometry(label, native = true) {
  const result = await page.evaluate(() => {
    const dialog = document.getElementById('fullscreen-help');
    const bounds = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { open: dialog.open, modal: dialog.matches(':modal'), dialog: bounds(dialog), heading: bounds(document.getElementById('fullscreen-help-title')), close: bounds(document.getElementById('fullscreen-help-close')),
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      title: document.getElementById('fullscreen-help-title').textContent,
      copy: document.getElementById('fullscreen-help-copy').textContent, instructions: dialog.textContent,
      labelledBy: dialog.getAttribute('aria-labelledby') };
  });
  assert.equal(result.open, true); assert.equal(result.modal, native, `${label}: unexpected modal implementation`);
  assert.equal(result.labelledBy, 'fullscreen-help-title');
  assert.match(result.copy, /home screen/i, `${label}: missing iPhone Home Screen instructions`);
  assert.match(result.instructions, /safari/i, `${label}: missing Safari instruction`);
  assert.match(result.instructions, /share/i, `${label}: missing Share instruction`);
  assert.ok(result.scrollWidth <= result.width + 1, `${label}: horizontal overflow`);
  for (const [name, r] of [['dialog', result.dialog], ['heading', result.heading], ['close', result.close]]) {
    assert.ok(r.width > 0 && r.height > 0 && r.x >= -1 && r.y >= -1 && r.x + r.width <= result.width + 1 && r.y + r.height <= result.height + 1,
      `${label}: ${name} outside viewport: ${JSON.stringify(r)}`);
  }
  assert.ok(result.close.width >= 44 && result.close.height >= 44, `${label}: close touch target below 44px`);
  return result;
}
async function verifyPreviewAssets() {
  const context = await browser.newContext();
  const assetPage = await context.newPage();
  const root = 'http://127.0.0.1:5196/bb8-fpv-pinball/';
  await assetPage.goto(root, { waitUntil: 'networkidle' });
  const assets = await assetPage.evaluate(async () => {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) throw new Error('Missing manifest link');
    const response = await fetch(manifestLink.href);
    if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
    const manifest = await response.json();
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    if (!apple) throw new Error('Missing Apple touch icon');
    const urls = [...manifest.icons.map(icon => new URL(icon.src, manifestLink.href).href), apple.href];
    const images = [];
    for (const url of urls) {
      const image = new Image(); image.src = url; await image.decode();
      images.push({ url, width: image.naturalWidth, height: image.naturalHeight });
    }
    return { manifestUrl: manifestLink.href, manifest, images,
      start: new URL(manifest.start_url, manifestLink.href).href, scope: new URL(manifest.scope, manifestLink.href).href };
  });
  assert.equal(assets.start, root); assert.equal(assets.scope, root);
  assert.equal(assets.manifest.start_url, './'); assert.equal(assets.manifest.scope, './');
  assert.equal(assets.manifest.display, 'fullscreen');
  assert.deepEqual(assets.manifest.display_override, ['fullscreen', 'standalone']);
  for (const image of assets.images) assert.ok(image.url.startsWith(root), `Icon escaped deployed subpath: ${image.url}`);
  for (const size of [180, 192, 512]) assert.ok(assets.images.some(image => image.width === size && image.height === size), `Missing decoded ${size}px icon`);
  await context.close(); cases.push({ name: 'production-subpath-manifest-and-icons', result: 'pass', assets });
}
(async () => {
  assert.ok(['chromium', 'webkit'].includes(engine), 'FULLSCREEN_ENGINE must be chromium or webkit');
  mkdirSync(out, { recursive: true });
  const vite = await import('vite');
  server = await vite.createServer({ server: { host: '127.0.0.1', port: 5195, strictPort: true, watch: { ignored: () => true }, hmr: false } });
  await server.listen();
  preview = await vite.preview({ base: '/bb8-fpv-pinball/', preview: { host: '127.0.0.1', port: 5196, strictPort: true } });
  browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit'
    ? { headless: true, executablePath: process.env.WEBKIT_PATH || undefined }
    : { headless: true, executablePath: process.env.CHROME_PATH || undefined,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')] });
  for (const mode of ['standard', 'prefixed']) {
    const context = await open(mode);
    // Start's real user gesture must request fullscreen before gameplay.
    assert.equal(await page.locator('#game').getAttribute('data-display-mode'), 'fullscreen');
    assert.equal(await page.locator('#fullscreen-help').evaluate(el => el.open), false);
    assert.deepEqual(await page.evaluate(() => window.fullscreenCalls), { enter: 1, exit: 0 });
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => document.getElementById('game').dataset.displayMode === 'browser');
    await page.evaluate(() => { window.fullscreenCalls = { enter: 0, exit: 0 }; });
    assert.equal(await page.locator('#fullscreen').getAttribute('aria-label'), 'Enter fullscreen');
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => document.getElementById('fullscreen').getAttribute('aria-label') === 'Exit fullscreen');
    assert.equal(await page.locator('#fullscreen-help').evaluate(el => el.open), false);
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => document.getElementById('fullscreen').getAttribute('aria-label') === 'Enter fullscreen');
    assert.deepEqual(await page.evaluate(() => window.fullscreenCalls), { enter: 1, exit: 1 });
    await page.locator('#fullscreen').click(); await page.evaluate(() => window.fixtureExit());
    assert.equal(await page.locator('#fullscreen').getAttribute('aria-label'), 'Enter fullscreen', 'Browser-initiated exit must update label');
    await capture(`${mode}-landscape`);
    cases.push({ name: mode, result: 'pass' }); await context.close(); page = undefined;
  }
  {
    const context = await open('native', { width: 1440, height: 900 }, false);
    const available = await page.evaluate(() => typeof document.getElementById('game').requestFullscreen === 'function' ||
      typeof document.getElementById('game').webkitRequestFullscreen === 'function');
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => document.fullscreenElement || document.webkitFullscreenElement || document.getElementById('fullscreen-help').open);
    const entered = await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement));
    if (entered) {
      assert.equal(await page.locator('#fullscreen').getAttribute('aria-label'), 'Exit fullscreen');
      await capture('native-desktop-fullscreen');
      await page.locator('#fullscreen').click();
      await page.waitForFunction(() => !document.fullscreenElement && !document.webkitFullscreenElement);
      assert.equal(await page.locator('#fullscreen').getAttribute('aria-label'), 'Enter fullscreen');
    } else {
      await helpGeometry('native-browser-fallback');
    }
    cases.push({ name: 'native-desktop-smoke', result: 'pass', available, entered,
      note: entered ? 'Actual engine fullscreen enter and exit succeeded.' : 'Engine did not grant native fullscreen; app showed its fallback. Native fullscreen remains unverified.' });
    await context.close(); page = undefined;
  }
  const titles = {};
  for (const mode of ['unsupported', 'rejected', 'legacy-dialog']) {
    for (const fixture of [
      { name: 'desktop', width: 1440, height: 900, mobile: false },
      { name: 'phone-portrait', width: 390, height: 844, mobile: true },
      { name: 'phone-landscape', width: 844, height: 390, mobile: true },
      { name: 'compact-landscape', width: 568, height: 320, mobile: true },
    ]) {
      const context = await open(mode, { width: fixture.width, height: fixture.height }, fixture.mobile);
      assert.equal(await page.locator('#fullscreen-help').evaluate(el => el.open), false, 'Start never blocks play with a fullscreen notice');
      assert.equal(await page.locator('#game').getAttribute('data-display-mode'), 'browser');
      if (mode === 'rejected' && fixture.mobile) {
        await page.evaluate(() => document.dispatchEvent(new Event('fullscreenerror')));
        assert.equal(await page.locator('#fullscreen-help').evaluate(el => el.open), false, 'Delayed automatic request error must not interrupt play');
      }
      if (mode === 'unsupported' || mode === 'legacy-dialog') {
        assert.equal(await page.locator('#fullscreen').getAttribute('aria-label'), 'Play without browser bars');
        assert.equal((await page.locator('#fullscreen').innerText()).trim(), 'APP');
      }
      // Set a paused game without its separate pause overlay intercepting the
      // fullscreen button. Escape from help must never toggle pause off.
      await page.evaluate(() => { window.orbitDebug.sim.paused = true; });
      await page.locator('#fullscreen').click();
      await page.waitForFunction(() => document.getElementById('fullscreen-help').open);
      const geometry = await helpGeometry(`${mode}-${fixture.name}`, mode !== 'legacy-dialog'); titles[mode] = geometry.title;
      const rendering = await capture(`${mode}-${fixture.name}`);
      if (mode === 'legacy-dialog') {
        assert.equal(await page.locator('#fullscreen-help').getAttribute('aria-modal'), 'true');
        await page.locator('#fullscreen-help-close').focus(); await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'fullscreen-help-body');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'fullscreen-help-close');
        await page.evaluate(() => document.getElementById('resume').focus());
        assert.equal(await page.evaluate(() => document.activeElement.id), 'fullscreen-help-title');
        assert.equal(await page.locator('#modal').getAttribute('aria-hidden'), 'true');
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        assert.equal(await page.locator('.fullscreen-help-overlay').evaluate(el => el.inert), false);
        await page.locator('#fullscreen-help-title').focus();
      }

      if (fixture.name === 'compact-landscape') {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'fullscreen-help-body', 'Keyboard must reach scrollable instructions');
        await page.keyboard.press('ArrowDown');
        await page.waitForFunction(() => document.getElementById('fullscreen-help-body').scrollTop > 0);
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('fullscreen-help').open);
      await page.waitForFunction(() => document.activeElement.id === 'resume');
      assert.equal(await page.evaluate(() => window.orbitDebug.sim.paused), true, 'Help Escape resumed a paused game');
      if (mode === 'legacy-dialog') {
        assert.equal(await page.locator('.fullscreen-help-overlay').count(), 0);
        assert.equal(await page.locator('#modal').getAttribute('aria-hidden'), null);
      }
      await page.locator('#resume').click();
      await page.evaluate(() => {
        for (const [index, id] of ['left', 'right', 'launch'].entries()) document.getElementById(id).dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 701 + index, pointerType: 'touch', button: 0, bubbles: true, cancelable: true,
        }));
        // Physics is frozen in visual fixtures; seed an already accumulated charge.
        window.orbitDebug.sim.charge = 0.6;
      });
      assert.deepEqual(await page.evaluate(() => ({ ...window.orbitDebug.sim.controls })), { left: true, right: true, launch: true });
      await page.locator('#fullscreen').click();
      await page.waitForFunction(() => document.getElementById('fullscreen-help').open);
      assert.deepEqual(await page.evaluate(() => ({ ...window.orbitDebug.sim.controls })), { left: false, right: false, launch: false }, 'Help must clear every simultaneous hold');
      assert.equal(await page.evaluate(() => window.orbitDebug.sim.charge), 0, 'Help must cancel accumulated launch charge');
      await page.evaluate(() => {
        for (const pointerId of [701, 702, 703]) window.dispatchEvent(new PointerEvent('pointerup', { pointerId, pointerType: 'touch' }));
      });
      assert.equal(await page.evaluate(() => window.orbitDebug.sim.phase), 'ready', 'Late releases must not launch the ball');
      await page.locator('#fullscreen-help-close').click();
      assert.equal(await page.locator('#fullscreen-help').evaluate(el => el.open), false);
      await page.waitForFunction(() => document.activeElement.id === 'resume');
      assert.equal(await page.evaluate(() => window.orbitDebug.sim.paused), true, 'Closing help resumed a paused game');
      cases.push({ name: `${mode}-${fixture.name}`, result: 'pass', geometry, rendering });
      console.log(`${engine} ${mode}-${fixture.name}: pass`);
      await context.close(); page = undefined;
    }
  }
  assert.notEqual(titles.unsupported, titles.rejected, 'Unsupported and rejected help need distinct explanations');
  for (const mode of ['unsupported', 'legacy-dialog']) {
    const context = await open(mode, { width: 1440, height: 900 }, false, false);
    await page.locator('#fullscreen').click();
    if (mode === 'legacy-dialog') {
      await page.evaluate(() => document.getElementById('start').focus());
      assert.equal(await page.evaluate(() => document.activeElement.id), 'fullscreen-help-title');
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('fullscreen-help').open && document.activeElement.id === 'fullscreen');
    assert.equal(await page.evaluate(() => window.orbitDebug.sim.phase), 'intro');
    cases.push({ name: `${mode}-intro-help-restores-invoker-focus`, result: 'pass' });
    await context.close(); page = undefined;
  }

  {
    const context = await open('unsupported');
    await page.locator('#fullscreen').click();
    await page.evaluate(() => { window.orbitDebug.sim.phase = 'over'; });
    await page.waitForFunction(() => !document.getElementById('modal').hidden && document.getElementById('resume').hidden);
    await page.locator('#fullscreen-help-close').click();
    await page.waitForFunction(() => document.activeElement.id === 'restart');
    assert.equal(await page.evaluate(() => window.orbitDebug.sim.phase), 'over');
    cases.push({ name: 'game-over-help-restores-restart-focus', result: 'pass' });
    await context.close(); page = undefined;
  }
  for (const mode of ['standalone', 'display-fullscreen', 'ios-standalone']) {
    const context = await open(mode);
    assert.equal(await page.locator('#fullscreen').isVisible(), false, `${mode}: installed app must hide redundant fullscreen button`);
    assert.equal(await page.locator('#game').getAttribute('data-display-mode'), 'standalone');
    assert.equal(await page.locator('#fullscreen-help').evaluate(el => el.open), false);
    assert.equal(await page.locator('#quality').isVisible(), false);
    assert.equal(await page.locator('#sound').isVisible(), false);
    const views = [];
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      const safe = viewport.width > viewport.height ? { top: 0, right: 47, bottom: 21, left: 47 } : { top: 47, right: 0, bottom: 34, left: 0 };
      await page.evaluate(safe => { for (const [side, value] of Object.entries(safe)) document.documentElement.style.setProperty(`--safe-${side}`, `${value}px`); }, safe);
      await page.waitForFunction(() => {
        const { view } = window.orbitDebug, host = document.getElementById('viewport');
        return Math.abs(view.camera.aspect - host.clientWidth / host.clientHeight) < 0.001;
      });
      if (await page.locator('#resume').isVisible()) await page.locator('#resume').click();
      assert.equal(await page.locator('#modal').isVisible(), false, 'Capture playable game, not pause overlay');
      const geometry = await page.evaluate(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return { id: el.id, x: r.x, y: r.y, width: r.width, height: r.height }; };
        return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
          canvas: rect(document.querySelector('#viewport canvas')), hud: rect(document.getElementById('hud')),
          buttons: ['left', 'launch', 'right', 'pause'].map(id => rect(document.getElementById(id))) };
      });
      assert.ok(geometry.scrollWidth <= geometry.width + 1, `${mode}: horizontal overflow`);
      for (const r of geometry.buttons) assert.ok(r.width >= 44 && r.height >= 44 && r.x >= -1 && r.y >= -1 &&
        r.x + r.width <= geometry.width + 1 && r.y + r.height <= geometry.height + 1, `${mode}: invalid standalone control bounds ${JSON.stringify(r)}`);
      for (const r of geometry.buttons) assert.ok(r.x >= safe.left && r.y >= safe.top && r.x + r.width <= viewport.width - safe.right + 1 && r.y + r.height <= viewport.height - safe.bottom + 1, `${mode}: control infringes simulated safe area`);
      assert.equal(geometry.canvas.x, 0); assert.equal(geometry.canvas.y, 0);
      assert.equal(geometry.canvas.width, viewport.width); assert.equal(geometry.canvas.height, viewport.height);
      assert.ok(geometry.hud.height < 85, 'Installed gameplay keeps a compact HUD');
      const rendering = await capture(`${mode}-${viewport.width > viewport.height ? 'landscape' : 'portrait'}`);
      views.push({ geometry, rendering });
    }
    const play = await page.evaluate(() => {
      const { sim } = window.orbitDebug;
      const pointer = (id, type, pointerId) => document.getElementById(id).dispatchEvent(new PointerEvent(type, {
        pointerId, pointerType: 'touch', button: 0, bubbles: true, cancelable: true,
      }));
      pointer('left', 'pointerdown', 801); pointer('right', 'pointerdown', 802);
      const simultaneous = sim.controls.left && sim.controls.right;
      pointer('left', 'pointerup', 801); pointer('right', 'pointerup', 802);
      pointer('launch', 'pointerdown', 803);
      for (let i = 0; i < 90; i++) sim.step();
      const charge = sim.charge;
      pointer('launch', 'pointerup', 803); sim.step();
      const launched = sim.phase === 'playing';
      const from = { ...sim.position };
      for (let i = 0; i < 60; i++) sim.step();
      return { simultaneous, charge, launched, from, to: { ...sim.position }, controls: { ...sim.controls } };
    });
    assert.equal(play.simultaneous, true); assert.ok(play.charge > .5); assert.equal(play.launched, true);
    assert.ok(Math.hypot(play.to.x - play.from.x, play.to.z - play.from.z) > 1, 'Installed launch must move the physical ball');
    assert.deepEqual(play.controls, { left: false, right: false, launch: false });
    await capture(`${mode}-playing-landscape`);
    await page.locator('#pause').click();
    assert.equal(await page.locator('#dialog-quality').isVisible(), true);
    assert.equal(await page.locator('#dialog-sound').isVisible(), true);
    const quality = await page.locator('#dialog-quality').innerText();
    await page.locator('#dialog-quality').click();
    assert.notEqual(await page.locator('#dialog-quality').innerText(), quality);
    await page.locator('#resume').click();
    assert.equal(await page.evaluate(() => window.orbitDebug.sim.paused), false);
    cases.push({ name: mode, result: 'pass', views, play }); await context.close(); page = undefined;
  }
  for (const mode of ['standard', 'prefixed', 'standalone']) {
    for (const entry of ['intro', 'pause', 'game-over']) {
      const context = await open(`${mode}-look`, { width: 844, height: 390 }, true, false);
      if (entry !== 'intro') {
        await page.locator('#start').click();
        assert.equal(await page.evaluate(() => window.fullscreenCalls.enter), mode === 'standalone' ? 0 : 1,
          'Ordinary touch Start still requests supported fullscreen');
        if (entry === 'game-over') {
          if (mode !== 'standalone') await page.evaluate(() => window.fixtureExit());
          await page.evaluate(() => { window.orbitDebug.sim.phase = 'over'; });
          await page.locator('#restart').waitFor({ state: 'visible' });
        } else await page.locator('#pause').click();
        await page.locator('#dialog-look').click();
      } else await page.locator('#look-settings').click();
      const enters = await page.evaluate(() => window.fullscreenCalls.enter);
      await page.locator('#look-enable').click();
      await page.waitForFunction(() => ['waiting', 'unavailable'].includes(window.orbitDebug.phoneLook.state));
      assert.equal(await page.evaluate(() => window.orbitDebug.phoneLook.state), 'waiting', 'Phone-look permission must retain user activation');
      assert.equal(await page.evaluate(() => window.fullscreenCalls.enter), enters, 'Phone-look setup must not consume activation with fullscreen');
      assert.deepEqual(await page.evaluate(() => ({ requests: window.fullscreenLook.requests,
        denied: window.fullscreenLook.deniedForActivation })), { requests: 1, denied: 0 });
      await page.waitForFunction(() => {
        window.fullscreenLook.emit();
        window.fullscreenRender(window.orbitDebug.sim, 1 / 60);
        return window.orbitDebug.phoneLook.state === 'calibrating';
      });
      await page.locator('#look-center').click();
      await page.waitForFunction(() => {
        window.fullscreenLook.emit();
        window.fullscreenRender(window.orbitDebug.sim, 1 / 60);
        return window.orbitDebug.phoneLook.state === 'active';
      });
      assert.equal(await page.locator('#dialog-quality').isVisible(), true);
      assert.equal(await page.locator('#dialog-look').isVisible(), true);
      assert.equal(await page.locator('#dialog-sound').isVisible(), true);
      const quality = await page.locator('#dialog-quality').innerText();
      await page.locator('#dialog-quality').click();
      assert.notEqual(await page.locator('#dialog-quality').innerText(), quality);
      await page.locator('#resume').click();
      assert.equal(await page.evaluate(() => window.orbitDebug.sim.paused), false);
      await page.locator('#look-live').waitFor({ state: 'visible' });
      const controls = await page.evaluate(() => ['look-center-live', 'look-follow-live', 'left', 'launch', 'right'].map(id => {
        const el = document.getElementById(id), r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { id, width: r.width, height: r.height, visible: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          hit: hit === el || el.contains(hit) };
      }));
      for (const control of controls) assert.ok(control.width >= 44 && control.height >= 44 && control.visible && control.hit,
        `Combined look/fullscreen control is unusable: ${JSON.stringify(control)}`);
      await capture(`${mode}-look-${entry}`);
      await page.locator('#look-follow-live').click();
      assert.equal(await page.evaluate(() => window.orbitDebug.phoneLook.selected), false);
      cases.push({ name: `${mode}-look-${entry}-preserves-permission-and-controls`, result: 'pass', controls });
      await context.close(); page = undefined;
    }
  }
  await verifyPreviewAssets();
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ result: 'pass', engine, version: browser.version(), cases, errors,
    limits: ['API outcomes and installed-app signals are deterministic injected fixtures, not native fullscreen or installation proof.',
      'Desktop and touch screenshots use actual WebGL with frozen simulation. No device FPS claim.',
      'Linux WebKit is engine evidence, not physical iPhone Safari, browser-toolbar removal, or Add to Home Screen validation.'] }, null, 2) + '\n');
  console.log(`${engine}: all fullscreen and production-subpath checks pass`);
})().catch(async error => {
  console.error(error); process.exitCode = 1; mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/failure.json`, JSON.stringify({ error: error.stack, cases, errors }, null, 2));
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
}).finally(async () => {
  if (browser) await browser.close(); if (server) await server.close();
  if (preview) await new Promise(resolve => preview.httpServer.close(resolve));
});

