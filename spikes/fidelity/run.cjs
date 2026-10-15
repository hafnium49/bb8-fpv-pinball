// Portable benchmark. Software renderer by default; never equate with hardware playability.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.join(root,'artifacts/fidelity');mkdirSync(out,{recursive:true});
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5198','--strictPort'],{cwd:root,stdio:'inherit'});
 let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5198')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const software=process.env.PERF_GPU!=='hardware';
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:software?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  const rows=[];
  for(const viewport of ['desktop','mobile'])for(const pose of ['ground','launch'])for(let repeat=0;repeat<2;repeat++){
   const order=repeat?['roughness','baked','baseline']:['baseline','baked','roughness'];
   for(const variant of order){
    const page=await browser.newPage({viewport:viewport==='mobile'?{width:844,height:520}:{width:1000,height:760},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:5198/spikes/fidelity/?fidelity=${variant}&pose=${pose}&viewport=${viewport}`);
    await page.waitForFunction(()=>document.querySelector('#report')?.textContent.includes('Ready.'),{},{timeout:120000});
    if(!repeat)await page.locator('#stage').screenshot({path:path.join(out,`${viewport}-${pose}-${variant}.png`)});
    await page.locator('#run').click();
    await page.waitForFunction(()=>document.querySelector('#report')?.textContent.includes('frameIntervalMs'),{},{timeout:120000});
    rows.push({repeat,requestedSoftware:software,errors,...JSON.parse(await page.locator('#report').textContent())});
    writeFileSync(path.join(out,'results.json'),JSON.stringify(rows,null,2));await page.close();
   }
  }
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
