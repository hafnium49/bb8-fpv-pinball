# Low-ramp ground-ball stall

The 6 October 2026 report showed a ground-height ball beside the left ascent, with the circuit inactive. The low ramp's open underside narrowed toward the playfield: a ball entering from a higher underpass or the side could be caught between the deck and board. The original underpass checks covered higher sections and missed this closing gap.

A diagnostic placement in the left gap stayed at approximately `(-3.059, 0.303, 1.040)` for 15 simulated seconds. This placement diagnoses the trapped state; it does not establish its arrival trajectory. A separate collision-free approach beneath the right return reproduces the same class of defect: start `(2.8, 0.31, 1.8)`, velocity `(2, 0, 0.5)`, zero spin. Before the fix it slept at `(3.240, 0.274, 4.778)`, without flipper contact. The new regression uses valid incoming approaches rather than placing balls inside the closed heel.

## Physical fix

Both low ramp heels now have visible skirts down to the playfield and a diagonal rear deflector. Ground balls move sideways around the inaccessible narrowing gap. The side endpoints differ by 1.1 units along the route, so the rear face does not oppose downhill gravity squarely. The shorter side reaches ball-centre height 1.15; taller underpasses remain open. Skirt normals face outward, which matters for Rapier's internal-edge contact correction. Their tops sit 0.012 below the contact deck and their bases meet the board.

The same typed geometry feeds Rapier and the existing rendered deck batch. The four static route colliders are retained. No timer, teleport, recovery impulse, scoring exception, or change to the launcher, flippers, gravity or 120 Hz CCD simulation is introduced.

## Regression coverage

`npm test` includes the previously failing valid return-ramp approach and a spinning left-ramp approach. `npm run test:circuit` adds 96 collision-free ground approaches: two ramps, four lateral positions, three lateral velocities, two downhill velocities and two spins. All reach the playable flipper region within the 20-second limit, with no circuit awards; the slowest takes 11.408 seconds. The harness stops at Z=6.5, before resting flipper pivots, where the player's buttons take over. This is a ramp-clearance test rather than a promise of unattended play for an entire ball.

The original 63 circuit entries, 18 spin/partial-step variants, two normal-launch traversals, camera collision tests and full flipper clearance still pass. Desktop and mobile browser checks exercise the ground approaches in the browser's Rapier runtime, with portrait Table and ground FPV captures added for the reported phone layout. See [the current validation](elevated-circuit-validation.md) and [compact evidence](validation/elevated-circuit.json).

Refresh the deployed page to load the new collision geometry; a running page retains its already-loaded simulation. Physical-phone performance and human FPV comfort remain separate playtest requirements.
