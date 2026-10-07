import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeadLossCamera, HEAD_LOSS_CHANCE, HEAD_LOSS_SECONDS } from '../src/render/head-loss';

const playing = (time = 0, x = 5.18) => ({ phase: 'playing' as const, paused: false, time, position: { x } });
const launch = [{ type: 'launch' as const }];

test('head loss draws once per launch, waits for lane exit, and occurs at the five-percent boundary', () => {
  let draws = 0;
  const camera = new HeadLossCamera(() => { draws++; return 0; });
  assert.equal(camera.update(playing(), launch).mode, 'fpv');
  for (let i = 1; i <= 120; i++) assert.equal(camera.update(playing(i / 120), []).mode, 'fpv');
  assert.equal(draws, 1);
  assert.equal(camera.update(playing(1.1, 4.3), []).started, true);
  assert.equal(camera.update(playing(1.2, 4.3), []).started, false);
  assert.equal(draws, 1);
  assert.equal(new HeadLossCamera(() => HEAD_LOSS_CHANCE).update(playing(0, 0), launch).mode, 'fpv');
  assert.equal(new HeadLossCamera(() => HEAD_LOSS_CHANCE - .000001).update(playing(0, 0), launch).mode, 'spin');
  const samples = new HeadLossCamera(() => ++draws / 20);
  draws = -1;
  let selected = 0;
  for (let i = 0; i < 20; i++) { samples.reset(); if (samples.update(playing(0, 0), launch).started) selected++; }
  assert.equal(selected, 1);
});

test('spin returns to FPV after three simulated seconds and cannot retrigger on the same ball', () => {
  const camera = new HeadLossCamera(() => 0);
  assert.equal(camera.update(playing(1, 0), launch).mode, 'spin');
  assert.equal(camera.update(playing(1 + HEAD_LOSS_SECONDS - .001, 0), []).mode, 'spin');
  assert.equal(camera.update(playing(1 + HEAD_LOSS_SECONDS, 0), []).ended, true);
  for (let i = 5; i < 30; i++) assert.equal(camera.update(playing(i, 0), [{ type: 'bumper', index: 0, points: 100 }]).mode, 'fpv');
});

test('pause, drain, ready, game-over and restart clear active and pending spins', () => {
  for (const state of [{ ...playing(2, 0), paused: true }, { ...playing(2, 0), phase: 'draining' as const },
    { ...playing(2, 0), phase: 'ready' as const }, { ...playing(2, 0), phase: 'over' as const }]) {
    for (const x of [5.18, 0]) {
      const camera = new HeadLossCamera(() => 0); camera.update(playing(1, x), launch);
      assert.equal(camera.update(state, []).mode, 'fpv');
      assert.equal(camera.update(playing(3, 0), []).mode, 'fpv');
    }
  }
  const camera = new HeadLossCamera(() => 0); camera.update(playing(10, 0), launch);
  assert.equal(camera.update(playing(0, 0), []).mode, 'fpv', 'Simulation reset must discard the old timer');
  camera.update(playing(1, 0), launch); camera.reset();
  assert.equal(camera.update(playing(2, 0), []).mode, 'fpv');
});

test('reduced motion disables the random roll and cancels an episode already in progress', () => {
  let draws = 0; const camera = new HeadLossCamera(() => { draws++; return 0; });
  assert.equal(camera.update(playing(0, 0), launch, true).mode, 'fpv'); assert.equal(draws, 0);
  camera.update(playing(1, 0), launch);
  assert.equal(camera.update(playing(2, 0), [], true).ended, true);
  assert.equal(camera.update(playing(3, 0), []).mode, 'fpv');
});
