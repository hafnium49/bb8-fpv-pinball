import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { batchStaticMeshes } from '../src/render/static-batch';

test('static batches preserve world vertices, UVs, normals and shadow flags under transformed parents', () => {
  const root = new THREE.Group(); root.position.set(4, 2, 1); root.rotation.y = .3;
  const parent = new THREE.Group(); parent.rotation.y = .6; root.add(parent);
  const mat = new THREE.MeshStandardMaterial(), meshes: THREE.Mesh[] = [];
  for (const x of [1, 2]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat); mesh.position.x = x;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); meshes.push(mesh);
  }
  root.updateMatrixWorld(true);
  const vertices = meshes.flatMap(mesh => {
    const g = mesh.geometry.toNonIndexed(), a = g.getAttribute('position');
    return Array.from({ length: a.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld));
  });
  const result = batchStaticMeshes(root, new Set());
  assert.equal(result.removed, 2); assert.equal(result.batches, 1);
  const batch = root.children.find(o => o instanceof THREE.Mesh) as THREE.Mesh;
  const a = batch.geometry.toNonIndexed().getAttribute('position');
  assert.equal(a.count, vertices.length);
  vertices.forEach((v, i) => assert.ok(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(batch.matrixWorld).distanceTo(v) < 1e-6));
  assert.equal(batch.geometry.getAttribute('uv').count, batch.geometry.getAttribute('position').count);
  assert.equal(batch.geometry.getAttribute('normal').count, batch.geometry.getAttribute('position').count);
  assert.equal(batch.geometry.getAttribute('position').count, 48, 'Indexed box vertices retain reuse');
  assert.ok(batch.position.length() > 0, 'Opaque sorting uses the actual batch center');
  assert.equal(batch.castShadow && batch.receiveShadow, true);
  assert.equal(batch.matrixWorldAutoUpdate, false);
});

test('moving descendants and transparent surfaces retain independent transforms and sorting', () => {
  const root = new THREE.Scene(), moving = new THREE.Group(); root.add(moving);
  const mat = new THREE.MeshStandardMaterial();
  for (const parent of [root, root, moving, moving]) parent.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial({ transparent: true, opacity: .2 }));
  root.add(glass);
  batchStaticMeshes(root, new Set([moving]));
  assert.equal(moving.children.length, 2); assert.equal(glass.parent, root);
  assert.equal(root.matrixWorldAutoUpdate, true, 'Renderer must continue traversing the scene');
  assert.equal(moving.matrixWorldAutoUpdate, true);
  moving.rotation.y = Math.PI / 2;
  // Match the renderer's gate instead of bypassing it with an unconditional update.
  if (root.matrixWorldAutoUpdate) root.updateMatrixWorld();
  assert.ok(Math.abs(moving.children[0].matrixWorld.elements[0]) < 1e-6);
});

test('material, shadow and spatial boundaries stay separate to preserve rendering and culling', () => {
  const root = new THREE.Group(), a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
  for (const [mat, x, shadow] of [[a, 1, true], [a, 1, true], [b, 1, true], [a, 1, false], [a, 20, true]] as const) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat); mesh.position.x = x; mesh.castShadow = shadow; root.add(mesh);
  }
  const result = batchStaticMeshes(root, new Set());
  assert.equal(result.batches, 1); assert.equal(root.children.length, 4);
});
