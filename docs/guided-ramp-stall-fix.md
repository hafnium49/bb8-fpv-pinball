# Guided ramp near-rest stalls

A captured WIRE RAMP shot starting at mouth sample 8 with horizontal entry speed
13.75 remains guided after 120 simulated seconds on main 6083c249. Constant
sign-based rolling resistance repeatedly reverses tiny velocities on shallow
sections, preventing a natural turnaround. This is distinct from the older
low-ramp underside collision defect.

Resistance now tapers linearly below speed 0.5, retaining the existing maximum
1.68 and fixed 120 Hz step. It remains dissipative and continuous at rest;
gravity can drive rollback without a timer, teleport, or recovery impulse.
Tunnel speed, scoring and collision restoration are unchanged.

## Review correction: rounded flat crests

Independent review found narrow speed bands missed by the initial 0.125-step
sweep: LEFT 14.65 and WIRE 13.82 could settle on perfectly level crest segments.
Both defects also existed on the original main. Damping alone cannot move a
resting ball along a genuinely level track.

Six rounded coordinates in the shared course data now describe two quadratic
sides meeting at an existing sampled apex, instead of a level plateau. LEFT
uses apex sample 211 at reference z=151.825, joining unchanged samples 209 and
214. WIRE uses apex sample 185 at z=185.965, joining unchanged samples 184 and
187. Each side is z=z_apex+(z_endpoint-z_apex)*((i-i_apex)/(i_endpoint-i_apex))^2.
The largest change is 0.01945 reference pixels (under 0.000545 world units).
Physics and rendering consume the same corrected coordinates. No artificial
force, minimum speed, timeout, or completion award is introduced.

## Verification

Five regression shots cover all three ramps and both previously level crests.
They require natural endpoint release, appropriate completion/award counts,
dynamic-body and collision-group restoration, and no lost ball. A structural
regression rejects constant-z ramp segments. The original wire reproduction
rolls back in approximately 9.79 simulated seconds with no completion award.
A slow crest traversal may take over 30 seconds while advancing; the regression
allows 45 seconds rather than treating every slow traversal as a permanent stall.

The final verification report and exact-commit CI status are recorded in the PR.
Local browser checks were blocked at startup by executor restrictions, and the
connected file reader could not materialize the 1.43 MB binary voice sprite for
three audio-asset tests. Those are not presented as local passes. Full-checkout
CI must verify the published commit before merging. Historical investigation
results are not substituted for current tests.
