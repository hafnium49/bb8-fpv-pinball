# Expressive ORBIT audio

The ball communicates entirely through expressive electronic beeps, whistles, trills and squeals, inspired by the nonverbal personalities of BB-8 and R2-D2. All sound is original synthesis. English text is a readable interpretation of the beeps; there is no spoken English track. A continuous cabinet soundscape accompanies both tables. The [cabinet/audio release](cabinet-arcade-release.md) adds a separate music slider, fuller arrangement and stronger urgent ducking.

| Gameplay | Sound |
| --- | --- |
| Ready / launch | Friendly chirps, excited rising whistle, spring/motor release |
| Bumpers / targets | Distinct mechanical hits, electronic surprise and impact cries |
| Walls | Impact strength from incoming velocity perpendicular to the real rail; soft scraping is ignored |
| Rolling | Speed-driven colored noise and a low motor tone; airborne balls fade the contact sound |
| Ramp / bridge | Rising excited chirps, joyful bridge trills, metallic rolling and speed-driven wire rattles |
| Tunnel | An inquisitive rising whistle with two short echoes and increased room echo |
| Flipper return | Distinct short alert motifs, interpreted by captions and matching button highlights |
| Save / circuit | Relieved chirps, triumphant beeps and a four-note circuit award |
| Drain / game over | Panicked descending squeal, then a wistful questioning whistle; music and rolling stop |

| Warning caption | Droid motif | Stereo position |
| --- | --- | --- |
| Left flipper! | Two low falling beeps | Left |
| Right flipper! | Three high rising beeps | Right |
| Both flippers! | Four alternating low/high beeps | Center |
| Watch the drain! | Three rapid pitch-breaking panic bursts | Center |

The warnings last 0.34–0.49 seconds. Pitch and rhythm distinguish them on a mono phone speaker; stereo is an additional cue. The synthesized fallback preserves these pattern families if the sprite has not decoded. The caption and highlighted button explain which action to take without giving the droid a human language.

## Timing and mixing

`SoundDirector` reads simulation snapshots and collision events. It supplies semantic cues and continuous layer settings without changing the ball, flippers, scoring, 120 Hz step, or camera. Wall events measure the pre-step rail-normal speed, with a 1.4 m/s minimum.

The ground-return forecast uses downslope gravity and horizontal velocity to estimate the side at a plane ahead of the flipper tips. It activates in a 0.10–1.15 second window. Forecasts through a bumper/target, the launcher, an upward-moving ball or the high bridge are suppressed. Verified tunnel/return motion uses remaining route distance to anticipate the right return before landing. Holding the advised flipper suppresses the corresponding instruction. A warning fires once per approach and rearms on an upward return, a new ball or resume. These are short forecasts; intervening rail contacts, high speeds and human response time still limit their usefulness.

The voice has one active slot. Urgent warnings replace flavour whistles, lower the music/effects and reject low-priority chatter. Route transitions may replace earlier route phrases; a short, fast traversal prioritizes the return warning. Impacts retain mechanical feedback while the voice is busy. Quick electronic reactions are rate-limited and longer phrases have a separate cooldown. Ordinary quiet play gets occasional inquisitive chirps.

The Web Audio graph mixes droid vocals, effects and an original 108 BPM, sixteen-bar A-minor groove through a limiter and a master mute. It uses two continuous sources, at most twelve effect layers and ten music layers. Music scheduling has a two-step limit and discards overdue scheduling after a stall. Audio parameter targets avoid redundant frame updates. Source completion disconnects nodes; pause/blur/mute/restart cancel sources and pending notes. Audio-context interruptions discard active sounds rather than resuming a stale warning.

Sound starts in a player gesture, preserves the existing local on/off preference and optional iPhone playback session, and shares startup-failure handling across all entry paths. The beep sprite loads and decodes once per context. A failed or unfinished decode falls back to an immediate electronic vocal; completed loading never replays an old warning. Captions keep critical advice available when muted. The caption region remains in the accessibility tree between cues, using polite announcements for ordinary reactions and assertive, atomic announcements for urgent instructions. Priority is set before warning text changes. Assistive technology may read captions using the user's chosen screen reader; that is separate from the nonverbal game soundtrack.

## Original assets

`src/assets/droid-beeps.wav` contains fifteen original nonverbal phrases, rendered from oscillators, curved pitch glides, frequency modulation, flutter and click-free envelopes. Hard collisions have rougher metallic squeals; friendly reactions use gentler modulation and melodic contours. The tunnel phrase has two delayed reflections. Mono PCM16 at 22,050 Hz keeps the sprite compact; each clip peaks at 0.64 for mixer headroom. `src/ui/voice-bank.ts` indexes the sprite in seconds and supplies interpretation captions.

Rebuild the checked-in beeps with Python 3's standard library:

```sh
python3 scripts/generate-droid-beeps.py
```

The asset is embedded by Vite, including in the single-file offline build. Short chatter/cries and the immediate fallback use original runtime synthesis; mechanical effects, rolling, room impulse and music are generated locally. The previous English speech asset and its Flite generation recipe have been removed. No recorded film audio, text-to-speech engine, model, online service or API key is used to create these beeps or play the game.

## Verification

All 31 unit/integration tests pass, covering real Rapier wall contacts, a real ground return with more than 0.6 seconds of warning before flipper contact, fast clear-return advice, obstacle suppression, route advice, cue cooldowns, pause/reset state, non-silent beep sprite bounds and distinct mono warning audio with low-left/high-right pitch. The circuit harness passes 63 entry cases, 18 spin/partial-step variants, 96 ground approaches and two input-only launch-to-circuit returns. TypeScript, Vite production and standalone generation pass. Regenerating the sprite produces the same WAV and cue index; production and offline HTML embed exactly the tested beep bytes.

`npm run test:audio:browser` passes desktop classic at 1440 × 900 and touch circuit at 844 × 390 with real Web Audio. It checks decoded beeps, actual wall/bumper/target and route events, urgent vocal interruption, warning panning, sustained rolling/music with no active voice, a 100-impact resource burst, keyboard/simultaneous touch, pause/blur, interrupted-context reuse, three-ball completion/restart, persistence, mute and injected startup/clip-decode failures. The four procedural fallback warning patterns are distinct and keep their directional panning. Actual desktop and mobile landscape screenshots show the warning caption and flipper highlight and were inspected. There were no browser errors. The [browser report](validation/droid-soundscape.json) includes source hashes and the exact scope.

Short audio checks suppress only the software-GPU render call while retaining the real animation loop, inputs and simulation. Rendering is restored for screenshots. Chromium measurements establish nonzero audio signals and event timing, rather than subjective sound quality or physical speaker output. The optional Safari session API is stubbed. Physical iPhone speaker balance, Bluetooth routing, Silent Mode and human reaction timing still need a device listen/playtest.
