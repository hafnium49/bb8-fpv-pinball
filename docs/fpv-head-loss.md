# FPV and the lost-head reaction

FPV is the only player camera. The camera chooser, number-key camera shortcuts, Table and Chase render branches are removed. The overhead radar is also removed in every state, including the lost-head reaction. The opening screen retains its cabinet view. The launch controls use the space freed by the chooser.

Each launch makes one random draw with a **1/20 probability**. A selected ball waits until its centre leaves the launcher (`x < 4.4`), then follows the actual ball quaternion for **three simulated seconds**. Stable FPV resumes automatically. The probability does not depend on frame rate, collisions or how long a ball survives. There is at most one episode per launch.

The caption is **Oh no, BB-8 lost its head!** BB-8 emits the existing original, nonverbal `ouch` cry; the English line is a caption interpretation. Clip-decoding failure uses a procedural electronic scream. Flipper advice has priority 100 and interrupts the reaction at priority 85. The caption remains available with sound muted and follows the spin's simulation-time lifetime even during rendering stalls.

Pause, blur, drain, game over, restart and a reset of simulation time cancel pending/active episodes. A live reduced-motion preference disables the roll and restores stable FPV on the next frame if changed mid-episode. It also clears active impact particles, rings and score popups, marking the particle buffer for upload. Resuming or turning reduced motion off does not resurrect an old episode or effect.

## Verification

`tests/head-loss.test.ts` exercises the exact five-percent boundary, one draw despite repeated frames, delayed lane exit, three-second recovery, no repeated episode on the same ball, pause/drain/restart and reduced motion. Existing tests preserve fixed 120 Hz physics, ball CCD, FPV clearance/pitch and all guide/circuit shots.

The audio/browser harness selects episodes deterministically through the development hook, checks the real rolled camera matrix and nonverbal audio cue, then lets live physics advance until automatic FPV recovery. Poses are held for rendered screenshots; the caption remains visible after 3.2 wall seconds with simulation time held. It also checks removed controls/shortcuts, pause, live motion-preference changes, clearing already-active visual effects and flipper-warning precedence in desktop classic and mobile circuit views. Other browser harnesses now check FPV routes and controls. The production build removes the development hook.

The [validation record](validation/fpv-head-loss.json) records source hashes, inspected screenshots and actual checks. Production and offline builds embed the same original beep sprite; no new audio download or speech service is needed.

Browser checks use Chromium with software WebGL and mobile touch emulation. Physical iPhone Safari, performance, human spin comfort and screen-reader announcement timing are unverified.
