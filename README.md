# ORBIT — BB-8 inspired FPV pinball

Pinball from inside the ball. The ball rolls and ricochets physically, while the default camera keeps its horizon level and smoothly follows the direction of travel. The default course uses the measured layout of [Hyperspace Pinball](https://pinball-fbd1a.firebaseapp.com/): three ramps, a raised mini playfield, nine bumpers, two flipper pairs and three subway routes. Artwork, materials, droid sounds and the FPV presentation are original.

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

FPV fills the playfield; there is no overhead/radar inset, including during a spin. The two touch flippers support simultaneous presses. Tap **SOUND OFF** to enable the lower, metallic nonverbal droid voice, rolling sounds, mechanical effects and arcade music. The sound preference is remembered on this device; after a reload, entering the table activates it again. On iPhone, use the media volume controls; older browsers may also require Silent Mode to be off. FPV is the only player camera. Each launch has a 5% chance of a three-second **lost head** spin after leaving the launcher: **Oh no, BB-8 lost its head!** A startled electronic cry accompanies the caption; the camera follows the real ball rotation, then restores upright FPV. Pause, drain and restart cancel it, and reduced-motion settings disable it. A game has three balls; bumper values range from 50 to 250, ground/deck targets score 150/300, and left/wire/sky ramps score 1,000/1,500/2,500. The best score is stored locally when a game ends.

## Orbital arcade visuals

The [reference cabinet recreation](docs/reference-cabinet-release.md) brings the Hyperspace Pinball reference's three-column PC layout, curved wood/chrome enclosure, purple illustrated playfield, cream apron cards and star-topped jet bumpers to ORBIT. The left panel shows this browser's top ten scores and eight recent completed games. The right console contains an amber dot display, three bumper lamps, actual game statistics, controls and scoring. The full cabinet appears before play; entering the table restores stabilized FPV. Smaller screens retain compact controls. Pause offers a separate Music volume slider while master SOUND controls the full mix.

The [iPhone touch and cabinet follow-up](docs/iphone-touch-cabinet-release.md) prevents visible touch-focus changes from pausing play, keeps independent finger/key holds, and adds the reference-inspired wood surround, ivory/red flippers, amber dot display and metal control pads. Backgrounding the page still pauses and silences the game.

The illustrated playfield has orbital rings, a spiral field, reactor markings and launch cues. Sculpted yellow/cyan bumper caps carry large printed stars over black rubber bodies and chrome skirts. Red ramp panels, ivory/red flippers, a metal apron and a curved walnut surround sit against a dark background. Reflections, contact shadows and restrained glow give the table depth; real scoring collisions depress the bumper caps, light their console windows and trigger pooled sparks, expanding light rings and floating score labels.

**FX High** enables restrained glow and cached dynamic shadows. **FX Eco** skips those extra passes while keeping the artwork, mechanical detail and collision effects. Resolution adjusts automatically toward smooth 60 Hz play; the HTML display and controls stay sharp. High retains native 1080p on a 1× display, caps density at 1.5 and rendering at three million pixels; Eco caps density at 1 and two million pixels. Sustained overload lowers render scale, and sustained headroom restores it. Touch devices and narrow screens start in Eco; the console button switches modes at any time. Reduced-motion preferences disable the random spin, particles and score animations. All artwork is generated locally, with no asset or font downloads.

The [desktop performance release](docs/desktop-performance-release.md) describes static GPU batches, shadow invalidation, the single glow/output pass, shader warm-up and the measured limits. Run `npm run test:render:browser` for desktop renderer regressions and `npm run benchmark:desktop` for matched held-scene GPU timings. The benchmark defaults to software rendering for repeatability. To measure an installed PC browser's actual GPU, set `CHROME_PATH`, `PERF_GPU=hardware` and `PERF_HEADLESS=0`, and check the renderer identity in the report. A software-renderer benchmark does not establish hardware PC FPS.

## Reference course

The reference course is the default, including old links with `?circuit=1`. Its left red loop returns to the right inlane, its wire loop returns to the left inlane, and its sky ramp reaches the mini playfield. A/D operate both flipper pairs. Three subway entrances, a kidney-shaped scoop, gravity well, paired portals, target banks and spinners use the reference coordinates. Weak ramp shots roll back without a completion award.

Rendering and collisions share one course definition. Free play and both flipper pairs use Rapier at 120 Hz with CCD; ramps and subways use constrained path riders, as in the reference. FPV follows these paths with bounded pitch and a level horizon. Reduced motion limits pitch to 8° and 15°/s. The opening overview uses the reference camera projection.

[Course correction, provenance and validation](docs/reference-course-release.md). The earlier original course remains available for regression comparison at `?table=orbit`, with its optional free-physics circuit at `?table=orbit&circuit=1`.

## Droid soundscape

The ball expresses itself entirely through lower electronic beeps, burbles, trills and metallic cries, inspired by BB-8 and R2-D2. Curious chatter, impact cries, launch excitement, bridge joy, tunnel echoes and relieved save beeps each have their own contour and rhythm. Contact-speed rolling and metal bridge rattles sit under an original 16-bar, 108 BPM arcade groove with bass, soft chords, percussion and a sparse motif. The game contains no spoken English audio.

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

`npm run test:cabinet:browser` checks five viewport layouts, large scores, toolbar target sizes, modal focus/inert behavior, keyboard ownership and the music slider.

`npm run test:design:browser` checks the three-column cabinet at 1440×900 and 1024×600, compact landscape at 844×390, real bumper-to-console feedback, score-history persistence, resize/start behavior, cap dimensions and matched render counters. It captures the cabinet and FPV views.

`npm run test:touch:browser` checks native repeated flipper taps, visible blur, independent fingers, long holds, cancellation and background/explicit pause behavior in portrait and landscape. Set `TOUCH_ENGINE=webkit` after installing Playwright WebKit to check the Safari engine; `WEBKIT_PATH` can select an installed runtime. A physical iPhone playtest remains separate.

`npm run test:audio:browser` checks real Web Audio waveforms, decoded droid beeps, directional warnings, actual collision and route cues, warning priority, continuous rolling/music, resource bounds, mute, reload preferences, interruption recovery and the three-ball audio lifecycle in desktop classic and mobile circuit views. It also injects clip-decoding and audio-start failures and verifies distinct procedural warning fallbacks. Safari audio-session behavior and the listening balance require a physical iPhone check.

`npm run test:circuit` runs the 63-case entry sweep, 18 spin/partial-step variants and two input-only launch-to-flipper return trials. `npm run test:circuit:browser` adds playable route screenshots, camera/control checks, touch, resource stability and context recovery. These commands use the same Chromium configuration as `test:browser`.

`npm run test:guides` sweeps both flipper hinges and the upper/lower side-guide heads on both tables, including slow arrivals, fast spin, held/released and pulsed flippers. It excludes overlapping seeds and the interiors of closed ramp heels. `npm run test:guides:browser` checks live arrivals, keyboard/touch launch exit and desktop/mobile screenshots. The [guide trap fix and validation](docs/flipper-guide-fix.md) records the scope and results.

`tests/circuit.test.ts` checks ordered scoring, reversals, wrong-height crossings, rollbacks, real flipper returns, underpasses and swept camera clearance. `tests/physics.test.ts` checks launch controls and lane exit, high-speed collision detection, bumper scoring, flipper return, three-ball game lifecycle, pause, and render-rate independence. Browser QA also checks actual keyboard/pointer input, camera orientation, absence of overhead insets, responsive layout and WebGL rendering.

## Architecture

- `src/physics/`: Rapier rigid bodies, shared table dimensions, a 120 Hz fixed step and game rules.
- `src/render/`: Three.js view and independent cameras, canvas artwork, detailed table geometry, lighting, postprocessing and bounded visual effects.
- `src/ui/`: a pure sound director, a bounded Web Audio mixer, droid beep cue index and validated local score history.
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

The default course has four flippers, nine bumpers, twelve bank targets, three ramps, three subways and three balls. Coordinates match the public reference; its casino/slot rules, online rankings and illustrated assets are not implemented. Multiball, tilt rules and online scores are future extensions. FPV timing should be tuned with human playtesting; nonverbal warning motifs and captions advise which flipper to use when it is behind the camera. This is a playable prototype, not a tournament pinball simulator.

Licensed under MIT. `THIRD-PARTY-NOTICES.txt` includes the Three.js and Rapier licenses; the standalone HTML embeds those notices.

See the [FPV immersion and voice refinement](docs/fpv-immersion-voice.md) and [reference cabinet and UI study](docs/reference-cabinet-ui-study.md).
