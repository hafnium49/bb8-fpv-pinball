import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { GameAudio } from '../src/ui/audio';

function fixture(t: TestContext, rejectSession = false) {
  const calls: string[] = [], oscillators: any[] = [];
  const parameter = () => ({ value: 0, setValueAtTime(v: number) { this.value = v; }, exponentialRampToValueAtTime() {} });
  const output = { gain: parameter(), connect() {}, disconnect() {} };
  const context = { state: 'suspended', currentTime: 0, destination: {},
    createGain: () => output,
    createOscillator: () => { const node = { type: 'sine', frequency: parameter(), connect() {}, disconnect() {}, start() {}, stop() {}, onended: null }; oscillators.push(node); return node; },
    async resume() { calls.push('resume'); context.state = 'running'; },
    async close() { context.state = 'closed'; },
  };
  const session = { set type(value: string) { calls.push(value); if (rejectSession) throw new Error('Unsupported session type'); } };
  for (const [name, value] of Object.entries({ navigator: { audioSession: session }, AudioContext: function () { calls.push('create'); return context; } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else Reflect.deleteProperty(globalThis, name); });
  }
  return { calls, context, output, oscillators };
}

test('enabled sound requests iOS playback within the gesture and resumes interruptions', async t => {
  const f = fixture(t), audio = new GameAudio(); audio.setEnabled(true);
  const ready = audio.unlock();
  assert.deepEqual(f.calls, ['playback', 'create', 'resume']);
  assert.equal(await ready, true);
  f.context.state = 'interrupted'; assert.equal(await audio.unlock(), true);
  assert.equal(f.calls.filter(c => c === 'create').length, 1, 'An interruption should reuse the audio context');
});

test('muting while resume is pending stays silent after the late resolution', async t => {
  const f = fixture(t), audio = new GameAudio(); let finish!: () => void;
  f.context.resume = () => new Promise<void>(resolve => { finish = () => { f.context.state = 'running'; resolve(); }; });
  audio.setEnabled(true); const ready = audio.unlock(); audio.setEnabled(false); finish();
  assert.equal(await ready, false); assert.equal(f.output.gain.value, 0);
  audio.tone(660, 0.2); assert.equal(f.oscillators.length, 0);
  assert.equal(f.calls.at(-1), 'auto');
});

test('unsupported audio-session configuration falls back; resume rejection is contained', async t => {
  const f = fixture(t, true), audio = new GameAudio(); audio.setEnabled(true);
  assert.equal(await audio.unlock(), true);
  f.context.state = 'suspended'; f.context.resume = async () => { throw new Error('Audio blocked'); };
  assert.equal(await audio.unlock(), false);
  audio.tone(660, 0.2); assert.equal(f.oscillators.length, 0);
});
