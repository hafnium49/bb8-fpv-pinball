import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArcadeTable } from '../../src/render/table-model';
import { ribbon, samples, wireStart, wireEnd, cageWires, wireGeometry, widthAt, length, nearest } from './route';
import { cameraPose, type Frame } from './camera';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture; room.dispose();
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xcbdfff, 0x23325e, 1.1));
const sun = new THREE.DirectionalLight(0xffe7d2, 1.8); sun.position.set(-7, 15, -6); scene.add(sun);
const blue = new THREE.DirectionalLight(0x6bbfff, 1.0); blue.position.set(8, 5, 10); scene.add(blue);
const table = new ArcadeTable(scene);
const baseChildren = new Set(scene.children);
const chrome = new THREE.MeshStandardMaterial({ color: 0xd4e5eb, metalness: 0.92, roughness: 0.18 });
const rampMetal = new THREE.MeshStandardMaterial({ color: 0x1a4454, metalness: 0.72, roughness: 0.30, side: THREE.DoubleSide });
const glass = new THREE.MeshPhysicalMaterial({ color: 0x8accde, metalness: 0.05, roughness: 0.25, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const cyan = new THREE.MeshStandardMaterial({ color: 0x9cfcff, emissive: 0x24bddd, emissiveIntensity: 1.3 });
const amber = new THREE.MeshStandardMaterial({ color: 0xffd8aa, emissive: 0xff8c30, emissiveIntensity: 1.1 });
function tube(points: THREE.Vector3[], radius: number, material: THREE.Material) {
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal'), points.length - 1, radius, 8, false);
  const mesh = new THREE.Mesh(geo, material); scene.add(mesh); return mesh;
}
for (const [from, to] of [[0, wireStart + 6], [wireEnd - 6, samples.length - 1]]) {
  const data = ribbon(0.65, 1.65, from, to, true, true);
  const floor: number[] = [], panels: number[] = [];
  for (let i = 0; i < (to - from); i++) {
    const b = i * 4;
    floor.push(b + 1, b + 2, b + 5, b + 2, b + 6, b + 5);
    for (const col of [0, 2]) panels.push(b + col, b + col + 1, b + col + 4, b + col + 1, b + col + 5, b + col + 4);
    if (samples[from + i + 1].s > 2 && samples[from + i + 1].s < length - 1.6) panels.push(b, b + 4, b + 3, b + 3, b + 4, b + 7);
  }
  for (const [indices, mat] of [[floor, rampMetal], [panels, glass]] as const) {
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(data.vertices, 3)).setIndex(indices); geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, mat));
  }
  for (const side of [-1, 1]) for (const height of [-0.28, 1.37]) {
    tube(samples.slice(from, to + 1).map((a, i) => a.c.clone().addScaledVector(a.right, side * widthAt(from + i, true)).addScaledVector(a.up, height)), height < 0 ? 0.035 : 0.025, height < 0 ? amber : chrome);
  }
}
for (const [lateral, height] of cageWires) scene.add(new THREE.Mesh(wireGeometry(lateral, height), chrome));
// Sparse bridge cross ties and outboard support arms: visual concepts, not in the contact comparison.
for (let i = wireStart + 5; i < wireEnd - 5; i += 8) {
  const a = samples[i];
  tube([-0.51, 0.51].map(x => a.c.clone().addScaledVector(a.right, x).addScaledVector(a.up, -0.36)), 0.026, chrome);
}
for (const i of [wireStart, Math.floor((wireStart + wireEnd) / 2), wireEnd]) {
  const a = samples[i], side = a.c.x < 0 ? -1 : 1, start = new THREE.Vector3(side * 6.3, -0.5, a.c.z);
  tube([start, new THREE.Vector3(side * 6.3, a.c.y - 0.65, a.c.z), a.c.clone().addScaledVector(a.up, -0.45)], 0.10, chrome);
}
// A 2.4-unit partly open tunnel on the descent. Bright ribs expose both portals.
const tunnelStart = samples.findIndex((a, i) => i > wireEnd && a.c.z > -0.6);
const tunnelEnd = samples.findIndex((a, i) => i > tunnelStart && a.s >= samples[tunnelStart].s + 2.4);
for (let i = tunnelStart; i <= tunnelEnd; i += 4) {
  const a = samples[i];
  tube([[-0.67, -0.25], [-0.67, 1.40], [0.67, 1.40], [0.67, -0.25]].map(([x, y]) => a.c.clone().addScaledVector(a.right, x).addScaledVector(a.up, y)), 0.045, cyan);
}
const traces: Record<string, Frame[]> = await (await fetch('./replay.json')).json();
const trace = traces['flipper-baked-wire'];
if (!trace?.length) throw new Error('Run the physics spike and generate replay.json first.');
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.06, 160);
let mode = 'table', time = 1.35;
function renderAt(t = time, nextMode = mode) {
  time = Math.min(trace.at(-1)!.t, Math.max(0, t)); mode = nextMode;
  const index = Math.min(trace.length - 1, Math.floor(time * 120)), f = trace[index];
  table.ball.position.set(f.x, f.y, f.z); table.ball.visible = mode !== 'fpv';
  table.flipperGroups[0].rotation.y = 0.48;
  const state = { yaw: 0, pitch: 0 }; let pose = cameraPose(trace[0], state);
  for (let i = 1; i <= index; i++) pose = cameraPose(trace[i], state);
  camera.up.set(0, 1, 0); camera.aspect = innerWidth / innerHeight;
  if (mode === 'fpv') { camera.fov = 82; camera.position.copy(pose.position); camera.lookAt(pose.target); }
  else if (mode === 'chase') { camera.fov = 65; camera.position.copy(pose.position).add(new THREE.Vector3(-Math.sin(pose.yaw) * 3.2, 2.6, Math.cos(pose.yaw) * 3.2)); camera.lookAt(f.x, f.y + 0.3, f.z); }
  else { camera.fov = 48; camera.position.set(0, Math.max(27, 17 / camera.aspect), 12); camera.lookAt(0, 0, -0.4); }
  camera.updateProjectionMatrix();
  if (canvas.width !== innerWidth || canvas.height !== innerHeight) renderer.setSize(innerWidth, innerHeight);
  renderer.render(scene, camera);
  document.querySelector<HTMLOutputElement>('#readout')!.value = `${time.toFixed(2)}s · height ${f.y.toFixed(2)}`;
  const s = nearest(f).s;
  document.querySelector('#state')!.textContent = s < samples[wireStart].s ? 'ASCENDING RAMP' : s < samples[wireEnd].s ? 'WIRE BRIDGE' : s < samples[tunnelEnd].s ? 'LIT TUNNEL' : 'RIGHT RETURN';
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  return { time, mode, position: pose.position.toArray(), pitchDegrees: pose.pitch * 180 / Math.PI, clearance: pose.clearance, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}
document.querySelector<HTMLInputElement>('#time')!.addEventListener('input', e => renderAt(Number((e.target as HTMLInputElement).value) / 1000 * trace.at(-1)!.t));
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => renderAt(time, button.dataset.mode)));
addEventListener('resize', () => renderAt());
const routeObjects = scene.children.filter(child => !baseChildren.has(child));
const measureGeometry = () => {
  renderAt(time, 'table'); const total = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  routeObjects.forEach(object => { object.visible = false; }); renderer.render(scene, camera);
  const base = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  routeObjects.forEach(object => { object.visible = true; }); renderAt(time, mode);
  return { base, total, added: { calls: total.calls - base.calls, triangles: total.triangles - base.triangles } };
};
const debug = { renderAt, measureGeometry, trace, renderer, scene, camera, tunnelStartS: samples[tunnelStart].s, tunnelEndS: samples[tunnelEnd].s, bridgeStartS: samples[wireStart].s, bridgeEndS: samples[wireEnd].s };
Object.assign(window, { spikeDebug: debug }); renderAt();
