# Phone look-around: design proposal

Status: **design and isolated spikes only; not implemented, enabled, or approved for release.**

Baseline: `21cbb73e02adc82285f811d89b1539a6a14b7ec7` (main, 17 October 2026). Independent of fullscreen PR #21 and physics PR #22. No production source, dependency, physics, or deployment changes are part of this proposal.

## Decision

Add optional **Look around** input to the existing stabilized ball-position FPV. Turning the phone turns the view, like a handheld window into the table. The ball continues moving independently. This is a single ordinary perspective render, not stereo, WebXR, or a 360-degree video pipeline.

Default remains **Follow ball**. In Look around, orientation is world-relative after calibration: a collision, reverse, or guided-route corner cannot rotate the player's view. Translation still follows the ball's position and existing clearance. Roll stays zero, yaw can turn through a full circle, pitch is bounded. No overhead/radar view or number-key camera selector returns.

Do not implement “route heading plus phone offset”: a route turn would rotate the view under a stationary phone, contradicting the requested behavior. Do not inherit the rolling ball quaternion. Do not use a compass heading or ask for magnetometer access merely to look around.

### Experience and controls

1. In intro/pause settings, choose **Look around**. Explain: “Turn your phone to look. The ball keeps moving. Hold it comfortably, then enable.” Keep **Follow ball** available without permission or sensors.
2. **Enable phone look** is a separate user-gesture button, not bundled with fullscreen/audio. Pause and cancel any launch charge before opening a permission prompt. Never launch a ball as a prompt closes.
3. After valid readings arrive: “Hold your phone comfortably. Tap Center view.” Center sets the current phone pose to the follow heading and pitch; no prescribed vertical grip is necessary. Calibration takes place while paused/ready, not during a live shot. Preview the stabilized view; explicit Resume/Launch continues play.
4. While enabled, show a compact **Center view** button and **Follow ball** escape in the existing action area, outside both flipper/launch hit regions and safe-area insets. Minimum 44 CSS-pixel targets, visible focus, clear labels, no icon-only controls. Settings name the selected input mode, not a new camera perspective.
5. In-play Center deliberately turns to the *current* follow heading/pitch, taking the current phone pose as neutral. Use a shortest-yaw ease of 200 ms, cancellable by another Center/Follow/pause event; reduced-motion uses an immediate change. This is a deliberate user-requested change, unlike automatic rebasing. Confirm comfort testing before retaining the ease.
6. Follow ball returns to live route-follow orientation with a 200 ms shortest-yaw ease toward the moving shadow target, recomputed each frame from the saved start pose. Unwrap the target around the previous target to avoid branch-cut flips; at progress=1 use that frame’s exact follow target so handoff cannot jump to a newer target. Reduced-motion snaps. Stop sensor listening, invalidate pending permission/calibration requests. No automatically returning to Follow after a collision or timeout.

No fullscreen requirement, forced orientation lock, drag-anywhere gesture, or gesture that steals a flipper finger. Support both landscape directions and portrait. A small “Turn the phone to look” hint appears once per enable, not on every launch. Do not claim permission was granted from stored preferences; do not auto-prompt on load. Persist an optional preference only after explicit selection, but next page load still starts Follow with an enable action.

## Current integration points

- `src/render/route-camera.ts`: `RouteCamera.update` already derives upright heading and bounded pitch from guidance/route/velocity. Keep it running as a **shadow follow target** even while manual look is active; it does not drive manual orientation.
- `src/render/view.ts`: `PinballView.render` currently places the FPV camera above ball position, then looks along `routeCamera.heading/pitch`. Split orientation selection from position/clearance. Preserve FOV 82, near-envelope logic, quality policy, one camera and existing render path. The guided-course branch currently bypasses clearance; all-direction visibility/clipping must be separately verified there before shipping.
- `src/main.ts`: owns lifecycle, `HeadLossCamera`, pause, start, ready/drain/over, captions and input. A small explicit coordinator should combine game lifecycle and look state, rather than adding unrelated booleans in the frame loop. Apply newest sensor sample once before `view.render`.
- `src/ui/play-input.ts`: keep pointer/key ownership unchanged. Look controls do not call flipper holds/releases. Existing orientation/layout callback cancels stale pointer owners and launch charge; preserve that behavior.
- Proposed later implementation files: `src/ui/phone-orientation.ts` (permission/listeners), `src/render/look-around.ts` (pure math/state), and focused tests. These are future integration boundaries, not files added to production by this design.

## State machine

The game lifecycle is orthogonal to look input. Each permission/enable attempt owns a monotonic generation token. Late promise/event callbacks can update state only when their generation still matches. Stop/restart/dispose increments it. Permission state is browser-owned; the following names are application states.

