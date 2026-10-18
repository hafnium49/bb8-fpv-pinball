import test from 'node:test';
import assert from 'node:assert/strict';
import { PhoneLook, type PhoneLookEnvironment, type OrientationReading } from '../src/ui/phone-orientation';
function fixture(permission?:()=>Promise<string>, reducedMotion?:()=>boolean) {
 let now=0, listener:((r:OrientationReading)=>void)|undefined, hidden=false, angle=0;
 const frames:(()=>void)[]=[];let pauses=0;
 const environment:PhoneLookEnvironment={available:()=>true,secure:()=>true,hidden:()=>hidden,screenAngle:()=>angle,requestPermission:permission,listen(fn){listener=fn;return()=>{listener=undefined;}},frame(fn){frames.push(fn);}};
 const look=new PhoneLook({environment,reducedMotion,now:()=>now,pause:()=>{pauses++;}});
 return {look, environment, setTime:(n:number)=>{now=n;},emit:(alpha=0,beta=90,gamma=0)=>listener?.({alpha,beta,gamma}), invalid:()=>listener?.({alpha:null,beta:null,gamma:null}),get pauses(){return pauses;},get listening(){return !!listener;}, hide:()=>{hidden=true;},screen:(n:number)=>{angle=n;look.screenChanged();},flush:()=>frames.splice(0).forEach(f=>f())};
}
const pose={heading:1,pitch:0};
function active(f:ReturnType<typeof fixture>){f.look.enable(pose);f.emit();f.look.update(0,pose);f.look.center(pose);assert.equal(f.look.state,'active');}
test('explicit enable only; valid sample and Center required',()=>{const f=fixture();assert.equal(f.listening,false);f.look.enable(pose);assert.equal(f.look.state,'waiting');f.emit();f.look.update(0,pose);assert.equal(f.look.state,'calibrating');f.look.center(pose);assert.equal(f.look.state,'active');assert.equal(f.look.orientation.heading,1);});
test('permission called synchronously and late grant ignored after Follow',async()=>{let resolve!:(s:string)=>void;let called=false;const f=fixture(()=>{called=true;return new Promise(r=>resolve=r);});f.look.enable(pose);assert.ok(called);f.look.follow();resolve('granted');await Promise.resolve();assert.equal(f.look.state,'follow');assert.equal(f.listening,false);});
test('hidden interruption invalidates pending grant',async()=>{let resolve!:(s:string)=>void;const f=fixture(()=>new Promise(r=>resolve=r));f.look.enable(pose);f.hide();f.look.suspend();resolve('granted');await Promise.resolve();assert.equal(f.look.state,'suspended');assert.equal(f.listening,false);});
test('silence never pauses; recovered sample rebases exactly',()=>{const f=fixture();active(f);const pauses=f.pauses;f.setTime(2000);f.look.update(.1,pose);assert.equal(f.look.state,'active');assert.equal(f.pauses,pauses);f.emit(80);f.look.update(.01,pose);assert.equal(f.look.orientation.heading,1);f.setTime(2010);f.emit(90);f.look.update(.01,pose);assert.ok(f.look.orientation.heading<1);});
test('three invalid readings spanning a second suspend once',()=>{const f=fixture();active(f);f.invalid();f.setTime(500);f.invalid();f.setTime(1001);f.invalid();f.look.update(.01,pose);assert.equal(f.look.state,'suspended');assert.equal(f.listening,false);assert.equal(f.pauses,2);});
test('screen boundary drops cached reading, coalesces and rebases fresh sample',()=>{const f=fixture();active(f);f.emit(30);f.screen(90);f.look.update(.01,pose);assert.equal(f.look.state,'rebasing');f.flush();f.look.update(.01,pose);assert.equal(f.look.state,'rebasing');f.emit(80);f.look.update(.01,pose);assert.equal(f.look.state,'active');assert.equal(f.look.orientation.heading,1);});
test('resume rebases only fresh readings and times out safely',()=>{const f=fixture();active(f);f.look.suspend();f.look.resume();assert.equal(f.look.state,'rebasing');f.emit(120);f.look.update(.01,pose);assert.equal(f.look.state,'active');assert.equal(f.look.orientation.heading,1);f.look.suspend();f.look.resume();f.setTime(3001);f.look.update(.01,pose);assert.equal(f.look.state,'unavailable');});
test('Follow tracks moving target and ends on exact current target',()=>{const f=fixture();active(f);f.look.follow();assert.equal(f.look.selected,false);assert.equal(f.listening,false);f.look.update(.1,{heading:2,pitch:.1});const result=f.look.update(.1,{heading:2.4,pitch:.2});assert.equal(result,null);assert.equal(f.look.orientation.heading,2.4);});
test('Center completion with stale sample pauses for fresh calibration',()=>{const f=fixture();active(f);f.look.center({heading:2,pitch:.1});f.setTime(300);f.look.update(.2,pose);assert.equal(f.look.state,'waiting');assert.equal(f.look.orientation.heading,2);});
test('denial, thrown permission and no hardware are unavailable',async()=>{for(const request of [()=>Promise.resolve('denied'),()=>{throw Error('blocked');}]){const f=fixture(request);f.look.enable(pose);await Promise.resolve();assert.equal(f.look.state,'unavailable');assert.equal(f.listening,false);}});
test('unsupported and insecure environments fail without listening',()=>{for(const key of ['secure','available'] as const){const f=fixture();f.environment[key]=()=>false;f.look.enable(pose);assert.equal(f.look.state,'unavailable');assert.equal(f.listening,false);}});
test('null-only and entirely silent acquisition both time out',()=>{for(const invalid of [true,false]){const f=fixture();f.look.enable(pose);if(invalid)f.invalid();f.setTime(3000);f.look.update(0,pose);assert.equal(f.look.state,'unavailable');}});
test('repeated enable ignores older grant and disposal cannot restart',async()=>{const resolvers:((s:string)=>void)[]=[];const f=fixture(()=>new Promise(r=>resolvers.push(r)));f.look.enable(pose);f.look.enable(pose);resolvers[0]('granted');await Promise.resolve();assert.equal(f.look.state,'requesting');assert.equal(f.listening,false);f.look.dispose();resolvers[1]('granted');await Promise.resolve();f.look.resume();f.look.enable(pose);assert.equal(f.listening,false);assert.equal(f.look.state,'follow');});
test('stationary duplicate events remain valid indefinitely',()=>{const f=fixture();active(f);for(let t=100;t<=60000;t+=100){f.setTime(t);f.emit();f.look.update(.1,pose);}assert.equal(f.look.state,'active');assert.equal(f.pauses,1);});
test('screen-after-sample and sample-after-screen event ordering',()=>{for(const beforeFrame of [true,false]){const f=fixture();active(f);f.screen(90);if(beforeFrame)f.emit(50);f.flush();if(!beforeFrame)f.emit(50);f.look.update(.01,pose);assert.equal(f.look.state,'active');assert.equal(f.look.orientation.heading,1);f.emit(60);f.look.update(.01,pose);assert.ok(f.look.orientation.heading<1);}});
test('screen timeout suspends and subsequent resume does not retain screen fence',()=>{const f=fixture();active(f);f.screen(90);f.flush();f.setTime(3000);f.look.update(0,pose);assert.equal(f.look.state,'suspended');f.look.resume();f.emit(150);f.look.update(0,pose);assert.equal(f.look.state,'active');assert.equal(f.look.orientation.heading,1);});
test('new ball reset requires fresh Center without another permission call',async()=>{let calls=0;const f=fixture(()=>{calls++;return Promise.resolve('granted');});f.look.enable(pose);await Promise.resolve();f.emit();f.look.update(0,pose);f.look.center(pose);f.look.suspend();f.look.reset({heading:2,pitch:.1});assert.equal(calls,1);assert.equal(f.look.state,'waiting');assert.equal(f.look.orientation.heading,2);f.emit(150);f.look.update(0,pose);assert.equal(f.look.state,'calibrating');f.look.center({heading:2,pitch:.1});assert.equal(f.look.state,'active');});
test('reduced motion Center and Follow snap immediately',()=>{const f=fixture();f.look.reducedMotion=true;active(f);f.look.center({heading:2,pitch:1});assert.equal(f.look.orientation.heading,2);assert.ok(f.look.orientation.pitch<=20*Math.PI/180);f.look.follow();assert.equal(f.look.update(0,{heading:3,pitch:0}),null);assert.equal(f.look.orientation.heading,3);});
test('Follow wins over Center and pause cancels pending Center completion',()=>{const f=fixture();active(f);f.look.center({heading:2,pitch:0});f.look.follow();f.look.update(.2,{heading:4,pitch:0});assert.equal(f.look.state,'follow');assert.equal(f.look.orientation.heading,4);active(f);f.look.center({heading:2,pitch:0});f.look.update(.1,pose);const held=f.look.orientation.heading;f.look.suspend();f.look.update(1,pose);assert.equal(f.look.state,'suspended');assert.equal(f.look.orientation.heading,held);});
test('render delay cannot apply old readings or rebase from stale acquisition',()=>{const f=fixture();active(f);f.emit(50);f.setTime(1001);f.look.update(.01,pose);assert.equal(f.look.orientation.heading,1);f.look.suspend();f.look.resume();f.emit(90);f.setTime(1302);f.look.update(.01,pose);assert.equal(f.look.state,'rebasing');f.emit(90);f.look.update(.01,pose);assert.equal(f.look.state,'active');assert.equal(f.look.orientation.heading,1);});

