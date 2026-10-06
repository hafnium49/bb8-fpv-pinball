# Expressive ORBIT audio

The previous sound system played a handful of short oscillators. This upgrade gives the ball a personality and a continuous cabinet soundscape on both tables.

| Gameplay | Sound |
| --- | --- |
| Ready / launch | Robot greeting, excited launch line, spring/motor release |
| Bumpers / targets | Distinct mechanical hits, electronic surprise and impact cries |
| Walls | Impact strength from incoming velocity perpendicular to the real rail; soft scraping is ignored |
| Rolling | Speed-driven colored noise and a low motor tone; airborne balls fade the contact sound |
| Ramp / bridge | Climb excitement, bridge banter, metallic rolling and speed-driven wire rattles |
| Tunnel | A short character reaction and increased room echo |
| Flipper return | Spoken left/right/both instruction with an alert accent and matching caption/button highlight |
| Save / circuit | Save praise and a four-note circuit award |
| Drain / game over | Falling tone, disappointed line, final invitation; music and rolling stop |

## Timing and mixing

`SoundDirector` reads simulation snapshots and collision events. It supplies semantic cues and continuous layer settings without changing the ball, flippers, scoring, 120 Hz step, or camera. Wall events measure the pre-step rail-normal speed, with a 1.4 m/s minimum.

The ground-return forecast uses downslope gravity and horizontal velocity to estimate the side at a plane ahead of the flipper tips. It activates in a 0.10–1.15 second window. Forecasts through a bumper/target, the launcher, an upward-moving ball or the high bridge are suppressed. Verified tunnel/return motion uses remaining route distance to anticipate the right return before landing. Holding the advised flipper suppresses the corresponding instruction. A warning fires once per approach and rearms on an upward return, a new ball or resume. These are short forecasts; intervening rail contacts, high speeds and human response time still limit their usefulness.

The voice has one active slot. Urgent instructions replace flavour speech, lower the music/effects and reject low-priority chatter. Route transitions may replace earlier route lines; a short, fast traversal prioritizes the return instruction. Impacts retain mechanical feedback even while speech is busy. Electronic reactions are rate-limited and longer spoken reactions have a separate cooldown. Ordinary quiet play gets occasional inquisitive chirps.

The Web Audio graph mixes speech, effects and an original 108 BPM, eight-bar A-minor groove through a limiter and a master mute. It uses two continuous sources, at most twelve effect layers and ten music layers. Music scheduling has a two-step limit and discards overdue scheduling after a stall. Audio parameter targets avoid redundant frame updates. Source completion disconnects nodes; pause/blur/mute/restart cancel sources and pending notes. Audio-context interruptions discard active sounds rather than resuming a stale warning.

Sound starts in a player gesture, preserves the existing local on/off preference and optional iPhone playback session, and shares startup-failure handling across all entry paths. Speech loads and decodes once per context. A failed or unfinished decode falls back to an immediate electronic vocal; completed loading never replays an old instruction. Captions keep critical advice available when muted.

## Original assets

`src/assets/droid-voice.wav` contains fifteen original English callouts, rendered locally using FFmpeg's Flite filter with the CMU SLT voice. Pitch, tempo, filtering, a short metallic reflection and edge fades give them a friendly machine character. The four urgent callouts last approximately 0.48–0.55 seconds. `src/ui/voice-bank.ts` indexes the sprite in seconds.

Rebuild the checked-in speech with Python 3 and an FFmpeg build supporting `flite`:

```sh
python3 scripts/generate-droid-voice.py
```

The asset is embedded by Vite, including in the single-file offline build. Chatter/cries use original FM and formant synthesis; mechanical effects, rolling, room impulse and music are generated locally. Runtime playback needs no speech service, speech-synthesis voice installation or API key. Flite attribution is included in `THIRD-PARTY-NOTICES.txt`.

## Verification

Thirty unit/integration regressions pass, including real Rapier wall contacts, a real ground return with more than 0.6 seconds of warning before flipper contact, fast clear-return advice, obstacle suppression, route advice, cue cooldowns, pause/reset state and non-silent voice sprite bounds. A separate 20 m/s free-body circuit entry warned in the tunnel 1.025 seconds before moving right-flipper contact. The original 63 entry cases, 18 spin/partial-step variants, 96 ground approaches and two input-only launch-to-circuit returns pass. TypeScript, Vite production and standalone generation pass.

`npm run test:audio:browser` runs desktop classic at 1440 × 900 and touch circuit at 844 × 390 with real Web Audio. It checks decoded speech, actual wall/bumper/target and route events, urgent speech interruption, sustained rolling/music with no active voice, a 100-impact resource burst, keyboard/simultaneous touch, pause/blur, interrupted-context reuse, three-ball completion/restart, persistence, mute and injected startup/voice-decode failures. Actual desktop and mobile landscape screenshots show the warning caption and flipper highlight and are inspected. The [browser report](validation/droid-soundscape.json) includes source hashes and the exact scope.

Short audio checks suppress only the software-GPU render call while retaining the real animation loop, inputs and simulation. Rendering is restored for screenshots. Chromium measurements establish nonzero audio signals and event timing, rather than subjective sound quality or physical speaker output. The optional Safari session API is stubbed. Physical iPhone speaker balance, Bluetooth routing, Silent Mode and human reaction timing still need a device listen/playtest.
