# Directional render-cost spike (cloud-only)

## Result and evidence boundary

Static geometry/frustum estimates completed for eight directions at four identical held poses in the explicit orbit circuit scene, plus two held poses in the default reference scene. The default reference launch sample estimates 163 scene calls versus 153 forward (+6.5%), and 191,206 triangles versus 186,194 (+2.7%); the reference ground sample peaks facing forward. These two reference locations do not bound elevated/tunnel/rear workload across the whole course. The separate orbit samples suggest directional workload headroom is needed: bridge right90 estimates 118 scene calls versus 78 forward (+51.3%); tunnel right90 estimates 105,796 submitted triangles versus 62,454 forward (+69.4%). These are **not measured WebGL renderer counters or frame timings**.

Chromium could not start in this executor: local socket creation returned EPERM. The supported escalation route also failed during environment setup before the browser ran. Therefore there are **no CPU submission, frame interval, GPU duration, iPhone performance, or sensor-latency results**. `run.cjs` is the ready-to-run browser measurement harness, not a successfully executed benchmark. No production source files were edited. The scripts and corrected evidence are versioned on the design branch.

## Reproduce

Place this directory under `spikes/look-around/render/` in a checkout of commit `21cbb73e02adc82285f811d89b1539a6a14b7ec7`, install the lockfile's dependencies, and run from the repository root:

    APP_ROOT="$PWD" SCENE=reference SOURCE_REF=21cbb73e02adc82285f811d89b1539a6a14b7ec7 node spikes/look-around/render/static-estimate.cjs
    APP_ROOT="$PWD" SCENE=orbit SOURCE_REF=21cbb73e02adc82285f811d89b1539a6a14b7ec7 node spikes/look-around/render/static-estimate.cjs
    APP_ROOT="$PWD" CHROME_PATH=/path/to/chromium SOURCE_REF=21cbb73e02adc82285f811d89b1539a6a14b7ec7 node spikes/look-around/render/run.cjs

Set APP_ROOT to an alternate app checkout and RENDER_OUT to an output directory. The static estimator defaults to SCENE=reference; SCENE=orbit selects the alternate circuit. The browser harness explicitly opens `?table=orbit&circuit=1` and measures only that alternate scene, not the default reference course. Browser harness uses a local Vite server, paused simulation, actual render calls, disabled adaptive resolution, manual `view.routeCamera.heading/pitch`, four warm-up and ten measured frames per direction per quality. It records calls, triangles, JavaScript render submission duration, requestAnimationFrame intervals, camera position and renderer identity. It includes Eco and High separately. It does not implement the proposed controller and cannot measure sensor-to-photon latency.

Static fallback runs unchanged scene constructors but uses no-op canvas texture painting, then Three.js bounding-sphere frustum tests and material/geometry-group counts. The player ball group is hidden, matching production FPV rather than the constructor’s intro state. Transparent double-sided material passes are counted. It excludes postprocessing, shadows, effects, physics camera-clearance adjustments and live mechanism state. Scene construction mixes the package's ESM/CommonJS Three.js instances, which logs warnings; counts use structural flags and geometry data rather than instance identity. It is a directional comparison of this static scene, not a replica of renderer.info.

## Provenance

All 52 runtime/config files in the isolated local `app/` were retrieved from GitHub through the connector at the exact commit. All Git blob SHA-1 hashes were verified locally against connector metadata. The connector omitted the large droid audio bytes; existing local bytes were used only after their blob SHA matched the connector SHA. `source-manifest.json` records the file hashes and source URLs. Existing installed dependencies were reused from pinball-iphone, whose package-lock is byte-equivalent in parsed content to the exact commit's lockfile. No dependency network request was needed.

The `app/` directory and its node_modules symlink are local measurement inputs, not proposed deliverables to commit. Commit only the scripts, README, manifest and evidence JSON. `evidence/static-estimate.json` has 32 orbit direction/pose rows; `evidence/static-reference-estimate.json` has 16 default reference rows and `reference-summary.json` its separate maxima; `evidence/summary.json` summarizes relative maxima. `evidence/browser-status.json` records why timing results are absent.

## Design implication

The following larger percentages apply to the alternate orbit circuit, not the two reference fixtures. Treat yaw as potentially raising submitted geometry, not automatically cheap because camera rotation changes no meshes. The sampled ±45° views peak at +33.3% scene calls (bridge) and +41.8% submitted triangles (tunnel) versus the same pose facing forward. The ±90° stress cases peak at +51.3% calls and +69.4% triangles. This does not establish frame-rate thresholds or justify automatic quality changes yet. Measure physical iPhone Safari at production DPR/quality, including first-turn shader work, moving play, near-surface views, heat and simultaneous touch, before shipping sensor look-around.

