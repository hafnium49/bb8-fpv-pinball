import test from 'node:test';
import assert from 'node:assert/strict';
import { cabinetDisplay, type DisplaySnapshot } from '../src/ui/cabinet-display';
import { musicPattern } from '../src/ui/music-pattern';
import { musicGain, musicLevel } from '../src/ui/audio-presets';

const state: DisplaySnapshot = { phase: 'ready', paused: false, score: 0, balls: 3, charge: 0,
  circuit: true, coarse: false, route: { active: false, phase: 'free' } };
test('dialog state takes precedence over charge, route and incidental pause', () => {
  assert.equal(cabinetDisplay({ ...state, paused: true, charge: 0.7 }).status, 'PAUSED');
  assert.equal(cabinetDisplay({ ...state, phase: 'over', paused: true }).status, 'GAME OVER');
  assert.equal(cabinetDisplay({ ...state, phase: 'playing', route: { active: true, phase: 'tunnel' } }).status, 'CIRCUIT / TUNNEL');
});
test('display preserves large scores and resets score/lives without stale route state', () => {
  assert.equal(cabinetDisplay({ ...state, score: 123456789, balls: 1 }).score, '123456789');
  assert.equal(cabinetDisplay({ ...state, balls: 1 }).ballLabel, '1 ball remaining');
  const reset = cabinetDisplay(state);
  assert.equal(reset.score, '00000'); assert.equal(reset.balls, '● ● ●');
  assert.equal(cabinetDisplay({ ...state, phase: 'intro' }).visible, false);
});
test('music volume remains bounded, silent at zero and subordinate to urgent voice', () => {
  assert.equal(musicLevel(NaN), 0.6); assert.equal(musicLevel(-1), 0); assert.equal(musicLevel(5), 1);
  assert.equal(musicGain(0, 100), 0);
  assert.ok(musicGain(0.6, 100) < musicGain(0.6, 40));
  assert.ok(musicGain(0.6, 40) < musicGain(0.6));
  assert.ok(Math.abs(musicGain(0.6) - 0.42) < 1e-10);
});
test('16-bar arrangements are deterministic and bounded across lifecycle modes', () => {
  for (const mode of ['ready', 'playing', 'draining', 'off'] as const) for (let step = 0; step < 256; step++) {
    const notes = musicPattern(step, mode);
    assert.deepEqual(notes, musicPattern(step + 128, mode));
    assert.ok(notes.length <= 6);
    assert.ok(notes.every(n => n.duration > 0 && n.duration <= 0.72 && n.gain <= 0.12 && Number.isFinite(n.frequency)));
    if (mode === 'off') assert.equal(notes.length, 0);
  }
  assert.ok(musicPattern(1, 'playing').length > musicPattern(1, 'ready').length);
  assert.notDeepEqual(musicPattern(72, 'playing'), musicPattern(8, 'playing'));
});