| State | View/input behavior | Events and transitions |
|---|---|---|
| `follow` | Existing FPV; no sensor listeners | Enable pauses safely, increments generation, feature-detects, then `requesting` or `waiting` |
| `requesting` | Frozen preview; permission pending; Cancel available | Granted -> `waiting`; denied/rejected -> `unavailable`; Cancel -> `follow`. Ignore late results after cancellation |
| `waiting` | Listen; preview frozen; need finite alpha/beta/gamma | First valid reading -> `calibrating`; after 3 s without a valid reading -> `unavailable`; Cancel -> `follow` |
| `calibrating` | Follow preview held; sensor samples collected, no live shot | Center captures latest sample (age <=250 ms) and follow target -> `active`; stale sample -> `waiting`; Cancel -> `follow` |
| `active` | Ball translation plus manual yaw/pitch | Center rebases to follow target; Follow -> `follow`; hidden/pause/context loss -> `suspended`; screen change -> short `rebasing`; invalid-stream error -> `suspended`; silence holds orientation without pausing |
| `rebasing` | Hold last rendered heading/pitch; clear old touch owners/charge | On first valid sample after coalesced layout/screen update, rebase to held orientation and reset filters -> previous active state; timeout -> `suspended` |
| `suspended` | Freeze orientation; preserve selected Look preference; detach listening while hidden | On visible explicit Resume, attach and acquire fresh readings; rebase to held orientation before simulation resumes. No valid stream within 3 s -> `unavailable`. Follow is always an escape |
| `unavailable` | Game stays paused/ready; explanation and Follow available | Explicit Retry creates a new generation and repeats acquisition; Follow -> `follow`. Never loop permission prompts |

A sample older than 1 s must not be extrapolated. Hold the last displayed orientation, but **do not pause on event silence alone**: browsers can suppress unchanged readings on a stationary phone. On the next valid event after a >1 s gap, rebase to the held displayed orientation once and reset filters; motion during the unobserved gap is intentionally discarded. Repeated invalid readings (three or more spanning 1 s), an explicit permission/revocation error, or acquisition failure during Resume enters `suspended` and pauses once with “Phone look paused. Resume or Follow ball.” Duplicate finite samples are valid. Normal stationary use must not trigger a warning or pause. This policy favors continuity over trying to infer missing motion; tests must expose that tradeoff and verify recovery on real devices.

On a pause, setting the phone down does not move the camera. Resume accepts fresh pose as the held orientation, not the old sensor reference. When the next ball becomes ready or a new game begins, reset preview to the launch follow target, then require fresh calibration before launch if Look remains selected. Draining/over suspend look; intro retains existing cinematic view. No permission requests or calibration UI obscure the active ball.

Lifecycle interruption is global: hidden/pagehide, graphics loss, or an external pause cancels/increments the acquisition generation in `requesting`, `waiting`, `calibrating`, `rebasing` and `active`, clears timers/listeners and enters `suspended`. The deliberate pre-enable pause occurs before the new acquisition generation starts. A permission promise settling while hidden is ignored; visible Resume starts a new generation and freshly checks/acquires capability without assuming permission was retained. No callback attaches listeners while hidden. Intro/over and disposal cancel every generation; disposal cannot resume.

For screen changes, record an arrival sequence at the event boundary, coalesce screen/layout notifications through the next animation frame, and accept only a sample received after that boundary with the newly read angle. Hold until that sample arrives; no cached sample is relabeled fresh. A sample-age check uses local monotonic arrival time, not incomparable browser timestamps. These ordering rules are required even though screen-angle compensation alone does not rotate the zero-roll optical ray.

Ordering: lifecycle suspension wins over Center/enable; Follow wins over any late sensor callback; screen-change rebase holds orientation before resize; manual look owns stabilized orientation; head-loss presentation is handled separately below. Rebase and filter reset are atomic on a render boundary.

## Coordinates and calibration contract

Use normalized quaternions with right-handed rotations and column-vector application; `A * B` applies B first. Device coordinates D use x right, y top, z out of the screen in natural device orientation. Construct sensor orientation `qD = Rz(alpha) * Rx(beta) * Ry(gamma)`, angles in radians. Map sensor reference up to game +Y with `G = Rx(-pi/2)`. Screen correction is a local rotation: `qScreen = G * qD * Rz(-screenAngle)`. Game forward is -Z; extract `f = qScreen * (0,0,-1)`.

Get `screen.orientation.angle` where available; otherwise use finite legacy `window.orientation`, normalized modulo 360. Do not guess orientation from viewport aspect or assume natural orientation is always portrait. No angle API: use zero for the roll-free forward ray, whose direction is unchanged by the local screen-Z correction, and explicitly gate any future roll-sensitive behavior. Screen changes still require input cleanup/rebase.

