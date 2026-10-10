import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RenderBudget, renderPixelRatio } from '../src/render/render-budget';

test('sustained slow frame delivery reduces pixels despite inexpensive JS submission', () => {
  const budget = new RenderBudget();
  for (let i = 0; i < 40; i++) budget.sample(80, 2, true);
  assert.equal(budget.scale, .5);
  for (let i = 0; i < 100; i++) budget.sample(80, 2, true);
  assert.equal(budget.scale, .5);
});

test('a compile stall, inactive window or invalid sample cannot degrade graphics', () => {
  const budget = new RenderBudget();
  for (let i = 0; i < 4; i++) budget.sample(16.67, 2, true);
  budget.sample(900, 800, true);
  for (let i = 0; i < 100; i++) {
    budget.sample(16.67, 2, true); budget.sample(300, 20, false);
    budget.sample(NaN, 0, true); budget.sample(Infinity, 20, true);
  }
  assert.equal(budget.scale, 1);
});

test('a PC delivering less than one frame a second still triggers resolution relief', () => {
  const budget = new RenderBudget();
  for (let i = 0; i < 21; i++) budget.sample(1500, 2, true);
  assert.equal(budget.scale, .5);
});

test('fast callback bursts cannot hide recurring GPU stalls from the rolling budget', () => {
  const budget = new RenderBudget();
  for (let burst = 0; burst < 8; burst++) {
    for (let i = 0; i < 9; i++) budget.sample(16.67, 2, true);
    budget.sample(600, 2, true);
  }
  assert.ok(budget.level > 0);
});

test('resolution recovers one step only after sustained headroom, with hysteresis and reset', () => {
  const budget = new RenderBudget();
  for (let i = 0; i < 50; i++) budget.sample(30, 5, true);
  const slowLevel = budget.level;
  assert.ok(slowLevel > 0);
  for (let i = 0; i < 100; i++) budget.sample(16.67, 2, true);
  assert.equal(budget.level, slowLevel);
  for (let i = 0; i < 400; i++) budget.sample(16.67, 2, true);
  assert.equal(budget.level, slowLevel - 1);
  budget.enabled = false;
  for (let i = 0; i < 100; i++) budget.sample(30, 20, true);
  assert.equal(budget.level, slowLevel - 1);
  budget.reset(); assert.equal(budget.scale, 1);
});

test('High retains native 1080p, caps 4K work and leaves CSS size independent of render scale', () => {
  assert.equal(renderPixelRatio(1920, 1080, 1, true), 1);
  const full = renderPixelRatio(3840, 2160, 2, true);
  assert.ok(Math.abs(3840 * 2160 * full * full - 3_000_000) < 1e-6);
  assert.equal(renderPixelRatio(3840, 2160, 2, true, .5), full / 2);
  assert.equal(renderPixelRatio(1440, 900, 2, false), 1);
});
