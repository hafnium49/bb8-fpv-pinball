import data from './reference-course-data.json';
import { BALL_RADIUS } from './table';
import { tubeData, mergeData, type MeshData, type Vec3 } from './route-geometry';
import { ShapeUtils, Vector2 } from 'three';
// Public reference geometry, inspected 2026-10-10. Its board x/y and height
// become our x/z and y with one uniform scale; no landmark is repositioned.
export const COURSE_SCALE = .028;
export const COURSE_GRAVITY = 9;
export const coursePoint = (x: number, z: number, y = 0): Vec3 => ({ x: (x - 240) * COURSE_SCALE, y: y * COURSE_SCALE, z: (z - 410) * COURSE_SCALE });
export const courseLaunch = { ...coursePoint(440, 750), y: BALL_RADIUS + .015 };
export const courseWidth = 440 * COURSE_SCALE, courseLength = 820 * COURSE_SCALE;
export const deckHeight = data.deck.z * COURSE_SCALE;
export interface CourseSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number;
  thickness: number;
  height: number;
  kind: string;
  restitution: number;
  kick: number;
}
const segment = (s: typeof data.segments[number], y = 0): CourseSegment => {
  const a = coursePoint(s.ax, s.ay), b = coursePoint(s.bx, s.by);
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z, y, thickness: s.thick * COURSE_SCALE,
    height: s.kind === 'rail' && s.ay < 221 && s.by < 221 ? .95 : s.kind.includes('wall') ? .66 : .48,
    kind: s.kind, restitution: s.e, kick: s.kick * COURSE_SCALE };
};
// The launch gate is a one-way gate, not an always-solid cross-lane wall.
export const courseRails = data.segments.filter(s => !/target|drop|gate/.test(s.kind)).map(s => segment(s));
const gateSource = data.segments.find(s => s.kind === 'gate')!;
export const courseGate = { ...segment(gateSource), nx: gateSource.one_way![0], nz: gateSource.one_way![1] };
export const courseTargets = [...data.segments.filter(s => /target|drop/.test(s.kind)).map(s => segment(s)),
  ...data.deck.segments.filter(s => /target|drop/.test(s.kind)).map(s => segment(s, deckHeight))];
export const deckRails = data.deck.segments.filter(s => !/target|drop/.test(s.kind)).map(s => segment(s, deckHeight));
export const courseBumpers = [...data.bumpers.map((b, i) => ({ ...coursePoint(b.x, b.y), radius: b.r * COURSE_SCALE,
    height: b.r * COURSE_SCALE * 1.1, color: [0xffca32, 0xffca32, 0x38bad7, 0xeb4676, 0x71c873, 0x71c873][i], points: b.score, kick: b.kick * COURSE_SCALE })),
  ...data.deck.bumpers.map((b, i) => ({ ...coursePoint(b.x, b.y, data.deck.z), radius: b.r * COURSE_SCALE,
    height: .35, color: [0xffca32, 0xf07b4a, 0xbc66dc][i], points: b.score, kick: b.kick * COURSE_SCALE }))];
export const coursePosts = data.posts.map(b => ({ ...coursePoint(b.x, b.y), radius: b.r * COURSE_SCALE }));
export const courseFlippers = [...data.flippers, ...data.deck.flippers].map((f, i) => ({ ...coursePoint(f.px, f.py, i < 2 ? 0 : data.deck.z),
  length: f.length * COURSE_SCALE, radius: ('radius' in f ? Number(f.radius) : 8) * COURSE_SCALE,
  side: i % 2 === 0 ? 1 : -1, rest: i % 2 === 0 ? -f.rest : Math.PI - f.rest,
  raised: i % 2 === 0 ? -f.up : Math.PI - f.up, input: i % 2 }));