test('unavailable survives restart, pause and Resume until explicit Retry or Follow',async()=>{
 for(const failure of ['denied','rejected','thrown','listener','timeout','unsupported'] as const){
  const f=fixture(failure==='denied'?()=>Promise.resolve('denied'):failure==='rejected'?()=>Promise.reject(Error('denied')):failure==='thrown'?()=>{throw Error('denied');}:undefined);
  if(failure==='listener')f.environment.listen=()=>{throw Error('blocked');};
  if(failure==='unsupported')f.environment.available=()=>false;
  f.look.enable(pose);await Promise.resolve();
  if(failure==='timeout'){f.setTime(3000);f.look.update(0,pose);}
  assert.equal(f.look.state,'unavailable',failure);const message=f.look.message;
  f.look.reset({heading:2,pitch:.1});f.look.suspend();f.look.resume();f.look.update(0,pose);
  assert.equal(f.look.state,'unavailable',failure);assert.equal(f.look.message,message);assert.equal(f.listening,false);
  f.look.follow();assert.equal(f.look.state,'follow');
 }
});
test('restart cancels pending permission and ignores late results until explicit Retry',async()=>{
 for(const status of ['granted','denied']){
  const resolvers:((s:string)=>void)[]=[];const f=fixture(()=>new Promise(r=>resolvers.push(r)));
  f.look.enable(pose);f.look.reset({heading:2,pitch:.1});
  assert.equal(f.look.state,'unavailable');assert.equal(f.listening,false);assert.equal(resolvers.length,1);
  const message=f.look.message;resolvers[0](status);await Promise.resolve();
  assert.equal(f.look.state,'unavailable');assert.equal(f.look.message,message);assert.equal(f.listening,false);
  f.look.enable({heading:2,pitch:.1});assert.equal(resolvers.length,2);resolvers[1]('granted');await Promise.resolve();
  f.emit();f.look.update(0,pose);assert.equal(f.look.state,'calibrating');assert.equal(f.look.orientation.heading,2);
 }
});
test('restart cannot bypass pending denial or interrupted permission',async()=>{
 for(const interrupt of [false,true]){
  const resolvers:((s:string)=>void)[]=[];const f=fixture(()=>new Promise(r=>resolvers.push(r)));
  f.look.enable(pose);if(interrupt)f.look.suspend();f.look.reset({heading:2,pitch:.1});
  assert.equal(f.listening,false);resolvers[0](interrupt?'granted':'denied');await Promise.resolve();
  assert.equal(f.listening,false);assert.equal(f.look.state,interrupt?'suspended':'unavailable');
  if(interrupt){f.look.resume();assert.equal(resolvers.length,2);resolvers[1]('granted');await Promise.resolve();f.emit();f.look.update(0,pose);assert.equal(f.look.state,'calibrating');}
 }
});
test('reduced-motion preference immediately bounds every selected held state without fresh events',()=>{
 for(const state of ['active','suspended','rebasing','waiting','calibrating','unavailable','requesting','center'] as const){
  let reduced=false;const f=fixture(state==='requesting'?()=>new Promise(()=>{}):undefined,()=>reduced);
  if(state==='requesting')f.look.enable({heading:1,pitch:.7});
  else{
   active(f);f.emit(0,130);f.look.update(0,pose);
   if(state==='suspended')f.look.suspend();
   if(state==='rebasing')f.screen(90);
   if(state==='waiting'||state==='calibrating') {f.look.reset({heading:1,pitch:.7});if(state==='calibrating'){f.emit();f.look.update(0,pose);}}
   if(state==='unavailable'){f.look.reset({heading:1,pitch:.7});f.setTime(3000);f.look.update(0,pose);}
   if(state==='center')f.look.center({heading:2,pitch:.7});
  }
  reduced=true;f.look.update(0,pose);
  assert.ok(Math.abs(f.look.orientation.pitch)<=20*Math.PI/180,state);
 }
});
test('changing pitch preference preserves stationary orientation across subsequent samples',()=>{
 let reduced=false;const f=fixture(undefined,()=>reduced);active(f);f.emit(0,150);f.look.update(0,pose);
 reduced=true;f.look.update(0,pose);const held=f.look.orientation.pitch;
 assert.equal(held,20*Math.PI/180);f.emit(0,150);f.look.update(0,pose);assert.ok(Math.abs(f.look.orientation.pitch-held)<1e-8);
 reduced=false;f.look.update(0,pose);f.emit(0,150);f.look.update(0,pose);assert.ok(Math.abs(f.look.orientation.pitch-held)<1e-8);
});

