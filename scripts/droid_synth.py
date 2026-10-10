"""Offline Python adaptation of MCP-Muse's MIT-licensed droid synthesizer.

Copyright (c) 2025 Alex Trzyna. License: vendor/mcp-muse-LICENSE.
Pinned upstream and unmodified source: vendor/mcp-muse/provenance.json.
ORBIT changes: narrower contours, syllable phrasing, low carrier body,
controlled edge fades and deterministic variants. No recordings are loaded.
"""
import math

RATE = 22050
TAU = math.tau
# Carrier ranges and contours ported from src/expressive/r2d2.rs.
PRESETS = {
    "Happy": ((294, 587), (.4, .8, .3, .9, .2, .7, .4, .85)),
    "Sad": ((100, 500), (1, .9, .8, .7, .6, .5, .4, .3, .2, .1, 0)),
    "Excited": ((440, 880), (.6, 1, .2, .9, .1, 1, .3, .8, .1, .95)),
    "Worried": ((174, 349), (.5, .3, .7, .2, .6, .35, .55, .25)),
    "Curious": ((130, 520), (.1, .15, .35, .65, 1)),
    "Affirmative": ((146, 233), (.8, .85, .9, .85)),
    "Negative": ((110, 175), (.7, .3, .1)),
    "Surprised": ((220, 880), (.05, .95, .1, .8)),
    "Thoughtful": ((82, 164), (.4, .6, .45, .65, .5, .35)),
}


def interpolate(progress, contour):
    position = min(1, max(0, progress)) * (len(contour) - 1)
    index = min(len(contour) - 1, int(position))
    current = contour[index]
    return current + (contour[min(index + 1, len(contour) - 1)] - current) * (position - index)


def ring_tone(duration, base, intensity, contour, body=.3):
    """Phase-accumulating golden-ratio ring modulation, adapted from synth.rs.

    Smoothly changing frequency must be integrated into phase. Applying
    frequency*time would add unintended sweeps to fast-changing contours.
    ORBIT narrows the upstream 0.2..3 multiplier to avoid voice-like yelps.
    """
    out = []
    carrier = modulator = harmonic = fundamental = 0.0
    for i in range(round(duration * RATE)):
        t = i / RATE
        progress = t / duration
        pitch = .72 + interpolate(progress, contour) * intensity * .75
        vibrato = math.sin(TAU * 1.8 * t) * .008
        frequency = base * pitch * (1 + vibrato)
        carrier += TAU * frequency / RATE
        modulator += TAU * frequency * .618 * (1 + vibrato * .2) / RATE
        harmonic += TAU * frequency * 1.05 / RATE
        fundamental += TAU * frequency * .5 / RATE
        voice = math.sin(carrier) * math.sin(modulator) * .75 + math.sin(harmonic) * .02
        # Retain upstream saturation; dry carrier/subtone gives a round body.
        voice = voice if abs(voice) < .5 else math.copysign(.5 + (abs(voice) - .5) * .6, voice)
        voice = voice * (1 - body) + body * (.65 * math.sin(carrier) + .35 * math.sin(fundamental))
        # Steady electronic syllables: no 23 Hz flutter or formant bark.
        edge = min(1, t / .009, max(0, duration - t) / .024)
        envelope = math.sin(edge * math.pi / 2) ** 2 * (.94 - .12 * progress)
        out.append(voice * envelope)
    return out


def phrase(emotion, duration, base, syllables, variant=0, intensity=.55, body=.3, echo=0):
    contour = PRESETS[emotion][1]
    # The voice's character comes from short discrete syllables and pauses,
    # with small internal inflections rather than a single rising/falling cry.
    rhythms = ((1, .82, 1.12, .72), (.76, 1.12, .9, 1), (1.1, .7, .86, 1.06))
    pitch_steps = ((1, .78, 1.13, .87), (.86, 1.08, .76, .95), (1.05, .82, .96, .74))
    gap = .043 if syllables > 2 else .055
    total = round(duration * RATE)
    dry_length = duration - echo
    weights = rhythms[variant % 3][:syllables]
    unit = (dry_length - gap * (syllables - 1)) / sum(weights)
    out = [0.0] * total
    onset = 0.0
    for i, weight in enumerate(weights):
        length = unit * weight
        # Rotate contours between syllables to avoid a repeated same-pitch bark.
        shifted = contour[i % len(contour):] + contour[:i % len(contour)] if emotion not in ("Sad", "Negative") else contour
        packet = ring_tone(length, base * pitch_steps[variant % 3][i], intensity, shifted, body)
        start = round(onset * RATE)
        for j, value in enumerate(packet):
            if start + j < total:
                out[start + j] += value
        onset += length + gap
    if echo:
        dry = out[:]
        for delay, gain in ((.09, .19), (.18, .075)):
            d = round(delay * RATE)
            for i in range(total - d):
                out[i + d] += dry[i] * gain
    return out


def finish(samples, peak=.55):
    # Remove DC, round the top edge, and leave headroom for music + mechanics.
    mean = sum(samples) / len(samples)
    alpha = 1 - math.exp(-TAU * 2100 / RATE)
    previous = 0.0
    out = []
    for value in samples:
        previous += alpha * (value - mean - previous)
        out.append(previous)
    maximum = max(abs(value) for value in out)
    if maximum:
        out = [value / maximum * peak for value in out]
    fade = round(.005 * RATE)
    for i in range(fade):
        out[i] *= i / fade
        out[-1 - i] *= i / fade
    return out
