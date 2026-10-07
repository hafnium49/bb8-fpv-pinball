import RAPIER from '@dimforge/rapier3d-compat';
import type { PinballSimulation, Point } from '../src/physics/simulation';
import { BALL_RADIUS, STEP } from '../src/physics/table';
import { ascentApron, descentApron, frames, localPoint, type MeshData, type RouteFrame } from '../src/physics/route-geometry';

export interface GuideCase {
  side: -1 | 1;
  start: Point;
  velocity: Point;
  spin?: Point;
  controls?: 'released' | 'hold-release' | 'pulse';
}

// A triangle surface query cannot detect a seed entirely inside the closed
// low-ramp heel. Exclude its ground footprint as well as touching geometry.
// Real arrivals from outside the heels are checked by the circuit harness.
function insideHeel(p: Point, mesh: MeshData, mouth: RouteFrame) {
  let inside = false;
  const v = mesh.vertices;
  const cross = (ax: number, az: number, bx: number, bz: number) => {
    if ((az > p.z) !== (bz > p.z) && p.x < ax + (p.z - az) * (bx - ax) / (bz - az)) inside = !inside;
  };
  for (let i = 0; i < v.length; i += 12) cross(v[i], v[i + 2], v[i + 6], v[i + 8]);
  // The mouths are flush with the board and have no vertical mesh face.
  const a = localPoint(mouth, -mouth.width, -BALL_RADIUS), b = localPoint(mouth, mouth.width, -BALL_RADIUS);
  cross(a.x, a.z, b.x, b.z);
  return inside;
}

/** Trace reachable ground arrivals until they actually leave the guide region. */
export function guideTrial(sim: PinballSimulation, input: GuideCase) {
  sim.start();
  // Previous trials may finish with a raised bat. Settle both before checking
  // the initial sphere, rather than querying yesterday's kinematic pose.
  for (let i = 0; i < 30; i++) sim.step();
  sim.launch(.5); sim.step();
  const began = sim.time;
  const overlap = sim.world.intersectionWithShape(input.start, { x: 0, y: 0, z: 0, w: 1 },
    new RAPIER.Ball(BALL_RADIUS), undefined, undefined, undefined, sim.ball);
  const enclosed = sim.circuitEnabled && (insideHeel(input.start, ascentApron, frames[0]) || insideHeel(input.start, descentApron, frames.at(-1)!));
  if (overlap || enclosed) return { input, valid: false, excluded: overlap ? 'collider overlap' : 'closed ramp heel', outcome: 'excluded' as const,
    duration: 0, maxQuiet: 0, position: sim.position, velocity: sim.velocity, completions: 0, score: 0 };
  sim.ball.setTranslation(input.start, true); sim.ball.setLinvel(input.velocity, true);
  sim.ball.setAngvel(input.spin ?? { x: 0, y: 0, z: 0 }, true); sim.events.length = 0;
  let quiet = 0, maxQuiet = 0, outcome: 'cleared' | 'stalled' | 'timeout' = 'timeout';
  for (let n = 0; n < 2400; n++) {
    const held = input.controls === 'hold-release' ? n < 240 : input.controls === 'pulse' && (n >= 30 && n < 54 || n >= 120 && n < 144);
    sim.controls.left = input.side < 0 && !!held; sim.controls.right = input.side > 0 && !!held;
    sim.step(); const p = sim.position, v = sim.velocity;
    // A raised-flipper cradle is deliberate. A trap after releasing is not.
    quiet = !held && Math.hypot(v.x, v.y, v.z) < .12 ? quiet + STEP : 0;
    maxQuiet = Math.max(maxQuiet, quiet);
    if (sim.phase !== 'playing' || p.z > 10.25 || Math.abs(p.x) < 2.25 || p.z < input.start.z - 2) { outcome = 'cleared'; break; }
    if (quiet >= 2) { outcome = 'stalled'; break; }
    sim.events.length = 0;
  }
  return { input, valid: true, excluded: undefined, outcome, duration: sim.time - began, maxQuiet,
    position: sim.position, velocity: sim.velocity, completions: sim.route.completions, score: sim.score };
}

export function guideInputs(): GuideCase[] {
  const inputs: GuideCase[] = [];
  for (const side of [-1, 1] as const) for (const x of [2.7, 3, 3.2, 3.4, 3.6, 3.9, 4, 4.13, 4.6, 5, 5.35])
    for (const z of [3.5, 4, 4.8, 5.6, 6.1, 6.5, 6.8, 7.6, 8.4, 9.2]) for (const vx of [-1.5, 0, 1.5]) for (const vz of [.5, 3, 8]) {
      inputs.push({ side, start: { x: side * x, y: BALL_RADIUS + .025, z }, velocity: { x: side * vx, y: 0, z: vz } });
    }
  for (const side of [-1, 1] as const) for (const controls of ['released', 'hold-release', 'pulse'] as const)
    for (const x of [2.7, 3.9, 5.0]) for (const z of [6.5, 7.6]) for (const speed of [.5, 8, 24])
      for (const spin of [{ x: -30, y: 0, z: 0 }, { x: 30, y: 12, z: -18 }]) {
        inputs.push({ side, controls, start: { x: side * x, y: BALL_RADIUS + .025, z }, velocity: { x: side * .8, y: 0, z: speed }, spin });
      }
  return inputs;
}