test('Retry after denial explicitly requests permission and still requires Center',async()=>{
 let calls=0;const f=fixture(()=>Promise.resolve(++calls===1?'denied':'granted'));
 f.look.enable(pose);await Promise.resolve();f.look.reset(pose);f.look.suspend();f.look.resume();assert.equal(calls,1);
 f.look.enable(pose);assert.equal(calls,2);await Promise.resolve();f.emit();f.look.update(0,pose);assert.equal(f.look.state,'calibrating');f.look.center(pose);assert.equal(f.look.state,'active');
});
test('repeated interruption after restart cannot skip required Center',async()=>{
 const resolvers:((s:string)=>void)[]=[];const f=fixture(()=>new Promise(r=>resolvers.push(r)));
 f.look.enable(pose);f.look.suspend();f.look.reset(pose);f.look.resume();f.look.suspend();f.look.resume();
 resolvers[0]('granted');resolvers[1]('granted');await Promise.resolve();assert.equal(f.listening,false);
 resolvers[2]('granted');await Promise.resolve();f.emit();f.look.update(0,pose);assert.equal(f.look.state,'calibrating');
 f.look.suspend();f.look.resume();resolvers[3]('granted');await Promise.resolve();f.emit();f.look.update(0,pose);assert.equal(f.look.state,'calibrating');
});
test('Follow invalidates pending permission even after repeated restart',async()=>{
 let resolve!:(s:string)=>void;const f=fixture(()=>new Promise(r=>resolve=r));f.look.enable(pose);f.look.reset(pose);f.look.reset(pose);f.look.follow();resolve('granted');await Promise.resolve();assert.equal(f.listening,false);assert.equal(f.look.state,'follow');
});
