import test from 'node:test';
import assert from 'node:assert/strict';
import { observeGameLayout, usesDesktopCabinet } from '../src/ui/game-layout';
import { PinballSimulation } from '../src/physics/simulation';
import { PlayInput } from '../src/ui/play-input';

test('large touch tablets never switch to desktop furniture, including with a mouse', () => {
  assert.equal(usesDesktopCabinet(true, true), false);
  assert.equal(usesDesktopCabinet(false, true), false);
  assert.equal(usesDesktopCabinet(true, false), true);
  assert.equal(usesDesktopCabinet(false, false), false);
});

test('layout events coalesce; only orientation events cancel input; teardown removes observers', () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const win = Object.assign(new EventTarget(), { screen: { orientation: new EventTarget() }, visualViewport: new EventTarget() });
  const doc = new EventTarget(), portrait = new EventTarget();
  let callback: (() => void) | undefined, observed = false, disconnected = false;
  let resized = 0, rotated = 0, nextFrame = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const globals = { window: win, document: doc, matchMedia: () => portrait,
    requestAnimationFrame: (fn: FrameRequestCallback) => { pending.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: (id: number) => pending.delete(id),
    ResizeObserver: class { constructor(fn: () => void) { callback = fn; } observe() { observed = true; } disconnect() { disconnected = true; } },
  };
  for (const [key, value] of Object.entries(globals)) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }); }
  const flush = () => { for (const [id, fn] of pending) { pending.delete(id); fn(0); } };
  try {
    const stop = observeGameLayout({} as HTMLElement, () => resized++, () => rotated++);
    assert.equal(observed, true);
    win.dispatchEvent(new Event('resize')); win.visualViewport.dispatchEvent(new Event('resize')); callback!(); doc.dispatchEvent(new Event('fullscreenchange'));
    assert.equal(pending.size, 1); assert.equal(rotated, 0); flush(); assert.equal(resized, 1);
    portrait.dispatchEvent(new Event('change')); assert.equal(rotated, 1); flush();
    win.screen.orientation.dispatchEvent(new Event('change')); assert.equal(rotated, 2); flush();
    win.dispatchEvent(new Event('orientationchange')); assert.equal(rotated, 3);
    stop(); assert.equal(disconnected, true); assert.equal(pending.size, 0);
    win.dispatchEvent(new Event('resize')); portrait.dispatchEvent(new Event('change')); win.screen.orientation.dispatchEvent(new Event('change'));
    assert.equal(pending.size, 0); assert.equal(rotated, 3);
  } finally { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } }
});

test('rotation cancellation discards held charge without firing or resetting the game', async () => {
  const sim = await PinballSimulation.create(); sim.start(); const input = new PlayInput(sim.controls);
  sim.score = 12345; sim.balls = 2;
  input.holdPointer(1, 'launch'); input.holdPointer(2, 'left'); input.holdKey('KeyD', 'right'); sim.update(.1);
  assert.ok(sim.charge > 0);
  input.clear(); sim.releaseControls(); sim.cancelLaunchCharge(); sim.update(.1);
  assert.equal(sim.phase, 'ready'); assert.equal(sim.score, 12345); assert.equal(sim.balls, 2);
  assert.equal(sim.charge, 0); assert.deepEqual(sim.controls, { left: false, right: false, launch: false });
  input.releasePointer(1); input.releaseKey('KeyD'); sim.update(.1); assert.equal(sim.phase, 'ready');
  input.holdPointer(3, 'launch'); sim.update(.1); input.releasePointer(3); sim.update(.1); assert.equal(sim.phase, 'playing');
  sim.dispose();
});


test('cancelled launch pointer cannot fire before orientation notification; other owners survive', async () => {
  const sim = await PinballSimulation.create(); sim.start(); const input = new PlayInput(sim.controls);
  const cancel = (id: number) => { if (input.releasePointer(id) === 'launch' && !sim.controls.launch) sim.cancelLaunchCharge(); };
  input.holdPointer(1, 'launch'); input.holdPointer(2, 'left'); sim.update(.1);
  cancel(1); sim.update(.1); assert.equal(sim.phase, 'ready'); assert.equal(sim.charge, 0); assert.equal(sim.controls.left, true);
  input.holdPointer(3, 'launch'); input.holdPointer(4, 'launch'); sim.update(.1);
  cancel(3); assert.equal(sim.controls.launch, true); assert.ok(sim.charge > 0);
  input.releasePointer(4); cancel(4); sim.update(.1); assert.equal(sim.phase, 'playing', 'lost capture after normal release must not cancel a shot');
  sim.dispose();
});
