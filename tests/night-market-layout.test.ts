import test from 'node:test';
import assert from 'node:assert/strict';
import {marketFronts,marketGlow,simplifyLightPath,tunnelVaultFits} from '../src/render/night-market-layout';
import {bloomSize,supportedHdrSamples} from '../src/render/arcade-post';

test('both courses have complete deterministic storefront districts',()=>{for(const reference of [false,true]){const f=marketFronts(reference);assert.equal(f.length,52);assert.deepEqual(f,marketFronts(reference));assert.equal(new Set(f.map(x=>x.district)).size,4);assert.equal(new Set(f.map(x=>x.tile)).size,16);assert.ok(f.every(x=>Object.values(x).every(Number.isFinite)&&x.width>0&&x.height>=1.8));}});
test('neon animation is bounded and reduced motion holds a constant level',()=>{for(let t=0;t<30;t+=.1)for(let c=0;c<6;c++){const n=marketGlow(t,c,false);assert.ok(n>=.8-1e-9&&n<=1.7+1e-9);assert.equal(marketGlow(t,c,true),1.6);}});
test('simplification preserves endpoints and corners without mutating input',()=>{const p=[{x:0,y:0,z:0},{x:.5,y:0,z:0},{x:1,y:0,z:0},{x:1,y:1,z:0}];const before=JSON.stringify(p);assert.deepEqual(simplifyLightPath(p,.004),[p[0],p[2],p[3]]);assert.equal(JSON.stringify(p),before);});
test('vault threshold prevents crowns above the playfield',()=>{assert.ok(tunnelVaultFits(-.48));assert.ok(!tunnelVaultFits(-.479));});
test('bloom buffers are bounded and HDR samples match both attachment formats',()=>{assert.deepEqual(bloomSize(1280,801),[320,201]);assert.deepEqual(bloomSize(1,1),[1,1]);assert.equal(supportedHdrSamples([4],[4],2),0);assert.equal(supportedHdrSamples([2,4],[2],2),2);assert.equal(supportedHdrSamples([2],[4],4),0);});
