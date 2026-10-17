// Cloud-only directional workload estimator. Run from repo root or set APP_ROOT.
const { createRequire } = require('node:module');
const { resolve, join } = require('node:path');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const root = resolve(process.env.APP_ROOT || process.cwd());
const req = createRequire(join(root, 'package.json'));
const { chromium } = req('playwright');
const out = resolve(process.env.RENDER_OUT || join(__dirname, 'evidence'));
let server, browser;
(async () => {
  mkdirSync(out, { recursive: true });
  const { createServer } = await import(req.resolve('vite'));
  server = await createServer({ root, cacheDir: join(out, 'vite-cache'), server: { host: '127.0.0.1', port: 5198, strictPort: true, watch: { ignored: () => true }, hmr: false } });
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--no-zygote', '--single-process', '--in-process-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.text().startsWith('SWEEP ')) console.log(m.text()); });
  await page.goto(server.resolvedUrls.local[0] + '?table=orbit&circuit=1', { waitUntil: 'networkidle' });
  await page.locator('#start:not([disabled])').waitFor();
  const report = await page.evaluate(async () => {
    const { sim, view, headLoss, begin } = window.orbitDebug;
    const geo = await import('/src/physics/route-geometry.ts');
    const render = view.render.bind(view); view.render = () => {}; headLoss.draw = () => 1;
    begin(); sim.launch(.5); sim.step(); sim.paused = true; sim.events.length = 0; view.budget.enabled = false;
    const gl = view.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const stats = values => { const a = [...values].sort((a,b) => a-b); return { median: a.length % 2 ? a[(a.length-1)/2] : (a[a.length/2-1]+a[a.length/2])/2, p95: a[Math.ceil(a.length*.95)-1], values }; };
    const poses = [{ name: 'launch', p: { x: 5.18, y: .31, z: 8.7 }, heading: 0, pitch: 0 }, { name: 'ground', p: { x: -4, y: .305, z: -1 }, heading: .35, pitch: 0 }];
    for (const [name, start, end] of [['bridge', geo.bridgeStart, geo.bridgeEnd], ['tunnel', geo.tunnelStart, geo.tunnelEnd]]) {
      const f = geo.frames[Math.floor((start+end)/2)]; poses.push({ name, p: f.c, heading: Math.atan2(f.tangent.x,-f.tangent.z), pitch: Math.max(-Math.PI/10,Math.min(Math.PI/10,Math.asin(f.tangent.y))) });
    }
    const directions = [{name:'forward', yaw:0,pitch:0},{name:'left45',yaw:-45,pitch:0},{name:'right45',yaw:45,pitch:0},{name:'left90',yaw:-90,pitch:0},{name:'right90',yaw:90,pitch:0},{name:'up25',yaw:0,pitch:25},{name:'down25',yaw:0,pitch:-25},{name:'rear180',yaw:180,pitch:0}];
    const fixed=[];
    for (const high of [false,true]) {
      view.setQuality(high);
      for (const pose of poses) for (const direction of directions) {
        sim.ball.setTranslation(pose.p,true); view.routeCamera.heading=pose.heading+direction.yaw*Math.PI/180; view.routeCamera.pitch=pose.pitch+direction.pitch*Math.PI/180;
        view.mode='fpv'; view.clearance.reset(); view.effects.reset();
        for(let n=0;n<4;n++){await new Promise(requestAnimationFrame);render(sim,1/60);}
        const cpu=[],raf=[],calls=[],triangles=[];let previous;
        for(let n=0;n<10;n++) {
          const now=await new Promise(requestAnimationFrame); if(previous!==undefined)raf.push(now-previous);previous=now;
          const start=performance.now();render(sim,1/60);cpu.push(performance.now()-start);
          calls.push(view.renderer.info.render.calls);triangles.push(view.renderer.info.render.triangles);
        }
        fixed.push({quality:high?'High':'Eco',pose:pose.name,direction:direction.name,yawDegrees:direction.yaw,pitchOffsetDegrees:direction.pitch,ballPosition:pose.p,cameraPosition:view.camera.position.toArray(),heading:view.routeCamera.heading,pitch:view.routeCamera.pitch,renderSize:[view.renderer.domElement.width,view.renderer.domElement.height],calls:stats(calls),triangles:stats(triangles),cpuSubmitMs:stats(cpu),rafIntervalMs:stats(raf)});
        console.log('SWEEP '+(high?'High':'Eco')+' '+pose.name+' '+direction.name);
      }
    }
    return { fixed, renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER), viewport:[innerWidth,innerHeight], dpr:devicePixelRatio };
  });
  report.sourceRef=process.env.SOURCE_REF || 'unverified';report.browser=browser.version();report.errors=errors;
  report.limitations=['Cloud Linux Chromium ANGLE SwiftShader software rendering, not iPhone hardware or Safari.', 'Draw calls and triangles are submitted workload counts, not visible triangles, GPU duration, fill-rate, or iPhone FPS.', 'CPU submission and requestAnimationFrame intervals are noisy cloud-only estimates. No GPU timer query, fence or sensor-to-photon latency was measured.', 'Simulation paused; same ball and camera positions within each pose; camera yaw/pitch manually set via debug hook. No production look-around controller or input implemented.', 'Adaptive budget disabled; DPR 1 and fixed 844x390 CSS viewport. High and Eco have different resolution/post-processing. Compare direction within each quality only.', 'Steady-state samples exclude first-view shader compilation and shadow warm-up. No moving physics, particles or concurrent touch/sensor processing.'];
  writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('Written '+join(out,'report.json'));
  if(errors.length) throw new Error(errors.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await server.close();});
