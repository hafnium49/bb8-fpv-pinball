// Functional desktop renderer checks; synthetic frame pressure is not an FPS benchmark.
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
let server, browser;
(async () => {
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5196, strictPort: true, watch: { ignored: () => true }, hmr: false } });
  await server.listen();
  const engine = process.env.RENDER_ENGINE || 'chromium';
  assert.ok(['chromium', 'webkit'].includes(engine));
  browser = engine === 'webkit' ? await webkit.launch({ headless: true, executablePath: process.env.WEBKIT_PATH }) :
    await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH,
      args: ['--no-sandbox', '--no-zygote', '--single-process', '--in-process-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(90000); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.resolvedUrls.local[0] + '?table=orbit&circuit=1', { waitUntil: 'networkidle' });
  await page.locator('#start:not([disabled])').waitFor(); await page.locator('#start').click();
  const result = await page.evaluate(async () => {
    const { sim, view } = window.orbitDebug, render = view.render.bind(view);
    view.render = () => {}; view.budget.enabled = false; sim.paused = true;
    view.setQuality(true); render(sim, 0); const cold = view.renderer.info.render.calls;
    render(sim, 0); const cached = view.renderer.info.render.calls;
    const beforeFlipperWorld = [...view.table.flipperGroups[0].matrixWorld.elements];
    sim.paused = false; sim.controls.left = true; sim.update(1 / 60); sim.controls.left = false; sim.paused = true;
    render(sim, 0); const flipper = view.renderer.info.render.calls;
    const flipperWorld = [...view.table.flipperGroups[0].matrixWorld.elements], flipperAngle = view.table.flipperGroups[0].rotation.y;
    render(sim, 0); const flipperCached = view.renderer.info.render.calls;
    sim.events.push({ type: 'bumper', index: 0, points: 100 }); render(sim, 0);
    const bumper = view.renderer.info.render.calls; sim.events.length = 0;
    const cap = view.table.caps[0], popup = view.effects.popups.find(p => p.sprite.visible).sprite;
    const motion = { sceneTraverses: view.scene.matrixWorldAutoUpdate,
      flipperChanged: flipperWorld.some((v, i) => Math.abs(v - beforeFlipperWorld[i]) > 1e-6),
      flipperMatches: Math.abs(flipperWorld[0] - Math.cos(flipperAngle)) < 1e-6 && Math.abs(flipperWorld[8] - Math.sin(flipperAngle)) < 1e-6,
      bumperY: cap.matrixWorld.elements[13], bumperLocalY: cap.position.y,
      popupWorld: [popup.matrixWorld.elements[12], popup.matrixWorld.elements[13], popup.matrixWorld.elements[14]],
      popupLocal: popup.position.toArray() };
    view.effects.reset(); render(sim, 0);
    const positionVersion = view.effects.geometry.attributes.position.version;
    let projections = 0; const projection = view.camera.updateProjectionMatrix.bind(view.camera);
    view.camera.updateProjectionMatrix = () => { projections++; projection(); };
    for (let i = 0; i < 12; i++) render(sim, 0);
    const idleProjections = projections, idlePositionVersion = view.effects.geometry.attributes.position.version;
    view.resize(); render(sim, 0); const resizeProjections = projections;
    // Expired particle pools stop uploads and disappear completely.
    view.effects.hit(0, 0, 0xffae52, 100); view.effects.update(.1, sim.position, 0, false);
    const particlesVisible = view.effects.points.visible;
    view.effects.update(2, sim.position, 0, false); const expiredVisible = view.effects.points.visible;
    view.effects.reset();
    // Warm both variants, then ensure repeated switches do not accumulate textures.
    for (let i = 0; i < 2; i++) { view.setQuality(false); render(sim, 0); view.setQuality(true); render(sim, 0); }
    const texturesBefore = view.renderer.info.memory.textures;
    for (let i = 0; i < 5; i++) { view.setQuality(false); render(sim, 0); view.setQuality(true); render(sim, 0); }
    const texturesAfter = view.renderer.info.memory.textures;
    // Emulate a GPU without float render targets. High retains its cabinet and
    // shadows, using direct tone-mapped output instead of clipping into RGBA8.
    view.setQuality(false);
    const has = view.renderer.extensions.has.bind(view.renderer.extensions);
    view.renderer.extensions.has = name => name === 'EXT_color_buffer_float' ? false : has(name);
    view.setQuality(true); render(sim, 0);
    const fallback = { direct: !view.post, high: view.highQuality, calls: view.renderer.info.render.calls };
    view.renderer.extensions.has = has;
    view.setQuality(false); view.setQuality(true); render(sim, 0);
    const rect = () => { const r = document.getElementById('left').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    const controlsBefore = rect();
    view.budget.enabled = true; view.budget.reset(); sim.paused = false;
    for (let i = 0; i < 40; i++) render(sim, 1 / 60, 80);
    const adapted = { scale: view.budget.scale, pixelRatio: view.renderer.getPixelRatio(),
      width: view.renderer.domElement.width, height: view.renderer.domElement.height, controls: rect(), high: view.highQuality };
    sim.paused = true; view.budget.enabled = false; view.budget.reset();
    view.container.style.width = '3840px'; view.container.style.height = '2160px'; view.resize();
    const capped = { width: view.renderer.domElement.width, height: view.renderer.domElement.height };
    view.container.style.width = ''; view.container.style.height = ''; view.resize(); render(sim, 0);
    const gl = view.renderer.getContext(); let adapter = null, adapterError = null;
    if (navigator.gpu) {
      try {
        const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        adapter = a ? { vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description, isFallbackAdapter: a.isFallbackAdapter } : null;
      } catch (e) { adapterError = String(e); }
    }
    return { cold, cached, flipper, flipperCached, bumper, idleProjections, resizeProjections,
      positionVersion, idlePositionVersion, particlesVisible, expiredVisible, motion,
      texturesBefore, texturesAfter, fallback, controlsBefore, adapted, capped, batching: view.table.batching,
      webgpu: { exposed: !!navigator.gpu, adapter, adapterError }, hdr: view.post.target.texture.type,
      extensions: { parallelCompile: !!gl.getExtension('KHR_parallel_shader_compile'), timer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') } };
  });
  assert.ok(result.cold > result.cached + 10, 'Idle frames rerender the cabinet shadows');
  assert.ok(result.flipper > result.flipperCached + 10, 'Moving flippers did not invalidate cached shadows');
  assert.ok(result.bumper > result.cached + 10, 'Moving bumper caps did not invalidate cached shadows');
  assert.equal(result.motion.sceneTraverses, true);
  assert.equal(result.motion.flipperChanged && result.motion.flipperMatches, true, 'Flipper world transform did not reach the renderer');
  assert.equal(result.motion.bumperY, result.motion.bumperLocalY, 'Bumper cap world transform is frozen');
  assert.deepEqual(result.motion.popupWorld, result.motion.popupLocal, 'Later-added score sprites have frozen world transforms');
  assert.equal(result.idleProjections, 0); assert.equal(result.resizeProjections, 1);
  assert.equal(result.positionVersion, result.idlePositionVersion, 'Idle particles keep uploading buffers');
  assert.equal(result.particlesVisible, true); assert.equal(result.expiredVisible, false);
  assert.equal(result.texturesAfter, result.texturesBefore, 'Quality switches leak render targets');
  assert.equal(result.fallback.direct && result.fallback.high, true, 'Unsupported HDR targets need direct tone-mapped output');
  assert.ok(result.fallback.calls > 10, 'Fallback did not render the scene');
  assert.equal(result.adapted.scale, .5); assert.equal(result.adapted.pixelRatio, .5);
  assert.equal(result.adapted.high, true); assert.deepEqual(result.controlsBefore, result.adapted.controls);
  assert.ok(result.capped.width * result.capped.height <= 3_000_000);
  assert.ok(result.batching.removed > result.batching.batches);
  assert.deepEqual(errors, []);
  const out = `artifacts/render-${engine}`; mkdirSync(out, { recursive: true });
  await page.screenshot({ path: out + '/desktop.png' });
  writeFileSync(out + '/report.json', JSON.stringify({ engine, browser: browser.version(), result, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ engine, result, errors }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) await server.close();
});
