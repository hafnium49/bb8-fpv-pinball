# Prototype validation

Verified on 2026-10-04 with Node.js 24 and headless Chromium 153 using software WebGL.

| Check | Result |
| --- | --- |
| Physics unit tests | 8 passed: stationary ready ball, launch-lane exit, high-speed collision detection, bumper score/rebound, flipper return, three-ball lifecycle, pause, fixed-step consistency |
| TypeScript and production build | Passed |
| Desktop browser | Keyboard launch and both flippers, pause, four cameras, stabilized FPV independent of ball rotation, game over, best score and restart passed |
| Touch browser | Two simultaneous touch flippers, release, landscape and portrait layout passed |
| Offline production HTML | Opened via file://; launch and camera switching passed; zero external requests and zero browser errors |
| Visual inspection | Desktop intro and table, mobile landscape and portrait inspected |

The download package includes browser reports and screenshots. Browser QA initially needed timing adjustments to wait for rendered state on the software renderer; the final run passed with zero browser errors.

These checks establish that the prototype runs and its controls and game rules work. Human playtesting is still needed to tune FPV turning and flipper timing on physical phones. Fullscreen and audible sound playback were not separately verified.

The repository includes a GitHub Pages build and deployment workflow. Its first deployment requires Pages to be enabled for the repository; see the README for the one-time setting if automatic enablement is denied. Deployment status is available in GitHub Actions.
