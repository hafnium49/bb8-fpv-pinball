# Elevated circuit design spikes

Read [the implementation design](../../docs/elevated-circuit-design.md) and [captured results](../../docs/spikes/elevated-circuit-results.json). These experiments run on the classic simulation and preserve their candidate geometry for comparison. The finished opt-in implementation is in `src/`; see [its validation](../../docs/elevated-circuit-validation.md). They use the existing dependencies installed by `npm ci`.

## Reproduce

Run from the repository root:

```bash
npm ci
node --import tsx spikes/elevated-circuit/run.ts
node --import tsx spikes/elevated-circuit/camera-check.ts
node --import tsx spikes/elevated-circuit/invariants.ts
node spikes/elevated-circuit/browser-check.cjs
node spikes/elevated-circuit/capture.cjs
```

The browser check needs a Playwright-compatible Chromium with WebGL. Use an already installed browser with `CHROME_PATH=/absolute/path/to/chromium`, or install Playwright Chromium in an environment that permits its download. Extra browser arguments may be supplied as a JSON array in `CHROME_ARGS`. The check starts Vite itself and saves desktop/mobile landscape screenshots to `artifacts/elevated-circuit/`.

Full physics cases, timings, traces, camera checks and invariant checks are saved under that ignored directory. `run.ts` also refreshes the committed `replay.json` from the first successful flipper shot of the preferred candidate. `capture.cjs` writes compact review evidence after all checks have run. The small committed replay is deliberately versioned for deterministic visual review: one successful reference shot, rounded to five decimal places. Regenerate it with `run.ts`; full-case traces stay in ignored artifacts. Timings vary by machine; outcome counts are the useful contact comparison.

Generate the layout diagram with Python and matplotlib:

```bash
python spikes/elevated-circuit/plot-layout.py
```

For interactive inspection:

```bash
npm run dev
```

Open `/spikes/elevated-circuit/index.html` on the printed local server URL. Scrub the recorded traversal and switch Table, FPV and Chase. This is a replay of actual Rapier positions and velocities with experimental art/camera behavior; it is not a playable upgraded build.

## Scope of the experiments

- `reach.ts` scans 192 synthetic incoming-ball poses and flipper timings on the original table.
- `route.ts` generates one 3D route and six collider variants. Its wire tube geometry is shared with the preview.
- `run.ts` compares 63 injected entry conditions per variant and the candidate flipper setups selected by the consistent zero-spin scan. Five ordered proximity gates prevent false completion from merely reaching the return area.
- `camera-check.ts` checks pitch/rate/roll and analytic clearance on two real completing traces.
- `invariants.ts` compares board-local versus rotated vertical gravity, three short underpasses and launch-lane exit.
- `preview.ts` and `browser-check.cjs` render the route on the existing cabinet and inspect desktop/mobile output.

Use this code as evidence and a starting point. Production needs allocation-free path lookup, swept scoring gates, scene-aware camera collision, collider coverage for reachable supports, and end-to-end playability tests. Successful trials stop near the return exit and do not establish a subsequent flipper hit.
