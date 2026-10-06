import { CatmullRomCurve3, Vector3 } from 'three';
import { BALL_RADIUS, CIRCUIT_POINTS } from './table';

export interface Vec3 { x: number; y: number; z: number }
export interface RouteFrame {
  c: Vec3; tangent: Vec3; right: Vec3; up: Vec3; s: number; t: number;
  width: number; roof: number;
}
export interface MeshData { vertices: Float32Array; indices: Uint32Array }
export interface Projection { s: number; index: number; distance: number; lateral: number; vertical: number }
export const WIRE_RADIUS = 0.06, SUPPORT_SPACING = 0.21;
const supportDrop = Math.sqrt((BALL_RADIUS + WIRE_RADIUS) ** 2 - SUPPORT_SPACING ** 2);
export const cageWires: ReadonlyArray<readonly [number, number]> = [
  [-SUPPORT_SPACING, -supportDrop], [SUPPORT_SPACING, -supportDrop],
  [-0.49, -0.07], [0.49, -0.07], [-0.49, 0.38], [0.49, 0.38],
  [-0.20, 0.82], [0.20, 0.82],
];
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (x: number, y: number, z: number): Vec3 => { const n = Math.hypot(x, y, z); return { x: x / n, y: y / n, z: z / n }; };
const cross = (a: Vec3, b: Vec3) => unit(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// Monotone Hermite height interpolation prevents floor/crest overshoot. Three.js
// is used only for startup curve math, never as authoritative simulation state.
const horizontal = new CatmullRomCurve3(CIRCUIT_POINTS.map(([x, , z]) => new Vector3(x, 0, z)), false, 'centripetal');
const heights = CIRCUIT_POINTS.map(p => p[1]);
const secants = heights.slice(1).map((y, i) => y - heights[i]);
const slopes = heights.map((_, i) => i === 0 || i === heights.length - 1 || secants[i - 1] * secants[i] <= 0 ? 0 : 2 / (1 / secants[i - 1] + 1 / secants[i]));
function pointAt(t: number): Vec3 {
  const p = horizontal.getPoint(t), scaled = Math.min(heights.length - 1 - 1e-10, Math.max(0, t * (heights.length - 1)));
  const i = Math.floor(scaled), u = scaled - i, u2 = u * u, u3 = u2 * u;
  return { x: p.x, z: p.z, y: (2 * u3 - 3 * u2 + 1) * heights[i] + (u3 - 2 * u2 + u) * slopes[i] + (-2 * u3 + 3 * u2) * heights[i + 1] + (u3 - u2) * slopes[i + 1] };
}
function tangentAt(t: number) {
  const a = pointAt(Math.max(0, t - 1e-5)), b = pointAt(Math.min(1, t + 1e-5));
  return unit(b.x - a.x, b.y - a.y, b.z - a.z);
}
const points: Array<{ t: number; c: Vec3 }> = [{ t: 0, c: pointAt(0) }];
function subdivide(a: number, b: number, pa: Vec3, pb: Vec3, depth = 0) {
  const mid = (a + b) / 2, pm = pointAt(mid), chord = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 };
  if (depth < 12 && (distance(pa, pb) > 0.16 || distance(pm, chord) > 0.0025 || dot(tangentAt(a), tangentAt(b)) < Math.cos(Math.PI / 45))) {
    subdivide(a, mid, pa, pm, depth + 1); subdivide(mid, b, pm, pb, depth + 1);
  } else points.push({ t: b, c: pb });
}
for (let i = 0; i < CIRCUIT_POINTS.length - 1; i++) {
  const a = i / (CIRCUIT_POINTS.length - 1), b = (i + 1) / (CIRCUIT_POINTS.length - 1);
  subdivide(a, b, pointAt(a), pointAt(b));
}
export const frames: RouteFrame[] = points.map((p, i) => {
  const tangent = tangentAt(p.t), right = cross(tangent, { x: 0, y: 1, z: 0 }), up = cross(right, tangent);
  return { ...p, tangent, right, up, s: 0, width: 0, roof: 0 };
});
for (let i = 1; i < frames.length; i++) frames[i].s = frames[i - 1].s + distance(frames[i].c, frames[i - 1].c);
export const routeLength = frames.at(-1)!.s;
export const bridgeStart = frames.findIndex(f => f.c.z < -5.15);
export const bridgeEnd = frames.findIndex((f, i) => i > bridgeStart && f.c.x > 3.2 && f.c.z > -3.5);
if (bridgeStart < 1 || bridgeEnd <= bridgeStart || bridgeEnd >= frames.length - 1) {
  throw new Error('Circuit requires ordered bridge boundaries inside the sampled route.');
}
export const bridgeStartS = frames[bridgeStart].s, bridgeEndS = frames[bridgeEnd].s;
export const tunnelStart = frames.findIndex((f, i) => i > bridgeEnd && f.c.z > -0.6);
export const tunnelEnd = frames.findIndex((f, i) => i > tunnelStart && f.s >= frames[tunnelStart].s + 2.4);
export const landingStart = frames.findIndex((f, i) => i > tunnelEnd && f.c.z > 5.6);
if (tunnelStart <= bridgeEnd || tunnelEnd <= tunnelStart || landingStart <= tunnelEnd) {
  throw new Error('Circuit requires a tunnel and landing after the bridge.');
}
const wireLeadIn = frames.findIndex(f => f.s >= bridgeStartS - 1.1);
const wireLeadOut = frames.findIndex(f => f.s >= bridgeEndS + 1.1);
export const ascentEnd = frames.findIndex(f => f.s >= bridgeStartS + 1.1);
export const descentStart = frames.findIndex(f => f.s >= bridgeEndS - 1.1);
if (wireLeadIn < 0 || wireLeadOut <= wireLeadIn || ascentEnd <= bridgeStart || descentStart <= wireLeadIn) {
  throw new Error('Circuit transition overlap does not fit inside the sampled route.');
}
for (const f of frames) {
  const narrowed = Math.min(smooth((f.s - bridgeStartS + 2.7) / 2), smooth((bridgeEndS + 2.7 - f.s) / 2));
  f.width = 0.65 + 0.45 * (1 - smooth(f.s / 2)) - 0.21 * narrowed;
  // Visible clear hold-down hood prevents fast descents from hitting the top of
  // the flipper airborne. It ends before the flipper's full sweep volume.
  f.roof = 1.65 - 0.87 * smooth((f.c.z - 1.5) / 3.6) * (f.s > bridgeEndS ? 1 : 0);
}