Compute raw yaw `atan2(f.x, -f.z)` and raw pitch `asin(clamp(f.y,-1,1))`. Unwrap yaw using `atan2(sin(delta),cos(delta))`, never interpolate alpha/beta/gamma independently. Derive yaw from the forward vector, not alpha alone. If horizontal forward length falls below 0.05, hold the last valid yaw; exit only at 0.08 or above (hysteresis). On leaving that cone, rebase the yaw offset to preserve the held displayed yaw before allowing new deltas. Reject calibration inside that cone and ask the user to tilt the phone slightly. Thus pointing directly at the floor/ceiling cannot cause a 180-degree jump.

At calibration, save raw unwrapped yaw/pitch `(ys, ps)` and intended displayed heading/pitch `(yc, pc)`. While active:

- heading = `yc + (currentRawYaw - ys)`
- pitch = `clamp(pc + currentRawPitch - ps, -45 degrees, +45 degrees)`
- forward = `(sin(heading)*cos(pitch), sin(pitch), -cos(heading)*cos(pitch))`
- use game up `(0,1,0)` and look along forward; never apply sensor roll

This gravity-aligned yaw/pitch offset intentionally avoids `q0^-1 * qCurrent` as the camera delta. An unrestricted calibration quaternion tilts the player's yaw axis when they calibrate holding the phone at an angle. Quaternion conversion still handles arbitrary device orientation without Euler-angle subtraction.

Rebase without visual motion means replace `(ys,ps)` with the new fresh reading and `(yc,pc)` with **last rendered** heading/pitch, then reset interpolation. Explicit Center instead uses the shadow follow target. Screen changes freeze then rebase once per coalesced change; asynchronous screen/sensor event order must not apply stale samples. The optional 200 ms Center transition rebases to its final displayed target only if the latest sample is <=250 ms old and outside the pole zone. Otherwise hold the final view, pause and enter calibration acquisition, without resuming simulation until a valid sample exists. Follow transitions need no sensor sample and end with live route-follow ownership. New Center/Follow/pause commands cancel the old transition token, preventing a stale completion from changing mode. This discards motion during Center intentionally and avoids a second jump.

Initial tuning: 1:1 angular response, no gain/dead-zone/prediction, no artificial yaw rate cap. Optional exponential smoothing has a 25 ms time constant, clamped dt and shortest-angle yaw; measure its impact before enabling by default. Do not smooth roll or sensor Euler components. Smoothing is reset on lifecycle/rebase, never blended across background gaps. A reduced-motion profile retains deliberate phone control if explicitly enabled, disables automatic transition ease and lost-head camera spin, and starts with pitch limited to ±20 degrees. These are proposed tuning values, not established comfort thresholds.

## Lost-head / Spin decision

Preserve the rare lost-head gameplay event, sound and caption. While Look around is selected (including temporary suspension), **suppress only the ball-quaternion camera takeover**. The player keeps the manual, horizon-level view through the event. Follow mode retains existing Spin behavior subject to reduced-motion preferences.

Do not merely pass `reducedMotion=true` to `HeadLossCamera`: that currently cancels the event itself. Later implementation must separate event timing from camera presentation, retaining one random draw per launch, current duration and announcement rules. If Follow is selected during an already-active lost-head event, suppress takeover for the remainder of that event to avoid unexpectedly entering Spin mid-event. A later event may spin normally. Enabling Look during Spin first pauses/cancels the existing presentation through the current pause flow, then calibrates from stable follow. This is a proposed comfort exception to the existing Spin camera concept, explicitly reviewable before implementation.

## Permission, privacy and fallback

HTTPS and feature detection, not browser-name detection. On the explicit enable gesture, if `DeviceOrientationEvent.requestPermission` exists, call it directly before unrelated awaits. Request relative orientation only; no absolute/magnetometer request, location, camera or microphone permission. Otherwise register the event listener and wait for usable readings. A visible constructor does not prove working hardware. Catch throws, rejection, denial, policy restrictions, null readings, embedded-webview limitations and revocation via stream failure.

Sensor data stays in memory on the device. No raw orientation storage, analytics, uploads or heading logs in production. Remove listeners/timers on disable/dispose, detach hidden acquisition, and avoid starting any sensor listener until the user enables the feature. No new iframe permission grants or header changes silently accompany this feature.

Fallback: Follow is fully playable without sensors. Also offer an optional **manual look pad** in pause settings: a dedicated small pad, not the whole playfield, with pointer capture independent of flipper pointers; horizontal movement changes yaw, vertical changes bounded pitch. An accessible set of labeled look-left/right/up/down buttons and Center uses the same controller; keyboard I/J/K/L controls only this mode, never A/D, arrows, Space, Escape or number keys. Ignore editable elements, retain focus semantics, release holds on blur/cancel/pause, and test simultaneous flippers. This pad is a later fallback increment, not a prerequisite for shipping basic opt-in sensor look plus Follow. Sensor-denied users always retain Follow immediately.

