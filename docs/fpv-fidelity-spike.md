# FPV fidelity spike and lighter wall bases

Status: draft experiment; visual/performance acceptance is outstanding. Do not merge or deploy on the strength of unit tests alone.

Baseline: `3c478dd7d4185750f6daac69780da0ebcc5aa063`. Existing title-only draft PR #17 (`e34e2430092a11420af94814b5ec47467bfe3e49`) is separate and unchanged. This branch preserves the repository's original audio asset; it does not replace or delete it.

## Requested wall-base change
Architectural bases now use lighter neutral slate **#74828C**:
- Patterned playable rail/perimeter faces, including upper-deck guides.
- Storefront cladding and enamel shells/architectural trim.
- Decorative tunnel vault lining and patterned upper-deck underside, which share the wall atlas.
- Actual lower subway walls now use their own opaque slate material instead of the dark route-floor texture. Slate emission (.35) keeps that material independent of environment lighting in Eco. Floor paving and tunnel guide lights are unchanged.
- Under-deck rail faces, fascia and soffit are covered. Ramp riding surfaces/undersides remain their existing paving, and recessed windows/sign backgrounds intentionally remain dark; this is not a global recoloring of every dark surface.

These surfaces occur in both the reference and classic/circuit courses. Sky/background, floor/paving, sign backgrounds, brass, recessed windows and neon colors remain unchanged. Existing atlas/palette batching is preserved. The lower-tunnel correction separates a material, which can add draw batches/program variation; it adds no texture, light, geometry or postprocessing pass. Its measured cost is unknown. Other wall-atlas/enamel material parameters are unchanged. Rendered contrast still requires desktop/mobile visual inspection; diffuse and emissive slots share the wall artwork, so verify it does not become too bright under bloom.

## Opt-in material experiment
The renderer already has ACES tone mapping, procedural PMREM environment lighting, physical clearcoat materials, shadow-revision caching, HDR bloom, adaptive resolution, static batching, palette/atlas consolidation and repeated texture-sample reuse. These are existing features, not claimed new improvements.

The reference playfield experiment is strictly opt-in:
- `fidelity=baseline` or omitted: no experiment.
- `fidelity=baked`: static contact-darkening around fixed ground bumpers/posts, painted once into the existing artwork. Artistic approximation, not traced GI; no moving ball/flipper shadows. No new runtime mesh/texture/pass. Because diffuse and emissive slots share the artwork, both change.
- `fidelity=roughness`: contacts plus one 256x512 linear-data roughness map for broad glaze variation/seams. Adds a texture lookup and approximately 0.67 MiB uncompressed GPU texels including mipmaps, plus 0.50 MiB source pixels. Actual driver allocation is unmeasured. The texture follows existing table disposal.

Physics, audio, input, camera, collision geometry and adaptive-budget logic are untouched. The optional artwork also appears in the intro preview; no camera mode or overhead inset is added. This is a small material experiment, not a full scene redesign.

## Initial verification (before review corrections)
- Baseline: 100 tests, 97 pass, 3 audio-dependent failures because the original WAV could not be retrieved into this local workspace through the connector.
- Combined candidate: 105 tests, 102 pass, the same 3 missing-WAV failures. The original WAV remains in this repository and must be present for full CI checks.
- Three new fidelity tests pass: strict mode allowlist, deterministic/bounded roughness data, fixed contact drawing/restoration.
- Two new wall tests pass: all base tiles/enamel use lighter slate, sky and neon values stay unchanged. Verified red/green against old wall source.
- Source and dedicated harness TypeScript checks pass.
- Render-only harness production bundle passes. Full local game build is blocked by the unavailable local WAV import; this is not a full-build pass.
- Patch whitespace check passes. Independent review recommendations to guard concurrent measurements and normalize variant labels were applied.