export const courseWell = { ...coursePoint(data.well[0], data.well[1]), radius: data.well[2] * COURSE_SCALE };
export const courseSaucer = coursePoint(...data.saucer as [
  number,
  number
]);
export const coursePortals = data.portals.map(p => coursePoint(p[0], p[1]));
export const courseSpinners = data.spinners.map(([a, b, z]) => ({ a: coursePoint(a, z), b: coursePoint(b, z) }));
export interface CoursePath {
  name: string;
  points: Vec3[];
  lengths: number[];
  length: number;
  width: number;
  pointsAward: number;
  deck: boolean;
  tunnel: boolean;
  exitKind: string;
  exitVelocity: Vec3;
}
function path(name: string, points: Vec3[], width: number, award: number, deck = false, tunnel = false, exitKind = '', exitVelocity = { x: 0, y: 0, z: 4.48 }): CoursePath {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  return { name, points, lengths, length: lengths.at(-1)!, width, pointsAward: award, deck, tunnel, exitKind, exitVelocity };
}
export const courseRamps = data.ramps.map((r, i) => path(r.name, r.pts.map(([x, z], n) => ({ ...coursePoint(x, z, r.height[n] * r.rz), y: r.height[n] * r.rz * COURSE_SCALE + BALL_RADIUS })), (i === 0 ? 26 : 20) * COURSE_SCALE, r.score, r.to_deck));
export const courseTunnels = data.tunnels.map((t, i) => path(t.name, t.pts.map(([x, z], n) => {
  const u = n / (t.pts.length - 1), drop = Math.min(1, u * 12, (1 - u) * 12);
  return { ...coursePoint(x, z), y: BALL_RADIUS - .90 * drop };
}), .4, [3000, 2000, 1500][i], false, true, t.exit_kind, { x: t.exit_vel[0] * COURSE_SCALE, y: 0, z: t.exit_vel[1] * COURSE_SCALE }));
export function pathFrame(path: CoursePath, s: number) {
  s = Math.max(0, Math.min(path.length, s));
  let lo = 0, hi = path.lengths.length - 2;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (path.lengths[m] <= s)
      lo = m;
    else
      hi = m - 1;
  }
  const a = path.points[lo], b = path.points[lo + 1], u = (s - path.lengths[lo]) / (path.lengths[lo + 1] - path.lengths[lo]);
  const n = Math.hypot(b.x - a.x, b.z - a.z);
  return { c: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u },
    tangent: { x: (b.x - a.x) / n, y: (b.y - a.y) / n, z: (b.z - a.z) / n }, index: lo };
}
export const deckOutline = [[255, 218], [255, 64], [285, 42], [335, 36], [372, 58], [408, 92], [432, 136], [440, 160], [440, 232], [255, 232]].map(([x, z]) => coursePoint(x, z));
export const fieldOutline = Array.from({ length: 49 }, (_, i) => coursePoint(240 + Math.cos(Math.PI + i / 48 * Math.PI) * 220, 220 + Math.sin(Math.PI + i / 48 * Math.PI) * 220));
fieldOutline.push(coursePoint(460, 820), coursePoint(20, 820));
export function polygonData(outline: Vec3[], y: number, holes: Vec3[][] = []): MeshData {
  const contours = [outline, ...holes], points = contours.flat();
  const faces = ShapeUtils.triangulateShape(outline.map(p => new Vector2(p.x, p.z)), holes.map(h => h.map(p => new Vector2(p.x, p.z))));
  const indices = faces.flatMap(([a, b, c]) => {
    const pa = points[a], pb = points[b], pc = points[c], area = (pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x);
    return area > 0 ? [a, c, b] : [a, b, c];
  });
  return { vertices: new Float32Array(points.flatMap(p => [p.x, y, p.z])), indices: new Uint32Array(indices) };
}
export const circle = (p: Vec3, r: number) => Array.from({ length: 32 }, (_, i) => ({ x: p.x + Math.cos(i / 16 * Math.PI) * r, y: 0, z: p.z + Math.sin(i / 16 * Math.PI) * r }));
const kidneyPath = courseTunnels[2];
export const kidneyOutline: Vec3[] = [];
const kidneyRadius = .40;
for (const [i, p] of kidneyPath.points.entries()) {
  const t = pathFrame(kidneyPath, kidneyPath.lengths[i]).tangent;
  kidneyOutline.push({ x: p.x - t.z * kidneyRadius, y: 0, z: p.z + t.x * kidneyRadius });
}
for (const end of [true, false]) {
  const index = end ? kidneyPath.points.length - 1 : 0, p = kidneyPath.points[index], t = pathFrame(kidneyPath, kidneyPath.lengths[index]).tangent;
  const angle = Math.atan2(t.x, -t.z) + (end ? 0 : Math.PI);
  for (let n = 1; n <= 16; n++)
    kidneyOutline.push({ x: p.x + Math.cos(angle - n / 16 * Math.PI) * kidneyRadius, y: 0, z: p.z + Math.sin(angle - n / 16 * Math.PI) * kidneyRadius });
  if (end)
    for (let i = kidneyPath.points.length - 1; i >= 0; i--) {
      const p = kidneyPath.points[i], t = pathFrame(kidneyPath, kidneyPath.lengths[i]).tangent;
      kidneyOutline.push({ x: p.x + t.z * kidneyRadius, y: 0, z: p.z - t.x * kidneyRadius });
    }
}
for (let i = kidneyOutline.length - 1; i >= 0; i--) {
  const p = kidneyOutline[i], next = kidneyOutline[(i + 1) % kidneyOutline.length];
  if (Math.hypot(p.x - next.x, p.z - next.z) < 1e-7)
    kidneyOutline.splice(i, 1);
}
export const courseHoles = [...courseTunnels.slice(0, 2).map(t => circle(t.points[0], .35)), kidneyOutline, circle(courseWell, .35), ...coursePortals.map(p => circle(p, .34))];
export const fieldData = polygonData(fieldOutline, 0, courseHoles);
export const deckData = polygonData(deckOutline, deckHeight);
export function pathSurface(path: CoursePath, kind: 'floor' | 'walls') {
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i < path.points.length; i++) {
    const f = pathFrame(path, path.lengths[i]), r = { x: -f.tangent.z, z: f.tangent.x }, p = f.c;
    for (const [side, height] of [[-1, 0], [-1, .42], [1, 0], [1, .42]])
      vertices.push(p.x + r.x * side * path.width, p.y - BALL_RADIUS + height, p.z + r.z * side * path.width);
    if (i === 0)
      continue;
    const k = (i - 1) * 4;
    if (kind === 'floor')
      indices.push(k, k + 2, k + 4, k + 2, k + 6, k + 4);
    else
      indices.push(k, k + 1, k + 4, k + 1, k + 5, k + 4, k + 2, k + 6, k + 3, k + 3, k + 6, k + 7);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
export function pathWires(path: CoursePath, offsets: readonly (readonly [
  number,
  number
])[], radius = .035) {
  return mergeData(offsets.map(([x, y]) => tubeData(path.points.map((p, i) => { const f = pathFrame(path, path.lengths[i]); return { x: p.x - f.tangent.z * x, y: p.y + y, z: p.z + f.tangent.x * x }; }), radius, 6)));
}
