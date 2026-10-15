# FPV fidelity spike and lighter wall bases

Status: draft experiment; visual/performance acceptance is outstanding. Do not merge or deploy on the strength of unit tests alone.

Baseline: `3c478dd7d4185750f6daac69780da0ebcc5aa063`. Existing title-only draft PR #17 (`e34e2430092a11420af94814b5ec47467bfe3e49`) is separate and unchanged. This branch preserves the repository's original audio asset; it does not replace or delete it.

## Requested wall-base change
Architectural bases now use lighter neutral slate **#74828C**:
- Patterned playable rail/perimeter faces, including upper-deck guides.
- Storefront cladding and enamel shells/architectural trim.
- Tunnel lining and the patterned upper-deck underside, which share the wall atlas.

These surfaces occur in both the reference and classic/circuit courses. Sky/background, floor/paving, sign backgrounds, brass, recessed windows and neon colors remain unchanged. Existing atlas/palette batching and all lighting/material parameters remain unchanged. No extra texture, light, geometry or pass is added by this color edit. Rendered contrast still requires desktop/mobile visual inspection; diffuse and emissive slots share the wall artwork, so verify it does not become too bright under bloom.

## Opt-in material experiment
The renderer already has ACES tone mapping, procedural PMREM environment lighting, physical clearcoat materials, shadow-revision caching, HDR bloom, adaptive resolution, static batching, palette/atlas consolidation and repeated texture-sample reuse. These are existing features, not claimed new improvements.

The reference playfield experiment is strictly opt-in:
- `fidelity=baseline` or omitted: no experiment.
- `fidelity=baked`: static contact-darkening around fixed ground bumpers/posts, painted once into the existing artwork. Artistic approximation, not traced GI; no moving ball/flipper shadows. No new runtime mesh/texture/pass. Because diffuse and emissive slots share the artwork, both change.
- `fidelity=roughness`: contacts plus one 256x512 linear-data roughness map for broad glaze variation/seams. Adds a texture lookup and approximately 0.67 MiB uncompressed GPU texels including mipmaps, plus 0.50 MiB source pixels. Actual driver allocation is unmeasured. The texture follows existing table disposal.

Physics, audio, input, camera, collision geometry and adaptive-budget logic are untouched. The optional artwork also appears in the intro preview; no camera mode or overhead inset is added. This is a small material experiment, not a full scene redesign.

## Local verification
- Baseline: 100 tests, 97 pass, 3 audio-dependent failures because the original WAV could not be retrieved into this local workspace through the connector.
- Combined candidate: 105 tests, 102 pass, the same 3 missing-WAV failures. The original WAV remains in this repository and must be present for full CI checks.
- Three new fidelity tests pass: strict mode allowlist, deterministic/bounded roughness data, fixed contact drawing/restoration.
- Two new wall tests pass: all base tiles/enamel use lighter slate, sky and neon values stay unchanged. Verified red/green against old wall source.
- Source and dedicated harness TypeScript checks pass.
- Render-only harness production bundle passes. Full local game build is blocked by the unavailable local WAV import; this is not a full-build pass.
- Patch whitespace check passes. Independent review recommendations to guard concurrent measurements and normalize variant labels were applied.

Remote CI is pending when this report is introduced. Use checks for the exact PR head; do not equate local missing-asset failures with repository failures.

## Unmeasured evidence
Installed Chromium could not start because of a socket permission error. An expanded launch failed during environment setup. The available cloud browser could not reach the workspace's localhost server. The portable runner also failed before rendering.

Consequently this run has no valid same-pose screenshots, frame-time p95, draw-call measurements, long-frame counts, runtime memory/startup measurements, GPU timings or input latency. No hardware or software-GPU performance improvement is claimed. Desktop/mobile visual and live-play acceptance remain outstanding.

## Reproduce
With the complete repository checkout:

```sh
npm ci
npm test
npm run build
CHROME_PATH=/path/to/chromium node spikes/fidelity/run.cjs
```

Runner output: `artifacts/fidelity/results.json` and fixed-pose PNGs. It defaults to explicitly requested SwiftShader/software rendering. Set `PERF_GPU=hardware` to request the machine's normal GPU path; confirm the actual returned renderer string. Software data is only a relative diagnostic.

Fixed conditions: ground and launch FPV poses; 960x540 desktop and 844x390 mobile-landscape canvases; DPR 1; high quality; adaptive scaling off; 60 warmup RAFs plus 240 measured RAFs; two repetitions with reversed variant order. A paused fixed simulation pose and no audio/live physics isolate rendering. Startup is recorded per page but browser/resource caches are not cold-controlled. RAF interval is frame delivery, not GPU time; CPU submission includes view-update overhead. Optional browser JS heap is not total memory; texture/geometry counts are not bytes. Input latency is not measured.

Manual harness: `npm run dev -- --port 5188`, open `/spikes/fidelity/?fidelity=baked`, substitute baseline/roughness, and use `pose=launch` or `viewport=mobile`.

## Acceptance before integration
1. Review matching desktop/mobile FPV captures for ground, launch, bridge and tunnel; the last two poses are not yet automated. Check Eco too. Reject loss of lane readability or motion shimmer.
2. Run repeated A/B tests on actual target desktop/mobile hardware, first at fixed quality/resolution, then live gameplay with adaptive budget enabled. Agree device/frame budgets; require no material p95 or long-frame regression.
3. Exercise keyboard/simultaneous touch, pause/blur, launch-lane exit, three-ball lifecycle, reduced motion and context restoration. Measure event-to-present latency separately if response equivalence is required.
4. Reconcile with the title PR's latest head before approved integration.

Recommendation: baked-only is the lowest runtime-risk experiment by code structure. Whether it looks better, and whether the extra roughness lookup earns its cost, remains unverified.
