import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WALL_BASE_COLOR, WALL_BASE_CSS } from '../src/render/wall-palette';
import { marketColors, nightMarketInlayAtlas, nightMarketSky } from '../src/render/night-market-art';

function fakeCanvas() {
 const fills:{color:string;rect:number[]}[]=[],stops:{offset:number;color:string}[]=[];
 const target={fillStyle:'',fillRect(...rect:number[]){fills.push({color:this.fillStyle,rect});},createLinearGradient(){return {addColorStop(offset:number,color:string){stops.push({offset,color});}}}};
 const context=new Proxy(target,{get(t,k){return k in t?t[k as keyof typeof t]:()=>{};}});
 const canvas={width:0,height:0,getContext(){return context;}};
 return {canvas,fills,stops};
}

test('all wall-inlay tiles use lighter slate while neon palette is unchanged',()=>{
 const fake=fakeCanvas(),original=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(){return fake.canvas;}}});
 try {
  const map=nightMarketInlayAtlas();
  const bases=fake.fills.filter(f=>f.rect.join(',')==='0,0,512,512');
  assert.equal(bases.length,16);assert.ok(bases.every(f=>f.color===WALL_BASE_CSS));map.dispose();
 } finally {if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}
 assert.equal(WALL_BASE_COLOR,parseInt(WALL_BASE_CSS.slice(1),16));
 assert.deepEqual(marketColors,[0xff4599,0x2ef5dc,0xffc15a,0x9082ff,0x64c5ff,0xd8fb81]);
 const channel=(n:number,s:number)=>(n>>s)&255;
 for(const old of [0x102632,0x29152c,0x172133,0x252319,0x344659])for(const shift of [0,8,16])assert.ok(channel(WALL_BASE_COLOR,shift)>channel(old,shift));
});

test('sky colors remain unchanged and shell uses the dedicated wall base',()=>{
 const fake=fakeCanvas(),original=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(){return fake.canvas;}}});
 try{const map=nightMarketSky();map.dispose();assert.deepEqual(fake.stops,[{offset:0,color:'#030717'},{offset:.55,color:'#141935'},{offset:1,color:'#472843'}]);}
 finally{if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}
 const source=readFileSync(new URL('../src/render/night-market.ts',import.meta.url),'utf8');
 assert.match(source,/this\.enamel = .*color: WALL_BASE_COLOR/);
 assert.match(source,/color: 0x18273f, metalness/); // recessed windows remain dark
});
