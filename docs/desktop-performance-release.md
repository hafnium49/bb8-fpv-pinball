# Desktop rendering performance

PC browsers are the primary target of this release. The previous High preset drew the entire directional shadow map and a five-level bloom chain every frame, while most cabinet parts remained separate meshes. Physics and camera queries were small compared with measured graphics work. The cabinet, original artwork, stabilized FPV, circuit geometry, 120 Hz physics, CCD and nonverbal droid/music experience are retained.

## Rendering changes

- **Static GPU batches:** 57 stationary meshes become 20 material/shadow/spatial batches. Six-unit cells retain useful FPV culling. World transforms, normals and UVs are baked once, indexed vertex reuse is retained, and batch origins sit at their bounds centers for depth sorting; moving flippers, bumper caps, the intro ball, portal arcs and transparent surfaces keep independent transforms/sorting. The scene root continues updating dynamic descendants and later-added effects. This uses ordinary WebGL 2 geometry buffers and works without a multi-draw extension.
- **Cached shadows:** regenerate the map when a flipper, bumper cap or visible intro ball changes, or after a quality/context reset. Following the moving ball with the camera does not invalidate a world-space shadow map. Tests distinguish the initial shadow draw, idle frames and moving mechanisms.
- **One glow/output pass:** a single HDR scene target and full-screen resolve replace the bloom mip chain and separate output pass. Four nearby bright samples supply restrained emissive glow, then the existing ACES exposure and sRGB conversion apply. Reflections, geometry and artwork remain. Eco has no post target; switching modes releases its GPU resources. Half-float HDR is used when supported. GPUs without float render targets use direct tone-mapped output with High shadows and no glow pass, avoiding clipped RGBA8 intermediates.
- **Automatic resolution:** High retains native 1920×1080 on a 1× display and caps work at three million pixels/density 1.5. Eco caps at two million pixels/density 1. A bounded 30-frame history detects recurring slow delivery, including fast RAF bursts interrupted by GPU stalls. Two pressured deliveries and a sustained window prevent one isolated hiccup from changing quality. Render scale steps through 1, .85, .7, .6 and .5; recovery requires six seconds of headroom. Only the canvas buffer changes: the HTML controls and display stay at CSS resolution. This targets smooth 60 Hz play; it does not guarantee 60 FPS on every GPU.
- **Frame preparation:** warm shaders asynchronously before enabling Start, using the actual HDR/direct target. Rebuild the camera projection only on FOV/aspect changes. Hide/stop uploads for idle particle pools, cache unchanged HUD/control values, and schedule sound/input feedback before submitting graphics.

Full-quality glow is deliberately tighter than the former multi-scale blur. Desktop cabinet, FPV and mobile landscape screenshots were inspected after the rendering fixes.

## Measured result

| High scene | Before calls | After calls | Software GPU median, before → after |
| --- | ---: | ---: | ---: |
| launch | 194 | 91 | 867.71 → 769.79 ms |
| ground | 161 | 71 | 781.86 → 765.55 ms |
| bridge | 146 | 56 | 525.40 → 471.78 ms |
| tunnel | 160 | 53 | 713.73 → 659.39 ms |

All fixed cases have 16 GPU timer samples at identical resolution and camera coordinates. Raw GPU samples are retained; even-count medians average the two middle sorted values. High draw calls fall by 53.09–66.88%; its isolated software-GPU median changes range from -11.29 to -2.09%. Eco median changes range from -5.63 to +6.57%. These timings describe this runner and do not establish a universal FPS improvement. The live optimized trial reaches scale 0.7 while following actual physics.

The full 56-test suite, circuit/guide checks, Chromium gameplay checks, five cabinet layouts, both Web Audio cases, and desktop renderer regressions in Chromium/WebKit pass. Renderer checks verify rendered flipper/bumper/score-sprite world transforms, direct output without HDR support, unchanged control bounds at scale .5, correct shadow refresh, stable texture counts across five quality round trips, idle particle buffers, projection caching and the 4K pixel cap.

## Technology choice

The current Three.js documentation describes WebGPU's modern backend and WebGL 2 fallback, but also says performance depends on the scene and that migration requires porting the post-processing/material stack. The available Chromium runner exposed the API but returned no GPU adapter; the Linux WebKit runner did not expose it. This release therefore ships the measured, tested WebGL 2 improvements. A native WebGPU migration needs a comparable full-scene prototype and hardware results before becoming the default.

Primary sources checked for the design:

- [Three.js WebGPURenderer and migration guidance](https://threejs.org/manual/pages/webgpurenderer.html)
- [Three.js WebGLRenderer asynchronous shader compilation](https://threejs.org/docs/pages/WebGLRenderer.html)
- [WebGL batching, smaller back buffers and nonblocking operations](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- [Chrome's WebGPU platform overview](https://developer.chrome.com/docs/web-platform/webgpu/overview)

## Verification and reproduction

Run `npm ci`, `npm test`, `npm run test:circuit`, `npm run test:guides`, `npm run build`, `npm run test:browser`, `npm run test:cabinet:browser`, `npm run test:audio:browser` and `npm run test:render:browser`. The renderer harness covers High output in a desktop viewport, shadow invalidation, projection caching, particle inactivity, repeated quality switches, synthetic sustained frame pressure and the 4K pixel cap. After installing Playwright WebKit and its dependencies, run `RENDER_ENGINE=webkit npm run test:render:browser` for the second engine.

`npm run benchmark:desktop` writes `artifacts/performance/candidate.json`. By default it selects ANGLE SwiftShader to make the environment explicit. The fixed scenes hold launch, ground, bridge and tunnel poses at 1440×900, disable automatic scaling, warm each workload, and collect 16 nonblocking GPU timer samples per scene/preset. A single timed frame stays in flight; missing/disjoint samples fail rather than quietly biasing the median. JS submission, isolated GPU work and live frame delivery are separate measurements. The live trial follows actual physics and therefore is not a trajectory-matched FPS comparison.

For a physical PC, use `CHROME_PATH=/path/to/chrome PERF_GPU=hardware PERF_HEADLESS=0 npm run benchmark:desktop`. Inspect the recorded renderer to verify hardware acceleration; requesting hardware does not establish that a driver actually supplied it.

Release evidence is recorded in [the validation report](validation/desktop-performance.json), [the baseline](validation/desktop-performance-baseline.json) and [the optimized fixed-scene results](validation/desktop-performance-candidate.json). The baseline is main commit `b980a1a3e0968b58b9f72800a006fed507f088ae`, tree `9e799b77b1d7743c3ca72d7096d8dd2581c8f1a0`.

The runner has no physical PC GPU. Software-GPU timers and render counters support a controlled workload comparison; they do not establish Windows/macOS hardware FPS. Chromium and Linux WebKit validate browser-engine behavior, rather than certifying every shipping browser/driver. The previous iPhone release's evidence remains a historical record.
