# Guided ramp near-rest stall

A captured WIRE RAMP shot starting at mouth sample 8 with horizontal entry speed
13.75 remains guided after 120 simulated seconds on main 6083c249. Constant
sign-based rolling resistance repeatedly reverses tiny velocities on shallow
sections, preventing a natural turnaround. This is distinct from the older
low-ramp underside collision defect.

Resistance now tapers linearly below speed 0.5, retaining the existing maximum
1.68 and fixed 120 Hz step. It remains dissipative and continuous at rest;
gravity can drive rollback without a timer, teleport, or recovery impulse.
Tunnel speed, path geometry, scoring, collision restoration and normal-speed
resistance are unchanged.

## Fresh verification

- Three targeted regression shots (LEFT 14.5, WIRE 13.75, SKY 15.375) fail on
  unmodified main and pass with the fix. They check endpoint release, appropriate
  completion/award counts, dynamic-body and collision-group restoration, and
  no lost ball. SKY may finish forward; it must not stall on its shallow section.
- The wire reproduction rolls back after 9.7917 simulated seconds with no award.
- A 480-shot sweep (three ramp mouths, speeds 4.5 through 24.375 in 0.125 steps,
  zero spin, 30-second observation limit) found six pre-fix stalls and none after
  the fix. Longest post-fix guided trial: 12.3333 seconds.
- Production build and both TypeScript checks pass.
- Course, circuit and flipper-guide CLI checks pass.

Local full-suite and browser verification have environment limits: the connected
GitHub file reader could not materialize the 1.43 MB binary voice sprite, so
three audio-asset tests cannot pass in this partial checkout. The system Chromium
process aborts at launch. These are not claimed as passes; remote CI on the exact
PR commit must provide full-checkout verification before merging. Historical
local investigation results are not substituted for current tests.
