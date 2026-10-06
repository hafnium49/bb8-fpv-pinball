import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import { PinballSimulation } from '../src/physics/simulation';
import { bridgeStart, bridgeEnd, frames, routeLength } from '../src/physics/route-geometry';
import { bumpers, flippers, rails } from '../src/physics/table';
import { entryTrial, launchTrial } from './circuit-harness';

await RAPIER.init();
const cases = [];
for (const speed of [4, 8, 12, 16, 20, 24, 28]) for (const offset of [-0.3, 0, 0.3]) for (const veer of [-0.1, 0, 0.1]) {
  const sim = new PinballSimulation({ circuit: true });
  try { const report = entryTrial(sim, { speed, offset, veer }); cases.push(report); assert.ok(['returned', 'rollback'].includes(report.outcome), JSON.stringify(report)); assert.equal(report.awards, report.completed ? 1 : 0); }
  finally { sim.dispose(); }
}
const stress = [];
for (const speed of [12, 20, 28]) for (const spin of [{ x: -30, y: 0, z: 0 }, { x: 30, y: 12, z: -18 }, { x: -50, y: -20, z: 25 }]) for (const fraction of [0.25, 0.75]) {
  const sim = new PinballSimulation({ circuit: true });
  try { const report = entryTrial(sim, { speed, offset: 0, veer: 0, spin, advance: speed / 120 * fraction, height: 0.08 }); stress.push(report); assert.ok(['returned', 'rollback'].includes(report.outcome), JSON.stringify(report)); assert.equal(report.awards, report.completed ? 1 : 0); }
  finally { sim.dispose(); }
}
const launches = [];
for (const leftZ of [6.3, 6.6]) {
  const sim = new PinballSimulation({ circuit: true });
  try { const report = launchTrial(sim, 0.7, leftZ); launches.push(report); assert.ok(report.laneExit && report.leftContact && report.rightReturn, JSON.stringify(report)); assert.equal(report.awards, 1); assert.ok(report.velocity.z < -3); }
  finally { sim.dispose(); }
}
const counts = (all: typeof cases) => Object.fromEntries(['returned', 'rollback', 'drain', 'timeout'].map(k => [k, all.filter(r => r.outcome === k).length]));
const report = { result: 'pass', scope: 'actual free Rapier body, fixed 120 Hz, CCD; synthetic entries separated from input-only launch trials', geometry: { length: routeLength, samples: frames.length, addedColliders: 4 }, grid: { count: cases.length, counts: counts(cases), cases }, spinAndPartialStep: { count: stress.length, counts: counts(stress), cases: stress }, launches };
mkdirSync('artifacts/circuit', { recursive: true }); writeFileSync('artifacts/circuit/physics.json', JSON.stringify(report, null, 2));
writeFileSync('artifacts/circuit/layout.json', JSON.stringify({ samples: frames.map(f => ({ ...f.c, s: f.s })), wireStart: bridgeStart, wireEnd: bridgeEnd, rails, bumpers, flippers }));
console.log(JSON.stringify({ ...report, grid: { count: cases.length, counts: counts(cases) }, spinAndPartialStep: { count: stress.length, counts: counts(stress) } }, null, 2));
