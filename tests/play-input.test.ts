import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayInput, pauseOnWindowBlur } from '../src/ui/play-input';

test('independent fingers and keys retain their own flipper/launch holds', () => {
  const controls = { left: false, right: false, launch: false }, input = new PlayInput(controls);
  input.holdPointer(1, 'launch'); input.holdKey('Space', 'left'); input.releaseKey('Space');
  assert.deepEqual(controls, { left: false, right: false, launch: true });
  input.holdPointer(2, 'left'); input.holdPointer(3, 'left'); input.holdKey('KeyA', 'left');
  input.releasePointer(2); input.releaseKey('KeyA');
  assert.equal(controls.left, true); input.releasePointer(3); assert.equal(controls.left, false);
  input.holdPointer(4, 'right'); input.releasePointer(1);
  assert.deepEqual(controls, { left: false, right: true, launch: false });
});

test('visible mobile blur releases keyboard holds while fingers remain independent', () => {
  const controls = { left: false, right: false, launch: false }, input = new PlayInput(controls);
  input.holdPointer(1, 'left'); input.holdKey('KeyD', 'right'); input.clearKeyboard();
  assert.deepEqual(controls, { left: true, right: false, launch: false });
  input.clear(); assert.deepEqual(controls, { left: false, right: false, launch: false });
  assert.equal(input.releaseKey('KeyD'), false);
});

test('mobile pausing follows visibility, while desktop window blur still pauses', () => {
  assert.equal(pauseOnWindowBlur(false, true, 'touch'), false);
  assert.equal(pauseOnWindowBlur(false, false, 'touch'), false);
  assert.equal(pauseOnWindowBlur(false, true, ''), false);
  assert.equal(pauseOnWindowBlur(true, true, 'touch'), true);
  assert.equal(pauseOnWindowBlur(false, true, 'mouse'), true);
  assert.equal(pauseOnWindowBlur(false, true, 'keyboard'), true);
  assert.equal(pauseOnWindowBlur(false, false, 'mouse'), true);
  assert.equal(pauseOnWindowBlur(false, false, ''), true);
});
