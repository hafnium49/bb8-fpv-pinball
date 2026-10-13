import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgePendantFits,signClearsRouteEyes,tubeClearsRouteEyes} from '../src/render/night-market-clearance';
import {courseRamps,pathFrame} from '../src/physics/reference-course';

const eyes=courseRamps.flatMap(path=>Array.from({length:Math.ceil(path.length/.08)+1},(_,i)=>{
  const p=pathFrame(path,Math.min(path.length,i*.08)).c;return {...p,y:p.y+.2};
}));

test('low return-ramp ornaments never hang into the free-ground eye envelope',()=>{
  for(const[index,s]of [[0,25.45],[1,24.05]])assert.equal(bridgePendantFits(pathFrame(courseRamps[index],s).c.y),false);
  assert.equal(bridgePendantFits(1.324),true);
  assert.equal(bridgePendantFits(1.32),false);
});

test('crossing-ramp posters test their entire rectangle against guided eyes',()=>{
  const path=courseRamps[2];
  for(const[s,side]of [[8.65,-1],[9.35,1]]){
    const f=pathFrame(path,s),p={x:f.c.x-f.tangent.z*side*(path.width+.035),y:f.c.y-.375,z:f.c.z+f.tangent.x*side*(path.width+.035)};
    assert.equal(signClearsRouteEyes(p,f.tangent,.42,.14,eyes),false);
  }
  assert.equal(signClearsRouteEyes({x:50,y:3,z:50},{x:1,z:0},.42,.14,eyes),true);
});

test('brace checks include segment interiors and preserve distant decorations',()=>{
  assert.equal(tubeClearsRouteEyes([{x:-1,y:0,z:0},{x:1,y:0,z:0}],[{x:0,y:.1,z:0}],.014),false);
  assert.equal(tubeClearsRouteEyes([{x:-1,y:0,z:0},{x:1,y:0,z:0}],[{x:0,y:1,z:0}],.014),true);
  let retained=0;
  for(const path of courseRamps)for(let s=.25;s<path.length-.25;s+=.7){
    const f=pathFrame(path,s),at=(x:number,y:number)=>({x:f.c.x-f.tangent.z*x,y:f.c.y+y,z:f.c.z+f.tangent.x*x});
    const points=[at(-path.width-.04,-.315),at(0,-.46),at(path.width+.04,-.315)];
    if(bridgePendantFits(f.c.y)&&tubeClearsRouteEyes(points,eyes,.014)){retained++;assert.ok(Math.min(...points.map(p=>p.y))-.014>=.85);}
  }
  assert.ok(retained>=20,'High bridge undersides retain dense safe trim');
});
