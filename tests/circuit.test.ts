import assert from 'node:assert/strict';
import { test } from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { PinballSimulation } from '../src/physics/simulation';
import { CIRCUIT_BONUS, STEP } from '../src/physics/table';
import { frames, localPoint, type Vec3 } from '../src/physics/route-geometry';
import { crossesGate, gates, RouteState } from '../src/physics/route-state';
import { CameraClearance, RouteCamera } from '../src/render/route-camera';
import { entryTrial, groundTrial, launchTrial } from '../scripts/circuit-harness';

const offset = (p: Vec3, direction: Vec3, amount: number) => ({ x: p.x + direction.x * amount, y: p.y + direction.y * amount, z: p.z + direction.z * amount });

test('gates require forward crossings at the correct height and lateral position', () => {
  for (const gate of gates) {
    const f = gate.frame, a = offset(f.c, f.tangent, -0.2), b = offset(f.c, f.tangent, 0.2);
    assert.ok(crossesGate(a, b, gate)); assert.equal(crossesGate(b, a, gate), false);
    assert.equal(crossesGate(offset(a, f.up, -2), offset(b, f.up, -2), gate), false);
    assert.equal(crossesGate(offset(a, f.right, 1.2), offset(b, f.right, 1.2), gate), false);
    assert.equal(crossesGate(a, a, gate), false);
  }
});

test('ordered traversal scores once; reversal, misses, and reset cannot retain progress', () => {
  const state = new RouteState(); let awards = 0;
  for (let i = 1; i < frames.length; i++) if (state.update(frames[i - 1].c, frames[i].c, STEP)) awards++;
  assert.equal(awards, 1); assert.equal(state.completions, 1); assert.equal(state.active, false);
  for (let i = frames.length - 1; i > 0; i--) assert.equal(state.update(frames[i].c, frames[i - 1].c, STEP), false);
  assert.equal(state.completions, 1);
  const f = gates[0].frame, a = offset(f.c, f.tangent, -0.2), b = offset(f.c, f.tangent, 0.2);
  state.reset(); state.update(a, b, STEP); assert.ok(state.active);
  state.update(b, a, STEP); assert.equal(state.active, false);
  state.reset(); state.update(a, b, STEP); state.update(b, offset(b, f.up, 2), STEP); assert.equal(state.active, false);
  state.reset(true); assert.equal(state.completions, 0); assert.equal(state.completionFlash, 0);
  for (let i = 1; i < frames.length; i++) state.update(localPoint(frames[i - 1], 0, -2), localPoint(frames[i], 0, -2), STEP);
  assert.equal(state.completions, 0); assert.equal(state.active, false);
});

test('a high-speed physical circuit awards once and meets a moving right flipper', async () => {
  const sim = await PinballSimulation.create({ circuit: true });
  try {
    const report = entryTrial(sim, { speed: 28, offset: -0.3, veer: -0.1 });
    assert.equal(report.outcome, 'returned'); assert.equal(report.awards, 1); assert.equal(report.score, CIRCUIT_BONUS);
    assert.equal(sim.routeColliderHandles.size, 4);
    const completions = sim.route.completions; sim.paused = true; const p = sim.position;
    sim.step(); sim.update(0.1); assert.deepEqual(sim.position, p); assert.equal(sim.route.completions, completions);
    sim.start(); assert.equal(sim.route.completions, 0); assert.equal(sim.score, 0); assert.equal(sim.route.active, false);
  } finally { sim.dispose(); }
});

test('a weak climb rolls back without an award; a drain clears route progress', async () => {
  const sim = await PinballSimulation.create({ circuit: true });
  try {
    const report = entryTrial(sim, { speed: 8, offset: 0, veer: 0 });
    assert.equal(report.outcome, 'rollback'); assert.equal(report.awards, 0); assert.equal(sim.balls, 3); assert.equal(sim.route.active, false);
    const f = gates[0].frame; sim.route.update(offset(f.c, f.tangent, -0.2), offset(f.c, f.tangent, 0.2), STEP);
    sim.ball.setTranslation({ x: 0, y: 0.4, z: 11.6 }, true); sim.step();
    assert.equal(sim.route.active, false); assert.equal(sim.route.nextGate, 0); assert.equal(sim.balls, 2);
  } finally { sim.dispose(); }
});

test('underpasses preserve the ground game and cannot award elevated points', async () => {
  await RAPIER.init();
  for (const start of [{ x: 1.2, z: -5.5, vx: 6, vz: 0 }, { x: -3.9, z: -3.2, vx: 0, vz: -6 }, { x: 0, z: -4.8, vx: 4, vz: -5 }]) {
    const base = new PinballSimulation(), circuit = new PinballSimulation({ circuit: true });
    try {
      for (const sim of [base, circuit]) { sim.start(); sim.launch(0.5); sim.ball.setTranslation({ x: start.x, y: 0.31, z: start.z }, true); sim.ball.setLinvel({ x: start.vx, y: 0, z: start.vz }, true); sim.ball.setAngvel({ x: 0, y: 0, z: 0 }, true); }
      for (let n = 0; n < 48; n++) { base.step(); circuit.step(); const a = base.position, b = circuit.position; assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.001); }
      assert.equal(circuit.score, base.score); assert.equal(circuit.route.completions, 0); assert.equal(circuit.route.active, false);
      assert.equal(base.routeColliderHandles.size, 0);
    } finally { base.dispose(); circuit.dispose(); }
  }
});