Remote CI passed on `63832d3351d5f9f8c2584e8dff7970616c80c192`: [run #87](https://github.com/hafnium49/bb8-fpv-pinball/actions/runs/38811587611) verified all 105 tests, circuit/flipper-guide/reference-course checks and the full production build with the original WAV. This is historical evidence for that commit only. Review corrections require their own exact-head check; use the PR checks rather than treating the older result as validation of later changes.

The first correction head `6afa3e13740029cd72b788bad34a0a17cee13e3e` also passed [run #89](https://github.com/hafnium49/bb8-fpv-pinball/actions/runs/38839148954): 115/115 tests, source and harness typechecks, circuit/guide/course checks and full production build. Later reliability fixes require their own exact-head CI.

Review corrections add dedicated lower-tunnel wall material coverage, under-deck coverage assertions, and a compiled old-main/PR comparison harness. Local corrected suite: **117/120 passed**, with the same three missing-WAV failures; all four wall tests and thirteen harness tests pass. Source/harness typechecks and circuit, guide and reference-course checks pass. Full local build still cannot resolve the absent WAV. See the current exact-head PR checks for complete-checkout verification.

## Unmeasured evidence and merge gate
Installed Chromium could not start because of a socket permission error. An expanded launch failed during environment setup. The available cloud browser could not reach the workspace's localhost server. The portable runner also failed before rendering.

Consequently this run has no valid same-pose screenshots, frame-time p95, draw-call measurements, long-frame counts, runtime memory/startup measurements, GPU timings or input latency. No hardware or software-GPU performance improvement is claimed. Desktop/mobile visual and live-play acceptance remain outstanding.

## Reproduce an actual old-main/PR comparison

Prepare two separate complete source checkouts using the authorized repository access method: baseline `3c478dd7d4185750f6daac69780da0ebcc5aa063` and the exact current PR head. Preserve each checkout's own `src` and original audio. Copy only the PR's `spikes/fidelity/` directory unchanged into the baseline checkout, so both use the identical measurement harness. The harness imports only APIs present on old main; it does not simulate old walls by toggling a PR material.

Run `npm ci` in each checkout. In the PR checkout run `npm test` and `npm run build`; the build now also typechecks the harness. Serve old main on port 5188 and PR on 5198 using `npm run dev -- --port <port>` in their respective directories. Verify the checkout revisions yourself: the URL/commit labels below are operator declarations, not independently authenticated provenance.

From the PR checkout:

```sh
export FIDELITY_BASELINE_URL=http://127.0.0.1:5188/spikes/fidelity/
export FIDELITY_PR_URL=http://127.0.0.1:5198/spikes/fidelity/
export FIDELITY_BASELINE_COMMIT=3c478dd7d4185750f6daac69780da0ebcc5aa063
export FIDELITY_PR_COMMIT='REPLACE_WITH_EXACT_CURRENT_PR_HEAD_SHA'
node spikes/fidelity/run.cjs --plan
CHROME_PATH=/path/to/chromium node spikes/fidelity/run.cjs
```

Runner output goes into a timestamped `artifacts/fidelity/` directory: manifest, raw results and matching PNGs. Missing/distinct-source configuration errors fail before launch. Browser page/console errors and WebGL context loss invalidate the case; failures are latched so later restoration cannot turn that run into a pass. A failed/incomplete manifest is not a successful benchmark. It defaults to SwiftShader/software rendering; `PERF_GPU=hardware` requests the normal GPU path, but verify the recorded actual renderer string. Software data is only a relative diagnostic, never desktop/iPhone proof.

The default matrix is 160 measurements: 2 viewports × Eco/High × ground/launch/bridge/tunnel/underdeck × 4 treatments × 2 forward/reverse repeats. Treatments are old-main baseline, PR default walls, PR baked, PR roughness. Thus old-main versus PR baseline isolates this PR's default wall change; PR baseline versus baked/roughness evaluates the opt-in floor experiments. Screenshots are saved for the first repeat of every treatment/condition.

Fixed conditions: 960x540 desktop and 844x390 mobile-landscape canvases; DPR 1 by default; adaptive scaling off; 60 warmup RAFs plus 240 sampled RAFs. Geometry-derived route fixtures use actual route capture before pausing. The runner rejects mismatched camera/simulation/buffer state across compared treatments. Fixture generation is tested, but framing and visible surface coverage still require inspecting the images. These five fixtures are not an exhaustive course walkthrough or motion test.

Startup timings separate simulation creation, pose preparation, view construction, shader warmup and first submitted render. They exclude page download/module loading and are not time-to-interactive. Browser/resource caches are not cold-controlled. RAF interval is frame delivery, not GPU time; CPU submission includes view-update overhead. Optional JS heap is not total memory; texture/geometry counts are not bytes. Input latency, audio and live physics are not measured. Paused screenshots cannot establish motion shimmer or touch/keyboard responsiveness.

For manual inspection open either server's `/spikes/fidelity/?source=pr&quality=eco&pose=underdeck&viewport=mobile&fidelity=baseline` (use `source=main` for the baseline server). Other supported quality/pose/variant names match the matrix above. Production defaults are unchanged by these harness options.

## Acceptance before integration
1. Produce and inspect matching old-main/PR desktop/mobile FPV captures for every automated pose in both Eco and High, especially the user-reported under-deck and tunnel walls. Check bloom and readable contrast. Then inspect moving gameplay for shimmer; static captures cannot establish that.
2. Run repeated A/B tests on actual target desktop/mobile hardware, first at fixed quality/resolution, then live gameplay with adaptive budget enabled. Agree device/frame budgets; require no material p95 or long-frame regression.
3. Exercise keyboard/simultaneous touch, pause/blur, launch-lane exit, three-ball lifecycle, reduced motion and context restoration. Measure event-to-present latency separately if response equivalence is required.
4. Reconcile with the title PR's latest head before approved integration.

Recommendation: baked-only is the lowest runtime-risk experiment by code structure. Whether it looks better, and whether the extra roughness lookup earns its cost, remains unverified.
