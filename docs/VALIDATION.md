# Orbital arcade visual upgrade validation

Verified on 2026-10-04 with Node.js 24 and headless Chromium 153 using software WebGL.

| Check | Result |
| --- | --- |
| Physics unit tests | 8 passed: stationary ready ball, launch-lane exit, high-speed collision detection, bumper score/rebound, flipper return, three-ball lifecycle, pause and fixed-step consistency |
| TypeScript and production build | Passed; Vite still reports the existing large bundle warning from the embedded physics runtime |
| Desktop browser, 1440 × 900 | Keyboard launch and simultaneous flippers, pause, blur releasing controls, all four cameras, stabilized FPV independent of ball rotation, game over, best score and restart passed |
| High / Eco graphics | Both render successfully; Eco disables shadows and uses fewer draw calls |
| Impact effects | A real bumper contact awards 100 points and creates a score popup, sparks and a light ring; restarting clears the effect pool |
| Touch browser, 844 × 390 and 390 × 844 | Eco default, simultaneous touch flippers, release and both responsive layouts passed with no horizontal overflow |
| Reduced motion | Decorative effects are suppressed when the reduced-motion preference is active |
| Graphics recovery | A real WebGL context loss pauses the game; restoring the context rebuilds the reflection environment and allows resume |
| Bundled offline production | Boots from a local HTML file; High / Eco switching, keyboard launch and pause / resume pass with zero external requests, zero browser errors and no development inspection hook |
| Browser errors | Zero JavaScript or console errors in the final browser regression check |
| Visual inspection | Desktop intro, FPV, Table, Chase, High / Eco, impact effects, mobile landscape and portrait screenshots inspected; bloom adjusted to preserve playfield contrast |

Run `npm test`, `npm run build` and `npm run test:browser` to reproduce the checks. Browser QA writes screenshots and a report to the ignored `artifacts/` directory. The diagnostic simulation hook exists only in development builds. The recovery check and final score-label placement were also checked separately after the full browser regression run.

The render changes leave the shared table dimensions and the 120 Hz simulation unchanged. Artwork and score effects are generated locally. Particle, ring and score pools have bounded capacity. High caps pixel density at 1.5; Eco caps it at 1 and skips bloom and shadow rendering.

Software WebGL verifies rendering and interactions, but does not establish a frame rate on physical phones or arcade hardware. Human playtesting is still needed to tune FPV turning and flipper timing. Fullscreen and audible sound playback were not separately verified during this visual upgrade.

GitHub Actions runs the physics tests and production build, then publishes `dist/` to GitHub Pages after a push to `main`. The repository's Pages source is GitHub Actions.
