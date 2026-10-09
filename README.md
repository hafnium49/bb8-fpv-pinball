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
| Graphics | — | FX High / FX Eco |
| Sound | — | Sound On / Sound Off |

FPV fills the playfield; there is no overhead/radar inset, including during a spin. The two touch flippers support simultaneous presses. Tap **SOUND OFF** to enable the lower, metallic nonverbal droid voice, rolling sounds, mechanical effects and arcade music. The sound preference is remembered on this device; after a reload, entering the table activates it again. On iPhone, use the media volume controls; older browsers may also require Silent Mode to be off. FPV is the only player camera. Each launch has a 5% chance of a three-second **lost head** spin after leaving the launcher: **Oh no, BB-8 lost its head!** A startled electronic cry accompanies the caption; the camera follows the real ball rotation, then restores upright FPV. Pause, drain and restart cancel it, and reduced-motion settings disable it. A game has three balls; bumper hits score 100 and target hits score 250. The best score is stored locally when a game ends.

## Orbital arcade visuals

The next cabinet, UI and original soundtrack upgrade is specified in the [implementation design](docs/cabinet-ui-audio-upgrade.md), with a layout schematic, reference audio evidence and a reproducible render-cost baseline. It is a proposal; the current game behaviour below remains the shipped baseline.

The illustrated playfield has a ringed planet, circuit paths, reactor markings and launch cues. Rounded cabinet parts, chrome bumper assemblies, inset flipper lights and an illuminated backboard sit inside a neon orbital arena. Reflections, contact shadows and restrained bloom give the table depth; real scoring collisions trigger pooled sparks, expanding light rings and floating score labels.

**FX High** enables bloom and dynamic shadows and caps pixel density at 1.5. **FX Eco** skips those extra passes and caps pixel density at 1 while keeping the artwork, mechanical detail and collision effects. Touch devices and narrow screens start in Eco; the top-bar button switches modes at any time. Reduced-motion preferences disable the random spin, decorative portal rotation, particles and score animations. All artwork is generated locally, with no asset or font downloads.

## Elevated circuit

Choose **Try elevated circuit** on the opening screen, or open the dev-server URL with `?circuit=1`. Aim at the left ramp, rise above the reactors on an open wire bridge, cross the short illuminated tunnel, and return to the right flipper. A full ordered traversal awards **750 points**. Weak attempts roll back naturally; the ball remains a free physics body throughout.

FPV previews the path with bounded pitch and a level horizon; FPV sweeps against the real cabinet to clear guard wires and ceilings. Reduced motion limits pitch to 8° and 15°/s. The classic table remains the default while physical-device performance and human FPV comfort are evaluated.

[Design](docs/elevated-circuit-design.md) · [Implementation](docs/elevated-circuit-implementation.md) · [Validation](docs/elevated-circuit-validation.md)

## Droid soundscape

The ball expresses itself entirely through lower electronic beeps, burbles, trills and metallic cries, inspired by BB-8 and R2-D2. Curious chatter, impact cries, launch excitement, bridge joy, tunnel echoes and relieved save beeps each have their own contour and rhythm. Contact-speed rolling and metal bridge rattles sit under an original arcade groove. The game contains no spoken English audio.

A short forecast plays distinct warning motifs ahead of a return: two low falling beeps for **Left flipper!**, three high rising beeps for **Right flipper!**, alternating low/high beeps for **Both flippers!**, and a rapid panic pattern for **Watch the drain!**. Left/right warnings also pan toward that side; their rhythm and pitch remain distinct on a mono phone speaker. English captions interpret the warning and highlight the requested flipper, including when sound is muted.

Urgent warnings interrupt chatter and lower the music/effects. Reactions have cooldowns, the voice has one active slot, and effects have a bounded budget. Pause, blur, mute and restart cancel active sounds; game over stops music and rolling while the final wistful burble finishes. Original synthesized droid clips are bundled with the game and the offline HTML. All audio plays through Web Audio after a player gesture.

[Audio design, asset recipe and verification](docs/droid-soundscape.md)

[FPV and the random lost-head reaction](docs/fpv-head-loss.md)

## Build and verify

```sh
npm test
npm run test:circuit
npm run test:guides
npm run build
npm run preview
```

