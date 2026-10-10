# Warmer nonverbal droid voice

Replace the high, repetitive synthetic yelp with short electronic syllables,
round burbles and occasional excited chirps. Idle chatter, ordinary contacts,
hard impacts, travel and lost-head reactions all use a rendered voice bank.
Warnings remain recognizable through stable rhythm and pitch, with matching
captions and button highlights. The droid never speaks English.

## Source decision and licensing

Use the oscillator-only droid voice code from
[MCP-Muse](https://github.com/alextrzyna/mcp-muse), pinned at
`8a23fd9e429a799324f0f98f93dd20647326bd6a`. The upstream repository licenses
this code under MIT, copyright 2025 Alex Trzyna. Its `r2d2.rs` emotion contours
and `synth.rs` phase-accumulating ring modulation and saturation are adapted
to Python in `scripts/droid_synth.py`. The exact upstream files and blob
hashes are retained under `scripts/vendor/mcp-muse/`; the full MIT notice is
retained in `scripts/vendor/mcp-muse-LICENSE` and `THIRD-PARTY-NOTICES.txt`.

The asset recipe loads no recordings. All PCM is newly rendered from local
oscillators. There is no movie audio, toy audio, voice cloning, external
SoundFont or generative model involved. This is an original droid-style
voice, not official BB-8 or R2-D2 recordings and not a claim of Lucasfilm
endorsement or clearance of Star Wars branding.

The purported official BB-8 recording repository was excluded because no
reuse license was established. `ttastromech` has MIT code, but its sample
provenance traces to a Scratch project; that is insufficient for importing
those recordings here. Freesound sound 331490 states original Aalto synthesis
and CC0, but the file download returned HTTP 403 in this environment. No
Freesound audio was downloaded, copied or included. The CC0 option was
therefore superseded by auditable, licensed synthesis code.

## Spikes and selected timbre

`scripts/droid-voice-spike.py` compares the pinned old PCM with three new
profiles. The warm candidate has a spectral centroid of 277.2 Hz versus
739.2 Hz for the old sprite, and 0.002% rather than 5.416% of measured energy
above 2 kHz. The deep candidate has a 189.4 Hz centroid; the bright candidate
has 461.3 Hz. Warm is selected to retain more midrange than deep while moving
well below the old voice's brightness. This is a signal-based design choice;
the numbers do not establish subjective sound quality or small-speaker
audibility. The spike report is [here](spikes/droid-voice-results.json).

The adaptation narrows pitch excursion, integrates oscillator phase, mixes
a dry carrier and sub-octave body into golden-ratio ring modulation, softens
the top edge, and uses short syllables separated by pauses. Fast 23 Hz
amplitude flutter and the runtime formant-filter cry are removed. All
normal reactions rotate among three different renders without immediate
repetition. Deterministic rotation avoids extra random draws interfering
with the lost-head camera probability.

## Event design

| Event | Voice | Duration | Variation |
| --- | --- | --- | --- |
| Ready / launch | Low confirmation / energetic chatter | 0.60 / 0.57 s | Three each |
| Minor contacts | Short metallic chirrup | 0.23 s | Three |
| Hard impacts | Startled chirps / low grumble | 0.46 / 0.56 s | Three each |
| Ramp / bridge | Curious rise / happy chatter | 0.66 / 0.69 s | Three each |
| Tunnel | Curious burble with short echoes | 0.85 s | Three |
| Save / award | Confident / excited response | 0.51 / 0.80 s | Three each |
| Quiet play | Thoughtful chatter | 0.68 s | Three |
| Head loss | Confused four-syllable reaction | 0.78 s | Three |
| Drain / game over | Worried chatter / descending burbles | 0.61 / 0.73 s | Three each |
| Left / right / both / danger | Stable 2 / 3 / 4 / 3 packet patterns | 0.34 / 0.41 / 0.46 / 0.49 s | One each |

Mechanical sounds still accompany every physical collision. Droid impact
reactions are limited to one per 0.42 seconds, with longer impact phrases
separated by at least 2.2 seconds. Very soft wall contacts stay mechanical.
An ordinary contact during the longer phrase cooldown uses the short
sample, rather than falling back to the old synthesizer. Idle chatter also
uses the sprite. Urgent warning priority still replaces flavour, ducks
music/effects, and never queues delayed playback after decoding.

## Delivery and performance

The sprite has 46 mono PCM16 clips at 22,050 Hz, 1,432,842 bytes. Normal clips
peak at 0.55; warnings peak at 0.58. One context decodes the bank once; each
accepted vocal uses one buffer source and the existing bounded mixer.
Synthesis runs offline, so the game has no synthesis-model, server or MCP
dependency. The larger asset increases initial transfer size, not recurring
render-loop work. Vite still embeds it for the existing offline build.

Rebuild with `python scripts/generate-droid-beeps.py` (standard library only).
The spectrum spike additionally requires NumPy. A short
[voice preview](../public/audio/droid-voice-preview.wav) contains idle, surprise,
grumble, bridge, tunnel, danger and lost-head sounds in that order.

Validation results are recorded separately in
`docs/validation/droid-voice-assets.json` and the browser report. Browser
waveform and spectral checks cannot certify a listener's perception of
BB-8 likeness. Actual speaker listening remains the final quality check.
