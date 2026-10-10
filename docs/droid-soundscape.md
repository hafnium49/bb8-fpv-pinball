# Expressive ORBIT audio

The ball communicates entirely through warm electronic beeps, burbles and short metallic syllables, inspired by the nonverbal personalities of BB-8 and R2-D2. All sound is original synthesis. English text is a readable interpretation of the beeps; there is no spoken English track. A continuous cabinet soundscape accompanies both tables. The [cabinet/audio release](cabinet-arcade-release.md) adds a separate music slider, fuller arrangement and stronger urgent ducking.

| Gameplay | Sound |
| --- | --- |
| Ready / launch | Friendly chirps, excited rising whistle, spring/motor release |
| Bumpers / targets | Distinct mechanical hits, sampled surprise chirps and low grumbles |
| Walls | Impact strength from incoming velocity perpendicular to the real rail; soft scraping is ignored |
| Rolling | Speed-driven colored noise and a low motor tone; airborne balls fade the contact sound |
| Ramp / bridge | Rising excited chirps, joyful bridge trills, metallic rolling and speed-driven wire rattles |
| Tunnel | An inquisitive rising whistle with two short echoes and increased room echo |
| Flipper return | Distinct short alert motifs, interpreted by captions and matching button highlights |
| Save / circuit | Relieved chirps, triumphant beeps and a four-note circuit award |
| Drain / game over | Worried chatter, then descending burbles; music and rolling stop |

| Warning caption | Droid motif | Stereo position |
| --- | --- | --- |
| Left flipper! | Two low falling beeps | Left |
| Right flipper! | Three high rising beeps | Right |
| Both flippers! | Four alternating low/high beeps | Center |
| Watch the drain! | Three stable rapid alert packets | Center |

The warnings last 0.34–0.49 seconds. Pitch and rhythm distinguish them on a mono phone speaker; stereo is an additional cue. The synthesized fallback preserves these pattern families if the sprite has not decoded. The caption and highlighted button explain which action to take without giving the droid a human language.

## Timing and mixing

`SoundDirector` reads simulation snapshots and collision events. It supplies semantic cues and continuous layer settings without changing the ball, flippers, scoring, 120 Hz step, or camera. Wall events measure the pre-step rail-normal speed, with a 1.4 m/s minimum.

The ground-return forecast uses downslope gravity and horizontal velocity to estimate the side at a plane ahead of the flipper tips. It activates in a 0.10–1.15 second window. Forecasts through a bumper/target, the launcher, an upward-moving ball or the high bridge are suppressed. Verified tunnel/return motion uses remaining route distance to anticipate the right return before landing. Holding the advised flipper suppresses the corresponding instruction. A warning fires once per approach and rearms on an upward return, a new ball or resume. These are short forecasts; intervening rail contacts, high speeds and human response time still limit their usefulness.

The voice has one active slot. Urgent warnings replace flavour whistles, lower the music/effects and reject low-priority chatter. Route transitions may replace earlier route phrases; a short, fast traversal prioritizes the return warning. Impacts retain mechanical feedback while the voice is busy. Quick electronic reactions are rate-limited and longer phrases have a separate cooldown. Ordinary quiet play gets occasional inquisitive chirps.

The Web Audio graph mixes droid vocals, effects and an original 108 BPM, sixteen-bar A-minor groove through a limiter and a master mute. It uses two continuous sources, at most twelve effect layers and ten music layers. Music scheduling has a two-step limit and discards overdue scheduling after a stall. Audio parameter targets avoid redundant frame updates. Source completion disconnects nodes; pause/blur/mute/restart cancel sources and pending notes. Audio-context interruptions discard active sounds rather than resuming a stale warning.

Sound starts in a player gesture, preserves the existing local on/off preference and optional iPhone playback session, and shares startup-failure handling across all entry paths. The beep sprite loads and decodes once per context. A failed or unfinished decode falls back to an immediate electronic vocal; completed loading never replays an old warning. Captions keep critical advice available when muted. The caption region remains in the accessibility tree between cues, using polite announcements for ordinary reactions and assertive, atomic announcements for urgent instructions. Priority is set before warning text changes. Assistive technology may read captions using the user's chosen screen reader; that is separate from the nonverbal game soundtrack.

## Voice assets and licensing

The [warmer voice upgrade](droid-voice-upgrade.md) supersedes the original
fifteen-phrase bank. It contains 46 oscillator-only clips, generated offline
from a Python adaptation of MCP-Muse's MIT-licensed droid synthesizer.
Pinned upstream source, exact blob hashes, copyright and full license are
retained in the repository. No recorded film, toy or Freesound audio is used.

Three variants per ordinary event family rotate without immediate repetition.
The four warnings keep one stable pattern each. Minor impacts and quiet-play
chatter use samples too; they no longer invoke the old formant-filter cry.
Contact reactions have a 0.42-second cooldown, and longer impact phrases
remain separated by 2.2 seconds. Very soft wall contacts stay mechanical.
The lost-head episode has a separate confused-chatter family.

`src/assets/droid-beeps.wav` remains mono PCM16 at 22,050 Hz, now 1,432,842 bytes.
Normal clips peak at 0.55; warnings at 0.58. The voice decodes once per context.
Its generation happens offline, with no new runtime synthesis engine or
server dependency. Rebuild with Python 3's standard library:

```sh
python scripts/generate-droid-beeps.py
```

The asset is embedded by Vite and in the offline HTML. Mechanical effects,
rolling, room impulse and music still use local runtime synthesis. Immediate
fallback beeps remain available before decode or after an asset failure;
loading never replays an expired warning.

## Verification

The current upgrade passes 84 unit/integration tests and TypeScript/Vite
production build. Checks cover physics and input regressions, useful warning
lead time, distinct mono patterns, all 46 PCM variants, independent variation
and exact upstream source provenance. Regeneration produces identical bytes.

The voice browser harness checks real Chromium playback of every variant,
urgent preemption, pause silence, mute and one-context reuse. The existing
desktop-classic and mobile-circuit Web Audio harness checks keyboard and
simultaneous touch, real contacts, route cues, head loss, priority, music and
effects bounds, interruption recovery, three drains/restart, and injected
startup/decode failures. Actual default-course audio is checked at all three
ramps and both flipper levels. Desktop and mobile landscape caption screenshots
were inspected. The current [validation report](validation/droid-voice.json)
records results and limitations.

Signal and spectral measurements establish output and timing, not subjective
BB-8 likeness or physical speaker quality. WebKit could not launch in the
current environment because host libraries were unavailable. Physical speaker
balance, Bluetooth routing and Safari audio-session behavior remain unverified.
