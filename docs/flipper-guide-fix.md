# Flipper guide trap fix

The reported radar position is immediately above the right hinge. A slow ball could settle between the detached guide end at `(3.65, 6.95)` and the square flipper end at `(3.2, 7.35)`. Their opposing contact normals supported the ball against the table's drainward gravity. The same geometry trapped arrivals at the left hinge.

Before the change, a valid arrival at `(2.7, .305, 6.5)` with velocity `(1.5, 0, .5)` settled at `(3.244, .280, 6.898)`. Mirroring the arrival settled at `(-3.268, .280, 6.914)`. A separate initial diagnostic found 25 stalls among 486 nonoverlapping arrivals around the hinges. These diagnostic inputs differ from the broader final sweep.

## Geometry

Six short fixed rail segments join both inlane guides to the flipper hinges and the upper/lower guide heads to the adjacent wall or launch divider. The existing long rail angles are retained. The right upper guide's start moves from `z=4.5` to `z=5.5` along its original slope, with a longer lead-in that leaves room outside the descending ramp heel. This removes an additional pinch point exposed while testing the guide connections.

Physics, table rendering and radar consume the same `rails` definition. The change adds six fixed rail colliders and eighteen rail meshes. Ball CCD, 120 Hz stepping, flipper tuning, scoring and camera behavior are unchanged. A held flipper may still cradle a ball; releasing it must free the ball through ordinary contacts.

## Verification

- `npm ci`, all **36 unit tests**, the TypeScript/production build and standalone HTML generation pass.
- The guide sweep attempts 2,196 cases per table. **1,431 classic and 1,179 circuit arrivals are valid, and all 2,610 clear.** Of 4,392 attempted seeds, 1,719 overlap a collider and 63 are wholly inside a closed ramp heel. Those are excluded rather than counted as playable arrivals.
- The sweep covers both sides, upper/lower heads, hinges, drainward speeds of `.5`, `3`, `8` and stress speeds up to `24`, opposite lateral directions, two spin variants and released/held/released/pulsed controls. A trap means at least two continuous seconds below `.12` speed after release. Valid cases clear in at most **4.034 simulated seconds**, with at most **.100 seconds** continuously quiet.
- The circuit harness retains **63 ramp entries, 18 spin/partial-step variants, 96 outside-to-ramp ground approaches and both original input-only launch/left-flip/circuit/right-return timings**. The latter still award exactly one circuit and return off the right flipper.
- Browser checks run live arrivals and actual keyboard/touch launches in desktop classic and mobile landscape circuit views. Table and close hinge screenshots are inspected. The separate audio/browser suite checks simultaneous touch flippers, pause/blur, nonverbal sound cues and all three balls through restart.
- The production bundle and offline HTML both embed the unchanged nonverbal beep sprite, and the production bundle strips the development hook.

The compact [validation record](validation/flipper-guides.json) includes source and screenshot hashes. CI runs the new guide sweep alongside unit and circuit tests.

The sweep seeds synthetic arrivals; it is bounded coverage, not proof against every possible trajectory. Browser checks use Chromium with software WebGL and emulated mobile touch. Physical iPhone Safari, frame-rate performance and human shot timing remain unverified.
