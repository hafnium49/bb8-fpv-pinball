# Tropical neon FPV cabinet — recovery build

This branch implements the requested dense, varied, glossy tropical night-street treatment from the ball's eye level. The cabinet course, fixed-step physics, collision detection, stabilized camera, controls, and existing droid audio are preserved.

## Coverage
- 52 varied storefronts per table, with 16 original fictional sign designs, layered bays, arches, shutters, awnings, windows, palm reliefs, and high lantern strings.
- Patterned actual inner rails and rounded rear walls, with neon strips and inset detail.
- Ramp-edge ribbons, clearance-checked underslung braces/signs, upper-deck fascia, patterned soffit and lattice.
- Fully submerged subway vaults with illuminated ribs and ceramic/metal panels; the older elevated circuit's banked tunnel is lined too.
- Glossy original paving and route artwork, baked colored reflections, quarter-resolution separable HDR bloom in High quality where floating-point render targets are supported.
- Eco retains the architecture and art while removing reflection/bloom/shadow passes. Reduced-motion freezes neon emission; pausing stops animation.
- Static spatial batching, shared shader samples, combined artwork atlas, and release of construction-only geometry/canvases.

## Recovery provenance
The earlier completed local workspace became inaccessible before delivery. This is a newly validated recovery build, not a byte-for-byte restoration of that earlier release. Most night-market geometry, material/batching helpers and HDR postprocess were recovered from exact review excerpts. A small facade sign gap, procedural artwork, layout/paving helpers and acceptance harness were reconstructed. Historical test claims are not used as validation for this build.

Remote starting point: 3fd9621081c594145a4e1befaf0b8b5a65d8fe79.
Local branch: feat/fpv-neon-night-market. No push, PR, merge or deployment has been performed.

## Fresh validation
- npm test: 98 passed.
- npm run build / standalone: passed.
- Chromium render regression, reference course (desktop, small PC and landscape), simultaneous touch (portrait/landscape), and browser smoke: passed.
- Fresh static visual acceptance: 21 reference-course poses and 5 older elevated-circuit poses. Includes all three ramps/subways, rail close-ups and tunnel/bridge views.
- Six High/Eco cycles on each course retained bounded geometry/texture counts. Four context-loss/restore cases (both modes on both courses) recreated the environment and rendered successfully.
- Neon levels change during play, remain fixed when paused, and are constant with reduced motion. This is not a medical comfort certification.
- Existing audio-browser suite passed in desktop classic and mobile circuit configurations, including waveform/lifecycle/fallback checks. Physical speaker/iPhone behavior remains unverified.
- Read-only geometry review found no nonfinite attributes or UV-count mismatch in all three table variants. Dense .01-unit path sampling verified 31 bridge braces and 73 signs against the guided-eye envelope.
- Detailed counters and per-case results: NEON-ACCEPTANCE.json.
- Ten-minute synthetic simulation/render smoke: 600.551 seconds, 19,788 app render frames, 6 launches and 1 simulation restart; no page errors or nonfinite sampled positions. All 119 consecutive sample pairs advanced render frames. This harness periodically supplies inputs and clears pause; it is not an unattended-pause, full app-restart, or memory-leak certification. Observed GPU resources ranged 162–168 geometries / 15–20 textures as effects loaded.
- Production standalone smoke: one initial local HTML request, then networking disabled. Browser-wide request tracking found no additional network dependencies. Start, charge indicator, simultaneous pressed flipper controls, pause and closed-modal resume checks passed. No page errors. Direct file opening and physical speaker output remain unverified.

The checks use cloud Chromium/SwiftShader. They do not establish real PC GPU frame rates, iPhone Safari performance, or individual motion comfort. Real iPhone/WebKit testing and direct file-opening are not claimed.

## Reproduce
npm ci
npm test
npm run build
CHROME_PATH=/usr/bin/chromium npm run test:render:browser
CHROME_PATH=/usr/bin/chromium npm run test:course:browser
CHROME_PATH=/usr/bin/chromium node scripts/neon-acceptance.cjs
CHROME_PATH=/usr/bin/chromium node scripts/neon-soak.cjs
npm run standalone

The standalone HTML embeds the bundle, WASM, audio, CSS, favicon and third-party notices. Source assets are original procedural drawings; no new external voice samples or photographs were introduced. Existing licenses remain in THIRD-PARTY-NOTICES.txt.
