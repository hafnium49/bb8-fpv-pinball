const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
let server, browser, activePage;
(async()=>{
 const out='artifacts/cabinet';mkdirSync(out,{recursive:true});
 const {createServer}=await import('vite');server=await createServer({server:{host:'127.0.0.1',port:5186,strictPort:true,watch:{ignored:()=>true},hmr:false}});await server.listen();
 const launch={headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',...JSON.parse(process.env.CHROME_ARGS||'[]')]};
 const cases=[],errors=[];
 for(const [width,height] of [[1440,900],[844,390],[390,844],[320,568],[568,320]]){
  browser=await chromium.launch(launch);
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000,deviceScaleFactor:1});activePage=page;page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'?circuit=1',{waitUntil:'networkidle'});await page.locator('#start:not([disabled])').waitFor();
  await page.locator('#start').click();
  await page.evaluate(()=>{const {sim,view,headLoss}=window.orbitDebug;headLoss.draw=()=>1;window.cabinetRender=view.render.bind(view);view.render=()=>{};sim.paused=true;});
  await page.waitForFunction(()=>document.querySelector('#hint').textContent==='PAUSED');
  await page.evaluate(()=>{window.orbitDebug.sim.paused=false;});
  await page.waitForFunction(()=>document.querySelector('#hint').textContent.includes('HOLD'));
  // Native keyboard focus on SOUND owns Space; it must never charge the ball.
  await page.locator('#sound').focus();await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>window.orbitDebug.sim.controls.launch),false);
  assert.equal(await page.locator('#sound').textContent(),'SOUND ON');
  await page.locator('#sound').focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('#sound').textContent(),'SOUND OFF');
  await page.locator('#game').focus();await page.keyboard.down('KeyA');await page.keyboard.down('KeyD');
  assert.deepEqual(await page.evaluate(()=>[window.orbitDebug.sim.controls.left,window.orbitDebug.sim.controls.right]),[true,true]);
  await page.keyboard.up('KeyA');await page.keyboard.up('KeyD');
  // Hold semantics on a focused launch button are kept separate from ordinary UI buttons.
  await page.locator('#launch').focus();await page.keyboard.down('Space');
  await page.waitForFunction(()=>window.orbitDebug.sim.charge>0.1);await page.keyboard.up('Space');
  await page.waitForFunction(()=>window.orbitDebug.sim.phase==='playing');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#hint').textContent(),'PAUSED');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'resume');
  assert.equal(await page.locator('.topbar').evaluate(el=>el.inert),true);
  await page.locator('#music-volume').focus();await page.keyboard.press('Home');
  assert.equal(await page.evaluate(()=>window.orbitDebug.audio.musicVolume),0);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'resume');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'music-volume');
  await page.keyboard.press('End');assert.equal(await page.evaluate(()=>window.orbitDebug.audio.musicVolume),1);
  await page.locator('#resume').click();
  await page.locator('#pause').click();
  assert.equal(await page.locator('#music-volume').inputValue(),'100');
  await page.locator('#restart').click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'game');
  await page.evaluate(()=>{const {sim,view}=window.orbitDebug;sim.score=123456789;window.cabinetRender(sim,1/60);});
  await page.waitForFunction(()=>document.querySelector('#score').textContent==='123456789');
  const bounds=await page.evaluate(()=>{
   const ids=['hud','score','balls','hint','quality','sound','pause','fullscreen','left','right','launch'];
   return ids.map(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect();return {id,x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};});
  });
  assert.ok(bounds.every(r=>r.x>=-1&&r.y>=-1&&r.x+r.width<=width+1&&r.y+r.height<=height+1),JSON.stringify(bounds));
  assert.ok(bounds.filter(r=>['quality','sound','pause','fullscreen','launch'].includes(r.id)).every(r=>r.width>=44&&r.height>=44));
  assert.ok(bounds.find(r=>r.id==='score').scrollWidth<=bounds.find(r=>r.id==='score').clientWidth,'score overflow');
  const a=bounds.find(r=>r.id==='left'),b=bounds.find(r=>r.id==='launch'),c=bounds.find(r=>r.id==='right');assert.ok(a.x+a.width<=b.x&&b.x+b.width<=c.x,'touch controls overlap');
  assert.equal(await page.locator('[data-camera], #map-wrap, #minimap, #camera-controls').count(),0);
  await page.screenshot({path:`${out}/${width}x${height}.png`});
  cases.push({viewport:{width,height},bounds,checks:['ordinary button owns Space','simultaneous keyboard flippers','focused launch hold/release','modal focus/inert/Tab trap','music slider keyboard control/persistence','large score fits','44px action targets','nonoverlapping controls','FPV-only UI']});
  await browser.close();browser=undefined;
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/report.json`,JSON.stringify({result:'pass',cases,errors},null,2)+'\n');console.log(JSON.stringify({result:'pass',viewports:cases.length}));
})().catch(async e=>{console.error(e);process.exitCode=1;if(activePage&&!activePage.isClosed())await activePage.screenshot({path:'artifacts/cabinet/failure.png'}).catch(()=>{});}).finally(async()=>{if(browser)await browser.close();if(server)await server.close();});
