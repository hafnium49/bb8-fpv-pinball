import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PinballSimulation } from '../src/physics/simulation';
import { routeLength } from '../src/physics/route-geometry';
import { BALL_RADIUS, STEP } from '../src/physics/table';
import { flipperWarning, SoundDirector, type SoundState } from '../src/ui/sound-director';
import { voiceBank } from '../src/ui/voice-bank';

function state(patch: Partial<SoundState> = {}): SoundState {
  return { phase: 'playing', paused: false, time: 10,
    position: { x: -1.7, y: BALL_RADIUS + 0.025, z: 2 }, velocity: { x: 0, y: 0, z: 4 },
    controls: { left: false, right: false, launch: false }, charge: 0,
    route: { active: false, phase: 'free', projection: { s: 0, vertical: 0 } }, ...patch };
}

test('flipper advice predicts the landing side with useful lead time', () => {
  const s = state(), left = flipperWarning(s)!;
  assert.equal(left.voice, 'left'); assert.ok(left.eta > 0.7 && left.eta < 1.15);
  assert.equal(flipperWarning(state({ position: { ...s.position, x: 1.7 } }))!.voice, 'right');
  assert.equal(flipperWarning(state({ position: { ...s.position, x: 0 } }))!.voice, 'both');
  assert.equal(flipperWarning(state({ velocity: { x: 4, y: 0, z: 4 } }))!.voice, 'right', 'Use the future side, not the current side');
  assert.equal(flipperWarning(state({ position: { ...s.position, x: -4.5 } }))!.voice, 'danger');
});

test('launcher, high bridge, upstream balls and held flippers do not give misleading advice', () => {
  const s = state();
  const ignored = [
    state({ phase: 'ready' }), state({ paused: true }), state({ velocity: { x: 0, y: 0, z: -8 } }),
    state({ position: { ...s.position, x: 5.18 } }), state({ position: { ...s.position, z: 7.3 } }),
    state({ position: { ...s.position, y: 2.5 } }),
    state({ route: { active: true, phase: 'bridge', projection: { s: routeLength - 3, vertical: 0 } } }),
    state({ controls: { left: true, right: false, launch: false } }),
  ];
  for (const sample of ignored) assert.equal(flipperWarning(sample), undefined);
});

test('fast clear returns warn earlier, while an intervening bumper suppresses the forecast', () => {
  const s = state({ position: { x: 0, y: 0.3, z: -4.5 }, velocity: { x: 0, y: 0, z: 12 } });
  const warning = flipperWarning(s)!;
  assert.equal(warning.voice, 'both'); assert.ok(warning.eta > 0.7);
  assert.equal(flipperWarning({ ...s, position: { x: -2.35, y: 0.3, z: -5.5 } }), undefined);
});

test('the descending tunnel warns before the right return lands', () => {
  const s = state({ position: { x: 3.05, y: 1.8, z: 2.7 }, velocity: { x: -1, y: -3, z: 9 },
    route: { active: true, phase: 'tunnel', projection: { s: routeLength - 7, vertical: 0.01 } } });
  const warning = flipperWarning(s)!;
  assert.equal(warning.voice, 'right'); assert.ok(warning.eta > 0.6);
  assert.equal(flipperWarning({ ...s, velocity: { x: 1, y: 3, z: -9 } }), undefined, 'Rollback must not call the return');
});

test('a warning fires once per approach, rearms on a save/resume, and takes precedence over hits', () => {
  const director = new SoundDirector(), s = state();
  let cues = director.update(s, [{ type: 'bumper', index: 0, points: 100 }]).cues;
  assert.equal(cues.at(-1)?.kind, 'warning'); assert.equal(cues.at(-1)?.priority, 100);
  assert.equal(director.update({ ...s, time: 10.1 }, []).cues.filter(c => c.kind === 'warning').length, 0);
  director.update({ ...s, time: 10.2, velocity: { x: 0, y: 0, z: -4 } }, []);
  assert.equal(director.update({ ...s, time: 11 }, []).cues.at(-1)?.voice, 'left');
  director.resume(); assert.equal(director.update(s, []).cues.at(-1)?.kind, 'warning');
  assert.deepEqual(director.update({ ...s, paused: true }, [{ type: 'drain' }]).cues, []);
});

test('frequent collisions retain mechanical feedback while budgeting droid reactions', () => {
  const director = new SoundDirector(), s = state({ position: { x: 0, y: 0.3, z: -5 } });
  const hit = { type: 'wall' as const, speed: 14 };
  const first = director.update(s, [hit]); assert.ok(first.cues.some(c => c.voice === 'whoa'));
  const next = director.update({ ...s, time: 10.04 }, [hit, hit]);
  assert.equal(next.cues.filter(c => c.kind === 'wall').length, 2);
  assert.equal(next.cues.filter(c => c.kind === 'chatter').length, 0);
  const later = director.update({ ...s, time: 10.55 }, [hit]);
  assert.ok(later.cues.some(c => c.kind === 'chatter' && c.voice === 'tap'));
});

test('rolling follows contact and route textures; drains and restart reset the sound state', () => {
  const director = new SoundDirector(), s = state({ position: { x: 0, y: 0.3, z: -5 } });
  assert.ok(director.update(s, []).rolling > 0);
  assert.equal(director.update({ ...s, position: { ...s.position, y: 1.4 } }, []).rolling, 0);
  const bridge = director.update({ ...s, route: { active: true, phase: 'bridge', projection: { s: 12, vertical: 0 } } }, []);
  assert.equal(bridge.surface, 'bridge'); assert.equal(bridge.cues[0].voice, 'bridge');
  const over = director.update({ ...s, phase: 'over' }, [{ type: 'drain' }, { type: 'over' }]);
  assert.equal(over.music, false); assert.equal(over.rolling, 0); assert.equal(over.cues.at(-1)?.voice, 'over');
  director.reset(); assert.equal(director.update({ ...s, phase: 'ready', time: 0 }, []).cues[0].voice, 'ready');
});

