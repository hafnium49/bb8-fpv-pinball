import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { voiceBank, type VoiceKey } from '../src/ui/voice-bank';
import { VoiceSelector } from '../src/ui/voice-selector';
import { SoundDirector, type SoundState } from '../src/ui/sound-director';

test('every shipped variant is audible, unique, bounded and inside the PCM sprite', () => {
  const wav = readFileSync(new URL('../src/assets/droid-beeps.wav', import.meta.url));
  const rate = wav.readUInt32LE(24), frames = (wav.length - 44) / 2;
  assert.ok(wav.length < 1_500_000, 'Voice bank must remain below 1.5 MB');
  const hashes = new Set<string>();
  for (const [key, bank] of Object.entries(voiceBank)) {
    for (const clip of bank.variants) {
      const first = Math.round(clip.offset * rate), last = first + Math.round(clip.duration * rate);
      assert.ok(first >= 0 && last <= frames && clip.duration <= .9, key);
      let energy = 0, peak = 0;
      for (let i = first; i < last; i++) {
        const value = wav.readInt16LE(44 + i * 2) / 32768;
        energy += value * value; peak = Math.max(peak, Math.abs(value));
      }
      assert.ok(Math.sqrt(energy / (last - first)) > .045, `${key}: inaudible variant`);
      assert.ok(peak <= .581, `${key}: headroom lost`);
      const hash = createHash('sha256').update(wav.subarray(44 + first * 2, 44 + last * 2)).digest('hex');
      assert.ok(!hashes.has(hash), `${key}: duplicated recording`); hashes.add(hash);
    }
  }
  assert.equal(hashes.size, 46);
});

test('ordinary event families rotate independently; warning motifs stay stable', () => {
  const selector = new VoiceSelector();
  for (const key of Object.keys(voiceBank) as VoiceKey[]) {
    const count = voiceBank[key].variants.length;
    const selections = Array.from({ length: 7 }, () => selector.select(key));
    if (count === 1) assert.ok(selections.every(c => c.variant === 0));
    else for (let i = 1; i < selections.length; i++) assert.notEqual(selections[i].offset, selections[i - 1].offset);
  }
  assert.notEqual(selector.select('idle').offset, selector.select('idle').offset);
  assert.equal(selector.select('left').offset, voiceBank.left.offset);
});

test('idle, short impacts and head-loss have sampled voices; very soft contacts stay mechanical', () => {
  const s: SoundState = { phase: 'playing', paused: false, time: 10,
    position: { x: 0, y: .3, z: -5 }, velocity: { x: 0, y: 0, z: 1 },
    controls: { left: false, right: false, launch: false }, charge: 0,
    route: { active: false, phase: 'free', projection: { s: 0, vertical: 0 } } };
  const director = new SoundDirector();
  assert.ok(director.update(s, []).cues.some(c => c.voice === 'idle'));
  const impact = director.update({ ...s, time: 10.5 }, [{ type: 'wall', speed: 4 }]);
  assert.ok(impact.cues.some(c => c.voice === 'tap'));
  assert.ok(impact.cues.filter(c => c.kind === 'chatter').every(c => c.voice));
  const scrape = director.update({ ...s, time: 11.1 }, [{ type: 'wall', speed: 1.5 }]);
  assert.ok(scrape.cues.some(c => c.kind === 'wall'));
  assert.equal(scrape.cues.filter(c => c.kind === 'chatter').length, 0);
  assert.equal(voiceBank['head-loss'].variants.length, 3);
});

test('adapted generator source has exact upstream provenance and retained MIT notice', () => {
  const root = new URL('../scripts/vendor/mcp-muse/', import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL('provenance.json', root), 'utf8'));
  assert.equal(provenance.license, 'MIT');
  assert.equal(provenance.commit, '8a23fd9e429a799324f0f98f93dd20647326bd6a');
  for (const file of provenance.files) {
    const data = readFileSync(new URL(file.path.split('/').at(-1)!, root));
    const hash = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    assert.equal(hash, file.gitBlobSha);
  }
  const license = readFileSync(new URL('../scripts/vendor/mcp-muse-LICENSE', import.meta.url), 'utf8');
  assert.ok(license.includes('Copyright (c) 2025 Alex Trzyna'));
  assert.ok(license.includes('Permission is hereby granted'));
});
