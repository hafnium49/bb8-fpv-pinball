import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PinballSimulation } from '../../src/physics/simulation';
import { STEP } from '../../src/physics/table';
import { addRoute, samples, nearest, length, wireStart, wireEnd, type Variant } from './route';
import { scanFlippers } from './reach';
import { bumpers, flippers, rails, targets } from '../../src/physics/table';

await RAPIER.init();
const variants: Variant[] = ['boxes', 'mesh', 'wire', 'guarded-mesh', 'guided-wire', 'baked-wire'];
type Frame = { t: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; s: number };

function trial(variant: Variant, speed: number, offset: number, veer: number, start?: { x: number; y: number; z: number; delaySteps: number; flipper: string }) {
  const sim = new PinballSimulation(); sim.start(); sim.launch(0.5);
  const colliderCount = addRoute(sim.world, variant), trace: Frame[] = [], costs: number[] = [];
  const first = samples[0];
  sim.ball.setTranslation(start ?? first.c.clone().addScaledVector(first.right, offset).addScaledVector(first.tangent, -0.4), true);
  sim.ball.setLinvel(start ? { x: 0, y: 0, z: 2 } : first.tangent.clone().multiplyScalar(speed).addScaledVector(first.right, speed * veer), true);
  sim.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
  let maxS = 0, maxY = 0, outcome = 'timeout', gate = 0;
  const gates = [2, samples[wireStart].s + 1, (samples[wireStart].s + samples[wireEnd].s) / 2, samples[wireEnd].s - 1, length - 1];
  for (let n = 0; n < 1440; n++) {
    if (start) {
      sim.controls.left = start.flipper === 'left' && n >= start.delaySteps;
      sim.controls.right = start.flipper === 'right' && n >= start.delaySteps;
    }
    const t0 = performance.now(); sim.step(); costs.push(performance.now() - t0);
    const p = sim.position, v = sim.velocity, a = nearest(p);
    if (a.distance < 0.8) maxS = Math.max(maxS, a.s);
    maxY = Math.max(maxY, p.y);
    if (gate < gates.length && a.distance < 0.8 && a.s >= gates[gate] && a.s < gates[gate] + 0.8) gate++;
    trace.push({ t: (n + 1) * STEP, ...p, vx: v.x, vy: v.y, vz: v.z, s: a.s });
    if (gate === gates.length && a.s > length - 0.9 && p.y < 0.65) { outcome = 'complete'; break; }
    if (maxS > 0.6 && maxS < samples[wireStart].s && p.z > 3.5 && v.z > 0) { outcome = 'rollback'; break; }
    if (maxY > 1 && a.c.y > 1.4 && p.y < a.c.y - 0.9) { outcome = 'escape'; break; }
    if (sim.phase !== 'playing') { outcome = 'drain'; break; }
  }
  const last = trace.at(-1)!;
  if (outcome === 'timeout' && Math.hypot(last.vx, last.vy, last.vz) < 0.25) outcome = 'stuck';
  costs.sort((a, b) => a - b);
  const report = { variant, ...(start ? { start } : { speed, offset, veer }), outcome, orderedGatesPassed: gate, colliderCount, maxS, maxY, duration: last.t, final: last, stepMedianMs: costs[Math.floor(costs.length / 2)], stepP95Ms: costs[Math.floor(costs.length * 0.95)] };
  sim.dispose(); return { report, trace };
}

const injected: any[] = [], traces: Record<string, Frame[]> = {};
for (const variant of variants) for (const speed of [4, 8, 12, 16, 20, 24, 28]) for (const offset of [-0.30, 0, 0.30]) for (const veer of [-0.10, 0, 0.10]) {
  const { report, trace } = trial(variant, speed, offset, veer); injected.push(report);
  if (offset === 0 && veer === 0) traces[`${variant}-${speed}`] = trace;
}
const shots = await scanFlippers();
const candidates = shots.filter(a => a.entry.x > -3.5 && a.entry.x < -1.8 && a.entry.y < 0.6);
const flipper: any[] = [];
for (const variant of variants) for (const candidate of candidates) {
  const { report, trace } = trial(variant, 0, 0, 0, candidate.start);
  flipper.push(report); if (report.outcome === 'complete') traces[`flipper-${variant}`] ??= trace;
}

const summary = variants.map(variant => {
  const cases = injected.filter(a => a.variant === variant), real = flipper.filter(a => a.variant === variant);
  const counts = (rows: any[]) => Object.fromEntries(['complete', 'rollback', 'escape', 'stuck', 'timeout', 'drain'].map(k => [k, rows.filter(a => a.outcome === k).length]));
  return { variant, colliders: cases[0].colliderCount, injected: counts(cases), flipper: counts(real), maxStepP95Ms: Math.max(...cases.map(a => a.stepP95Ms)) };
});

// The board-local gravity is a coordinate transform of vertical gravity.
const angle = Math.atan2(3, 9.81), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
const transformed = new THREE.Vector3(0, -9.81, 3).applyQuaternion(q);
const gravity = { boardLocal: [0, -9.81, 3], equivalentTiltDegrees: angle * 180 / Math.PI, verticalGravity: transformed.toArray(), magnitude: Math.hypot(9.81, 3) };
mkdirSync('artifacts/elevated-circuit', { recursive: true });
writeFileSync('artifacts/elevated-circuit/physics.json', JSON.stringify({ basis: 'Rapier 0.21.0, original table, 120 Hz, ball CCD, production flipper tuning, zero rail restitution combined by Min', routeLength: length, samples: samples.length, scannedFlipperSetups: 192, forwardCrossings: shots.length, candidateFlipperSetups: candidates.length, summary, gravity, injected, flipper }, null, 2));
writeFileSync('artifacts/elevated-circuit/traces.json', JSON.stringify(traces));
writeFileSync('artifacts/elevated-circuit/layout.json', JSON.stringify({ samples: samples.map(a => ({ x: a.c.x, y: a.c.y, z: a.c.z, s: a.s })), wireStart, wireEnd, bumpers, flippers, rails, targets }));
const replay = traces['flipper-baked-wire'];
if (!replay?.length) throw new Error('The preferred route did not complete a flipper-driven traversal.');
writeFileSync('spikes/elevated-circuit/replay.json', '{"flipper-baked-wire": [\n' + replay.map(frame => JSON.stringify(Object.fromEntries(Object.entries(frame).map(([key, value]) => [key, Number(value.toFixed(5))])))).join(',\n') + '\n]}\n');
console.log(JSON.stringify({ summary, gravity, flipper }, null, 2));