test('real Rapier rail contacts emit impact speed without awarding points or scraping noise', async () => {
  const s = await PinballSimulation.create();
  try {
    s.start(); s.launch(0.5); s.events.length = 0;
    s.ball.setTranslation({ x: -4.8, y: 0.31, z: -2 }, true); s.ball.setLinvel({ x: -9, y: 0, z: 0 }, true);
    for (let i = 0; i < 15; i++) s.step();
    const impacts = s.events.filter(e => e.type === 'wall');
    assert.equal(impacts.length, 1); assert.ok(impacts[0].speed > 8); assert.equal(s.score, 0);
    s.start(); s.launch(); s.events.length = 0;
    s.ball.setTranslation({ x: -5.39, y: 0.31, z: 1 }, true); s.ball.setLinvel({ x: -0.3, y: 0, z: 5 }, true);
    for (let i = 0; i < 15; i++) s.step();
    assert.equal(s.events.filter(e => e.type === 'wall').length, 0);
  } finally { s.dispose(); }
});

test('a real slow ground return receives a warning well before flipper contact', async () => {
  const s = await PinballSimulation.create(), director = new SoundDirector();
  try {
    s.start(); s.launch(0.5); s.events.length = 0;
    s.ball.setTranslation({ x: -1.7, y: 0.305, z: 2 }, true); s.ball.setLinvel({ x: 0, y: 0, z: 4 }, true);
    let warnedAt: number | undefined, touchedAt: number | undefined;
    for (let i = 0; i < 240; i++) {
      s.step();
      if (director.update(s, s.events).cues.some(c => c.kind === 'warning')) warnedAt ??= s.time;
      if (s.events.some(e => e.type === 'flipper-hit')) { touchedAt = s.time; break; }
      s.events.length = 0;
    }
    assert.ok(warnedAt !== undefined && touchedAt !== undefined);
    assert.ok(touchedAt - warnedAt > 0.6, `Only ${touchedAt - warnedAt}s of warning`);
    assert.ok(touchedAt - warnedAt > voiceBank.left.duration, 'The warning motif must finish before contact');
  } finally { s.dispose(); }
});

test('original nonverbal droid clips are audible, bounded and leave reaction time', () => {
  const wav = readFileSync(new URL('../src/assets/droid-beeps.wav', import.meta.url));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  const rate = wav.readUInt32LE(24), duration = (wav.length - 44) / 2 / rate;
  for (const [key, clip] of Object.entries(voiceBank)) {
    assert.ok(clip.offset >= 0 && clip.duration > 0.15 && clip.offset + clip.duration <= duration + 0.001);
    let energy = 0, peak = 0;
    for (let i = Math.round(clip.offset * rate); i < Math.floor((clip.offset + clip.duration) * rate); i++) {
      const sample = wav.readInt16LE(44 + i * 2) / 32768; energy += sample * sample; peak = Math.max(peak, Math.abs(sample));
    }
    assert.ok(energy / (clip.duration * rate) > 0.0001, `${key} is silent`);
    assert.ok(peak < 0.99, `${key} clips`);
    if (['left', 'right', 'both', 'danger'].includes(key)) assert.ok(clip.duration < 0.5);
  }
});

test('mono warning audio has different rhythms and low-left/high-right pitch', () => {
  const wav = readFileSync(new URL('../src/assets/droid-beeps.wav', import.meta.url)), rate = wav.readUInt32LE(24);
  const patterns = { left: [0, .18], right: [0, .13, .26], both: [0, .11, .22, .33], danger: [0, .16, .32] };
  const clips = Object.entries(patterns).map(([key, expected]) => {
    const clip = voiceBank[key as keyof typeof voiceBank];
    const start = Math.round(clip.offset * rate), end = Math.round((clip.offset + clip.duration) * rate);
    // Measure packet onsets from the shipped PCM, not its generation recipe.
    // Short RMS windows ignore carrier zero crossings and preserve the pauses.
    const onsets: number[] = [], window = Math.round(.005 * rate);
    let voiced = false;
    for (let i = start; i < end; i += window) {
      let energy = 0;
      const count = Math.min(window, end - i);
      for (let j = 0; j < count; j++) energy += (wav.readInt16LE(44 + (i + j) * 2) / 32768) ** 2;
      const active = Math.sqrt(energy / count) > .025;
      if (active && !voiced) onsets.push((i - start) / rate);
      voiced = active;
    }
    assert.equal(onsets.length, expected.length, `${key}: wrong number of beep packets`);
    for (const [i, time] of expected.entries()) {
      assert.ok(Math.abs(onsets[i] - time) < .012, `${key}: packet ${i} starts at ${onsets[i]}s, expected ${time}s`);
    }
    let crossings = 0;
    // Compare only the first voiced packet, before either warning's pause.
    for (let i = start + 1; i < start + Math.round(.08 * rate); i++) {
      if (wav.readInt16LE(44 + (i - 1) * 2) <= 0 && wav.readInt16LE(44 + i * 2) > 0) crossings++;
    }
    return { onsets, crossings };
  });
  assert.equal(new Set(clips.map(c => JSON.stringify(c.onsets))).size, 4, 'Warning rhythms must remain distinct without stereo');
  assert.ok(clips[1].crossings > clips[0].crossings * 1.3, 'Right warning should sound higher than left');
});