## Rendering and performance

One perspective camera and existing scene/post path remain. No cubemap, extra scene render, panoramic texture, stereo, extra shadow pass, FOV expansion or physics step is needed. The same objects may cost more when looking behind/up: draw-call counts, fragments, transparency and shader warmup depend on direction. A near-zero math cost does **not** prove a near-zero rendering cost.

Proposed budgets: sensor handler only validates/stores latest sample, zero scene work; orientation update p95 <0.2 ms on target phones; no steady-state allocation in production update; event-receipt-to-application age p95 <50 ms (local monotonic receipt time; excludes unknown hardware sampling latency and motion-to-photon); p95 frame interval no more than 10% worse than matched follow view at fixed quality and replay, with existing adaptive quality still active in separate soak runs. 60 Hz target remains 16.7 ms, not a promise. Measure motion-to-photon separately with high-speed video if needed. No prediction to mask latency in v1.

A directional sweep spike is diagnostic, not an iPhone benchmark. Record baseline SHA, browser/renderer, viewport/DPR/quality, scene/ball pose, yaw/pitch, calls/triangles, warm/cold distinction and CPU submission timing. Do not label software-renderer frame timing as hardware GPU performance. Physical tests must cover both directions of the guided course, upward cabinet/market views, clipping behind walls, shadows, transparency, blank/backface surfaces and first-turn shader hitch. Keep geometry/art fixes separate if full-circle inspection exposes them.

## Acceptance gates and rollout

1. Pure tests: known device cardinal poses, both landscape angles, screen changes with no visual jump, alpha wrap, tilted calibration, pole entry/exit, pitch bounds, repeated Center, q/-q equivalence if quaternions are interpolated, and independence from ball rotation/velocity/guidance. Executable design spike covers the mathematical subset; it is not a production controller.
2. Coordinator tests: grant/deny/throw/absence/null data, late grant after Cancel, repeated enable, silence-without-false-pause/recovery, invalid-stream suspension, hidden/visible, restart/three-ball lifecycle, lost-head with manual selection, manual->Follow mid-event, context loss, and all transition priorities.
3. Browser integration: synthetic orientation only validates plumbing, not physical signs or permissions. Test true/simulated denied branches, screen events in both orders, portrait/landscape, audio/fullscreen separate gestures, focused buttons, simultaneous left/right holds, launch-charge cancellation and modal focus trap.
4. Real hardware release gate: record actual device/OS/browser versions for iPhone Safari tab and standalone, Android Chrome, both landscape directions, portrait and lock/unlock; cold permission grant, denial/retry, comfortable tilted grip, continuous full turn, natural-world clockwise turn, no-roll tilt, two-finger flippers, one-minute stationary hold, app-switch/resume and a five-minute drift/thermal session. At least one lower-tier phone. No physical measurements have been made by this design task.
5. Comfort/playability: explicitly verify keeping the ball's travel direction out of sight is understandable; assess loss of situational awareness and hand fatigue. Center/Follow must remain reachable. Do not add radar to solve this. Collect whether ±45 pitch and transition ease are comfortable, then choose final tuning.
6. Later implementation behind an opt-in development flag; no default-on rollout. Run repository `npm ci`, `npm test`, circuit/guides/course checks, `npm run build`, relevant browser suites and the above sensor/device gates. Design approval is separate from implementation approval; merge/deploy is a separate action.

## Sources and evidence limits

Checked 17 October 2026. The [W3C Device Orientation and Motion draft](https://www.w3.org/TR/orientation-event/) specifies natural device axes, intrinsic Z-X-Y angles, secure-context and permission behavior. Relative readings can use an implementation-defined reference; no cross-browser compass stability is assumed. The conversion and calibration choices above are this proposal, tested synthetically rather than copied implementation guarantees.

The [W3C Screen Orientation draft](https://www.w3.org/TR/screen-orientation/) defines orientation angle and change events; locking has platform preconditions and is deliberately unnecessary here. [WebKit's permission discussion](https://bugs.webkit.org/show_bug.cgi?id=201676) documents the user-interaction permission requirement; it is historical implementation evidence, not a current device compatibility matrix. [Apple's WKUIDelegate API](https://developer.apple.com/documentation/webkit/wkuidelegate/webview(_:requestdeviceorientationandmotionpermissionfor:initiatedbyframe:decisionhandler:)) also makes embedded-host permission handling relevant. Actual supported versions require the release-device matrix, not inference from these documents.

See `spikes/look-around/` for executable experiments, their raw output and exact run instructions. Those experiments do not exercise a physical sensor, permission sheet, touch comfort, drift or motion-to-photon latency. Review record and final run results are in `docs/phone-look-around-validation.md`.
