const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
let server,browser,currentPage;
(async()=>{
 const {createServer}=await import('vite');server=await createServer({server:{host:'127.0.0.1',port:5198,strictPort:true,watch:{ignored:()=>true},hmr:false}});await server.listen();
 mkdirSync('artifacts/reference-course',{recursive:true});const errors=[],cases=[],engine=process.env.RENDER_ENGINE||'chromium';
 assert.ok(['chromium','webkit'].includes(engine));
 for(const [name,viewport]of [['desktop',{width:1440,height:900}],['small-pc',{width:1024,height:600}],['landscape',{width:844,height:390}]]){
  browser=engine==='webkit'?await webkit.launch({executablePath:process.env.WEBKIT_PATH,headless:true}):await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport,hasTouch:name==='landscape'});currentPage=page;page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
  await page.goto(server.resolvedUrls.local[0],{waitUntil:'networkidle'});await page.locator('#start:not([disabled])').waitFor();
  await page.evaluate(()=>{const {sim,view,headLoss}=window.orbitDebug;headLoss.draw=()=>1;sim.paused=true;view.budget.enabled=false;window.courseRender=view.render.bind(view);view.render=()=>{};window.courseRender(sim,0);});
  const layout=await page.evaluate(()=>{const {sim,view}=window.orbitDebug;const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};};return{reference:!!sim.reference,flippers:sim.flipperBodies.length,caps:view.table.caps.length,viewport:r('viewport'),start:r('start')};});
  assert.equal(layout.reference,true);assert.equal(layout.flippers,4);assert.equal(layout.caps,9);assert.equal(await page.locator('#table-variant').isVisible(),false);
  const introShadow=await page.evaluate(()=>{const {sim,view}=window.orbitDebug;window.courseRender(sim,0);const first={revision:view.table.shadowRevision,calls:view.renderer.info.render.calls};window.courseRender(sim,0);const second={revision:view.table.shadowRevision,calls:view.renderer.info.render.calls};return{first,second};});
  assert.deepEqual(introShadow.first,introShadow.second,'an idle visible ball must preserve the cached intro shadow');
  const projection=await page.evaluate(async()=>{
   const THREE=await import('/node_modules/three/build/three.module.js'),{courseBumpers}=await import('/src/physics/reference-course.ts'),{view}=window.orbitDebug;
   const h=[[1825.3208053691283,-183.77367290987698,186753.49460499093],[0,1280.7216459858269,101722.389107008],[0,-.5734623443633283,1949.7719708353166]],w=view.container.clientWidth,height=view.container.clientHeight;
   return courseBumpers.map(b=>{const x=b.x/.028+240,y=b.z/.028+410,z=b.y/.028,t=1400/(1400-z),xx=240+(x-240)*t,yy=1400+(y-1400)*t,den=h[2][1]*yy+h[2][2];const expected=[((h[0][0]*xx+h[0][1]*yy+h[0][2])/den-320.5)*height/820+w/2,(h[1][1]*yy+h[1][2])/den*height/820];const v=new THREE.Vector3(b.x,b.y,b.z).project(view.camera),actual=[(v.x+1)*w/2,(1-v.y)*height/2];return {actual,expected,error:Math.hypot(actual[0]-expected[0],actual[1]-expected[1])};});
  });
  assert.ok(projection.every(p=>p.error<.05),'course overview must match the reference homography');

  await page.screenshot({path:`artifacts/reference-course/${name}-intro.png`});if(name==='desktop')await page.screenshot({path:'artifacts/reference-course/cabinet-pc.jpg',type:'jpeg',quality:90});
  await page.locator('#start').click();const transition=await page.evaluate(()=>{const {sim,view}=window.orbitDebug;sim.paused=true;const before=view.table.shadowRevision;window.courseRender(sim,0);const after=view.table.shadowRevision;window.courseRender(sim,0);return{before,after,cached:view.table.shadowRevision,visible:view.table.ball.visible};});
  assert.ok(!transition.visible&&transition.after>transition.before&&transition.cached===transition.after,'hiding the intro ball must invalidate its shadow once');
  assert.equal(await page.locator('[data-camera],#camera-controls,#minimap,#map-wrap').count(),0);
  await page.screenshot({path:`artifacts/reference-course/${name}-fpv.png`});
  const controls=await page.evaluate(()=>['left','launch','right','quality','sound','pause','fullscreen'].map(id=>{const b=document.getElementById(id).getBoundingClientRect();return{id,x:b.x,y:b.y,w:b.width,h:b.height};}));
  assert.ok(controls.every(b=>b.w>=44&&b.h>=44&&b.x>=0&&b.y>=0&&b.x+b.w<=viewport.width+1&&b.y+b.h<=viewport.height+1));
  let shots=[],render=[],resources;
  if(name==='desktop') {
   const landmark=await page.evaluate(async()=>{const {courseBumpers}=await import('/src/physics/reference-course.ts'),{view}=window.orbitDebug;return view.table.caps.map((c,i)=>({x:c.position.x,z:c.position.z,expected:[courseBumpers[i].x,courseBumpers[i].z]}));});
   assert.ok(landmark.every(p=>Math.abs(p.x-p.expected[0])<1e-6&&Math.abs(p.z-p.expected[1])<1e-6));
   const supports=await page.evaluate(async()=>{const {courseSpinners}=await import('/src/physics/reference-course.ts'),{view}=window.orbitDebug;return view.table.spinnerSupports.map((m,i)=>{const s=courseSpinners[Math.floor(i/2)],end=i%2?s.b:s.a;return{actual:[m.matrixWorld.elements[12],m.matrixWorld.elements[13],m.matrixWorld.elements[14]],expected:[end.x,.3,end.z],inRotor:view.table.spinnerGroups.includes(m.parent)};});});
   assert.equal(supports.length,6);assert.ok(supports.every(p=>!p.inRotor&&p.actual.every((v,i)=>Math.abs(v-p.expected[i])<1e-6)),'stationary spinner supports must bracket the measured blades');
   for(let i=0;i<3;i++){
    const shot=await page.evaluate(async i=>{const {sim}=window.orbitDebug,{courseRamps,pathFrame}=await import('/src/physics/reference-course.ts');sim.start();sim.launch(.5);const r=courseRamps[i],p=r.points[0],t=pathFrame(r,0).tangent;sim.ball.setTranslation({x:p.x-t.x*.6,y:.295,z:p.z-t.z*.6},true);sim.ball.setLinvel({x:t.x*25,y:0,z:t.z*25},true);sim.ball.setAngvel({x:0,y:0,z:0},true);sim.events.length=0;let captured=false,peak=0;for(let n=0;n<1400;n++){sim.step();captured||=sim.reference.guided;peak=Math.max(peak,sim.position.y);if(sim.events.some(e=>e.type==='ramp'&&e.name===r.name))break;}sim.paused=true;window.courseRender(sim,0);return{ramp:r.name,captured,completed:sim.events.some(e=>e.type==='ramp'&&e.name===r.name),peak,onDeck:sim.reference.onDeck,score:sim.score,p:sim.position};},i);
    assert.ok(shot.captured&&shot.completed);shots.push(shot);await page.screenshot({path:`artifacts/reference-course/desktop-exit-${i}.png`});
   }
   render=await page.evaluate(async()=>{const {sim,view}=window.orbitDebug,{courseRamps,pathFrame,courseLaunch}=await import('/src/physics/reference-course.ts');sim.start();sim.launch(.5);sim.paused=true;view.budget.enabled=false;sim.events.length=0;
    const poses=[{name:'launch',p:courseLaunch,heading:0,pitch:0},{name:'ground',p:{x:-3.5,y:.295,z:-1},heading:0,pitch:0}];
    for(const path of courseRamps){const f=pathFrame(path,path.length*.45);poses.push({name:path.name,p:f.c,heading:Math.atan2(f.tangent.x,-f.tangent.z),pitch:Math.atan2(f.tangent.y,1)});}
    poses.push({name:'upper-deck',p:{x:3.05,y:1.904,z:-5.92},heading:Math.PI,pitch:0});
    const rows=[];for(const high of [true,false]){view.setQuality(high);for(const pose of poses){sim.ball.setTranslation(pose.p,true);view.heading=pose.heading;view.routeCamera.pitch=pose.pitch;view.clearance.reset();for(let i=0;i<5;i++){window.courseRender(sim,0);await new Promise(requestAnimationFrame);}rows.push({quality:high?'High':'Eco',pose:pose.name,calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,memory:{...view.renderer.info.memory},size:[view.renderer.domElement.width,view.renderer.domElement.height]});}}
    view.setQuality(true);return rows;
   });
   // Moving source flippers must update actual world transforms after batching.
   const motion=await page.evaluate(()=>{const {sim,view}=window.orbitDebug;sim.start();sim.paused=false;sim.controls.left=true;sim.controls.right=true;for(let n=0;n<18;n++)sim.step();sim.paused=true;window.courseRender(sim,0);return view.table.flipperGroups.map(g=>({local:g.rotation.y,world:g.matrixWorld.elements.slice(0,3)}));});
   assert.equal(motion.length,4);assert.ok(motion.every(g=>Math.abs(g.local)>.4&&Math.abs(g.world[0]-Math.cos(g.local))<1e-6&&Math.abs(g.world[2]+Math.sin(g.local))<1e-6));
   resources=await page.evaluate(()=>{const {sim,view}=window.orbitDebug;sim.start();sim.paused=true;sim.events.length=0;view.effects.reset();view.setQuality(true);window.courseRender(sim,0);window.courseRender(sim,0);const cached=view.renderer.info.render.calls;
    const samples=[];for(let i=0;i<6;i++){view.setQuality(false);window.courseRender(sim,0);view.setQuality(true);window.courseRender(sim,0);samples.push({...view.renderer.info.memory});}
    sim.controls.left=true;sim.paused=false;sim.step();sim.paused=true;window.courseRender(sim,0);const moving=view.renderer.info.render.calls;window.courseRender(sim,0);const cachedAfter=view.renderer.info.render.calls;
    sim.launch(.5);return{cached,moving,cachedAfter,samples};});
   assert.ok(resources.moving>resources.cachedAfter,'moving flippers must invalidate the cached shadow');
   assert.ok(resources.samples.every(s=>s.geometries===resources.samples[0].geometries&&s.textures===resources.samples[0].textures),'quality switches must retain bounded GPU resources');
   // Real reference impacts still drive the DMD, droid cue and matching lamp.
   await page.evaluate(async()=>{const {sim}=window.orbitDebug,{courseBumpers}=await import('/src/physics/reference-course.ts');sim.start();sim.launch(.5);sim.paused=false;sim.events.length=0;const b=courseBumpers[0];sim.ball.setTranslation({x:b.x-1.4,y:.295,z:b.z},true);sim.ball.setLinvel({x:9,y:0,z:0},true);for(let n=0;n<24;n++)sim.step();sim.paused=true;window.courseRender(sim,0);});
   await page.waitForFunction(()=>document.querySelector('.reactor-window').classList.contains('hit'));
   assert.equal(await page.locator('#score').textContent(),'00100');
   const fifty=await page.evaluate(async()=>{const {sim,view}=window.orbitDebug,{courseBumpers}=await import('/src/physics/reference-course.ts');sim.start();sim.launch(.5);sim.events.length=0;view.effects.reset();const b=courseBumpers[4];sim.ball.setTranslation({x:b.x-1.2,y:.295,z:b.z},true);sim.ball.setLinvel({x:7,y:0,z:0},true);sim.ball.setAngvel({x:0,y:0,z:0},true);for(let n=0;n<20;n++)sim.step();sim.paused=true;window.courseRender(sim,0);const popup=view.effects.popups.find(p=>p.sprite.visible),index=view.effects.scoreValues.indexOf(50);return{score:sim.score,hit:sim.events.some(e=>e.type==='bumper'&&e.points===50),index,mapped:!!popup&&index>=0&&popup.sprite.material.map===view.effects.scoreMaps[index]};});
   assert.equal(fifty.score,50);assert.ok(fifty.hit&&fifty.mapped,'a real green-bumper hit must display its 50-point texture');
   await page.waitForFunction(()=>document.getElementById('score').textContent==='00050');
  }
  cases.push({name,viewport,layout,projection,introShadow,transition,controls,shots,render,resources});console.log(`${name}: reference geometry, routes and controls pass`);await browser.close();browser=undefined;
 }
 assert.deepEqual(errors,[]);writeFileSync(`artifacts/reference-course/browser-${engine}-report.json`,JSON.stringify({result:'pass',engine,cases,errors,limits:['Software-renderer counters are not physical PC FPS.','Coordinates match the public course; original artwork and FPV presentation are retained.']},null,2)+'\n');
})().catch(async e=>{console.error(e);if(currentPage&&!currentPage.isClosed()){console.error(await currentPage.locator('#loading-error').textContent());await currentPage.screenshot({path:'artifacts/reference-course/failure.png'});}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await server.close();});
