# Look-around design validation

Baseline: main `21cbb73e02adc82285f811d89b1539a6a14b7ec7`.
Scope: design, dependency-free math experiment, static directional-workload experiment and an unexecuted browser measurement harness. No production feature or dependency change.

## Checks actually run

- `node spikes/look-around/math/test-lookaround.mjs`: **14 test groups pass**, independently rerun during design review. Raw machine-readable output: `spikes/look-around/math/evidence.json`.
- Coordinate tests include independent expanded Euler oracle, physical cardinal/landscape poses, multi-turn unwrap, tilted-grip calibration, rejection of unrestricted inverse-quaternion calibration, pitch clamp/zero roll, pole hold and continuous exit, nonzero follow-target Center, resume/screen rebasing, repeated Center and invalid readings.
- Node math microbenchmark is included in that output. It measures this allocating experiment in a cloud Node process, not the future allocation-free production controller, browser frame cost, hardware sensor delay or mobile comfort. Timing varies per run.
- The directional geometry/frustum sweep uses verified main scene source. Its counts are **estimates**, not actual GPU or renderer counters. See `spikes/look-around/render/README.md` and its evidence for scene coverage and deltas.
- Chromium failed before app startup because the executor could not create the required socket. The supported escalation attempt also failed during environment setup. Consequently the browser harness has **not run successfully**; no frame, GPU, CPU submission, screenshot or physical-device result is claimed.
- No full application test/build result is inferred from isolated experiments. Existing repository CI is a separate check of the final commit. No visible production UI changed, and no gameplay screenshots were fabricated.

## Independent review and resolution

An independent design reviewer found no P0/P1 defects and independently passed all 14 math groups. Four P2 clarifications were resolved in the design before delivery:

1. Global lifecycle suspension now invalidates generations and removes listeners/timers during permission requests, acquisition, calibration and rebasing as well as active control. Hidden late grants cannot start listeners.
2. Center's transition completion requires a fresh non-pole reading; otherwise the displayed view is held and calibration reacquired while paused. Cancellation invalidates transition callbacks.
3. Follow easing tracks the moving shadow-follow target and transfers ownership using that frame's target, avoiding a stale-target handoff jump.
4. The performance budget is explicitly event-receipt-to-application age. It makes no claim about unknown sensor acquisition time or motion-to-photon latency.

Additional iterative fixes: stationary event silence does not automatically pause play; first recovery rebases. Pole exit discards unobservable yaw and stays continuous. Calibration at a pole is rejected. These are deliberate continuity tradeoffs and need real-device validation.

## Still open before implementation/release

Design approval is not a release approval. The future coordinator, permission UI, sensor listeners, transition interpolation and input integration have not been implemented or tested. Hardware permission behavior, physical signs in both landscape directions, drift, stationary event cadence, phone-lock/app-switch recovery, two-finger comfort, hand fatigue and sensor-to-display latency remain unmeasured. All-direction clipping/art coverage and actual render performance remain release gates. Follow mode remains the immediately available fallback in the proposal.

Read `docs/phone-look-around.md` for the complete acceptance matrix and explicit opt-in rollout plan.
