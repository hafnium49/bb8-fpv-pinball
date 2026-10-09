# Cabinet, display and original arcade soundtrack

Implemented 2026-10-10 (JST), following the [cabinet/UI/audio handoff](cabinet-ui-audio-upgrade.md). The running game now has separated rubber, painted cap and metal bumper surfaces, rail trim/fasteners aligned with real contact bounds, refined existing bridge/support/tunnel finishes, calmer variant-aware artwork, and one compact cabinet display. High uses restrained hit lighting; Eco retains the same surfaces and feedback without bumper point lights. Exposure is 0.98 and floor emission is 0.08.

The existing circuit geometry already supplies cross ties and support arms. This release improves those parts rather than introducing new contact surfaces. The optional deck-thickness proposal was resolved by retaining the generated faces: adding underside volume near the return/underpasses would require a separate clearance study. Physics source, ball paths, scoring, 120 Hz stepping and CCD are unchanged.

Score, balls and short status share an opaque HTML display. Normal toasts use its status row; pause/game-over keep their persistent labels while confirmations appear inside the dialog. Introduction feedback stays visible when the play HUD is hidden. Pause has a light scrim, focus containment and inert background controls. The music slider is keyboard-operable. Space on ordinary UI buttons no longer launches a ball; focused flipper/launch buttons retain their hold semantics, and simultaneous flippers still work. Large scores and captions wrap/resize instead of being clipped.

The original soundtrack now uses a 16-bar, 108 BPM arrangement of bass, short soft chords, percussion and a sparse motif. Ready/draining use fewer parts. Shorter original flipper, bumper, target and wall transients contrast with launch, route and final cues. BB-8 retains its lower nonverbal beep sprite, cries, warning patterns and procedural fallback. No reference sound recording is used.

Master sound keeps its existing preference. Music has its own bounded preference, default 60% (nominal gain 0.42); 0% preserves effects/droid/rolling. Ordinary vocals duck music about 12.5 dB; urgent cues duck about 18 dB with a 15 ms attack / 120 ms recovery target. The existing source/layer caps and interruption cleanup remain intact. Stable FPV, the rare lost-head rotation, reduced-motion cancellation and absence of radar/camera choices are preserved.

## Verification

- 44 unit/integration tests pass, including new state precedence, score/lives reset, bounded deterministic arrangements and volume/ducking rules.
- Circuit checks pass 63 entry seeds, 18 spin/partial-step variants, 96 ground approaches and two input-only launch-to-circuit returns. Both-side guide sweeps clear all 2,610 valid cases.
- The existing browser gameplay harness passes keyboard launch, both flippers, High/Eco, real collision feedback, pause/blur, context recovery, game over/restart, touch, resize and reduced motion.
- The cabinet browser harness passes 1440 × 900, 844 × 390, 390 × 844, 320 × 568 and 568 × 320: nine-digit scores fit, action targets are at least 44 px, controls do not overlap, native UI-button Space does not launch, modal focus/Tab/Shift+Tab work, and music volume persists. Actual desktop/mobile screenshots were inspected.
- The real Web Audio harness checks desktop classic and mobile circuit. It verifies decoded original beeps, real contact/route events, warning interruption, audible generated signals, bounded bursts, independent music mute, actual music-bus ducking, mix headroom, context interruptions, startup/decode failures and three-ball/restart behavior. Bus calibration holds a quiet ground fixture to prevent a naturally triggered warning from contaminating the unducked comparison.
- Production TypeScript/Vite and the single-file offline build pass. Production has no development inspection hook, and original audio remains embedded.

The 24 matched render-cost samples stay within the design budget: maximum draw-call increase is 4, triangle count decreases in every sample (at least 7,048 fewer), geometry count decreases by at least 5, and texture counts do not increase. These are software-GPU counters, not a physical-device frame-rate claim. Rendering source was unchanged after sampling; later refinements concern UI feedback and keyboard/focus checks.

Evidence: [browser/UI/audio and source hashes](validation/cabinet-arcade.json), [render samples](validation/cabinet-arcade-render-cost.json). Reproduce UI checks with `npm run test:cabinet:browser` and the existing audio/gameplay/circuit/guide commands. `CHROME_PATH` and `CHROME_ARGS` select the local browser configuration.

Chromium signal measurements do not establish perceived soundtrack quality, physical iPhone speaker balance, Silent Mode/Bluetooth routing or screen-reader announcement timing. Those device checks remain a playtest limitation, not an automated pass claim. Music is original synthesis inspired by the reference's event pacing; its continuous music was not verified by listening.
