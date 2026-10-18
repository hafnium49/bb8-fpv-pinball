# Look-around coordinate experiment

This is an isolated dependency-free Node experiment. It does not modify the game or implement production camera, permissions, sensor subscriptions, UI, smoothing, or lifecycle handling.

Run from this directory:

```sh
node test-lookaround.mjs
node test-lookaround.mjs > evidence.json
```

The process exits nonzero on failed assertions, and prints machine-readable evidence on success. Timing varies by machine/run; test outcomes and benchmark checksum are reproducible. No npm install is needed.

## Frames and conventions

- Device D: x right, y toward screen top, z out of screen. Angles arrive in degrees.
- Sensor reference has Z up. Use active column-vector rotation `Rz(alpha) Rx(beta) Ry(gamma)`.
- Transform into game coordinates with `Rx(-pi/2)` on the left.
- Correct screen orientation with `Rz(-screenAngle)` on the right.
- Quaternion storage is `[x,y,z,w]`. Optical direction is rotated local `[0,0,-1]`.
- World heading is `atan2(f.x,-f.z)`; pitch is `asin(f.y)`.
- Rightward heading is positive. For a conventional active quaternion, construct zero-roll output as `Ry(-heading) Rx(pitch)`.

Screen-angle correction rotates around the optical axis and therefore cannot change optical forward. Physical device roll and screen-angle event changes are different operations. Tests cover both. A beta=90 portrait phone looks horizontally forward; a beta=0 face-up phone looks straight down, where yaw is undefined.

## Calibration and continuity

Calibration saves independent yaw and pitch offsets in the gravity-aligned game frame. It does not use unrestricted `inverse(q0) * q`, which turns yaw about gravity into spurious pitch after tilted calibration. A regression example demonstrates over 20 degrees of erroneous pitch in that rejected approach.

Yaw is unwrapped and never clamped. Successive accepted heading deltas must be less than 180 degrees; missed turns cannot be inferred. Pitch output clamps to ±45 degrees by default. Output roll is always zero.

Near the optical vertical, yaw is held with hysteresis: enter below horizontal projection 0.05; exit at 0.08 or above. These are experiment parameters, not validated UX settings. Motion around gravity at an exact pole cannot be recovered from optical direction alone. On the first sample exiting the pole zone, keep the held unwrapped heading and reset the wrapped reference. This deliberately discards the unobservable heading change, avoiding a 180-degree flip even when emerging facing the opposite way. Subsequent samples apply normal yaw deltas.

`recenter(sample, screenAngle, {heading, pitch})` calibrates to a specified shadow follow target in radians. The default target is zero yaw/pitch. Explicit calibration inside the pole zone rejects with RangeError; if already pole-held, it remains rejected until the exit threshold is reached. The caller should ask the user to tilt slightly. This spike immediately sets the target; deliberate UI easing belongs to future integration. `rebase(sample, screenAngle)` preserves the last displayed yaw and pitch while adopting fresh sensor references. It preserves displayed pitch including its clamp, so there is no hidden overshoot after a rebase. Call rebase once on the first fresh valid sensor sample after resume or orientation transition. Do not repeatedly rebase normal samples, which would freeze motion. Future integration must reject stale/out-of-order events and gate permissions/lifecycle; those are outside this math experiment. Startup at a pole has no observable heading and calibration is rejected.

## Evidence scope

Tests cover cardinal physical examples, an independent expanded Euler forward-vector oracle across thousands of angle combinations, physical ±90-degree landscape rolls, screen-angle invariance, multi-turn alpha wrap, tilted calibration and gravity yaw, rejected inverse-quaternion calibration, pitch clamps, pole hold/hysteresis and opposite-heading continuous exit, pole calibration rejection, nonzero shadow-follow target calibration, screen-angle/restart rebasing, repeated recenter and invalid input.

The microbenchmark measures CPU-only coordinate updates in Node after warmup. It is not browser, smartphone, rendering, sensor-frequency, input-to-photon latency, battery, or thermal evidence. Runtime and measured elapsed time appear in evidence JSON. Device testing is still necessary.
