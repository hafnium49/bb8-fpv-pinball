// Held-pose render counters, not a frame-rate or gameplay benchmark.
// Run from the repository root; CHROME_PATH optionally selects a browser.
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
let server, browser;

(async () => {
  const { createServer } = await import('vite');
  server = await createServer({
    server: { host: '127.0.0.1', port: 5192, strictPort: true,
      watch: { ignored: () => true }, hmr: false },
  });
  await server.listen();
  const launch = {
    headless: true, executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--no-zygote', '--single-process', '--in-process-gpu',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  };
  const cases = [];
  let browserVersion;
  for (const circuit of [false, true]) {
    // Fresh browser per variant supports the single-process software-GPU setup.
    browser = await chromium.launch(launch);
    browserVersion = browser.version();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(60000);
    await page.goto(server.resolvedUrls.local[0] + (circuit ? '?circuit=1' : ''),
      { waitUntil: 'networkidle' });
    await page.locator('#start:not([disabled])').waitFor();
    const rows = await page.evaluate(async ({ circuit }) => {
      const { sim, view, headLoss } = window.orbitDebug;
      const geo = await import('/src/physics/route-geometry.ts');
      headLoss.draw = () => 1;
      sim.start(); sim.launch(0.5); sim.step(); sim.paused = true;
      sim.events.length = 0;
      const render = view.render.bind(view);
      view.render = () => {};
      const poses = [
        { name: 'launch', position: { x: 5.18, y: 0.31, z: 8.7 }, heading: 0, pitch: 0 },
        { name: 'ground-bumpers', position: { x: -4, y: 0.305, z: -1 }, heading: 0.35, pitch: 0 },
      ];
      if (circuit) {
        for (const [name, index] of [
          ['bridge', Math.floor((geo.bridgeStart + geo.bridgeEnd) / 2)],
          ['tunnel', Math.floor((geo.tunnelStart + geo.tunnelEnd) / 2)],
        ]) {
          const frame = geo.frames[index];
          poses.push({ name, position: frame.c,
            heading: Math.atan2(frame.tangent.x, -frame.tangent.z),
            pitch: Math.max(-Math.PI / 10, Math.min(Math.PI / 10, Math.asin(frame.tangent.y))) });
        }
      }
      const samples = [];
      // Deliberately resize the render container, not the browser/device model.
      for (const [width, height] of [[1440, 900], [844, 390]]) {
        view.container.style.width = width + 'px';
        view.container.style.height = height + 'px'; view.resize();
        for (const high of [false, true]) {
          view.setQuality(high);
          for (const pose of poses) {
            sim.ball.setTranslation(pose.position, true);
            view.heading = pose.heading; view.routeCamera.pitch = pose.pitch;
            view.mode = 'fpv'; render(sim, 1 / 60); render(sim, 1 / 60);
            samples.push({ variant: circuit ? 'circuit' : 'classic', viewport: { width, height },
              quality: high ? 'High' : 'Eco', pose: pose.name, ballPosition: pose.position,
              cameraPosition: view.camera.position.toArray(), calls: view.renderer.info.render.calls,
              triangles: view.renderer.info.render.triangles, memory: { ...view.renderer.info.memory },
              programs: view.renderer.info.programs.length });
          }
        }
      }
      return samples;
    }, { circuit });
    cases.push(...rows);
    await browser.close(); browser = undefined;
  }
  const report = {
    comparisonBaselineCommit: '51b452b91fee4fd1233dc0d69030ee46d65eafcf',
    scope: 'Static render-cost samples of the checked-out FPV renderer',
    browser: browserVersion, gpu: 'ANGLE SwiftShader', browserViewport: { width: 1440, height: 900 },
    cases,
    limitations: [
      'Not a device FPS benchmark or mobile device emulation.',
      'Draw calls and triangles include all High composer/shadow passes; compare the same pose/quality/viewport and warm-up order.',
      'Ball poses are held by the dev inspection hook; they are not gameplay success trials.',
    ],
  };
  const output = process.env.RENDER_REPORT_PATH || 'artifacts/cabinet-design/render-cost.json';
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ samples: cases.length, output }));
})().catch(error => {
  console.error(error); process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});
