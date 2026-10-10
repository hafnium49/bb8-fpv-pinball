"""Compare old voice and three original ring-modulated candidates offline."""
import hashlib
import json
import struct
import subprocess
import wave
from pathlib import Path
import numpy as np
from droid_synth import RATE, phrase, finish

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/droid-voice'
OUT.mkdir(parents=True, exist_ok=True)


def metrics(data):
    spectrum = np.abs(np.fft.rfft(data)) ** 2
    frequencies = np.fft.rfftfreq(len(data), 1 / RATE)
    return {'rms': round(float(np.sqrt(np.mean(data * data))), 5),
            'peak': round(float(np.max(np.abs(data))), 5),
            'centroidHz': round(float(np.sum(frequencies * spectrum) / np.sum(spectrum)), 1),
            'energyAbove2k': round(float(np.sum(spectrum[frequencies > 2000]) / np.sum(spectrum)), 5)}


def write(path, data):
    with wave.open(str(path), 'wb') as w:
        w.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        w.writeframes(b''.join(struct.pack('<h', round(v * 32767)) for v in data))


def main():
    report = {'licensing': {
        'selected': 'MIT-licensed MCP-Muse code adapted to generate new oscillator audio locally',
        'commit': '8a23fd9e429a799324f0f98f93dd20647326bd6a',
        'officialBb8Recordings': 'excluded: no reuse license established',
        'ttastromechSamples': 'excluded: code MIT, bundled recordings trace to Scratch with unclear original provenance',
        'freesound331490': 'creator states Aalto synthesis and CC0; file retrieval returned HTTP 403; no audio imported',
        'vendoredSourceHashes': {},
    }, 'candidates': {}, 'chosen': 'warm',
        'limits': ['Signal measurements do not establish subjective similarity to BB-8 or speaker quality.']}
    source = ROOT / 'scripts/vendor/mcp-muse'
    for path in source.glob('*.rs'):
        data = path.read_bytes()
        report['licensing']['vendoredSourceHashes'][path.name] = {
            'sha256': hashlib.sha256(data).hexdigest(),
            'gitBlobSha': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest(),
        }
    # Baseline blob is pinned rather than reading the newly generated asset.
    baseline = subprocess.check_output(['git', 'show', '105fa51969bfad703c28429c4460d518caad7857'], cwd=ROOT)
    (OUT / 'baseline.wav').write_bytes(baseline)
    with wave.open(str(OUT / 'baseline.wav'), 'rb') as w:
        old = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(float) / 32768
    report['oldVoice'] = metrics(old)
    write(OUT / 'old.wav', old)
    for name, scale in (('deep', .68), ('warm', 1), ('bright', 1.7)):
        sequence = []
        clips = {}
        for emotion, base, length, count in (
            ('Thoughtful', 260, .68, 3), ('Curious', 310, .65, 3),
            ('Surprised', 430, .46, 2), ('Worried', 350, .53, 3),
            ('Excited', 400, .72, 4), ('Sad', 260, .74, 2)):
            packet = finish(phrase(emotion, length, base * scale, count))
            clips[emotion] = metrics(np.asarray(packet))
            sequence += packet + [0.0] * round(RATE * .32)
        write(OUT / f'{name}.wav', sequence)
        report['candidates'][name] = {'clips': clips, 'combined': metrics(np.asarray(sequence))}
    report['decision'] = 'Warm retains audible midrange for small speakers, with substantially less high-frequency energy than the old voice. Deep risks losing body on small speakers; bright returns toward the rejected soprano character. All candidates use discrete syllables without fast amplitude flutter or formant-filter vocalization.'
    path = ROOT / 'docs/spikes/droid-voice-results.json'
    path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
