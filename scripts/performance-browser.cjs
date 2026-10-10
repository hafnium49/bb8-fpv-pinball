// Desktop performance comparison. Default GPU is software, not a hardware FPS claim.
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
let server, browser;
(async () => {
  const { createServer } = await import('vite');
  server = await createServer({ cacheDir: 'artifacts/performance/vite-cache', server: { host: '127.0.0.1', port: 5194, strictPort: true,
    watch: { ignored: () => true }, hmr: false } });
  await server.listen();
  const software = process.env.PERF_GPU !== 'hardware';
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: process.env.PERF_HEADLESS !== '0',
    args: software ? ['--no-sandbox', '--no-zygote', '--single-process', '--in-process-gpu',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' || (m.type() === 'warning' && /INVALID_|Shader Error|not compiled/.test(m.text()))) errors.push(m.text());
    if (m.text().startsWith('PERF ')) console.log(m.text());
  });
  await page.goto(server.resolvedUrls.local[0] + '?circuit=1', { waitUntil: 'networkidle' });
  await page.locator('#start:not([disabled])').waitFor();
  const report = await page.evaluate(async () => {
    const { sim, view, headLoss, begin, audio } = window.orbitDebug;
    const geo = await import('/src/physics/route-geometry.ts');
    const gl = view.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const stats = values => {
      if (!values.length) return null;
      const a = [...values].sort((a, b) => a - b);
      return { median: a[Math.floor(a.length / 2)], p95: a[Math.min(a.length - 1, Math.floor(a.length * .95))], samples: a.length };
    };
    const measure = () => {
      if (!timer) return null;
      const query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query); return query;
    };
    const finish = query => { if (query) gl.endQuery(timer.TIME_ELAPSED_EXT); };
    const collect = async queries => {
      const values = [], pending = queries.filter(Boolean), deadline = performance.now() + 10000;
      while (pending.length && performance.now() < deadline) {
        if (gl.getParameter(timer.GPU_DISJOINT_EXT)) { values.length = 0; break; }
        for (let i = pending.length - 1; i >= 0; i--) if (gl.getQueryParameter(pending[i], gl.QUERY_RESULT_AVAILABLE)) {
          values.push(gl.getQueryParameter(pending[i], gl.QUERY_RESULT) / 1e6); gl.deleteQuery(pending[i]); pending.splice(i, 1);
        }
        if (pending.length) await new Promise(requestAnimationFrame);
      }
      for (const query of pending) gl.deleteQuery(query);
      return stats(values);
    };
    const phases = {};
    const wrap = (obj, key, label) => {
      const original = obj[key].bind(obj);
      phases[label] = [];
      obj[key] = (...args) => { const start = performance.now(); const out = original(...args); phases[label].push(performance.now() - start); return out; };
    };
    wrap(sim, 'update', 'physics'); wrap(view.table, 'update', 'mechanisms');
    wrap(view.effects, 'update', 'particles'); wrap(view.clearance, 'place', 'cameraSweep');
    wrap(view.routeCamera, 'update', 'cameraHeading'); wrap(audio, 'update', 'audio');
    const render = view.render.bind(view);
    view.render = () => {};
    headLoss.draw = () => 1;
    begin(); sim.launch(.5); sim.step(); sim.paused = true; sim.events.length = 0;
    if (view.budget) view.budget.enabled = false;
    const poses = [{ name: 'launch', p: { x: 5.18, y: .31, z: 8.7 }, heading: 0, pitch: 0 },
      { name: 'ground', p: { x: -4, y: .305, z: -1 }, heading: .35, pitch: 0 }];
    for (const [name, start, end] of [['bridge', geo.bridgeStart, geo.bridgeEnd], ['tunnel', geo.tunnelStart, geo.tunnelEnd]]) {
      const f = geo.frames[Math.floor((start + end) / 2)];
      poses.push({ name, p: f.c, heading: Math.atan2(f.tangent.x, -f.tangent.z),
        pitch: Math.max(-Math.PI / 10, Math.min(Math.PI / 10, Math.asin(f.tangent.y))) });
    }
    const fixed = [];
    for (const high of [true, false]) {
      view.setQuality(high);
      for (const pose of poses) {
        sim.ball.setTranslation(pose.p, true); view.heading = pose.heading; view.routeCamera.pitch = pose.pitch;
        view.mode = 'fpv'; view.clearance.reset(); view.effects.reset();
        let warmQuery;
        for (let n = 0; n < 6; n++) {
          await new Promise(requestAnimationFrame);
          if (n === 5) warmQuery = measure(); render(sim, 1 / 60); if (n === 5) finish(warmQuery);
        }
        // Drain warm-up asynchronously. Keep one timed frame in flight so a
        // software GPU cannot silently lose late samples to the query deadline.
        if (warmQuery && (await collect([warmQuery]))?.samples !== 1) throw new Error('GPU warm-up query timed out or became disjoint');
        const intervals = [], submit = [], gpuTimes = []; let previous;
        for (let n = 0; n < 16; n++) {
          const now = await new Promise(requestAnimationFrame);
          if (previous !== undefined) intervals.push(now - previous); previous = now;
          const query = measure(), t = performance.now(); render(sim, 1 / 60); submit.push(performance.now() - t); finish(query);
          if (query) {
            const sample = await collect([query]);
            if (sample?.samples !== 1) throw new Error('GPU sample timed out or became disjoint');
            gpuTimes.push(sample.median);
          }
        }
        fixed.push({ quality: high ? 'High' : 'Eco', pose: pose.name,
          size: [view.renderer.domElement.width, view.renderer.domElement.height],
          calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles,
          memory: { ...view.renderer.info.memory }, programs: view.renderer.info.programs.length,
          submitMs: stats(submit), rafMs: timer ? null : stats(intervals), gpuMs: stats(gpuTimes),
          camera: view.camera.position.toArray() });
        console.log('PERF ' + (high ? 'High' : 'Eco') + ' ' + pose.name + ' captured');
      }
    }
    const heldPhases = Object.fromEntries(Object.entries(phases).filter(([, a]) => a.length).map(([k, a]) => [k, stats(a)]));
    for (const a of Object.values(phases)) a.length = 0;
    // Exercise actual fixed-step physics and rendering for a timed run.
    view.render = render; view.setQuality(true);
    if (view.budget) { view.budget.enabled = true; view.budget.reset(); }
    begin(); sim.launch(.6);
    const frameTimes = [], t0 = performance.now(); let last;
    await new Promise(resolve => {
      const tick = now => { if (last !== undefined) frameTimes.push(now - last); last = now;
        if (now - t0 > 10000) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    const live = { durationSeconds: (performance.now() - t0) / 1000, frames: frameTimes.length,
      rafMs: stats(frameTimes), phase: sim.phase, finalPixelRatio: view.renderer.getPixelRatio(),
      budget: view.budget ? { scale: view.budget.scale, level: view.budget.level } : null,
      phases: Object.fromEntries(Object.entries(phases).filter(([, a]) => a.length).map(([k, a]) => [k, stats(a)])) };
    sim.paused = true; view.render = () => {};
    return { fixed, heldPhases, live, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      parallelCompile: !!gl.getExtension('KHR_parallel_shader_compile'), multiDraw: !!gl.getExtension('WEBGL_multi_draw'),
      webgpuAvailable: !!navigator.gpu };
  });
  report.label = process.env.PERF_LABEL || 'candidate'; report.baseCommit = 'b980a1a3e0968b58b9f72800a006fed507f088ae';
  report.browser = browser.version(); report.viewport = { width: 1440, height: 900, devicePixelRatio: 1 };
  report.errors = errors;
  report.limitations = [software ? 'Linux Chromium with ANGLE SwiftShader; timings compare this runner only, not a physical PC GPU.' :
    'Hardware requested; verify the reported renderer. Headless delivery can differ from a visible browser window.',
    'Fixed samples use identical held poses, warm-up and resolution with adaptive quality disabled.',
    'submitMs is JavaScript submission time; rafMs includes GPU/compositor work. gpuMs uses nonblocking EXT_disjoint_timer_query_webgl2 when available.',
    'Timed fixed frames are paced one in flight; they measure isolated GPU workloads, not presented gameplay FPS.',
    'The live ten-second trial follows actual physics; trajectories and automatic quality can differ.'];
  const out = process.env.PERF_REPORT_PATH || 'artifacts/performance/candidate.json';
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ out, errors, renderer: report.renderer, fixed: report.fixed.map(c => ({ quality: c.quality, pose: c.pose, calls: c.calls, gpuMs: c.gpuMs })), live: report.live }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) await server.close();
});
