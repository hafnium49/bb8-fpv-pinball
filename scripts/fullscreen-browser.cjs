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
  let active = null;
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
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
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
async function helpGeometry(label) {
  const result = await page.evaluate(() => {
    const dialog = document.getElementById('fullscreen-help');
    const bounds = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { open: dialog.open, modal: dialog.matches(':modal'), dialog: bounds(dialog), heading: bounds(document.getElementById('fullscreen-help-title')), close: bounds(document.getElementById('fullscreen-help-close')),
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      title: document.getElementById('fullscreen-help-title').textContent,
      copy: document.getElementById('fullscreen-help-copy').textContent, instructions: dialog.textContent,
      labelledBy: dialog.getAttribute('aria-labelledby') };
  });
  assert.equal(result.open, true); assert.equal(result.modal, true, `${label}: help must be a native modal dialog`);
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
  assert.equal(assets.manifest.display, 'standalone');
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
  for (const mode of ['unsupported', 'rejected']) {
    for (const fixture of [
      { name: 'desktop', width: 1440, height: 900, mobile: false },
      { name: 'phone-portrait', width: 390, height: 844, mobile: true },
      { name: 'phone-landscape', width: 844, height: 390, mobile: true },
      { name: 'compact-landscape', width: 568, height: 320, mobile: true },
    ]) {
      const context = await open(mode, { width: fixture.width, height: fixture.height }, fixture.mobile);
      if (mode === 'unsupported') {
        assert.equal(await page.locator('#fullscreen').getAttribute('aria-label'), 'Play without browser bars');
        assert.equal((await page.locator('#fullscreen').innerText()).trim(), 'APP');
      }
      // Set a paused game without its separate pause overlay intercepting the
      // fullscreen button. Escape from help must never toggle pause off.
      await page.evaluate(() => { window.orbitDebug.sim.paused = true; });
      await page.locator('#fullscreen').click();
      await page.waitForFunction(() => document.getElementById('fullscreen-help').open);
      const geometry = await helpGeometry(`${mode}-${fixture.name}`); titles[mode] = geometry.title;
      const rendering = await capture(`${mode}-${fixture.name}`);
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
  {
    const context = await open('unsupported', { width: 1440, height: 900 }, false, false);
    await page.locator('#fullscreen').click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('fullscreen-help').open && document.activeElement.id === 'fullscreen');
    assert.equal(await page.evaluate(() => window.orbitDebug.sim.phase), 'intro');
    cases.push({ name: 'intro-help-restores-invoker-focus', result: 'pass' });
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
    const views = [];
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const { view } = window.orbitDebug, host = document.getElementById('viewport');
        return Math.abs(view.camera.aspect - host.clientWidth / host.clientHeight) < 0.001;
      });
      const geometry = await page.evaluate(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return { id: el.id, x: r.x, y: r.y, width: r.width, height: r.height }; };
        return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
          buttons: ['left', 'launch', 'right', 'quality', 'sound', 'pause'].map(id => rect(document.getElementById(id))) };
      });
      assert.ok(geometry.scrollWidth <= geometry.width + 1, `${mode}: horizontal overflow`);
      for (const r of geometry.buttons) assert.ok(r.width >= 44 && r.height >= 44 && r.x >= -1 && r.y >= -1 &&
        r.x + r.width <= geometry.width + 1 && r.y + r.height <= geometry.height + 1, `${mode}: invalid standalone control bounds ${JSON.stringify(r)}`);
      const rendering = await capture(`${mode}-${viewport.width > viewport.height ? 'landscape' : 'portrait'}`);
      views.push({ geometry, rendering });
    }
    cases.push({ name: mode, result: 'pass', views }); await context.close(); page = undefined;
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
