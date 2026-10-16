# PR18 rendered comparison and measured resource cost

## Scope and provenance

This report accompanies the normal lighter-wall update and a **default-off** material experiment. The render source was `178f54ef953add64c115484780c3732cbfa727d6`; old main was `3c478dd7d4185750f6daac69780da0ebcc5aa063`. The report commit changes documentation only, not the measured production code or harness.

- [Exact-source build/test CI](https://github.com/hafnium49/bb8-fpv-pinball/actions/runs/38843516727): **137/137 tests**, source and harness TypeScript checks, circuit/guide/reference checks, full production build with the original audio asset.
- [Software-rendered comparison run](https://github.com/hafnium49/bb8-fpv-pinball/actions/runs/38843516802): **20/20 conditions and aggregation passed; 160/160 measurements, 80/80 full-resolution PNGs, zero recorded browser errors.** Completed October 16, 2026.
- [Complete raw evidence artifact](https://github.com/hafnium49/bb8-fpv-pinball/actions/runs/38843516802/artifacts/12023536806), ZIP SHA256 `5366a88a62e0f992abbe4615a765496054bf1c3971d34f3952016bfa9df7eea5`. The downloaded artifact was checksum-verified; local reaggregation reproduced every result and all 80 PNGs, and regenerated summary matched CI exactly.
- Durable per-measurement values: [CSV](fpv-fidelity-measurements.csv). Each row is one 60-frame measurement; repeats are kept separate.
- Full raw frame samples, original manifests, generated paired-ratio report and 80 PNGs are in the run artifact. GitHub artifact retention is seven days, through October 23, 2026; download it before expiry for long-term raw-evidence retention.

The workflow checks out both exact revisions and copies only the same harness into old main. It uses standard Ubuntu runners, read-only repository contents and no deployment. Each of 20 viewport/quality/pose conditions keeps all four treatments and both forward/reverse orders on one runner. The aggregator rejects incomplete conditions, renderer errors, mismatched fixed state or sampling, inconsistent raw summaries, and missing/wrong-size screenshots. No timing samples are pooled across independent runners.

Conditions: desktop 960×540 and mobile-landscape 844×390, DPR1; Eco and High; ground, launch, bridge, tunnel and underdeck. Adaptive scaling is off and reduced motion is on. Each measurement uses 15 warmup RAF frames and 60 sampled frames. This short-profile p95 is exploratory. The manual runner still defaults to 60 warmup/240 measured frames.

## Visual review

The requested neutral slate **#74828C** clearly separates patterned wall bases from the dark sky/background. All **80 current-run images** were inspected in independent review, covering all four treatments in all 20 conditions. Actual rendered comparisons show:

- Ground and launch: patterned rails, perimeter panels and storefront cladding are lighter; lane paving remains dark and readable.
- Bridge: rail/fascia cladding is lighter without changing framing, riding rails or skyline.
- Tunnel: opaque lower walls now use solid slate rather than the old dark paving artwork; the upper vault remains patterned and is lighter. Floor paving and guide lights are preserved.
- Underdeck: sidewall cladding and the patterned upper-deck soffit are lighter. The curved ramp's riding underside retains its existing dark paving artwork; recessed windows and sign backgrounds also intentionally remain dark.
- High-quality bloom retains readable patterns, lane separation and neon. No missing surfaces, changed geometry/framing or obvious shader-failure artifact was found in the reviewed fixed poses.
- Optional baked contacts are subtle, most apparent around bumper bases in the underdeck view. Optional roughness changes highlights without a visible broken surface. Neither is enabled by default.

These are fixed-camera reference-course captures, not an exhaustive course walkthrough. They do not assess motion shimmer or live keyboard/touch play.

## What the measurements establish

All recorded renderer strings identify **ANGLE/Vulkan SwiftShader Device (Subzero)**; this is software rendering. Chromium version is 151.0.7922.34. The mobile condition is a viewport, not an iPhone test.

Resource counters are consistent within every paired condition:

- Default wall separation adds **1 draw call at the bridge pose and 3 at other poses**. The triangle count is unchanged. No texture is added by the wall change.
- Baked contacts add **zero draw calls, triangles or textures** relative to PR default.
- Roughness adds **one texture**, with unchanged draw-call and triangle counts. Its 256×512 RGBA8 pixels plus mipmaps imply about 0.67 MiB of texture texels, plus 0.50 MiB of source pixels; actual GPU-driver allocation is not measured.

RAF delivery timings are heavily affected by software-renderer/runner scheduling and treatment order. For example, desktop Eco tunnel main→PR p95 is **716.7→1033.2 ms** forward, but **1050.0→683.3 ms** reverse. That reversal prevents a defensible no-regression or speedup claim. Keep the values as bounded diagnostic evidence, not hardware performance certification. CPU submission time is not GPU execution time.

Across the individual measurements (ranges only, not pooled statistics), RAF p95 spans 333.4–2283.3 ms and CPU-submit p95 spans 2.4–7.9 ms. Each 60-frame sample contains 42–49 intervals over 50 ms. Scene-ready measurements span 1.207–8.140 s and JS-heap snapshots 35.1–97.4 MB. Different conditions use independent runners; these ranges describe the evidence set, not a controlled cross-condition comparison.

### Old main → default walls: per-repeat p95 and draw calls

Each row below is one runner/condition. Forward and reverse repeat values remain separate; the table does not calculate a pooled percentile or cross-machine average.

| Condition | Forward p95 ms, main→PR | Reverse p95 ms, main→PR | Draw calls, main→PR |
| --- | ---: | ---: | ---: |
| desktop / eco / bridge | 500.1→949.9 | 949.9→733.3 | 49→50 |
| desktop / eco / ground | 900.0→966.7 | 1083.2→733.2 | 144→147 |
| desktop / eco / launch | 733.3→916.6 | 916.6→483.4 | 151→154 |
| desktop / eco / tunnel | 716.7→1033.2 | 1050.0→683.3 | 73→76 |
| desktop / eco / underdeck | 1299.9→1299.9 | 1083.3→1300.0 | 135→138 |
| desktop / high / bridge | 2283.3→2283.2 | 2283.2→2283.3 | 53→54 |
| desktop / high / ground | 1016.6→1033.2 | 1016.6→1033.3 | 148→151 |
| desktop / high / launch | 1316.6→1299.9 | 1300.0→1316.6 | 155→158 |
| desktop / high / tunnel | 1533.3→2183.2 | 2099.9→2083.2 | 77→80 |
| desktop / high / underdeck | 2199.9→2233.2 | 2199.9→1183.3 | 139→142 |
| mobile / eco / bridge | 483.4→716.6 | 716.7→700.0 | 55→56 |
| mobile / eco / ground | 616.7→616.7 | 333.4→633.2 | 144→147 |
| mobile / eco / launch | 883.3→883.2 | 883.3→883.3 | 151→154 |
| mobile / eco / tunnel | 550.1→666.7 | 766.7→416.7 | 75→78 |
| mobile / eco / underdeck | 983.2→966.7 | 983.3→966.7 | 135→138 |
| mobile / high / bridge | 816.7→816.6 | 833.2→816.5 | 59→60 |
| mobile / high / ground | 816.7→800.0 | 783.3→600.0 | 148→151 |
| mobile / high / launch | 1733.3→1733.3 | 1750.0→1733.4 | 155→158 |
| mobile / high / tunnel | 1383.3→1366.6 | 1066.6→1366.6 | 79→82 |
| mobile / high / underdeck | 1933.2→1933.3 | 1949.9→1949.9 | 139→142 |

The CSV also preserves each optional treatment's frame median/p95/max, CPU median/p95, long-frame counts, startup segment total, JS heap and renderer resource counters.

## Limits and recommendation

- Startup covers simulation creation through the first submitted render, excluding navigation, module loading and downloads. Caches are not cold-controlled; it is not time-to-interactive.
- JS heap is an optional coarse snapshot, not process or GPU memory. Resource counts are not allocation bytes.
- RAF long frames count intervals above 33.33 ms and 50 ms; they are descriptive, not an acceptance threshold. A short 60-frame p95 has weak tail precision.
- Physics, audio, input and production camera code are unchanged. The benchmark pauses simulation and does not measure input latency, GPU execution time, live physics or audio. Actual PC/iPhone performance and touch response remain unmeasured.
- The first single-run attempt timed out after 8/160 cases. Its partial evidence is historical and is not counted as complete coverage; see [execution history](fpv-fidelity-spike.md).

Accept the lighter-wall change on its visible result and measured small resource-counter delta, while retaining the material experiments default-off. The baked experiment has the lower structural runtime cost. The roughness lookup has no demonstrated timing benefit and should not become the default based on this evidence. Device-specific performance or response-equivalence claims need actual-device gameplay measurement; that follow-up is not evidence of a current regression.

No merge or deployment is included in this validation. The existing title-only PR17 remains separate.
