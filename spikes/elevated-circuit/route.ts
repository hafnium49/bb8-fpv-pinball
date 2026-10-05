import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BALL_RADIUS } from '../../src/physics/table';

export const anchors = [
  [-2.75, 0.28, 3.0], [-2.80, 0.31, 2.0], [-3.30, 1.00, 0.0],
  [-3.80, 2.05, -3.0], [-3.50, 2.48, -5.1], [-1.80, 2.48, -5.8],
  [0.90, 2.48, -5.6], [3.20, 2.48, -4.0], [3.40, 2.20, -1.0],
  [3.10, 1.80, 2.0], [2.85, 0.95, 4.6], [2.40, 0.28, 6.3],
  [2.20, 0.28, 6.9],
];
export type Sample = { c: THREE.Vector3; tangent: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; s: number; u: number };
export type Variant = 'boxes' | 'mesh' | 'wire' | 'guarded-mesh' | 'guided-wire' | 'baked-wire';
export const WIRE_RADIUS = 0.06, WIRE_SPACING = 0.21;
export const WIRE_DROP = Math.sqrt((BALL_RADIUS + WIRE_RADIUS) ** 2 - WIRE_SPACING ** 2);
export const curve = new THREE.CatmullRomCurve3(anchors.map(p => new THREE.Vector3(...p as [number, number, number])), false, 'centripetal');
export const samples: Sample[] = [];
const count = Math.ceil(curve.getLength() / 0.18);
for (let i = 0; i <= count; i++) {
  const u = i / count, c = curve.getPointAt(u), tangent = curve.getTangentAt(u).normalize();
  const right = tangent.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const up = right.clone().cross(tangent).normalize();
  samples.push({ c, tangent, right, up, s: i ? samples[i - 1].s + c.distanceTo(samples[i - 1].c) : 0, u });
}
export const length = samples.at(-1)!.s;
export const wireStart = samples.findIndex(p => p.c.z < -5.15), wireEnd = samples.findIndex((p, i) => i > wireStart && p.c.x > 3.2 && p.c.z > -3.5);

export function nearest(p: { x: number; y: number; z: number }) {
  const point = new THREE.Vector3(p.x, p.y, p.z);
  let index = 0, d = Infinity;
  samples.forEach((a, i) => { const distance = a.c.distanceToSquared(point); if (distance < d) { d = distance; index = i; } });
  return { ...samples[index], index, distance: Math.sqrt(d), lateral: point.clone().sub(samples[index].c).dot(samples[index].right) };
}

