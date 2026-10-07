"""Build ORBIT's original nonverbal droid voice with Python's standard library.

The voice is made only from oscillators, frequency modulation and envelopes.
Captions describe the meaning; they are never fed to a speech synthesizer.
Run from any directory. Only the resulting WAV and index ship with the game.
"""
import json
import math
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_RATE = 22050
TAU = math.tau

# (onset, duration, pitch contour in Hz, metallic color, flutter depth).
# Different rhythms and contours carry emotion; warning motifs are stable
# and distinguishable even through a mono phone speaker.
PHRASES = {
    "left": [(0, .13, [690, 640, 560], .4, 0), (.18, .13, [580, 540, 480], .4, 0)],
    "right": [(0, .09, [1050, 1210], .4, 0), (.13, .09, [1210, 1370], .4, 0), (.26, .12, [1370, 1580], .4, 0)],
    "both": [(0, .08, [620, 680], .4, 0), (.11, .08, [1320, 1420], .4, 0), (.22, .08, [620, 680], .4, 0), (.33, .10, [1320, 1520], .4, 0)],
    "danger": [(0, .12, [1500, 1900, 700], 1.7, .3), (.16, .12, [1600, 2100, 650], 1.7, .3), (.32, .14, [1800, 2400, 500], 2.0, .4)],
    "ready": [(0, .12, [480, 720], .5, 0), (.17, .16, [680, 960, 740], .65, 0), (.39, .18, [580, 850, 1120], .45, .08)],
    "launch": [(0, .10, [420, 640], .8, 0), (.13, .35, [640, 1300, 1800, 1250], .7, .2)],
    "whoa": [(0, .11, [700, 1650], 1.3, .2), (.13, .30, [1800, 2100, 1400, 550], 1.5, .3)],
    "ouch": [(0, .46, [520, 1900, 2400, 1800, 900, 420], 2.3, .4), (.50, .10, [450, 330], 1.1, .2)],
    "ramp": [(0, .12, [360, 660], .7, 0), (.17, .14, [640, 1100], .7, .1), (.36, .27, [920, 1460, 1780], .6, .18)],
    "bridge": [(0, .12, [800, 1300, 900], .5, .1), (.17, .12, [1100, 1680, 1200], .6, .18), (.34, .32, [900, 1400, 1100, 1700, 1250], .75, .25)],
    "tunnel": [(0, .10, [530, 740], .45, 0), (.15, .12, [650, 490], .6, 0), (.33, .27, [540, 800, 1260], .5, .1)],
    "save": [(0, .10, [650, 920], .5, 0), (.14, .10, [920, 1230], .5, 0), (.29, .19, [1150, 1600, 1300], .65, .18)],
    "circuit": [(0, .11, [600, 850], .5, 0), (.15, .11, [850, 1130], .5, 0), (.30, .11, [1130, 1500], .5, 0), (.47, .30, [1050, 1800, 1450, 2050], .7, .2)],
    "drain": [(0, .13, [1700, 2300, 1600], 1.4, .25), (.18, .40, [1400, 950, 550, 220], 1.0, .35)],
    "over": [(0, .16, [820, 630], .5, 0), (.23, .18, [620, 420], .6, .1), (.47, .23, [400, 650, 920], .5, .1)],
}
CAPTIONS = {
    "left": "Left flipper!", "right": "Right flipper!",
    "both": "Both flippers!", "danger": "Watch the drain!",
    "ready": "[ready chirps]", "launch": "[excited launch whistle]",
    "whoa": "[startled squeal]", "ouch": "[pained electronic cry]",
    "ramp": "[rising excited chirps]", "bridge": "[joyful bridge trill]",
    "tunnel": "[curious whistle echoes]", "save": "[relieved chirps]",
    "circuit": "[triumphant beeps]", "drain": "[panicked descending squeal]",
    "over": "[wistful questioning whistle]",
}


def render(name):
    pulses = PHRASES[name]
    tail = .25 if name == "tunnel" else .03
    duration = max(start + length for start, length, *_ in pulses) + tail
    samples = [0.0] * round(duration * SAMPLE_RATE)
    for start, length, pitches, color, flutter in pulses:
        onset, count = round(start * SAMPLE_RATE), round(length * SAMPLE_RATE)
        phase = 0.0
        for i in range(count):
            t = i / SAMPLE_RATE
            position = i / max(1, count - 1) * (len(pitches) - 1)
            segment = min(len(pitches) - 2, int(position))
            fraction = position - segment
            glide = fraction * fraction * (3 - 2 * fraction)
            frequency = pitches[segment] + (pitches[segment + 1] - pitches[segment]) * glide
            frequency *= 1 + .012 * math.sin(TAU * 8.5 * t)
            phase += TAU * frequency / SAMPLE_RATE
            metallic = color * math.sin(phase * 2.013 + .22 * math.sin(TAU * 27 * t))
            signal = math.sin(phase + metallic) + .16 * math.sin(phase * 2.97)
            attack = min(1, t / .007)
            release = min(1, (length - t) / .018)
            envelope = math.sin(attack * math.pi / 2) ** 2 * math.sin(release * math.pi / 2) ** 2
            envelope *= (1 - .3 * t / length) * (1 - flutter / 2 + flutter / 2 * math.sin(TAU * 23 * t))
            samples[onset + i] += signal * envelope
    if name == "tunnel":
        dry = samples[:]
        for delay, level in [(round(.11 * SAMPLE_RATE), .28), (round(.22 * SAMPLE_RATE), .12)]:
            for i in range(len(samples) - delay):
                samples[i + delay] += dry[i] * level
    # Leave ample mixer headroom and avoid clicks at clip boundaries.
    peak = max(abs(sample) for sample in samples)
    return b"".join(struct.pack("<h", round(sample / peak * .64 * 32767)) for sample in samples)


def main():
    samples = bytearray()
    index = {}
    for name in PHRASES:
        data = render(name)
        index[name] = {
            "offset": round(len(samples) / 2 / SAMPLE_RATE, 6),
            "duration": round(len(data) / 2 / SAMPLE_RATE, 6),
            "caption": CAPTIONS[name],
        }
        samples.extend(data)
        samples.extend(b"\0\0" * round(SAMPLE_RATE * .12))
    (ROOT / "src/assets").mkdir(exist_ok=True)
    with wave.open(str(ROOT / "src/assets/droid-beeps.wav"), "wb") as sprite:
        sprite.setnchannels(1)
        sprite.setsampwidth(2)
        sprite.setframerate(SAMPLE_RATE)
        sprite.writeframes(samples)
    (ROOT / "src/ui/voice-bank.ts").write_text(
        "// Generated by scripts/generate-droid-beeps.py. Nonverbal clips; offsets in seconds.\n"
        "export const voiceBank = " + json.dumps(index, indent=2) + " as const;\n"
        "export type VoiceKey = keyof typeof voiceBank;\n"
    )
    print(json.dumps({"bytes": len(samples) + 44, "clips": index}, indent=2))


if __name__ == "__main__":
    main()
