import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { watchRenderHealth } from '../spikes/fidelity/render-health';
import { readFileSync } from 'node:fs';
import { courseFlippers, courseLaunch, courseRamps, courseTunnels, deckHeight, deckOutline, pathFrame } from '../src/physics/reference-course';
import { BALL_RADIUS } from '../src/physics/table';
import { PinballSimulation } from '../src/physics/simulation';
import { clampFPVPitch, getFixture, poseNames, prepareFixture, readOptions, summarize } from '../spikes/fidelity/fixtures';

const require = createRequire(import.meta.url);
const { readConfig, buildMatrix, caseUrl } = require('../spikes/fidelity/matrix.cjs');
const { watchBrowserErrors, checkedScreenshot } = require('../spikes/fidelity/browser-evidence.cjs');
const env = {
  FIDELITY_BASELINE_URL: 'http://127.0.0.1:5188', FIDELITY_PR_URL: 'http://127.0.0.1:5198',
  FIDELITY_BASELINE_COMMIT: '1234567890abcdef', FIDELITY_PR_COMMIT: 'abcdef1234567890',
};

function insideDeck(x: number, z: number) {
  let inside = false;
  for (let i = 0, j = deckOutline.length - 1; i < deckOutline.length; j = i++) {
    const a = deckOutline[i], b = deckOutline[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

test('fixture coverage uses measured reference geometry for all five camera poses', () => {
  assert.deepEqual(poseNames, ['ground', 'launch', 'bridge', 'tunnel', 'underdeck']);
  assert.deepEqual(getFixture('launch').position, courseLaunch);
  assert.equal(getFixture('ground').position.x, (courseFlippers[0].x + courseFlippers[1].x) / 2);
  assert.equal(getFixture('ground').position.z, courseFlippers[0].z - 2.8);
  for (const [name, path] of [['bridge', courseRamps[1]], ['tunnel', courseTunnels[0]]] as const) {
    const fixture = getFixture(name), frame = pathFrame(path, path.length * .5);
    assert.equal(fixture.path, path);
    assert.equal(fixture.distance, path.length * .5);
    assert.deepEqual(fixture.position, frame.c);
    assert.equal(fixture.heading, Math.atan2(frame.tangent.x, -frame.tangent.z));
    assert.equal(fixture.pitch, Math.atan2(frame.tangent.y, 1));
  }
  assert.ok(getFixture('bridge').position.y > 1);
  assert.ok(getFixture('tunnel').position.y < -.5);
  const below = getFixture('underdeck');
  assert.ok(insideDeck(below.position.x, below.position.z));
  assert.equal(below.position.y, BALL_RADIUS + .015);
  assert.ok(below.position.y + .3 < deckHeight, 'camera is beneath the measured deck');
});

test('real route capture prepares deterministic paused bridge/tunnel fixtures without production hooks', async () => {
  for (const name of poseNames) {
    const states = [];
    for (let repeat = 0; repeat < 2; repeat++) {
      // Every measured page constructs a fresh simulation, as this test does.
      const sim = await PinballSimulation.create({ course: 'reference' });
      try {
        const { fixture, preparationSteps } = prepareFixture(sim, name);
        const state = { position: { ...sim.position }, heading: fixture.heading, pitch: fixture.pitch,
          routeDistance: sim.reference!.routeDistance, guided: sim.reference!.guided, phase: sim.route.phase,
          preparationSteps };
        states.push(state);
        assert.equal(sim.paused, true); assert.equal(sim.phase, 'playing'); assert.equal(sim.events.length, 0);
        if (fixture.path) {
          assert.equal(sim.reference!.path, fixture.path);
          assert.equal(sim.reference!.guided, true);
          assert.ok(preparationSteps > 0 && preparationSteps < 2400);
          const frame = pathFrame(fixture.path, sim.reference!.routeDistance);
          assert.ok(Math.hypot(sim.position.x - frame.c.x, sim.position.y - frame.c.y, sim.position.z - frame.c.z) < 1e-6);
          assert.equal(sim.route.phase, name === 'tunnel' ? 'tunnel' : 'bridge');
        } else assert.equal(sim.reference!.guided, false);
        // Kinematic route riders retain an instantaneous velocity; pausing
        // freezes the position and simulation time without changing body type.
        const position = { ...sim.position }, velocity = { ...sim.velocity }, time = sim.time;
        for (let i = 0; i < 10; i++) sim.step();
        assert.deepEqual({ ...sim.position }, position); assert.equal(sim.time, time);
        assert.deepEqual({ ...sim.velocity }, velocity);
      } finally { sim.dispose(); }
    }
    assert.deepEqual(states[0], states[1], `${name} preparation repeats exactly`);
  }
});

test('fixed-camera pitch uses the production 18-degree or reduced-motion 8-degree envelope', () => {
  assert.equal(clampFPVPitch(Math.PI, false), 18 * Math.PI / 180);
  assert.equal(clampFPVPitch(-Math.PI, false), -18 * Math.PI / 180);
  assert.equal(clampFPVPitch(Math.PI, true), 8 * Math.PI / 180);
  assert.equal(clampFPVPitch(-Math.PI, true), -8 * Math.PI / 180);
  assert.equal(clampFPVPitch(.01, true), .01);
});

test('harness options strictly label quality/source and never claim old-main bake variants', () => {
  assert.deepEqual(readOptions(''), { source: 'pr', variant: 'baseline', quality: 'high', pose: 'ground', viewport: 'desktop', commitLabel: 'unlabelled', warmupFrames: 60, sampleFrames: 240 });
  assert.equal(readOptions('?source=main&quality=eco&pose=tunnel&viewport=mobile').quality, 'eco');
  assert.equal(readOptions('?source=pr&fidelity=roughness&commit=abcdef0').commitLabel, 'abcdef0');
  for (const query of ['?source=legacy', '?quality=medium', '?pose=unknown', '?viewport=phone', '?fidelity=unknown', '?source=main&fidelity=baked']) {
    assert.throws(() => readOptions(query));
  }
});

test('summary reports the actual median and nearest-rank p95 without mutating samples', () => {
  const samples = [4, 1, 3, 2];
  assert.deepEqual(summarize(samples), { median: 2.5, p95: 4, max: 4, samples: 4 });
  assert.deepEqual(samples, [4, 1, 3, 2]);
  assert.equal(summarize(Array.from({ length: 100 }, (_, i) => i + 1)).p95, 95);
  assert.equal(summarize([3, 1, 2]).median, 2);
  for (const invalid of [[], [NaN], [-1], [Infinity]]) assert.throws(() => summarize(invalid));
});

test('full matrix includes old main plus all PR variants, Eco/High, both viewports and reversed repeats', () => {
  const config = readConfig(env), matrix = buildMatrix(config);
  assert.equal(matrix.length, 160);
  assert.deepEqual(new Set(matrix.map((entry: any) => entry.quality)), new Set(['eco', 'high']));
  assert.deepEqual(new Set(matrix.map((entry: any) => entry.viewport)), new Set(['desktop', 'mobile']));
  assert.deepEqual(new Set(matrix.map((entry: any) => entry.pose)), new Set(poseNames));
  for (let i = 0; i < matrix.length; i += 8) {
    const forward = matrix.slice(i, i + 4), reverse = matrix.slice(i + 4, i + 8);
    const treatment = (entry: any) => `${entry.source}/${entry.variant}`;
    assert.deepEqual(forward.map(treatment), ['main/baseline', 'pr/baseline', 'pr/baked', 'pr/roughness']);
    assert.deepEqual(reverse.map(treatment), [...forward].reverse().map(treatment));
    assert.ok(forward.every((entry: any) => entry.order === 'forward' && entry.repeat === 0));
    assert.ok(reverse.every((entry: any) => entry.order === 'reverse' && entry.repeat === 1));
  }
  for (const entry of matrix) {
    const url = new URL(caseUrl(config, entry));
    assert.equal(url.port, entry.source === 'main' ? '5188' : '5198');
    assert.equal(url.pathname, '/spikes/fidelity/');
    assert.equal(url.searchParams.get('commit'), entry.source === 'main' ? env.FIDELITY_BASELINE_COMMIT : env.FIDELITY_PR_COMMIT);
    assert.equal(url.searchParams.get('quality'), entry.quality);
    assert.equal(url.searchParams.get('fidelity'), entry.variant);
  }
});

test('runner refuses missing or misleading old-main provenance and unpaired repetitions', () => {
  assert.throws(() => readConfig({ ...env, FIDELITY_BASELINE_URL: '' }), /BASELINE_URL is required/);
  assert.throws(() => readConfig({ ...env, FIDELITY_PR_URL: env.FIDELITY_BASELINE_URL }), /separate checkout URLs/);
  assert.throws(() => readConfig({ ...env, FIDELITY_BASELINE_URL: 'file:///tmp/main' }), /HTTP/);
  assert.throws(() => readConfig({ ...env, FIDELITY_BASELINE_COMMIT: '' }), /BASELINE_COMMIT/);
  assert.throws(() => readConfig({ ...env, FIDELITY_PR_COMMIT: 'main' }), /PR_COMMIT/);
  assert.throws(() => readConfig({ ...env, FIDELITY_PR_COMMIT: env.FIDELITY_BASELINE_COMMIT }), /different commit/);
  for (const repeats of ['1', '3', '2.5', '-2']) assert.throws(() => readConfig({ ...env, FIDELITY_REPEATS: repeats }), /even integer/);
  assert.equal(buildMatrix(readConfig({ ...env, FIDELITY_REPEATS: '4' })).length, 320);
  assert.throws(() => readConfig({ ...env, FIDELITY_DPR: '0' }), /DPR/);
  assert.throws(() => readConfig({ ...env, PERF_GPU: 'magic' }), /PERF_GPU/);
});

test('portable harness has no fidelity-bake dependency and normal build typechecks it', () => {
  const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');
  for (const file of ['../spikes/fidelity/harness.ts', '../spikes/fidelity/fixtures.ts']) {
    assert.doesNotMatch(read(file), /from\s+['"][^'"]*fidelity-bake/);
  }
  const packageJson = JSON.parse(read('../package.json'));
  assert.match(packageJson.scripts.build, /typecheck:fidelity/);
  assert.match(packageJson.scripts['typecheck:fidelity'], /tsconfig\.fidelity\.json/);
  assert.ok(JSON.parse(read('../tsconfig.fidelity.json')).include.includes('spikes/fidelity/**/*.ts'));
  const harness = read('../spikes/fidelity/harness.ts');
  assert.match(harness, /WARMUP_FRAMES = options.warmupFrames, SAMPLE_FRAMES = options.sampleFrames/);
  assert.match(harness, /gpuTime: 'not measured'/);
  assert.match(harness, /inputLatency: 'not measured'/);
  assert.match(harness, /caller-supplied; not independently verified/);
  assert.match(harness, /view\.budget\.enabled = false/);
});


test('WebGL loss event latches permanently, including a loss between readiness and click', () => {
  const canvas = new EventTarget(), failures: Error[] = [];
  const health = watchRenderHealth(canvas, { isContextLost: () => false }, error => failures.push(error));
  health.assertHealthy('ready');
  canvas.dispatchEvent(new Event('webglcontextlost'));
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.equal(failures.length, 1);
  assert.throws(() => health.assertHealthy('before click'), /WebGL context lost/);
  assert.throws(() => health.assertHealthy('publishing complete'), /WebGL context lost/);
  canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(failures.length, 1, 'the first failure is retained');
  health.dispose();
});

test('context polling rejects loss before the browser dispatches its event', () => {
  for (const phase of ['after renderer construction', 'before shader warmup', 'after shader warmup', 'after first render', 'ready', 'before measurement frame 0', 'after measurement frame 299', 'complete']) {
    const failures: Error[] = [];
    let lost = true;
    const health = watchRenderHealth(new EventTarget(), { isContextLost: () => lost }, error => failures.push(error));
    assert.throws(() => health.assertHealthy(phase), /WebGL context lost/);
    lost = false;
    assert.throws(() => health.assertHealthy('restored'), /WebGL context lost/);
    assert.equal(failures.length, 1);
    health.dispose();
  }
});

test('runner collects console.error shader failures and uncaught page exceptions', () => {
  const page = new EventEmitter(), evidence = watchBrowserErrors(page);
  const message = (type: string, text: string) => ({ type: () => type, text: () => text, location: () => ({ url: 'harness.ts' }) });
  page.emit('console', message('warning', 'diagnostic warning'));
  evidence.assertClean('ready');
  page.emit('console', message('error', 'THREE.WebGLProgram: shader failed to compile'));
  assert.throws(() => evidence.assertClean('ready'), /console.error: THREE.WebGLProgram/);
  page.emit('pageerror', new Error('render exception'));
  assert.equal(evidence.errors.length, 2);
  assert.throws(() => evidence.assertClean('after measurement'), /pageerror: render exception/);
});

test('screenshot evidence rejects existing errors before capture and errors emitted during capture', async () => {
  for (const when of ['before', 'during']) {
    const page = new EventEmitter() as EventEmitter & { locator: () => unknown };
    const evidence = watchBrowserErrors(page);
    let captures = 0;
    const emitError = () => page.emit('console', { type: () => 'error', text: () => 'WebGL failure', location: () => ({}) });
    page.locator = () => ({ screenshot: async () => { captures++; if (when === 'during') emitError(); } });
    if (when === 'before') emitError();
    await assert.rejects(checkedScreenshot(page, 'unused.png', async (phase: string) => evidence.assertClean(phase)), /WebGL failure/);
    assert.equal(captures, when === 'before' ? 0 : 1);
  }
});

test('context polling gates warmup, readiness, every rendered frame and completed results', () => {
  const harness = readFileSync(new URL('../spikes/fidelity/harness.ts', import.meta.url), 'utf8');
  assert.match(harness, /watchRenderHealth\(view.renderer.domElement, gl, fail\)/);
  assert.match(harness, /health.assertHealthy\('before shader warmup'\);\s*await view.warmup\(\);\s*health.assertHealthy\('after shader warmup'\)/);
  assert.match(harness, /health.assertHealthy\('before first render'\);\s*view.render/);
  assert.match(harness, /health.assertHealthy\('after first render'\)/);
  assert.match(harness, /health.assertHealthy\(`before publishing \$\{status\}`\)/);
  assert.match(harness, /health.assertHealthy\(`before measurement frame \$\{i\}`\)/);
  assert.match(harness, /health.assertHealthy\(`after measurement frame \$\{i\}`\)/);
  const runner = readFileSync(new URL('../spikes/fidelity/run.cjs', import.meta.url), 'utf8');
  assert.match(runner, /window\.__fidelityAssertHealthy\(\)/);
  assert.match(runner, /await readReport\('readiness'\)/);
  assert.match(runner, /await checkedScreenshot/);
  assert.match(runner, /await readReport\('before measurement'\)/);
  assert.match(runner, /await readReport\('after measurement'\)/);
  assert.match(runner, /evidence.assertClean\('before accepting measurement'\)/);
});


test('sampling profiles are bounded, declared in queries and preserve the default profile', () => {
  const defaults = readConfig(env);
  assert.equal(defaults.warmupFrames, 60); assert.equal(defaults.sampleFrames, 240);
  const bounded = readConfig({ ...env, FIDELITY_WARMUP: '15', FIDELITY_SAMPLES: '60', FIDELITY_MEASUREMENT_TIMEOUT_MS: '600000' });
  assert.equal(bounded.measurementTimeoutMs, 600000);
  const options = readOptions(new URL(caseUrl(bounded, buildMatrix(bounded)[0])).search);
  assert.equal(options.warmupFrames, 15); assert.equal(options.sampleFrames, 60);
  for (const [key, value] of [['FIDELITY_WARMUP', '14'], ['FIDELITY_SAMPLES', '59'], ['FIDELITY_SAMPLES', '60.5'], ['FIDELITY_MEASUREMENT_TIMEOUT_MS', '600001']]) {
    assert.throws(() => readConfig({ ...env, [key]: value }));
  }
  for (const query of ['?warmup=14', '?samples=59', '?samples=6000', '?samples=NaN']) assert.throws(() => readOptions(query));
});

test('each filtered condition preserves all eight treatment/order cases and twenty shards cover the full matrix', () => {
  const full = buildMatrix(readConfig(env));
  const collected: any[] = [];
  for (const viewport of ['desktop', 'mobile']) for (const quality of ['eco', 'high']) for (const pose of poseNames) {
    const config = readConfig({ ...env, FIDELITY_VIEWPORT: viewport, FIDELITY_QUALITY: quality, FIDELITY_POSE: pose });
    const shard = buildMatrix(config);
    assert.equal(shard.length, 8);
    assert.ok(shard.every((entry: any) => entry.viewport === viewport && entry.quality === quality && entry.pose === pose));
    collected.push(...shard);
  }
  assert.deepEqual(collected, full);
  for (const key of ['FIDELITY_VIEWPORT', 'FIDELITY_QUALITY', 'FIDELITY_POSE']) assert.throws(() => readConfig({ ...env, [key]: 'unknown' }));
  const runner = readFileSync(new URL('../spikes/fidelity/run.cjs', import.meta.url), 'utf8');
  assert.match(runner, /status, timeout = 120000/);
  assert.match(runner, /waitForStatus\('complete', config.measurementTimeoutMs\)/);
});