export function localPoint(frame: RouteFrame, lateral: number, vertical: number): Vec3 {
  return { x: frame.c.x + frame.right.x * lateral + frame.up.x * vertical, y: frame.c.y + frame.right.y * lateral + frame.up.y * vertical, z: frame.c.z + frame.right.z * lateral + frame.up.z * vertical };
}
export function frameAt(s: number) {
  let a = 0, b = frames.length - 1;
  while (a < b) { const mid = Math.floor((a + b) / 2); if (frames[mid].s < s) a = mid + 1; else b = mid; }
  return frames[a];
}
export function projectRoute(p: Vec3, out: Projection, from = 0, to = frames.length - 1) {
  let best = Infinity;
  for (let i = Math.max(0, from); i < Math.min(to, frames.length - 1); i++) {
    const a = frames[i], b = frames[i + 1], dx = b.c.x - a.c.x, dy = b.c.y - a.c.y, dz = b.c.z - a.c.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.c.x) * dx + (p.y - a.c.y) * dy + (p.z - a.c.z) * dz) / (dx * dx + dy * dy + dz * dz)));
    const px = p.x - a.c.x - t * dx, py = p.y - a.c.y - t * dy, pz = p.z - a.c.z - t * dz, d = px * px + py * py + pz * pz;
    if (d < best) {
      best = d; out.index = i; out.s = a.s + t * (b.s - a.s);
      out.lateral = px * a.right.x + py * a.right.y + pz * a.right.z;
      out.vertical = px * a.up.x + py * a.up.y + pz * a.up.z;
    }
  }
  out.distance = Math.sqrt(best); return out;
}

