import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { PinballSimulation } from '../src/physics/simulation';
import { BALL_RADIUS, STEP, bumpers } from '../src/physics/table';

const simulations: PinballSimulation[] = [];
async function simulation() { const s = await PinballSimulation.create(); simulations.push(s); return s; }
function tick(s: PinballSimulation, seconds: number) { for (let i = 0; i < Math.round(seconds / STEP); i++) s.step(); }
function activeBall(s: PinballSimulation, x: number, z: number, vx = 0, vz = 0) {
  s.start(); s.launch(0.8); s.ball.setTranslation({ x, y: BALL_RADIUS + 0.025, z }, true);
  s.ball.setLinvel({ x: vx, y: 0, z: vz }, true); s.ball.setAngvel({ x: 0, y: 0, z: 0 }, true); s.events.length = 0;
}
afterEach(() => { for (const s of simulations.splice(0)) s.dispose(); });

test('an unlaunched ball stays in the lane; holding and releasing launches it', async () => {
  const s = await simulation(); s.start(); const initial = s.position;
  tick(s, 1.0); assert.deepEqual(s.position, initial); assert.equal(s.phase, 'ready');
  s.controls.launch = true; tick(s, 0.5); assert.ok(s.charge > 0.45);
  s.controls.launch = false; s.step(); assert.equal(s.phase, 'playing'); assert.ok(s.velocity.z < -15);
});

test('the launch guide sends the ball into the main table', async () => {
  const s = await simulation(); s.start(); s.launch(0.8);
  let entered = false;
  for (let i = 0; i < 360; i++) { s.step(); if (s.position.x < 4.0 && s.position.z < -5) entered = true; }
  assert.ok(entered, `ball stayed in launch lane: ${JSON.stringify(s.position)}`);
});

test('continuous collision detection prevents a fast ball tunnelling through a side rail', async () => {
  const s = await simulation(); activeBall(s, -4.7, 0, -160, 0); s.step();
  assert.ok(s.position.x > -5.65, `ball escaped through rail: ${s.position.x}`);
  assert.ok(s.velocity.x > 0, 'ball did not rebound into the table');
});

test('bumper contact awards points and kicks the ball away', async () => {
  const s = await simulation(), b = bumpers[0];
  activeBall(s, b.x - 1.8, b.z, 9, 0); tick(s, 0.15);
  assert.equal(s.score, 100); assert.ok(s.velocity.x < 0, 'bumper failed to reverse the ball');
  assert.equal(s.events.filter(e => e.type === 'bumper').length, 1);
});

test('a moving left flipper returns an approaching ball up the table', async () => {
  const s = await simulation(); activeBall(s, -1.7, 7.8, 0, 2);
  s.controls.left = true;
  let returned = false;
  for (let i = 0; i < 36; i++) { s.step(); if (s.velocity.z < -3) returned = true; }
  assert.ok(returned, `flipper failed to return ball: ${JSON.stringify(s.velocity)}`);
});

test('three drains end a game and restarting resets its lives and score', async () => {
  const s = await simulation(); s.start(); s.score = 600;
  for (let ball = 0; ball < 3; ball++) {
    s.launch(0.5); s.ball.setTranslation({ x: 0, y: 0.4, z: 11.6 }, true); s.step();
    assert.equal(s.balls, 2 - ball); if (ball < 2) { tick(s, 1); assert.equal(s.phase, 'ready'); }
  }
  assert.equal(s.phase, 'over'); assert.equal(s.score, 600);
  s.start(); assert.equal(s.phase, 'ready'); assert.equal(s.balls, 3); assert.equal(s.score, 0);
});

test('paused simulation does not advance physics or consume launch input', async () => {
  const s = await simulation(); s.start(); s.launch(0.5); tick(s, 0.2);
  const p = s.position, time = s.time; s.paused = true; s.update(0.1); s.step();
  assert.deepEqual(s.position, p); assert.equal(s.time, time);
});

test('fixed-step physics is independent of render frame frequency', async () => {
  const a = await simulation(), b = await simulation(); a.start(); b.start(); a.launch(0.5); b.launch(0.5);
  for (let i = 0; i < 60; i++) a.update(1 / 60);
  for (let i = 0; i < 120; i++) b.update(1 / 120);
  assert.ok(Math.abs(a.position.x - b.position.x) < 1e-5); assert.ok(Math.abs(a.position.z - b.position.z) < 1e-5);
});
