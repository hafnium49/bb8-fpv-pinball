# Phone look-around implementation

An optional experiment at `https://hafnium49.github.io/bb8-fpv-pinball/?look=1`.
Normal URLs keep the existing Follow ball experience and attach no sensor listeners.
Even with the flag, Follow remains selected until the player explicitly enables phone look.

## Play

1. Open the opt-in URL, choose **Look around · experimental**, then **Enable phone look**.
2. Grant motion access if the browser asks. The game is paused and any launch charge is canceled.
3. Hold the phone comfortably and tap **Center view**, then explicitly resume.
4. Turn the phone to look independently of the ball. **Center view** and **Follow ball** remain available above the playfield controls.
5. Pausing, switching apps or losing graphics freezes the view. Explicit Resume acquires fresh readings and rebases before play continues. Each new ball needs fresh Center calibration.

Uses relative orientation only, in memory. No sensor recording/upload, compass request, orientation lock, fullscreen prerequisite or new permission grants. Denied or unavailable sensors retain playable Follow.

## Implementation and review

- Source baseline: main `21cbb73e02adc82285f811d89b1539a6a14b7ec7`.
- Independent from fullscreen PR #21 and bumper geometry PR #22; neither is included.
- Pure forward-vector math and a generation-safe permission/lifecycle controller keep sensor processing separate from ball simulation.
- The existing route camera continues as a shadow target. Manual orientation controls yaw/pitch only; ball translation and swept near-plane clearance remain in the single render path. Guided manual views also use the clearance sweep.
- Lost-head event duration, sound/caption and one random draw per launch are retained in Look; ball-quaternion takeover is suppressed for the whole event, including a mid-event return to Follow.
- Review corrected drain suspension accidentally pausing the next-ball timer, reduced-motion Look-to-Follow event truncation, hidden controls in the modal focus cycle, focus restoration after live Follow, and portrait controls being obscured by the HUD. Header-size observation now keeps these controls below the HUD; calibration returns focus to the explicit Resume action.
- The optional manual look pad is intentionally deferred, as allowed in the reviewed design. Follow is the sensor-free fallback.

## Evidence and limits

Local `npm ci --cache /tmp/pinball-npm-cache` succeeded. Local validation passed 174 unit tests, TypeScript, fidelity typecheck, production build and circuit/guides/course checks. Final-head browser results, independent review and workflow links are maintained in [PR #23](https://github.com/hafnium49/bb8-fpv-pinball/pull/23).

The browser suite runs Chromium and Linux WebKit with synthetic permission and orientation fixtures. It tests real app rendering, controls, lifecycle and screenshots, not real iPhone permission sheets or physical sensor signs. The local browser could not create its required socket, so successful browser evidence must come from GitHub Actions.

No physical iPhone/Android measurements have been made. Sensor latency, real permission behavior, natural-turn signs, long-session drift/thermal behavior and comfort remain unverified. The `?look=1` flag and explicit enable are retained for that reason. Software-renderer directional counters/timings are diagnostics, not phone GPU performance claims.

## Follow-up: late review edge cases

After the initial deployment, two review findings were reproduced with failing
regressions and corrected on top of deployed commit `c49b30b`:

- Denial, permission exceptions and acquisition failures remain unavailable across
  New Game, pause and Resume, preserving the original explanation. Only explicit
  Retry begins a new permission/acquisition attempt. Restart cancels a pending
  permission generation, so a late grant cannot attach listeners. Interrupted
  initial setup and new-ball setup still require Center before play.
- A runtime reduced-motion change clamps the held/transition pitch immediately,
  even when a stationary browser emits no new sensor events. The pitch reference
  is reanchored so the next unchanged sample, or later widening the pitch range,
  does not reveal a stale clipped offset.

The updated local suite passes 183 tests (35 focused math/controller tests), both
typechecks and production build. Browser regressions exercise real UI restart,
Retry and permission races, plus runtime media-preference changes without fresh
sensor input. Physical-device limitations above remain unchanged.
