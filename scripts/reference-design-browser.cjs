// Visible reference-design checks and matched render counters, not a hardware FPS benchmark.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
let server, browser;
(async () => {
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5197, strictPort: true, watch: { ignored: () => true }, hmr: false } });
  await server.listen(); mkdirSync('artifacts/reference-design', { recursive: true });
  const errors = [], cases = [];
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['small-pc', { width: 1024, height: 600 }], ['landscape', { width: 844, height: 390 }]]) {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
      args: ['--no-sandbox', '--no-zygote', '--single-process', '--in-process-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport, hasTouch: name === 'landscape' }); page.setDefaultTimeout(90000);
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(server.resolvedUrls.local[0] + '?circuit=1', { waitUntil: 'networkidle' });
    await page.locator('#start:not([disabled])').waitFor();
    await page.evaluate(() => { const {sim,view,headLoss}=window.orbitDebug; headLoss.draw=()=>1; sim.paused=true; view.budget.enabled=false; window.designRender=view.render.bind(view); view.render=()=>{}; window.designRender(sim,0); });
    await page.screenshot({ path: `artifacts/reference-design/${name}-intro.png` });
    if(name==='desktop') {
      mkdirSync('docs/assets/reference-design',{recursive:true});
      await page.screenshot({path:'docs/assets/reference-design/cabinet-pc.jpg',type:'jpeg',quality:90});
    }
    const intro = await page.evaluate(() => {
      const r=id=>{const e=document.getElementById(id), b=e.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height,visible:getComputedStyle(e).display!=='none'};};
      return { ranking:r('ranking-panel'), viewport:r('viewport'), hud:r('hud'), start:r('start'), mode:window.orbitDebug.view.mode,
        startParent:document.getElementById('intro-content').parentElement.id };
    });
    assert.equal(intro.mode,'fpv');
    if(name!=='landscape') {
      assert.equal(intro.startParent,'desktop-start-slot'); assert.ok(intro.ranking.visible);
      assert.ok(intro.ranking.x+intro.ranking.w<intro.viewport.x && intro.viewport.x+intro.viewport.w<intro.hud.x);
    } else { assert.equal(intro.startParent,'intro'); assert.equal(intro.ranking.visible,false); }
    await page.locator('#start').click();
    await page.evaluate(()=>{const {sim,view}=window.orbitDebug;sim.paused=true;window.designRender(sim,0);});
    const controls = await page.evaluate(()=>['left','launch','right','quality','sound','pause','fullscreen'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,x:r.x,y:r.y,w:r.width,h:r.height};}));
    assert.ok(controls.every(r=>r.w>=44&&r.h>=44&&r.x>=0&&r.y>=0&&r.x+r.w<=viewport.width+1&&r.y+r.h<=viewport.height+1));
    assert.ok(controls[0].x+controls[0].w<=controls[1].x&&controls[1].x+controls[1].w<=controls[2].x);
    await page.screenshot({ path: `artifacts/reference-design/${name}-fpv.png` });
    let caps, counters;
    if(name==='desktop') {
      caps=await page.evaluate(async()=>{
        const THREE=await import('/node_modules/three/build/three.module.js'), {view}=window.orbitDebug;
        return view.table.caps.map(cap=>{const b=new THREE.Box3().setFromObject(cap);return {name:cap.name,star:!!cap.getObjectByName('Star-topped jet bumper cap'),height:b.max.y,radius:Math.max(b.max.x-cap.position.x,cap.position.x-b.min.x,b.max.z-cap.position.z,cap.position.z-b.min.z)};});
      });
      assert.equal(caps.length,3); assert.ok(caps.every(c=>c.star&&c.height<=1.04&&c.radius<=.820001));
      // A real bumper collision must drive the corresponding cabinet lamp.
      await page.evaluate(()=>{const {sim}=window.orbitDebug;sim.paused=false;sim.launch(.5);sim.events.length=0;sim.ball.setTranslation({x:-1.8,y:.305,z:-6.4},true);sim.ball.setLinvel({x:9,y:0,z:0},true);sim.ball.setAngvel({x:0,y:0,z:0},true);});
      await page.waitForFunction(()=>document.querySelectorAll('.reactor-window')[0].classList.contains('hit'));
      await page.evaluate(()=>{window.orbitDebug.sim.paused=true;});
      // A finished game creates a real local record and survives a reload.
      await page.evaluate(()=>{const {sim}=window.orbitDebug;sim.score=12345;sim.balls=0;sim.phase='over';});
      await page.waitForFunction(()=>document.querySelector('#rankings li b').textContent==='12,345');
      await page.reload({waitUntil:'networkidle'});await page.locator('#start:not([disabled])').waitFor();
      assert.equal(await page.locator('#rankings li b').first().textContent(),'12,345');
      assert.equal(await page.locator('#recent-runs li b').first().textContent(),'12,345');
      // Moving between cabinet and compact layouts must retain a usable start button.
      await page.setViewportSize({width:844,height:390});
      await page.waitForFunction(()=>document.getElementById('intro-content').parentElement.id==='intro');
      await page.setViewportSize(viewport);
      await page.waitForFunction(()=>document.getElementById('intro-content').parentElement.id==='desktop-start-slot');
      await page.locator('#start').click();
      counters=await page.evaluate(async()=>{
        const {sim,view}=window.orbitDebug, render=view.render.bind(view);view.render=()=>{};sim.paused=true;view.budget.enabled=false;sim.phase='playing';sim.events.length=0;
        view.container.style.border='0';view.container.style.width='1440px';view.container.style.height='900px';view.resize();
        const geo=await import('/src/physics/route-geometry.ts');
        const poses=[{name:'launch',p:{x:5.18,y:.31,z:8.7},heading:0,pitch:0},{name:'ground',p:{x:-4,y:.305,z:-1},heading:.35,pitch:0}];
        for(const [name,start,end] of [['bridge',geo.bridgeStart,geo.bridgeEnd],['tunnel',geo.tunnelStart,geo.tunnelEnd]]) {const f=geo.frames[Math.floor((start+end)/2)];poses.push({name,p:f.c,heading:Math.atan2(f.tangent.x,-f.tangent.z),pitch:Math.max(-Math.PI/10,Math.min(Math.PI/10,Math.asin(f.tangent.y)))});}
        const rows=[];
        for(const high of [true,false]) {view.setQuality(high);for(const pose of poses) {sim.ball.setTranslation(pose.p,true);view.heading=pose.heading;view.routeCamera.pitch=pose.pitch;view.clearance.reset();view.effects.reset();for(let i=0;i<6;i++){render(sim,1/60);await new Promise(requestAnimationFrame);} rows.push({quality:high?'High':'Eco',pose:pose.name,size:[view.renderer.domElement.width,view.renderer.domElement.height],camera:view.camera.position.toArray(),calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,memory:{...view.renderer.info.memory}});}}
        view.container.style.border='';view.container.style.width='';view.container.style.height='';view.resize();view.setQuality(true);sim.ball.setTranslation({x:0,y:.305,z:-3.9},true);view.heading=0;view.clearance.reset();render(sim,0);return rows;
      });
      await page.screenshot({path:'artifacts/reference-design/desktop-reactors.png'});
    }
    cases.push({name,viewport,intro,controls,caps,counters});console.log(`${name}: design checks pass`);
    await browser.close();browser=undefined;
  }
  assert.deepEqual(errors,[]);writeFileSync('artifacts/reference-design/report.json',JSON.stringify({result:'pass',cases,errors,limits:['ANGLE SwiftShader counters do not establish physical PC frame rates.','Local rankings are generated from completed games, without an online leaderboard.']},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await server.close();});
