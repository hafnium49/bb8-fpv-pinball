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

## Fresh review of commit `198014a`

A second independent review found no new P0/P1/P2 design or math defects. Two P3 evidence corrections were made without changing production code:

- The static estimator left the player ball visible, although both production table update methods hide it outside intro. It now hides the ball for FPV. Both sweeps were rerun against all 52 source-manifest Git blob hashes, which were reverified locally. All 48 rows and both summaries were regenerated. Orbit bridge right90 is now 118 versus 78 forward scene calls (+51.3%); orbit tunnel right90 is 105,796 versus 62,454 submitted triangles (+69.4%). Reference launch remains +6.5% calls and +2.7% triangles. These remain static estimates, not renderer counters or FPS.
- The unexecuted browser harness no longer says Eco/High have different resolution: with this fixture's DPR 1 they both use pixel ratio 1. Actual dimensions are recorded in `renderSize`; quality/postprocessing still differ.

Independent re-review verified both corrections, all 48 regenerated rows, both summaries and the updated README percentages; no additional concrete defect was found.

The connector-fetched math files independently passed all 14 test groups on Node v24.19.0. Additional local seeded checks covered 10,000 normalized sensor quaternions, arbitrary-pose no-jump rebases and the reduced-motion 20-degree pitch bound. This does not exercise browser lifecycle or physical devices. Coordinate conventions were checked against `view.ts`, `route-camera.ts` and the linked W3C specification; the proposed Spin exception matches the existing event/presentation coupling in `head-loss.ts`.

The reviewed input commit's [Verify pinball run](https://github.com/hafnium49/bb8-fpv-pinball/actions/runs/39078308217) completed successfully. That workflow runs application tests, circuit/guides/course checks and build; it does **not** run the isolated look-around math spike. The math result above is a separate local run. Final-commit CI must be checked separately. Browser startup was not retried and no new browser or hardware result is claimed.

## Still open before implementation/release

Design approval is not a release approval. The future coordinator, permission UI, sensor listeners, transition interpolation and input integration have not been implemented or tested. Hardware permission behavior, physical signs in both landscape directions, drift, stationary event cadence, phone-lock/app-switch recovery, two-finger comfort, hand fatigue and sensor-to-display latency remain unmeasured. All-direction clipping/art coverage and actual render performance remain release gates. Follow mode remains the immediately available fallback in the proposal.

Read `docs/phone-look-around.md` for the complete acceptance matrix and explicit opt-in rollout plan.

