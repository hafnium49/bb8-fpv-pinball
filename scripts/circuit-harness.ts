import type { PinballSimulation } from '../src/physics/simulation';
import { frames, localPoint, type Vec3 } from '../src/physics/route-geometry';

export interface EntryCase { speed: number; offset: number; veer: number; spin?: Vec3; advance?: number; height?: number }

/** Synthetic entry sweeps isolate contact defects; these are not player success rates. */
export function entryTrial(sim: PinballSimulation, input: EntryCase, sample?: (sim: PinballSimulation) => void) {
  sim.start(); sim.launch(0.5);
  const f = frames[0], p = localPoint(f, input.offset, input.height ?? 0), lead = 0.4 - (input.advance ?? 0);
  sim.ball.setTranslation({ x: p.x - f.tangent.x * lead, y: p.y, z: p.z - f.tangent.z * lead }, true);
  sim.ball.setLinvel({ x: f.tangent.x * input.speed + f.right.x * input.speed * input.veer, y: 0, z: f.tangent.z * input.speed + f.right.z * input.speed * input.veer }, true);
  sim.ball.setAngvel(input.spin ?? { x: 0, y: 0, z: 0 }, true); sim.events.length = 0;
  let entered = false, completed = false, hit = false, awards = 0, maxY = 0, completionTime = 0;
  let outcome = 'timeout';
  for (let n = 0; n < 2400; n++) {
    sim.step(); const p = sim.position, v = sim.velocity;
    entered ||= sim.route.active; maxY = Math.max(maxY, p.y);
    if (!completed && sim.route.completions) { completed = true; completionTime = sim.time; }
    for (const e of sim.events) {
      if (e.type === 'circuit') awards++;
      if (completed && e.type === 'flipper-hit' && e.index === 1 && sim.controls.right) hit = true;
    }
    if (completed && p.z > 6.35 && p.x > 1.5 && p.x < 3.6 && v.z > 0 && p.y < 0.65) sim.controls.right = true;
    sample?.(sim);
    if (hit && v.z < -3 && p.y < 1) { outcome = 'returned'; break; }
    if (entered && !completed && p.z > 3.85 && p.x < -1 && v.z > 0) { outcome = 'rollback'; break; }
    if (sim.phase !== 'playing') { outcome = 'drain'; break; }
    sim.events.length = 0;
  }
  return { ...input, outcome, entered, completed, hit, awards, maxY, completionTime, duration: sim.time, position: sim.position, velocity: sim.velocity, score: sim.score };
}

/** Normal launch, then only two human-equivalent flipper inputs. No ball placement. */
export function launchTrial(sim: PinballSimulation, power: number, leftZ: number, rightZ = 6.4) {
  sim.start(); sim.controls.launch = true;
  for (let i = 0; i < Math.round(power * 120); i++) sim.step();
  sim.controls.launch = false; sim.step();
  let laneExit = false, leftContact = false, rightReturn = false, awards = 0;
  const changes: Array<[number, boolean, boolean]> = []; let left = false, right = false;
  for (let i = 0; i < 3000 && sim.phase === 'playing'; i++) {
    const p = sim.position, v = sim.velocity;
    sim.controls.left = p.x < 0 && p.z > leftZ && v.z > -0.5;
    sim.controls.right = p.x >= 0 && p.x < 4.5 && p.z > rightZ && v.z > -0.5;
    if (left !== sim.controls.left || right !== sim.controls.right) { left = sim.controls.left; right = sim.controls.right; changes.push([i, left, right]); }
    sim.step(); laneExit ||= sim.position.x < 4 && sim.position.z < -5;
    for (const e of sim.events) {
      if (e.type === 'circuit') awards++;
      if (e.type === 'flipper-hit' && e.index === 0 && sim.controls.left) leftContact = true;
      if (awards && e.type === 'flipper-hit' && e.index === 1 && sim.controls.right) rightReturn = true;
    }
    if (rightReturn && sim.velocity.z < -3 && sim.position.y < 1) break;
    sim.events.length = 0;
  }
  return { power, leftZ, rightZ, laneExit, leftContact, awards, rightReturn, phase: sim.phase, duration: sim.time, score: sim.score, velocity: sim.velocity, changes };
}
