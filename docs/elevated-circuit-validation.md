# Elevated circuit validation

The optional cabinet is verified against the original deployed table's rules with Node.js 24, Rapier 0.21.0, Three.js 0.186.1 and headless Chromium 153 using software WebGL. The compact evidence is [elevated-circuit.json](validation/elevated-circuit.json). Historical candidate experiments remain [separate](spikes/elevated-circuit-results.json).

| Check | Evidence |
| --- | --- |
| Unit and regression tests | 17 pass: original eight plus swept/ordered gates, wrong-height and lateral crossings, reversal/reset, high-speed completion, weak rollback, underpasses, low-ramp ground clearance, two normal launches, camera sweep/rates and complete flipper-volume clearance |
| Standard physical grid | 63 entries: seven speeds × three offsets × three approach angles; 36 ordered completions followed by contact with a moving right flipper and upward return, 27 safe rollbacks, zero drains/timeouts within a 20-second limit |
| Spin and entry timing | 18 variants with three speeds, three angular velocity vectors, quarter/three-quarter-step entry advances and initial height +0.08; 12 moving-flipper returns and six rollbacks; zero drains/timeouts |
| Low-ramp ground approaches | 96 collision-free starts around both heels, four lateral positions, three lateral velocities, two downhill speeds and two spins; all reach Z=6.5 within 20 seconds, no circuit awards; slowest 11.408 seconds, longest continuous low-speed interval 1.025 seconds; [reported stall and fix](low-ramp-stall-fix.md) |
| Input-only reachability | Two runs charge/release the normal launcher, leave the launch lane, make a left-flipper contact, cross all five gates, award 750 once and return off the moving right flipper; no ball placement during these runs |
| Weak/marginal behavior | The slowest accepted grid trial lasts 12.242 seconds; it is a slow crest crossing, not a persistent stall. No scripted recovery or steering force is used |
| Ground underpasses | Three 0.4-second trajectories match classic within 0.001 units, including an original 100-point bumper contact; no elevated progress or bonus |
| Camera geometry | Actual FPV/Chase envelopes checked against Rapier colliders at landscape and extreme 6:1 aspect ratios; pitch ≤18°, rate ≤30°/s, yaw ≤3.5 rad/s; reduced-motion pitch ≤8° and rate ≤15°/s; pause freezes orientation |
| Classic browser regression | Normal keyboard launch, simultaneous flippers, pause/blur, all four views, high score/restart, High/Eco, impact effects, context recovery, touch, landscape/portrait resize and reduced motion pass with zero browser errors |
| Playable route browser | Normal keyboard launch, simultaneous keys, pause/blur, physical section captures, FPV/Chase horizon and Spin independence, normal-launch traversal, actual final-gate score/toast, three-ball lifecycle, restart, context recovery and mobile simultaneous touch checked |
| Static rendering cost | 15 additional main-pass draw calls and 27,138 triangles in Eco Table view; 114 → 129 calls, 62,584 → 89,722 triangles; below the 25-call design target |
| Resource lifecycle | 130 geometries and 24 textures remain stable over four restarts; route models are built once and own their disposal; pooled effects reset without constructing new tables |
| Presentation | Desktop 1440 × 900 and mobile landscape 844 × 390 screenshots inspected; opening controls, Table view and ground FPV recovery also checked at 390 × 844 for route height, open wire deck, visible guards, tunnel exit, flipper handoff, radar and readable controls |
| Build | TypeScript and Vite production build pass; the existing large-bundle warning remains because the physics runtime is embedded |
| Late spike review | Route boundaries validate before mesh generation; preview resizes only on dimension changes and passes desktop/mobile browser checks; plotter executes; scrubber/readout association and reference-trace generation documented |
| Reviewed spike failure path | A missing Chromium executable exits with status 1 in under one second; the Vite server closes instead of keeping the process alive |

Synthetic entry counts measure containment and contact behavior, not a player's completion percentage. The two launch tests use a deterministic two-button input policy and establish end-to-end reachability at two left-flipper timing thresholds; they do not replace human playtesting. The final return check requires a real contact event while the right flipper is pressed and a subsequent upward velocity.

The reviewed scan/trial spin mismatch is corrected to zero initial spin on both sides. The prototype's speed-12 drain and flipper timeout were late ordinary-playfield outcomes after an unrecognized safe rollback; the classifier now stops at that rollback. The speed-28 airborne return was a real defect and is addressed by the monotone landing and visible lowering cover. The new grid uses the finished geometry and continues successful attempts through a moving flipper contact instead of stopping at the route exit.

## Reproduce

```sh
npm ci
npm test
npm run test:circuit
npm run build
npm run test:browser
npm run test:circuit:browser
node scripts/circuit-capture.cjs
python spikes/elevated-circuit/plot-layout.py --production
```

Browser checks start their own isolated Vite servers. Supply `CHROME_PATH` for an installed WebGL-capable Chromium; additional arguments may be supplied as a JSON array in `CHROME_ARGS`. They write full reports and screenshots under ignored `artifacts/`. Browser checks should run sequentially when using software rendering. The plot command additionally requires matplotlib.

For optional playtesting, start `npm run dev` and choose **Try elevated circuit**, or append `?circuit=1`. The classic opening-screen link returns to the original table. The development inspection hook is stripped from production builds. After an opening-layout-only CSS change, `CIRCUIT_MOBILE_LAYOUT_ONLY=1 npm run test:circuit:browser` runs a focused landscape/portrait capture without replacing the full gameplay report.

Representative phone and desktop frame-time measurements and human FPV motion comfort remain unmeasured. Software WebGL verifies scene output and interactions; it cannot establish a hardware FPS result. Fullscreen and audible playback were not separately verified for this upgrade. The route remains opt-in, and this PR does not deploy itself.