export function mergeData(parts: MeshData[]): MeshData {
  const vertexCount = parts.reduce((n, p) => n + p.vertices.length, 0), indexCount = parts.reduce((n, p) => n + p.indices.length, 0);
  const vertices = new Float32Array(vertexCount), indices = new Uint32Array(indexCount); let v = 0, k = 0;
  for (const part of parts) { vertices.set(part.vertices, v); for (const index of part.indices) indices[k++] = index + v / 3; v += part.vertices.length; }
  return { vertices, indices };
}
export function channelData(from: number, to: number, kind: 'floor' | 'sides' | 'roof'): MeshData {
  const vertices: number[] = [], indices: number[] = [];
  for (let i = from; i <= to; i++) {
    const f = frames[i];
    for (const [x, y] of [[-f.width, f.roof - BALL_RADIUS], [-f.width, -BALL_RADIUS], [f.width, -BALL_RADIUS], [f.width, f.roof - BALL_RADIUS]]) {
      const p = localPoint(f, x, y); vertices.push(p.x, p.y, p.z);
    }
    if (i === from) continue;
    const base = (i - from - 1) * 4;
    for (const col of kind === 'floor' ? [1] : kind === 'sides' ? [0, 2] : []) indices.push(base + col, base + col + 1, base + col + 4, base + col + 1, base + col + 5, base + col + 4);
    if (kind === 'roof' && f.s > 1.6 && i < landingStart) indices.push(base, base + 4, base + 3, base + 3, base + 4, base + 7);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
export function tubeData(points: Vec3[], radius: number, sides = 10, capped = true): MeshData {
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)], t = unit(b.x - a.x, b.y - a.y, b.z - a.z);
    const r = cross(t, Math.abs(t.y) > 0.98 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }), up = cross(r, t);
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius, p = points[i];
      vertices.push(p.x + r.x * x + up.x * y, p.y + r.y * x + up.y * y, p.z + r.z * x + up.z * y);
      if (i > 0) { const v = (i - 1) * sides + j, next = (i - 1) * sides + (j + 1) % sides; indices.push(v, v + sides, next, next, v + sides, next + sides); }
    }
  }
  if (capped) for (const end of [0, points.length - 1]) {
    const center = vertices.length / 3, p = points[end]; vertices.push(p.x, p.y, p.z);
    for (let j = 0; j < sides; j++) { const a = end * sides + j, b = end * sides + (j + 1) % sides; indices.push(center, end === 0 ? a : b, end === 0 ? b : a); }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
export const wireData = mergeData(cageWires.map(([x, y]) => tubeData(frames.slice(wireLeadIn, wireLeadOut + 1).map(f => localPoint(f, x, y)), WIRE_RADIUS)));
export const ascentFloor = channelData(0, ascentEnd, 'floor'), descentFloor = channelData(descentStart, frames.length - 1, 'floor');

// A ball must not enter the narrowing space between a low ramp and the board.
// Ground-height skirts close its sides; a skewed rear face guides a ground ball
// sideways instead of balancing it against a wall perpendicular to gravity.
// The higher deck remains open underneath. These faces are rendered as well.
function rampApronData(mouth: number, highEnd: number): MeshData {
  const direction = Math.sign(highEnd - mouth), shortSide = direction > 0 ? -1 : 1;
  let shortEnd = mouth;
  while (shortEnd !== highEnd && frames[shortEnd].c.y < 1.15) shortEnd += direction;
  let longEnd = shortEnd;
  while (longEnd !== highEnd && Math.abs(frames[longEnd].s - frames[shortEnd].s) < 1.1) longEnd += direction;
  if (shortEnd === highEnd || longEnd === highEnd) throw new Error('Low ramp needs room for its diagonal ground deflector.');
  const vertices: number[] = [], indices: number[] = [];
  const edge = (i: number, side: number) => {
    const p = localPoint(frames[i], side * frames[i].width, -BALL_RADIUS);
    p.y = Math.max(-0.01, p.y - 0.012); return p;
  };
  const wall = (points: Vec3[], flip = false) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], v = vertices.length / 3;
      vertices.push(a.x, -0.01, a.z, a.x, a.y, a.z, b.x, -0.01, b.z, b.x, b.y, b.z);
      // FIX_INTERNAL_EDGES uses face orientation at shared edges. Both skirts
      // must face the outside of the closed heel, rather than into its gap.
      if (flip) indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      else indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  };
  for (const side of [-1, 1]) {
    const end = side === shortSide ? shortEnd : longEnd, points: Vec3[] = [];
    for (let i = mouth; ; i += direction) { points.push(edge(i, side)); if (i === end) break; }
    wall(points, side !== shortSide);
  }
  const diagonal: Vec3[] = [], count = Math.abs(longEnd - shortEnd);
  for (let n = 0; n <= count; n++) diagonal.push(edge(shortEnd + n * direction, shortSide * (1 - 2 * n / count)));
  wall(diagonal);
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
export const ascentApron = rampApronData(0, ascentEnd);
export const descentApron = rampApronData(frames.length - 1, descentStart);
export const apronData = mergeData([ascentApron, descentApron]);
export const sideData = mergeData([channelData(0, ascentEnd, 'sides'), channelData(descentStart, frames.length - 1, 'sides')]);
export const roofData = mergeData([channelData(0, ascentEnd, 'roof'), channelData(descentStart, frames.length - 1, 'roof')]);
export const supportData = mergeData([bridgeStart, Math.floor((bridgeStart + bridgeEnd) / 2), bridgeEnd].map(i => {
  const f = frames[i], side = f.c.x < 0 ? -1 : 1;
  return tubeData([{ x: side * 6.3, y: -0.55, z: f.c.z }, { x: side * 6.3, y: f.c.y - 0.60, z: f.c.z }, localPoint(f, 0, -0.45)], 0.08, 8);
}));
export const tiesData = mergeData(frames.filter((_, i) => i > bridgeStart + 5 && i < bridgeEnd - 5 && i % 16 === 0).map(f => tubeData([localPoint(f, -0.51, -0.37), localPoint(f, 0.51, -0.37)], 0.025, 6)));
export const collisionData = [
  mergeData([ascentFloor, ascentApron, channelData(0, ascentEnd, 'sides'), channelData(0, ascentEnd, 'roof')]),
  mergeData([descentFloor, descentApron, channelData(descentStart, frames.length - 1, 'sides'), channelData(descentStart, frames.length - 1, 'roof')]),
  mergeData([wireData, tiesData]), supportData,
];