test('input-only launch traverses the circuit and returns off the right flipper at two timings', async () => {
  await RAPIER.init();
  for (const timing of [6.3, 6.6]) {
    const sim = new PinballSimulation({ circuit: true });
    try {
      const report = launchTrial(sim, 0.7, timing);
      assert.ok(report.laneExit && report.leftContact && report.rightReturn, JSON.stringify(report)); assert.equal(report.awards, 1); assert.ok(report.velocity.z < -3);
    } finally { sim.dispose(); }
  }
});

test('ground approaches cannot wedge beneath either low ramp heel', async () => {
  const sim = await PinballSimulation.create({ circuit: true });
  try {
    for (const input of [
      { start: { x: -2.8, y: 0.31, z: -2.4 }, velocity: { x: 0, y: 0, z: 0.5 }, spin: { x: -30, y: 0, z: 0 } },
      // Before the skirt fix this valid approach slept indefinitely beneath
      // the return deck at (3.24, 0.274, 4.778), without any flipper contact.
      { start: { x: 2.8, y: 0.31, z: 1.8 }, velocity: { x: 2, y: 0, z: 0.5 }, spin: { x: 0, y: 0, z: 0 } },
    ]) {
      const report = groundTrial(sim, input);
      assert.equal(report.outcome, 'cleared', JSON.stringify(report));
      assert.equal(report.awards, 0); assert.equal(report.completions, 0);
    }
  } finally { sim.dispose(); }
});

test('the FPV camera bounds pitch/rates and sweeps its envelope against real colliders', async () => {
  await RAPIER.init();
  for (const reduced of [false, true]) for (const aspect of [844 / 390, 6]) {
    const sim = new PinballSimulation({ circuit: true }), camera = new RouteCamera();
    const fpv = new CameraClearance(), out = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0, w: 1 };
    let maxPitch = 0, samples = 0;
    try {
      const report = entryTrial(sim, { speed: 20, offset: 0, veer: 0 }, s => {
        const pitch = camera.pitch, heading = camera.heading; camera.update(s, STEP, reduced);
        maxPitch = Math.max(maxPitch, Math.abs(camera.pitch)); samples++;
        assert.ok(Math.abs(camera.pitch - pitch) <= (reduced ? 15 : 30) * Math.PI / 180 * STEP + 1e-9);
        assert.ok(Math.abs(camera.heading - heading) <= 3.5 * STEP + 1e-9);
        const p = s.position;
        for (const [clearance, desired, fov] of [
          [fpv, { x: p.x, y: p.y + 0.30, z: p.z }, 82],
        ] as const) {
          clearance.place(s, desired, out, aspect, fov, STEP);
          const tangent = Math.tan(fov * Math.PI / 360), radius = Math.max(0.12, Math.min(0.25, 0.06 * Math.sqrt(1 + tangent * tangent * (1 + aspect * aspect))));
          assert.equal(s.world.intersectionWithShape(out, q, new RAPIER.Ball(radius - 0.003), RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, s.ball), null, `camera intersects cabinet at ${JSON.stringify(out)}`);
        }
      });
      assert.equal(report.outcome, 'returned'); assert.ok(samples > 100); assert.ok(maxPitch <= (reduced ? 8 : 18) * Math.PI / 180 + 1e-9);
      sim.paused = true; const pitch = camera.pitch, heading = camera.heading; camera.update(sim, 0.1, reduced); assert.equal(camera.pitch, pitch); assert.equal(camera.heading, heading);
      camera.reset(); assert.equal(camera.pitch, 0); assert.equal(camera.heading, 0);
    } finally { sim.dispose(); }
  }
});

test('the complete flipper sweep stays clear of the return deck and hold-down cover', async () => {
  const sim = await PinballSimulation.create({ circuit: true });
  try {
    sim.start();
    for (const pressed of [true, false]) for (let n = 0; n < 36; n++) {
      sim.controls.left = sim.controls.right = pressed; sim.step();
      for (const body of sim.flipperBodies) {
        const collider = body.collider(0); let obstructed = false;
        sim.world.intersectionsWithShape(collider.translation(), collider.rotation(), collider.shape, () => { obstructed = true; return false; },
          undefined, undefined, collider, body, c => sim.routeColliderHandles.has(c.handle));
        assert.equal(obstructed, false, 'route overlaps the flipper sweep');
      }
    }
  } finally { sim.dispose(); }
});