export function widthAt(index: number, narrow = false) {
  if (!narrow) return 0.65;
  const s = samples[index].s, entry = samples[wireStart].s, exit = samples[wireEnd].s;
  const blend = Math.min(1, Math.max(0, (s - entry + 2.5) / 2.0), Math.max(0, (exit + 2.5 - s) / 2.0));
  const entranceFlare = 0.45 * Math.max(0, 1 - s / 2.0);
  return 0.65 + entranceFlare - blend * 0.21;
}
export function ribbon(halfWidth = 0.65, wallHeight = 0.65, from = 0, to = samples.length - 1, narrow = false, roof = false) {
  const vertices: number[] = [], indices: number[] = [];
  for (let i = from; i <= to; i++) {
    const a = samples[i], surface = a.c.clone().addScaledVector(a.up, -BALL_RADIUS);
    for (const [side, height] of [[-1, wallHeight], [-1, 0], [1, 0], [1, wallHeight]]) {
      const v = surface.clone().addScaledVector(a.right, side * (narrow ? widthAt(i, true) : halfWidth)).addScaledVector(a.up, height);
      vertices.push(v.x, v.y, v.z);
    }
    if (i > from) for (let col = 0; col < 3; col++) {
      const b = (i - from - 1) * 4 + col;
      indices.push(b, b + 1, b + 4, b + 1, b + 5, b + 4);
    }
    if (roof && i > from && a.s > 2 && a.s < length - 1.6) {
      const b = (i - from - 1) * 4;
      indices.push(b, b + 4, b + 3, b + 3, b + 4, b + 7);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

function settings(desc: RAPIER.ColliderDesc) {
  return desc.setFriction(0.02).setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
}
function capsule(world: RAPIER.World, a: THREE.Vector3, b: THREE.Vector3, radius = WIRE_RADIUS) {
  const center = a.clone().add(b).multiplyScalar(0.5), tangent = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.clone().normalize());
  world.createCollider(settings(RAPIER.ColliderDesc.capsule(tangent.length() / 2, radius)).setTranslation(center.x, center.y, center.z).setRotation(q));
}

export const cageWires = [[-WIRE_SPACING, -WIRE_DROP], [WIRE_SPACING, -WIRE_DROP], [-0.49, -0.07], [0.49, -0.07], [-0.49, 0.38], [0.49, 0.38], [-0.2, 0.82], [0.2, 0.82]];
export function wireGeometry(lateral: number, vertical: number, guided = true) {
  const overlap = guided ? 6 : 0;
  const points = samples.slice(wireStart - overlap, wireEnd + overlap + 1).map(a => a.c.clone().addScaledVector(a.right, lateral).addScaledVector(a.up, vertical));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal'), points.length - 1, WIRE_RADIUS, 8, false);
}
function bakedWires() {
  const vertices: number[] = [], indices: number[] = [];
  for (const [side, height] of cageWires) {
    const geometry = wireGeometry(side, height), position = geometry.getAttribute('position'), index = geometry.index!;
    const offset = vertices.length / 3;
    vertices.push(...Array.from(position.array)); indices.push(...Array.from(index.array).map(i => i + offset)); geometry.dispose();
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

export function addRoute(world: RAPIER.World, variant: Variant) {
  const before = world.colliders.len();
  if (variant === 'mesh' || variant === 'guarded-mesh') {
    const data = ribbon(0.65, variant === 'guarded-mesh' ? 1.65 : 0.65, 0, samples.length - 1, false, variant === 'guarded-mesh');
    world.createCollider(settings(RAPIER.ColliderDesc.trimesh(data.vertices, data.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)));
  } else if (variant === 'boxes') {
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1], tangent = b.c.clone().sub(a.c), center = a.c.clone().add(b.c).multiplyScalar(0.5);
      const right = tangent.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), up = right.clone().cross(tangent).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, tangent.clone().normalize().negate()));
      for (const [dx, dy, width, height] of [[0, -BALL_RADIUS - 0.04, 0.65, 0.04], [-0.70, 0.05, 0.05, 0.33], [0.70, 0.05, 0.05, 0.33]]) {
        const p = center.clone().addScaledVector(right, dx).addScaledVector(up, dy);
        world.createCollider(settings(RAPIER.ColliderDesc.cuboid(width, height, tangent.length() / 2 + 0.025)).setTranslation(p.x, p.y, p.z).setRotation(q));
      }
    }
  } else {
    // Solid lead-in and descent; a genuinely open, six-wire cage across the bridge.
    const guided = variant === 'guided-wire' || variant === 'baked-wire', overlap = guided ? 6 : 0;
    for (const [a, b] of [[0, wireStart + overlap], [wireEnd - overlap, samples.length - 1]]) {
      const data = ribbon(0.65, guided ? 1.65 : 0.65, a, b, guided, guided);
      world.createCollider(settings(RAPIER.ColliderDesc.trimesh(data.vertices, data.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)));
    }
    if (variant === 'baked-wire') {
      const data = bakedWires();
      world.createCollider(settings(RAPIER.ColliderDesc.trimesh(data.vertices, data.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)));
    } else {
      const wires = guided ? cageWires : cageWires.slice(0, 6);
      for (let i = wireStart - overlap; i < wireEnd + overlap; i++) for (const [lateral, vertical] of wires) {
        const wire = (a: Sample) => a.c.clone().addScaledVector(a.right, lateral).addScaledVector(a.up, vertical);
        capsule(world, wire(samples[i]), wire(samples[i + 1]));
      }
    }
  }
  return world.colliders.len() - before;
}
