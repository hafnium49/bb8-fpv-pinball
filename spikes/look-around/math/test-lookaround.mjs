import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {DEG, LookAroundMath, opticalAngles, rotate, deviceQuaternion, mul} from './lookaround-math.mjs';
const evidence=[];
const near=(actual,expected,epsilon=1e-9)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);
const vec=(actual,expected)=>actual.forEach((v,i)=>near(v,expected[i]));
const pose=(alpha=0,beta=90,gamma=0)=>({alpha,beta,gamma});
const test=(name,fn)=>{fn();evidence.push({name,status:'pass'});};

test('Explicit W3C physical cardinal poses',()=>{
  // Upright screen facing viewer: beta=90. Alpha=90 turns optical view left.
  for(const [sample,forward] of [
    [pose(0),[0,0,-1]], [pose(90),[-1,0,0]], [pose(180),[0,0,1]], [pose(270),[1,0,0]],
    [pose(0,0),[0,-1,0]], // screen face-up: optical view points down
    [pose(0,180),[0,1,0]], // screen face-down: optical view points up
    [pose(0,60),[0,-0.5,-Math.sqrt(3)/2]],
    [pose(0,120),[0,0.5,-Math.sqrt(3)/2]],
    [pose(0,0,90),[-1,0,0]], [pose(0,0,-90),[1,0,0]],
  ]) vec(opticalAngles(sample).forward,forward);
});
test('Independent expanded Euler forward-vector oracle',()=>{
  for(let alpha=0;alpha<360;alpha+=23) for(let beta=-180;beta<=180;beta+=31) for(let gamma=-90;gamma<=90;gamma+=29){
    const a=alpha*DEG,b=beta*DEG,g=gamma*DEG;
    const expected=[-Math.cos(a)*Math.sin(g)-Math.sin(a)*Math.sin(b)*Math.cos(g),-Math.cos(b)*Math.cos(g),Math.sin(a)*Math.sin(g)-Math.cos(a)*Math.sin(b)*Math.cos(g)];
    vec(opticalAngles({alpha,beta,gamma}).forward,expected);
  }
});
test('Landscape +90 and -90 physical roll retain optical forward',()=>{
  vec(opticalAngles(pose(90,0,-90),90).forward,[0,0,-1]);
  vec(opticalAngles(pose(270,0,90),-90).forward,[0,0,-1]);
  for(const screen of [-90,0,90,180]) vec(opticalAngles(pose(73,52,-21),screen).forward,opticalAngles(pose(73,52,-21),0).forward);
});
test('Alpha wrap and multi-turn yaw remain continuous',()=>{
  const m=new LookAroundMath();m.recenter(pose(350));
  for(let alpha=351;alpha<=1100;alpha++) near(m.update(pose(alpha%360)).yaw,-(alpha-350)*DEG);
});
test('Tilted comfortable calibration preserves yaw about gravity',()=>{
  // Changing alpha left-multiplies sensor orientation by its gravity-axis Rz.
  // This remains pure game yaw even when beta and gamma are both tilted.
  for(const [beta,gamma] of [[57,24],[117,-39],[34,-58]]) {
    const m=new LookAroundMath();m.recenter(pose(13,beta,gamma));
    for(let delta=0;delta<=720;delta+=3){const o=m.update(pose((13+delta)%360,beta,gamma));near(o.yaw,-delta*DEG);near(o.pitch,0);near(o.roll,0);}
  }
});
test('Unrestricted inverse calibration demonstrably breaks gravity yaw',()=>{
  const q0=deviceQuaternion(pose(13,57,24)), q1=deviceQuaternion(pose(73,57,24));
  const wrong=rotate(mul([-q0[0],-q0[1],-q0[2],q0[3]],q1),[0,0,-1]);
  assert.ok(Math.abs(Math.asin(wrong[1]))>20*DEG); // pure physical yaw spuriously pitches >20 degrees
  const m=new LookAroundMath();m.recenter(pose(13,57,24));const correct=m.update(pose(73,57,24));near(correct.pitch,0);near(correct.yaw,-60*DEG);
});
test('Pitch clamp, zero roll and output quaternion convention',()=>{
  const m=new LookAroundMath();m.recenter(pose());
  near(m.update(pose(0,160)).pitch,45*DEG);near(m.update(pose(0,20)).pitch,-45*DEG);
  const o=m.update(pose(31,107));
  vec(rotate(o.quaternion,[0,0,-1]),[Math.sin(o.yaw)*Math.cos(o.pitch),Math.sin(o.pitch),-Math.cos(o.yaw)*Math.cos(o.pitch)]);
});
test('Pole yaw hold and hysteresis suppress unstable heading',()=>{
  const m=new LookAroundMath();const initial=m.recenter(pose(42,6));
  for(const beta of [2,0,3,4]){const o=m.update(pose(210,beta));near(o.yaw,initial.yaw);assert.equal(o.poleHeld,true);}
  const o=m.update(pose(42,6));near(o.yaw,0);assert.equal(o.poleHeld,false);
  const fresh=new LookAroundMath();assert.equal(fresh.update(pose(120,0)).poleHeld,true);
  assert.ok(Number.isFinite(fresh.update(pose(120,180)).yaw));
});
test('Opposite-heading pole exit is continuous and next delta works',()=>{
  const m=new LookAroundMath();m.recenter(pose(42,6),0,{heading:710*DEG,pitch:0});
  const before=m.update(pose(45,6));
  near(m.update(pose(220,0)).yaw,before.yaw);
  const exit=m.update(pose(225,6));near(exit.yaw,before.yaw);assert.equal(exit.poleHeld,false);
  near(m.update(pose(230,6)).yaw,before.yaw-5*DEG);
});
test('Pole calibration rejects and target calibration sets shadow follow pose',()=>{
  const m=new LookAroundMath();
  for(const beta of [0,180,2]) assert.throws(()=>m.recenter(pose(99,beta)),RangeError);
  const target={heading:137*DEG,pitch:12*DEG};
  const centered=m.recenter(pose(17,61,-23),90,target);near(centered.yaw,target.heading);near(centered.pitch,target.pitch);
  const moved=m.update(pose(27,61,-23),90);near(moved.yaw,target.heading-10*DEG);near(moved.pitch,target.pitch);
  m.update(pose(0,0));assert.throws(()=>m.recenter(pose(99,4)),RangeError);
  assert.ok(Number.isFinite(m.recenter(pose(99,6),0,target).yaw));
});
test('180-degree screen-angle change retains accumulated yaw and pitch',()=>{
  const m=new LookAroundMath();m.recenter(pose());let before;
  for(let a=0;a<=810;a+=5) before=m.update(pose(a%360,108));
  const after=m.rebase(pose(90,108),180);near(after.yaw,before.yaw);near(after.pitch,before.pitch);
  const moved=m.update(pose(95,110),180);near(moved.yaw,before.yaw-5*DEG);near(moved.pitch,before.pitch+2*DEG);
});
test('Resume with changed sensor reference retains displayed orientation',()=>{
  const m=new LookAroundMath();m.recenter(pose());const before=m.update(pose(35,160));
  const after=m.rebase(pose(241,67));near(after.yaw,before.yaw);near(after.pitch,before.pitch);
  const moved=m.update(pose(246,65));near(moved.yaw,before.yaw-5*DEG);near(moved.pitch,43*DEG);
});
test('Repeated recenter remains idempotent',()=>{
  const m=new LookAroundMath();for(let i=0;i<50;i++){m.update(pose(i*7%360,71,-13));const o=m.recenter(pose(i*7%360,71,-13));near(o.yaw,0);near(o.pitch,0);near(m.recenter(pose(i*7%360,71,-13)).yaw,0);}
});
test('Invalid samples rejected without corrupting state',()=>{
  const m=new LookAroundMath();m.recenter(pose());assert.throws(()=>m.update({alpha:null,beta:90,gamma:0}),TypeError);near(m.update(pose(10)).yaw,-10*DEG);
});
const samples=Array.from({length:360},(_,alpha)=>pose(alpha,75+10*Math.sin(alpha*DEG),8));
const m=new LookAroundMath();for(let i=0;i<10000;i++)m.update(samples[i%360]);
const iterations=100000, start=performance.now();let checksum=0;
for(let i=0;i<iterations;i++)checksum+=m.update(samples[i%360]).yaw;
const elapsedMs=performance.now()-start;
console.log(JSON.stringify({schema:1,command:'node test-lookaround.mjs',runtime:process.version,passed:evidence.length,tests:evidence,benchmark:{kind:'CPU-only coordinate math; excludes sensor cadence, rendering, input-to-photon latency and mobile thermal effects',iterations,elapsedMs,nanosecondsPerUpdate:elapsedMs*1e6/iterations,checksum},limitations:['Relative alpha can drift; this does not establish geographic north.','Unwrap assumes less than 180 degrees of heading motion between accepted non-pole samples.','At vertical optical direction yaw is undefined; hold policy deliberately cannot infer turns made at the pole.','Fresh sample rebasing requires lifecycle gating in a future integration.','No production input, permissions, lifecycle or renderer implementation is included.']},null,2));
