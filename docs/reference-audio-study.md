# Reference audio inspection: Hyperspace Pinball

Reference: https://pinball-fbd1a.firebaseapp.com/ — inspected 2026-10-09. This extends the [visual/UI study](reference-cabinet-ui-study.md) and informs the [next implementation](cabinet-ui-audio-upgrade.md).

## What was verified

The page directly serves `assets.js`, `firebase-config.js`, `ranking.js` and `game.js`. Its served `game.js` defines a `Sound` class and 24 named event effects: flipper, bumper, sling, target, drop, lane, launch, ramp, combo, saucer, reach, win, jackpot, multiball, extra, skill, saved, drain, tilt, warn, nudge, bonus, gameover and start.

Playback uses `new Audio(src)`, choosing an optional `window.PINBALL_SOUNDS` override or `sounds/<name>.wav`. Each name has a pool of up to three audio elements; an event resets the selected element to the start and plays it at volume 0.55. M toggles sound. No background music loop or music sequencer was found in the inspected `game.js` or `assets.js`; this is not a claim about any future version or every possible audio source on the site.

Eight event URLs from that implementation returned valid, non-silent mono PCM16 WAV files at 22,050 Hz:

| Event | Duration | Design implication for ORBIT |
| --- | --- | --- |
| Flipper | 0.060 s | Very short immediate coil/contact accent |
| Bumper | 0.090 s | Distinct short impact feedback |
| Target | 0.070 s | Short contrasting target accent |
| Launch | 0.350 s | Longer release/sweep cue |
| Ramp | 0.240 s | Brief route transition flourish |
| Combo | 0.200 s | Compact reward accent |
| Drain | 0.700 s | Longer loss cue |
| Game over | 1.040 s | Brief final phrase rather than a continuous score loop |

The timing interpretation is a design inference from the code, event names and measured files. This environment did not provide reference audio capture/listening through the inspected browser. No subjective timbre, perceived loudness, musical quality, actual speaker playback, mute recovery or background-tab behaviour was verified. The source-based findings are enough to specify a similar event-driven arcade structure, but do not justify claiming a soundtrack was heard.

## Transfer into ORBIT

Use original short mechanical/electronic contact effects and longer launch/route/award/loss accents in ORBIT's existing Web Audio mixer. Keep its continuous rolling, wire rattles, original arcade groove, lower nonverbal droid voice and urgent warning priority. Expand that original music independently: no reference continuous music implementation was identified to match.

Do not import the inspected WAVs or copy their pitches/melodies. No reference audio assets or game source are committed here or enter the runtime; the retained evidence is URLs, hashes and numerical metadata. The implementation should listen to and calibrate its own mix on real speakers, especially a mono iPhone, rather than treating source-file peaks as perceived loudness.

## Reproducible evidence

See [inspection metadata](spikes/reference-audio-inspection.json) for URLs, SHA-256 hashes, durations, format and signal peaks/RMS. Source downloads and WAVs were read-only analysis inputs. Exact public resources:

- [Page](https://pinball-fbd1a.firebaseapp.com/)
- [Game source](https://pinball-fbd1a.firebaseapp.com/game.js)
- [Asset source](https://pinball-fbd1a.firebaseapp.com/assets.js)
- Example sound resource: [flipper.wav](https://pinball-fbd1a.firebaseapp.com/sounds/flipper.wav)

Compare these hashes before reusing the findings after an upstream update. The separate ORBIT render-counter baseline is unrelated to reference audio and is not a sound-quality test.
