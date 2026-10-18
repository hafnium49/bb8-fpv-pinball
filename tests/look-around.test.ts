import test from 'node:test';
import assert from 'node:assert/strict';
import { LookAround, deviceForward, shortestAngle } from '../src/render/look-around';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
test('device optical ray: cardinal poses and screen rotations',()=>{
 for(const screen of [0,90,180,270]) {const f=deviceForward(0,90,0,screen);near(f.x,0);near(f.y,0);near(f.z,-1);}
 const f=deviceForward(90,90,0,0);near(f.x,-1);near(f.y,0);near(f.z,0);
});
test('tilted calibration, wrap, bounds and independent follow heading',()=>{
 const look=new LookAround();look.sample(359,65,12,0);assert.ok(look.calibrate({heading:2,pitch:.1}));
 look.sample(1,65,12,90);near(look.orientation.heading,2-2*Math.PI/180);near(look.orientation.pitch,.1);
 look.sample(1,140,12,90);assert.ok(Math.abs(look.orientation.pitch)<=Math.PI/4);
 near(shortestAngle(2*Math.PI-.1),-.1);
});
test('pole entry/exit holds heading and rejects pole calibration',()=>{
 const look=new LookAround();look.sample(0,90,0,0);look.calibrate({heading:1,pitch:0});
 look.sample(170,0,0,0);near(look.orientation.heading,1);assert.equal(look.calibrate({heading:0,pitch:0}),false);
 look.sample(170,90,0,0);near(look.orientation.heading,1);
 look.sample(175,90,0,0);near(look.orientation.heading,1-5*Math.PI/180);
});
test('rebase is exact, reduced-motion pitch uses twenty degree limit',()=>{
 const look=new LookAround(true);look.sample(30,50,20,0);look.calibrate({heading:8,pitch:.2});
 look.sample(260,90,10,0);look.calibrate({heading:1.4,pitch:.1});near(look.orientation.heading,1.4);near(look.orientation.pitch,.1);
 look.sample(260,150,10,0);assert.ok(Math.abs(look.orientation.pitch)<=20*Math.PI/180);
});
test('expanded conversion matches independent quaternion oracle over arbitrary poses',()=>{
 type Q=[number,number,number,number];
 const mul=(a:Q,b:Q):Q=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
 const axis=(i:number,d:number):Q=>{const q:Q=[0,0,0,Math.cos(d*Math.PI/360)];q[i]=Math.sin(d*Math.PI/360);return q;};
 for(let i=0;i<1000;i++) {const a=i*137.507%360,b=i*17.91%360-180,g=i*23.4%180-90,s=[0,90,180,270][i%4];const q=mul(mul(mul(mul(axis(0,-90),axis(2,a)),axis(0,b)),axis(1,g)),axis(2,-s));const v=mul(mul(q,[0,0,-1,0]),[-q[0],-q[1],-q[2],q[3]]);const f=deviceForward(a,b,g,s);near(f.x,v[0]);near(f.y,v[1]);near(f.z,v[2]);}
});
test('yaw unwrap stays continuous through several full rotations',()=>{const look=new LookAround();look.sample(0,90,0,0);look.calibrate({heading:0,pitch:0});for(let a=10;a<=1080;a+=10){look.sample(a%360,90,0,0);near(look.orientation.heading,-a*Math.PI/180);}});

test('pitch-limit changes immediately clamp and reanchor without stationary snap on expansion',()=>{
 for(const beta of [30,150]){
  const look=new LookAround();look.sample(0,90,0,0);look.calibrate({heading:1,pitch:0});look.sample(0,beta,0,0);
  look.reducedMotion=true;const held=look.orientation.pitch;near(Math.abs(held),20*Math.PI/180);
  look.sample(0,beta,0,0);near(look.orientation.pitch,held);
  look.reducedMotion=false;look.sample(0,beta,0,0);near(look.orientation.pitch,held);
  look.sample(0,beta+1,0,0);near(look.orientation.pitch,held+Math.PI/180);
 }
});
