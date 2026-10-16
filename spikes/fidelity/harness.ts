import { PinballSimulation } from '../../src/physics/simulation';
import { PinballView } from '../../src/render/view';
import { watchRenderHealth } from './render-health';
import { clampFPVPitch, prepareFixture, readOptions, summarize } from './fixtures';

const report = document.querySelector<HTMLPreElement>('#report')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const stage = document.querySelector<HTMLElement>('#stage')!;

declare global { interface Window { __fidelityAssertHealthy?: () => void } }

function fail(error: unknown) {
  report.dataset.status = 'error';
  report.textContent = JSON.stringify({ status: 'error', error: error instanceof Error ? error.message : String(error) }, null, 2);
  run.disabled = true;
}

async function main() {
  const options = readOptions(location.search);
  const WARMUP_FRAMES = options.warmupFrames, SAMPLE_FRAMES = options.sampleFrames;
  const viewport = options.viewport === 'mobile' ? [844, 390] : [960, 540];
  stage.style.width = `${viewport[0]}px`; stage.style.height = `${viewport[1]}px`;
  const start = performance.now();
  const sim = await PinballSimulation.create({ course: 'reference' });
  const simulationReady = performance.now();
  const { fixture, preparationSteps } = prepareFixture(sim, options.pose);
  const poseReady = performance.now();
  const view = new PinballView(stage, true, true);
  const gl = view.renderer.getContext();
  const health = watchRenderHealth(view.renderer.domElement, gl, fail);
  // Let the runner poll the live context immediately around screenshot capture,
  // including the idle gap between initial readiness and the Run click.
  window.__fidelityAssertHealthy = () => health.assertHealthy('before evidence capture');
  health.assertHealthy('after renderer construction');
  view.setQuality(options.quality === 'high');
  view.budget.enabled = false;
  view.mode = 'fpv'; view.heading = fixture.heading;
  view.routeCamera.pitch = clampFPVPitch(fixture.pitch, view.effects.reducedMotion);
  const viewReady = performance.now();
  health.assertHealthy('before shader warmup');
  await view.warmup();
  health.assertHealthy('after shader warmup');
  const shadersReady = performance.now();
  health.assertHealthy('before first render');
  view.render(sim, 0, 1000 / 60);
  const firstRenderReady = performance.now();
  health.assertHealthy('after first render');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const snapshot = () => ({
    ball: { ...sim.position }, velocity: { ...sim.velocity }, rotation: { ...sim.ball.rotation() }, simulationTime: sim.time,
    guided: sim.reference!.guided, routeDistance: sim.reference!.routeDistance, routePhase: sim.route.phase,
    cameraPosition: view.camera.position.toArray(), cameraQuaternion: view.camera.quaternion.toArray(),
    cameraProjection: view.camera.projectionMatrix.toArray(), buffer: [view.renderer.domElement.width, view.renderer.domElement.height],
  });
  const fixedState = snapshot(), fixedStateJSON = JSON.stringify(fixedState);
  const base = {
    schemaVersion: 2, harness: 'shared-old-main-vs-pr', healthChecks: 'context-loss-latched-v1', ...options,
    sourceUrl: location.href, commitLabelVerification: 'caller-supplied; not independently verified by browser',
    viewportName: options.viewport, viewport, dpr: devicePixelRatio, buffer: fixedState.buffer, highQuality: view.highQuality,
    adaptiveResolution: view.budget.enabled, gpu, softwareRendererDetected: /swiftshader|llvmpipe|software|softpipe/i.test(gpu),
    reducedMotion: view.effects.reducedMotion, fixedState,
    fixture: { landmark: fixture.landmark, position: fixture.position, heading: fixture.heading, pitch: view.routeCamera.pitch, pathTangentPitch: fixture.pitch,
      pitchLimitDegrees: view.effects.reducedMotion ? 8 : 18,
      path: fixture.path?.name ?? null, distance: fixture.distance ?? null, preparationSteps },
    startupTimingsMs: {
      simulationCreation: simulationReady - start, posePreparation: poseReady - simulationReady,
      viewConstruction: viewReady - poseReady, shaderWarmup: shadersReady - viewReady,
      firstRender: firstRenderReady - shadersReady, sceneReady: firstRenderReady - start,
    },
    startupNotes: 'Simulation creation through first submitted render; excludes module evaluation/navigation/download and is not time to interactive.',
  };
  const display = (value: unknown, status: string) => {
    health.assertHealthy(`before publishing ${status}`);
    report.textContent = JSON.stringify(value, null, 2); report.dataset.status = status;
  };
  display({ ...base, status: 'ready', notes: 'Fixed camera and paused simulation. Audio is not initialized.' }, 'ready');
  run.disabled = false;
  let hiddenDuringRun = false;
  document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenDuringRun = true; });
  run.addEventListener('click', async () => {
    if (run.disabled) return;
    run.disabled = true; hiddenDuringRun = document.hidden;
    try {
      display({ ...base, status: 'running', warmupFrames: WARMUP_FRAMES, sampleFrames: SAMPLE_FRAMES }, 'running');
      const frameIntervals: number[] = [], cpuSubmit: number[] = [];
      let previous = 0;
      for (let i = 0; i < WARMUP_FRAMES + SAMPLE_FRAMES; i++) {
        const frameTime = await new Promise<number>(requestAnimationFrame);
        if (document.hidden || hiddenDuringRun) throw new Error('Page lost foreground visibility; discard this timing run.');
        health.assertHealthy(`before measurement frame ${i}`);
        const before = performance.now();
        view.render(sim, 0, 1000 / 60);
        const after = performance.now();
        health.assertHealthy(`after measurement frame ${i}`);
        if (i >= WARMUP_FRAMES) { frameIntervals.push(frameTime - previous); cpuSubmit.push(after - before); }
        previous = frameTime;
      }
      if (JSON.stringify(snapshot()) !== fixedStateJSON) throw new Error('Camera, buffer or simulation state moved during the fixed-pose run.');
      display({
        ...base, status: 'complete', warmupFrames: WARMUP_FRAMES, sampleFrames: SAMPLE_FRAMES,
        frameIntervalMs: summarize(frameIntervals), cpuSubmitMs: summarize(cpuSubmit),
        longFramesOver33ms: frameIntervals.filter(value => value > 1000 / 30).length,
        longFramesOver50ms: frameIntervals.filter(value => value > 50).length,
        samples: { frameIntervalMs: frameIntervals, cpuSubmitMs: cpuSubmit },
        heapBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
        drawCalls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles,
        geometryCount: view.renderer.info.memory.geometries, textureCount: view.renderer.info.memory.textures,
        programCount: view.renderer.info.programs?.length ?? null,
        gpuTime: 'not measured', inputLatency: 'not measured', livePhysics: false, audio: false,
        notes: 'Static render-only workload. RAF intervals measure frame delivery; CPU submission is not GPU time. Heap is an optional JS-heap snapshot, not GPU memory. These results do not establish gameplay or touch responsiveness.',
      }, 'complete');
      run.disabled = false;
    } catch (error) { fail(error); }
  });
  window.addEventListener('pagehide', () => { health.dispose(); view.dispose(); sim.dispose(); }, { once: true });
}
main().catch(fail);
