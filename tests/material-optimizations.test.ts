import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { reuseMaterialSamples } from '../src/render/material-optimizations';

const compile = (m: THREE.MeshStandardMaterial) => {
  const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <map_fragment>\n#include <emissivemap_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>' };
  m.onBeforeCompile(shader as Parameters<typeof m.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
  return shader;
};

test('identical artwork/emission samples preserve existing neon shader hooks and cache identity', () => {
  const texture = new THREE.Texture(), m = new THREE.MeshStandardMaterial({ map:texture, emissiveMap:texture });
  m.onBeforeCompile = shader => { shader.fragmentShader += '\n// original neon hook'; };
  m.customProgramCacheKey = () => 'neon-palette';
  assert.equal(reuseMaterialSamples(m), true);
  const shader = compile(m);
  assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance *= sampledDiffuseColor.rgb;'));
  assert.ok(shader.fragmentShader.includes('// original neon hook'));
  assert.ok(shader.fragmentShader.includes('#include <map_fragment>'));
  assert.ok(m.customProgramCacheKey().startsWith('neon-palette-'));
  const version = m.version;
  assert.equal(reuseMaterialSamples(m), false); assert.equal(m.version,version,'Idempotent specialization');
  texture.dispose();m.dispose();
});

test('different texture objects retain their independent color/emission transforms', () => {
  const a = new THREE.Texture(), b = a.clone(); b.offset.x=.25;
  const m = new THREE.MeshStandardMaterial({map:a,emissiveMap:b});
  assert.equal(reuseMaterialSamples(m),false);
  assert.ok(compile(m).fragmentShader.includes('#include <emissivemap_fragment>'));
  a.dispose();b.dispose();m.dispose();
});

test('shared roughness/metalness palette preserves channel semantics with one sample', () => {
  const texture = new THREE.Texture(), m = new THREE.MeshPhysicalMaterial({roughnessMap:texture,metalnessMap:texture});
  assert.equal(reuseMaterialSamples(m),true);const shader=compile(m);
  assert.ok(shader.fragmentShader.includes('#include <roughnessmap_fragment>'));
  assert.ok(shader.fragmentShader.includes('metalnessFactor *= texelRoughness.b;'));
  assert.ok(shader.fragmentShader.includes('#include <emissivemap_fragment>'));
  // Pin the Three shader contract that this optimization relies on.
  assert.match(THREE.ShaderChunk.roughnessmap_fragment,/vec4 texelRoughness/);
  assert.match(THREE.ShaderChunk.map_fragment,/vec4 sampledDiffuseColor/);
  texture.dispose();m.dispose();
});

test('underside illumination composes with shared samples without changing front-face emission',async()=>{
  const {illuminateBackFace}=await import('../src/render/material-optimizations');
  const texture=new THREE.Texture(),m=new THREE.MeshPhysicalMaterial({map:texture,emissiveMap:texture,side:THREE.DoubleSide});
  illuminateBackFace(m,5.5);reuseMaterialSamples(m);const shader=compile(m);
  assert.ok(shader.fragmentShader.includes('gl_FrontFacing ? 1.0 : 5.5000'));
  assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance *= sampledDiffuseColor.rgb;'));
  assert.ok(m.customProgramCacheKey().includes('back-emission-5.5000'));
  assert.throws(()=>illuminateBackFace(m,NaN));assert.throws(()=>illuminateBackFace(m,.5));
  texture.dispose();m.dispose();
});
