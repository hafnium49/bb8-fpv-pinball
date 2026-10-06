import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { PinballSimulation } from '../../src/physics/simulation';
import { addRoute } from './route';
import { STEP } from '../../src/physics/table';

await RAPIER.init();
const a = Math.atan2(3, 9.81), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a), inverse = q.clone().invert();
function gravityWorld(rotated: boolean) {
  const world = new RAPIER.World(rotated ? { x: 0, y: -Math.hypot(9.81, 3), z: 0 } : { x: 0, y: -9.81, z: 3 }); world.timestep = STEP;
  const floor = new THREE.Vector3(0, -0.2, 0), p = new THREE.Vector3(1, 0.31, 3), v = new THREE.Vector3(-3, 0, -8);
  if (rotated) { floor.applyQuaternion(q); p.applyQuaternion(q); v.applyQuaternion(q); }
  const desc = RAPIER.ColliderDesc.cuboid(30, 0.2, 30).setTranslation(floor.x, floor.y, floor.z).setFriction(0.035);
  if (rotated) desc.setRotation(q);
  world.createCollider(desc);
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setCcdEnabled(true).setLinearDamping(0.04).setAngularDamping(0.18));
  world.createCollider(RAPIER.ColliderDesc.ball(0.28).setFriction(0.07).setRestitution(0.65), ball); ball.setLinvel(v, true);
  return { world, ball };
}
const local = gravityWorld(false), vertical = gravityWorld(true);
let maxGravityError = 0;
for (let i = 0; i < 600; i++) {
  local.world.step(); vertical.world.step();
  const p = vertical.ball.translation(), back = new THREE.Vector3(p.x, p.y, p.z).applyQuaternion(inverse), reference = local.ball.translation();
  maxGravityError = Math.max(maxGravityError, back.distanceTo(new THREE.Vector3(reference.x, reference.y, reference.z)));
}
local.world.free(); vertical.world.free(); assert.ok(maxGravityError < 0.001);

const underpasses = [];
for (const start of [{ x: 1.2, z: -5.5, vx: 6, vz: 0 }, { x: -3.9, z: -3.2, vx: 0, vz: -6 }, { x: 0, z: -4.8, vx: 4, vz: -5 }]) {
  const base = new PinballSimulation(), elevated = new PinballSimulation(); addRoute(elevated.world, 'baked-wire');
  for (const sim of [base, elevated]) { sim.start(); sim.launch(0.5); sim.ball.setTranslation({ x: start.x, y: 0.31, z: start.z }, true); sim.ball.setLinvel({ x: start.vx, y: 0, z: start.vz }, true); sim.ball.setAngvel({ x: 0, y: 0, z: 0 }, true); }
  let maxError = 0;
  for (let n = 0; n < 48; n++) {
    base.step(); elevated.step(); const p = base.position, r = elevated.position;
    maxError = Math.max(maxError, Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z));
  }
  assert.ok(maxError < 0.001); assert.equal(elevated.score, base.score);
  underpasses.push({ start, duration: 0.4, maxPositionDifference: maxError, score: elevated.score }); base.dispose(); elevated.dispose();
}
const sim = new PinballSimulation(); addRoute(sim.world, 'baked-wire'); sim.start(); sim.launch(0.8);
let leftLane = false;
for (let n = 0; n < 360; n++) { sim.step(); if (sim.position.x < 4 && sim.position.z < -5) leftLane = true; }
assert.ok(leftLane); sim.dispose();
const report = { result: 'pass', gravity: { duration: 5, maxPositionDifference: maxGravityError, conclusion: 'board-local gravity equals a 17.004-degree rotated table with vertical gravity within floating-point tolerance' }, underpasses, launchLaneExitWithin3Seconds: leftLane };
writeFileSync('artifacts/elevated-circuit/invariants.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
