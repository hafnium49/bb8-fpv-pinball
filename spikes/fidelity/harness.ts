import { fidelityMode } from '../../src/render/fidelity-bake';
import { PinballSimulation } from '../../src/physics/simulation';
import { PinballView } from '../../src/render/view';
const query=new URLSearchParams(location.search);
const mobile=query.get('viewport')==='mobile';
const stage=document.querySelector<HTMLElement>('#stage')!;
const viewport=mobile?[844,390]:[960,540];stage.style.width=viewport[0]+'px';stage.style.height=viewport[1]+'px';
const poses={ground:{p:{x:-2,y:.305,z:4},heading:0},launch:{p:{x:5.6,y:.305,z:8},heading:0}};
const poseName=query.get('pose')==='launch'?'launch':'ground',pose=poses[poseName];
const report = document.querySelector('#report')!;
const start = performance.now();
const sim = await PinballSimulation.create({course:'reference'});
const view = new PinballView(document.querySelector('#stage')!, true, true);
view.setQuality(true); view.budget.enabled = false;
sim.phase='playing'; sim.paused=true; sim.events.length=0;
sim.ball.setTranslation(pose.p,true); view.heading=pose.heading; view.routeCamera.pitch=0;
await view.warmup(); view.render(sim,0,16.67);
const startup=performance.now()-start;
const gl=view.renderer.getContext(), debug=gl.getExtension('WEBGL_debug_renderer_info');
const base={variant:fidelityMode(location.search), pose:poseName, viewport, dpr:devicePixelRatio, buffer:[view.renderer.domElement.width,view.renderer.domElement.height], gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER), startupMs:startup};
report.textContent=JSON.stringify({...base,status:'Ready. Fixed camera; no live physics or audio.'},null,2);
function stats(xs:number[]){const a=[...xs].sort((a,b)=>a-b);return {median:a[Math.floor(a.length/2)],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1),samples:a.length};}
const run=document.querySelector<HTMLButtonElement>('#run')!;
run.addEventListener('click',async()=>{
 if(run.disabled)return;run.disabled=true;
 try {
 report.textContent='Measuring fixed pose: 60 warmup + 240 sampled frames...';
 const raf:number[]=[],submit:number[]=[];let previous=0;
 for(let i=0;i<300;i++){
 const t=await new Promise<number>(requestAnimationFrame); const before=performance.now();view.render(sim,0,16.67);const after=performance.now();
 if(i>=60){raf.push(t-previous);submit.push(after-before);} previous=t;
 }
 const result={...base,frameIntervalMs:stats(raf),cpuSubmitMs:stats(submit),longFramesOver33ms:raf.filter(n=>n>33.34).length,longFramesOver50ms:raf.filter(n=>n>50).length,heapBytes:(performance as Performance & {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize ?? null,drawCalls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,geometryCount:view.renderer.info.memory.geometries,textureCount:view.renderer.info.memory.textures,programCount:view.renderer.info.programs?.length,inputLatency:'not measured',notes:'Static render-only workload; RAF interval is not GPU time or input latency.'};
 report.textContent=JSON.stringify(result,null,2);
 } catch(error) { report.textContent=String(error); } finally {run.disabled=false;}
});
