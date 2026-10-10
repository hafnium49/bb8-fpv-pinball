import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Merge opaque stationary parts once, in small spatial cells so FPV culling stays useful. */
export function batchStaticMeshes(root: THREE.Object3D, moving: Set<THREE.Object3D>, cellSize = 6) {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, THREE.Mesh[]>();
  const rootInverse = root.matrixWorld.clone().invert();
  const center = new THREE.Vector3();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || Array.isArray(object.material)) return;
    for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) if (moving.has(ancestor)) return;
    const material = object.material;
    if (material.transparent || object.geometry.morphAttributes.position || !object.visible) return;
    object.getWorldPosition(center).applyMatrix4(rootInverse);
    const key = [material.uuid, object.castShadow, object.receiveShadow, object.layers.mask, object.renderOrder,
      Object.keys(object.geometry.attributes).sort().join(','), Math.floor(center.x / cellSize), Math.floor(center.z / cellSize)].join(':');
    const bucket = buckets.get(key) || []; bucket.push(object); buckets.set(key, bucket);
  });
  const geometries: THREE.BufferGeometry[] = [];
  let removed = 0, batches = 0;
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      const geometry = mesh.geometry.clone();
      // Keep vertex reuse in indexed primitives. Sequential indices let the
      // non-indexed rounded boxes join without expanding cylinders/rings.
      if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld));
      return geometry;
    });
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const first = meshes[0], batch = new THREE.Mesh(geometry, first.material);
    geometry.boundingBox!.getCenter(batch.position);
    geometry.translate(-batch.position.x, -batch.position.y, -batch.position.z);
    // A batch at the world origin defeats Three's front-to-back sorting even
    // when its vertices are far away. Recenter without changing world vertices.
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    batch.name = 'Static cabinet batch'; batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.layers.mask = first.layers.mask; batch.renderOrder = first.renderOrder;
    root.add(batch); for (const mesh of meshes) mesh.removeFromParent();
    geometries.push(geometry); removed += meshes.length; batches++;
  }
  // Freeze world transforms only when every ancestor is stationary. Dynamic
  // flippers, bumper caps, the intro ball and portals keep normal updates.
  root.updateMatrixWorld(true);
  root.traverse(object => {
    for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) if (moving.has(ancestor)) return;
    object.updateMatrix(); object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false;
  });
  return { geometries, removed, batches };
}
