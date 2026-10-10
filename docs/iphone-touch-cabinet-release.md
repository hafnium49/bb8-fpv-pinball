# iPhone touch reliability and reference-inspired cabinet finish

This follow-up addresses flipper taps accidentally pausing the game on an iPhone browser and completes the most visible cabinet/UI details from [the Hyperspace Pinball study](reference-cabinet-ui-study.md). The previous release improved the mechanisms, display layout and soundtrack; its enclosure and UI still lacked the reference's wood, metal and arcade display styling.

## Touch and pausing

Previously every window `blur` opened the pause dialog and released all controls. Focus loss is not sufficient evidence that a mobile page has left the foreground. While the page remains visible, blur after touch input (or before the first input on a coarse device) now releases only keyboard holds. `visibilitychange` with a hidden document and `pagehide` still pause, clear every input and stop audio. Desktop mouse/keyboard blur and the explicit Pause button keep their pause behavior. The last input type follows pointer and keyboard activity so switching from touch back to a mouse/keyboard on a hybrid device does not leave desktop blur disabled, even when its primary pointer remains coarse.

Each finger and key owns its hold independently. Releasing or cancelling one finger cannot release another finger on the same flipper, the opposite flipper, or a separately held launcher. Pointer capture has a global release fallback. Play pads suppress text selection, touch callouts and context menus, and their decorative children do not intercept the hit target.

The full audio/browser check also found a caption priority conflict across frames. An urgent flipper instruction now retains its reading window when a later lost-head reaction arrives. The regression explicitly starts the reaction after an already active warning. Independent audio fixtures use the actual new-game lifecycle to reset captions and input ownership along with physics.

## Cabinet and UI

| Reference detail | Visible ORBIT implementation |
| --- | --- |
| Brown wooden enclosure with metal edging | Generated wood grain on the cabinet, outer rail faces and backboard surround; brushed metal/rubber launch and guide faces; existing steel trim and fasteners |
| Plum space artwork and apron rule cards | Original purple orbital illustration and two printed cream scoring/instruction cards integrated into the floor texture |
| Red rubber and ivory flippers | Matte red contact bodies with visible ivory top plates and metal pivot caps; the old plates/caps were buried in the body and are now exposed |
| Framed amber arcade display | Dark metal-framed HTML score/lives/status display, dotted amber score glyphs and warm status text; plain system text remains available in forced-colour mode |
| Controls that belong to a cabinet | Bevelled metal thumb pads with recessed round flipper faces and matching toolbar hardware; accessible buttons and target sizes are retained |

Textures are generated once and owned/disposed by the table. The existing contact bodies, route geometry, launch calibration, scoring, 120 Hz stepping and CCD are unchanged. Only thin decorative flipper plates/caps move above their existing shell; their footprints stay fixed. Stable FPV, the occasional lost-head spin, reduced-motion support and the original nonverbal droid/music mix remain in place.

The reference's design language is adapted to the existing FPV game. The reference's artwork, recordings and assets are not runtime dependencies. Its overhead view, side rankings and extra playfield mechanics are outside this implementation.

## Reproducing the checks

Run `npm ci`, `npm test`, `npm run build`, `npm run test:browser`, `npm run test:cabinet:browser`, `npm run test:audio:browser` and `npm run test:touch:browser`. The touch command uses Chromium by default; after `npx playwright install --with-deps webkit`, run `TOUCH_ENGINE=webkit npm run test:touch:browser`. `CHROME_PATH`, `CHROME_ARGS` and `WEBKIT_PATH` can select compatible installed browser runtimes.

The dedicated touch harness uses native repeated touch taps and explicit regression fixtures for visible blur, cancellation, lost capture and pagehide. It checks both portrait and landscape, independent holds, context-menu suppression, explicit pause/resume, control bounds and a real WebGL screenshot. WebKit on Linux verifies Safari-engine compatibility; it does not establish physical iPhone behavior or iOS browser chrome/callout handling. That final device playtest remains a limitation.

Current results, tested source hashes, visual inspections and render counters are recorded in [the validation report](validation/iphone-touch-cabinet.json) and [the matched render samples](validation/iphone-touch-cabinet-render-cost.json). The earlier release's evidence is retained as a historical record.

Verification completed: 47 unit/integration tests, production/offline builds, gameplay checks, five cabinet layouts, both real Web Audio cases, and portrait/landscape touch cases in WebKit 26.5 and Chromium 155 pass. The four touch cases execute 96 native alternating flipper taps in total. Desktop and mobile landscape screenshots were inspected.

All 24 matched render samples meet the original design budget. Compared with that baseline, the maximum increase is four draw calls and two textures; every sample uses at least 7,048 fewer triangles and five fewer geometries. These are software-GPU counters, not phone frame-rate measurements.
