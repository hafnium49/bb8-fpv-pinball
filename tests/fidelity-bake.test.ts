import test from 'node:test';
import assert from 'node:assert/strict';
import { fidelityMode, glazePixels, contactFootprints, bakeGroundContacts } from '../src/render/fidelity-bake';
test('fidelity spike is opt-in with strict mode allowlist',()=>{
 for(const q of ['', '?fidelity=no', '?fidelity=baseline']) assert.equal(fidelityMode(q),'baseline');
 assert.equal(fidelityMode('?fidelity=baked'),'baked');assert.equal(fidelityMode('?fidelity=roughness'),'roughness');
});
test('glaze data is deterministic, opaque and bounded',()=>{
 const a=glazePixels();assert.deepEqual(a,glazePixels());assert.equal(a.length,256*512*4);
 for(let i=0;i<a.length;i+=4){assert.ok(a[i]>=58&&a[i]<=123);assert.equal(a[i],a[i+1]);assert.equal(a[i],a[i+2]);assert.equal(a[i+3],255);}
});
test('contact approximation uses only finite fixed ground landmarks and restores canvas',()=>{
 assert.ok(contactFootprints.length>0);
 for(const p of contactFootprints){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.radius>0);}
 const calls:string[]=[];
 const c={save(){calls.push('save')},restore(){calls.push('restore')},createRadialGradient(){return {addColorStop(){}}},fillRect(){calls.push('rect')},fillStyle:''};
 bakeGroundContacts(c as unknown as CanvasRenderingContext2D);
 assert.equal(calls[0],'save');assert.equal(calls.at(-1),'restore');assert.equal(calls.filter(c=>c==='rect').length,contactFootprints.length);
});