For a single offline HTML file, run `npm run standalone` and open `artifacts/ORBIT-FPV-Pinball.html` in a WebGL-capable browser. It embeds the renderer, physics runtime and stylesheet; no server or CDN is needed.

For browser QA, run `npx playwright install chromium`, then `npm run test:browser`. It starts its own dev server. Screenshots and the check report go into `artifacts/`. Set `CHROME_PATH` to use an existing Chromium executable or `GAME_URL` to test a running dev server.

`npm run test:audio:browser` checks real Web Audio waveforms, decoded droid beeps, directional warnings, actual collision and route cues, warning priority, continuous rolling/music, resource bounds, mute, reload preferences, interruption recovery and the three-ball audio lifecycle in desktop classic and mobile circuit views. It also injects clip-decoding and audio-start failures and verifies distinct procedural warning fallbacks. Safari audio-session behavior and the listening balance require a physical iPhone check.

`npm run test:circuit` runs the 63-case entry sweep, 18 spin/partial-step variants and two input-only launch-to-flipper return trials. `npm run test:circuit:browser` adds playable route screenshots, camera/control checks, touch, resource stability and context recovery. These commands use the same Chromium configuration as `test:browser`.

`npm run test:guides` sweeps both flipper hinges and the upper/lower side-guide heads on both tables, including slow arrivals, fast spin, held/released and pulsed flippers. It excludes overlapping seeds and the interiors of closed ramp heels. `npm run test:guides:browser` checks live arrivals, keyboard/touch launch exit and desktop/mobile screenshots. The [guide trap fix and validation](docs/flipper-guide-fix.md) records the scope and results.

`tests/circuit.test.ts` checks ordered scoring, reversals, wrong-height crossings, rollbacks, real flipper returns, underpasses and swept camera clearance. `tests/physics.test.ts` checks launch controls and lane exit, high-speed collision detection, bumper scoring, flipper return, three-ball game lifecycle, pause, and render-rate independence. Browser QA also checks actual keyboard/pointer input, camera orientation, absence of overhead insets, responsive layout and WebGL rendering.

## Architecture

- `src/physics/`: Rapier rigid bodies, shared table dimensions, a 120 Hz fixed step and game rules.
- `src/render/`: Three.js view and independent cameras, canvas artwork, detailed table geometry, lighting, postprocessing and bounded visual effects.
- `src/ui/`: a pure sound director, a bounded Web Audio mixer and droid beep cue index.
- `src/assets/`: the bundled nonverbal droid sprite; rebuild it with `python3 scripts/generate-droid-beeps.py` (standard library only).
- `src/main.ts`: DOM controls, state presentation, input and browser lifecycle.

The render graph is separate from the simulation. Flippers are moving kinematic bodies, the ball uses continuous collision detection, and physics is independent of display frame rate. FPV camera orientation never inherits the ball quaternion. UI checks do not replace collision/physics tests.

## GitHub Pages

Repository: https://github.com/hafnium49/bb8-fpv-pinball

Game URL after deployment: https://hafnium49.github.io/bb8-fpv-pinball/

`.github/workflows/pages.yml` tests and builds the game, uploads `dist/`, and deploys it to GitHub Pages on each push to `main`. The deployment uses GitHub's Pages artifact and deployment actions; it needs no external hosting account or API key. Vite uses relative asset paths so the game works under the repository URL.

The workflow attempts to enable Pages on its first run. If GitHub denies that first-time settings change, open the repository's **Settings → Pages**, choose **GitHub Actions** under **Build and deployment → Source**, then rerun the failed Pages workflow. This is a one-time repository setting; later pushes deploy automatically.

The separate CI workflow tests and builds changes on pushes and pull requests. Only `main` publishes the site.

## Prototype scope

One table, two flippers, three bumpers, two targets and three balls. The connected elevated circuit is optional. Multiball, tilt rules and online scores are future extensions. FPV timing should be tuned with human playtesting; nonverbal warning motifs and captions advise which flipper to use when it is behind the camera. This is a playable prototype, not a tournament pinball simulator.

Licensed under MIT. `THIRD-PARTY-NOTICES.txt` includes the Three.js and Rapier licenses; the standalone HTML embeds those notices.

See the [FPV immersion and voice refinement](docs/fpv-immersion-voice.md) and [reference cabinet and UI study](docs/reference-cabinet-ui-study.md).
