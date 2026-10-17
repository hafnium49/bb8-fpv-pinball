// Fallback only: real geometry and bounding-sphere culling, NO WebGL/timing claim.
const { createRequire }=require('node:module');
const {resolve,join}=require('node:path');
const {mkdirSync,writeFileSync}=require('node:fs');
const mode=process.env.SCENE || 'reference'; if(!['reference','orbit'].includes(mode))throw new Error('SCENE must be reference or orbit');
const root=resolve(process.env.APP_ROOT||process.cwd()); const req=createRequire(join(root,'package.json'));
const {tsImport}=req('tsx/esm/api'); const THREE=req('three');
// Canvas calls only produce texture pixels; no pixels are needed for geometry/frustum estimates.
function canvas(){const image={width:1,height:1}; const ctx=new Proxy({canvas:image,measureText:s=>({width:String(s).length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})}, {get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});image.getContext=()=>ctx;return image;}
global.document={createElement:()=>canvas()};global.window={location:{search:mode==='orbit'?'?table=orbit&circuit=1':''},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
(async()=>{
  const imp=path=>tsImport(join(root,path),__filename);
  const [{ArcadeTable},{NightMarket},{ElevatedCircuit},geo]=await Promise.all([imp('src/render/table-model.ts'),imp('src/render/night-market.ts'),imp('src/render/route-model.ts'),imp('src/physics/route-geometry.ts')]);
  const {ReferenceTable}=await imp('src/render/reference-table.ts'); const course=await imp('src/physics/reference-course.ts');
  const scene=new THREE.Scene();const table=mode==='reference'?new ReferenceTable(scene):new ArcadeTable(scene,true);if(mode==='orbit')new ElevatedCircuit(scene);new NightMarket(scene,mode==='reference',mode==='orbit');
  let poses=[{name:'launch',p:{x:5.18,y:.31,z:8.7},heading:0,pitch:0},{name:'ground',p:{x:-4,y:.305,z:-1},heading:.35,pitch:0}];
  if(mode==='reference') poses=[{name:'launch',p:course.courseLaunch,heading:0,pitch:0},{name:'ground',p:{x:0,y:.305,z:3},heading:0,pitch:0}];
  if(mode==='orbit') for(const [name,start,end] of [['bridge',geo.bridgeStart,geo.bridgeEnd],['tunnel',geo.tunnelStart,geo.tunnelEnd]]){const f=geo.frames[Math.floor((start+end)/2)];poses.push({name,p:f.c,heading:Math.atan2(f.tangent.x,-f.tangent.z),pitch:Math.max(-Math.PI/10,Math.min(Math.PI/10,Math.asin(f.tangent.y)))});}
  const directions=[['forward',0,0],['left45',-45,0],['right45',45,0],['left90',-90,0],['right90',90,0],['up25',0,25],['down25',0,-25],['rear180',180,0]];
  const rows=[];const camera=new THREE.PerspectiveCamera(82,844/390,.06,160);const frustum=new THREE.Frustum();
  for(const pose of poses)for(const [direction,yaw,offset] of directions){
    table.ball.position.copy(pose.p);scene.updateMatrixWorld(true);
    const heading=pose.heading+yaw*Math.PI/180,pitch=pose.pitch+offset*Math.PI/180;
    camera.position.set(pose.p.x,pose.p.y+.3,pose.p.z);camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),-Math.cos(heading)*Math.cos(pitch))));camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let objects=0,calls=0,triangles=0,transparentCalls=0;
    scene.traverseVisible(o=>{
      if(!o.isMesh||!o.layers.test(camera.layers)||(o.frustumCulled&&!frustum.intersectsObject(o)))return;
      const g=o.geometry,available=g.index?g.index.count:g.attributes.position.count,instances=o.isInstancedMesh?o.count:1;
      const groups=Array.isArray(o.material)?g.groups:[{start:0,count:available,materialIndex:0}];let counted=false;
      for(const group of groups){const m=Array.isArray(o.material)?o.material[group.materialIndex]:o.material;if(!m||!m.visible)continue;
        const start=Math.max(group.start,g.drawRange.start),end=Math.min(available,group.start+group.count,g.drawRange.start+g.drawRange.count);if(end<=start)continue;
        const passes=m.transparent&&m.side===THREE.DoubleSide&&!m.forceSinglePass?2:1;
        calls+=passes;triangles+=(end-start)/3*instances*passes;if(m.transparent)transparentCalls+=passes;counted=true;
      }if(counted)objects++;
    });rows.push({pose:pose.name,direction,yawDegrees:yaw,pitchOffsetDegrees:offset,cameraPosition:camera.position.toArray(),estimatedSceneCalls:calls,estimatedSubmittedTriangles:triangles,visibleMeshObjects:objects,transparentCalls});
  }
  const out=resolve(process.env.RENDER_OUT||join(__dirname,'evidence'));mkdirSync(out,{recursive:true});
  writeFileSync(join(out,mode==='orbit'?'static-estimate.json':'static-reference-estimate.json'),JSON.stringify({scene:mode,sourceRef:process.env.SOURCE_REF||'unverified',viewport:[844,390],method:'Actual main scene constructors with no-op 2D texture canvas; Three.js mesh bounding-sphere frustum culling and geometry/material-group counts; no renderer instantiated.',limitations:['Static estimates, not measured WebGL renderer counters or timings.','No camera physics clearance: ideal ball center plus 0.30m camera height.','No effects, postprocessing, shadow passes or live mechanism state; initial table state except ball translation.','Texture canvas is stubbed and no pixels/shaders are executed. Geometry and batching use source unchanged.','No iPhone GPU, Safari, sensor, input, frame time or thermal evidence.'],rows},null,2)+'\n');console.log(JSON.stringify(rows));
})().catch(e=>{console.error(e);process.exitCode=1;});
