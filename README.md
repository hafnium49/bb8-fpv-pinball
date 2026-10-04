# ORBIT — BB-8 inspired FPV pinball

Pinball from inside the ball. The ball rolls and ricochets physically, while the default camera keeps its horizon level and smoothly follows the direction of travel. The inspiration is BB-8's independent head movement; the table and artwork are original procedural geometry.

## Play

```sh
npm ci
npm run dev
```

Open the address printed by Vite. Requires Node.js 20.19+ or 22.12+ and a browser with WebGL. The game runs entirely in the browser; no account, backend or API key is required.

| Action | Keyboard | Touch / mouse |
| --- | --- | --- |
| Left flipper | A or left arrow | Hold left flipper |
| Right flipper | D or right arrow | Hold right flipper |
| Launch | Hold Space, then release | Hold Launch, then release |
| Pause / resume | Esc | Pause / resume buttons |
| Camera | 1 / 2 / 3 / 4 | FPV / Chase / Table / Spin |
| Graphics | — | FX High / FX Eco |

The radar shows the full table, ball and flippers. The two touch flippers support simultaneous presses. Sound is off until enabled. Spin view deliberately follows the rolling ball's rotation; stabilized FPV is the default. A game has three balls; bumper hits score 100 and target hits score 250. The best score is stored locally when a game ends.

## Orbital arcade visuals

The illustrated playfield has a ringed planet, circuit paths, reactor markings and launch cues. Rounded cabinet parts, chrome bumper assemblies, inset flipper lights and an illuminated backboard sit inside a neon orbital arena. Reflections, contact shadows and restrained bloom give the table depth; real scoring collisions trigger pooled sparks, expanding light rings and floating score labels. A short ball trail helps in Table and Chase views.

**FX High** enables bloom and dynamic shadows and caps pixel density at 1.5. **FX Eco** skips those extra passes and caps pixel density at 1 while keeping the artwork, mechanical detail and collision effects. Touch devices and narrow screens start in Eco; the top-bar button switches modes at any time. Reduced-motion preferences disable decorative portal rotation, particles and score animations. All artwork is generated locally, with no asset or font downloads.

## Build and verify

```sh
npm test
npm run build
npm run preview
```

For a single offline HTML file, run `npm run standalone` and open `artifacts/ORBIT-FPV-Pinball.html` in a WebGL-capable browser. It embeds the renderer, physics runtime and stylesheet; no server or CDN is needed.

For browser QA, run `npx playwright install chromium`, then `npm run test:browser`. It starts its own dev server. Screenshots and the check report go into `artifacts/`. Set `CHROME_PATH` to use an existing Chromium executable or `GAME_URL` to test a running dev server.

`tests/physics.test.ts` checks launch controls and lane exit, high-speed collision detection, bumper scoring, flipper return, three-ball game lifecycle, pause, and render-rate independence. Browser QA also checks actual keyboard/pointer input, camera orientation, minimap, responsive layout and WebGL rendering.

## Architecture

- `src/physics/`: Rapier rigid bodies, shared table dimensions, a 120 Hz fixed step and game rules.
- `src/render/`: Three.js view and independent cameras, canvas artwork, detailed table geometry, lighting, postprocessing and bounded visual effects.
- `src/ui/`: radar and synthesized audio.
- `src/main.ts`: DOM controls, state presentation, input and browser lifecycle.

The render graph is separate from the simulation. Flippers are moving kinematic bodies, the ball uses continuous collision detection, and physics is independent of display frame rate. FPV camera orientation never inherits the ball quaternion. UI checks do not replace collision/physics tests.

## GitHub Pages

Repository: https://github.com/hafnium49/bb8-fpv-pinball

Game URL after deployment: https://hafnium49.github.io/bb8-fpv-pinball/

`.github/workflows/pages.yml` tests and builds the game, uploads `dist/`, and deploys it to GitHub Pages on each push to `main`. The deployment uses GitHub's Pages artifact and deployment actions; it needs no external hosting account or API key. Vite uses relative asset paths so the game works under the repository URL.

The workflow attempts to enable Pages on its first run. If GitHub denies that first-time settings change, open the repository's **Settings → Pages**, choose **GitHub Actions** under **Build and deployment → Source**, then rerun the failed Pages workflow. This is a one-time repository setting; later pushes deploy automatically.

The separate CI workflow tests and builds changes on pushes and pull requests. Only `main` publishes the site.

## Prototype scope

One table, two flippers, three bumpers, two targets and three balls. Ramps, multiball, tilt rules and online scores are future extensions. FPV timing should be tuned with human playtesting; the radar helps when the flippers are behind the camera. This is a playable prototype, not a tournament pinball simulator.

Licensed under MIT. `THIRD-PARTY-NOTICES.txt` includes the Three.js and Rapier licenses; the standalone HTML embeds those notices.
