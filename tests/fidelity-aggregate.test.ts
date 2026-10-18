import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { readConfig, buildMatrix, caseUrl } = require('../spikes/fidelity/matrix.cjs');
const { aggregateRuns, aggregateDirectory, screenshotNames, validateScreenshot } = require('../spikes/fidelity/aggregate.cjs');
const { summarizeRun, renderMarkdown } = require('../spikes/fidelity/summarize.cjs');

function shards(profile = { warmup: 15, samples: 60 }) {
  const result: any[] = [];
  for (const viewport of ['desktop', 'mobile']) for (const quality of ['eco', 'high']) for (const pose of ['ground', 'launch', 'bridge', 'tunnel', 'underdeck']) {
    const config = readConfig({ FIDELITY_BASELINE_URL: 'http://127.0.0.1:5188', FIDELITY_PR_URL: 'http://127.0.0.1:5198',
      FIDELITY_BASELINE_COMMIT: '1234567890abcdef', FIDELITY_PR_COMMIT: 'abcdef1234567890',
      FIDELITY_VIEWPORT: viewport, FIDELITY_QUALITY: quality, FIDELITY_POSE: pose,
      FIDELITY_WARMUP: String(profile.warmup), FIDELITY_SAMPLES: String(profile.samples), FIDELITY_MEASUREMENT_TIMEOUT_MS: '600000' });
    const cases = buildMatrix(config).map((entry: any) => ({ ...entry, url: caseUrl(config, entry) }));
    const rows = cases.map((entry: any) => {
      const multiplier = entry.source === 'main' ? 1 : entry.variant === 'baseline' ? 2 : entry.variant === 'baked' ? 3 : 4;
      const dimensions = viewport === 'desktop' ? [960, 540] : [844, 390];
      const value = 400 * multiplier;
      return { ...entry, schemaVersion: 2, status: 'complete', healthChecks: 'context-loss-latched-v1',
        sourceUrl: entry.url, commitLabel: entry.source === 'main' ? config.baselineCommit : config.prCommit,
        viewportName: viewport, viewport: dimensions, buffer: dimensions, highQuality: quality === 'high',
        dpr: 1, adaptiveResolution: false, reducedMotion: true, requestedRenderer: 'software', gpu: 'ANGLE SwiftShader', softwareRendererDetected: true,
        warmupFrames: profile.warmup, sampleFrames: profile.samples, livePhysics: false, audio: false, gpuTime: 'not measured', inputLatency: 'not measured', errors: [],
        fixedState: { cameraPosition: [0, .5, 0], cameraQuaternion: [0, 0, 0, 1], cameraProjection: Array.from({ length: 16 }, (_, i) => i % 5 === 0 ? 1 : 0), buffer: dimensions },
        frameIntervalMs: { median: value, p95: value, max: value, samples: profile.samples },
        cpuSubmitMs: { median: value - 1, p95: value - 1, max: value - 1, samples: profile.samples },
        samples: { frameIntervalMs: Array(profile.samples).fill(value), cpuSubmitMs: Array(profile.samples).fill(value - 1) },
        longFramesOver33ms: profile.samples, longFramesOver50ms: profile.samples, drawCalls: 100, triangles: 10000,
        heapBytes: null, startupTimingsMs: { sceneReady: 2000 } };
    });
    result.push({ name: `fpv-shard-${viewport}-${quality}-${pose}`, rows, manifest: { schemaVersion: 2,
      runId: `${viewport}-${quality}-${pose}`, status: 'complete', expectedMeasurements: 8, completedMeasurements: 8,
      startedAt: '2026-10-16T03:00:00Z', finishedAt: '2026-10-16T03:10:00Z', browserVersion: 'test-browser', config, cases } });
  }
  return result;
}

test('twenty completed condition shards become one validated160-case run without pooling samples', () => {
  const source = shards(), serialized = JSON.stringify(source);
  const { manifest, rows } = aggregateRuns([...source].reverse());
  assert.equal(manifest.status, 'complete'); assert.equal(manifest.completedMeasurements, 160);
  assert.equal(manifest.aggregation.shards.length, 20);
  assert.deepEqual(manifest.config.filters, { viewport: null, quality: null, pose: null });
  assert.equal(manifest.config.warmupFrames, 15); assert.equal(manifest.config.sampleFrames, 60);
  assert.equal(rows[0].samples.frameIntervalMs.length, 60);
  assert.equal(rows[0].frameIntervalMs.p95, source[0].rows[0].frameIntervalMs.p95);
  const markdown = renderMarkdown(summarizeRun(manifest, rows));
  assert.match(markdown, /15 warmup frames followed by 60 sampled frames/);
  assert.match(markdown, /60-sample p95 is exploratory and provides weak tail-latency evidence/);
  assert.match(markdown, /Aggregated from 20 completed condition shards/);
  assert.match(markdown, /Separate CI jobs may have different host load/);
  assert.equal(JSON.stringify(source), serialized, 'original shards retain their own complete8-case manifests');
});

test('default60/240 and odd sample counts retain correct declared percentile calculations', () => {
  for (const samples of [240, 61]) {
    const { manifest, rows } = aggregateRuns(shards({ warmup: 60, samples }));
    const sorted = Array.from({ length: samples }, (_, index) => index + 1), middle = Math.floor(samples / 2);
    rows[0].samples.cpuSubmitMs = sorted;
    rows[0].cpuSubmitMs = { median: samples % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
      p95: sorted[Math.ceil(samples * .95) - 1], max: samples, samples };
    assert.equal(summarizeRun(manifest, rows).groups[0].repeats[0].values[0].metrics.cpuP95Ms, sorted[Math.ceil(samples * .95) - 1]);
  }
});

test('missing, failed, partial and duplicate condition shards cannot produce complete evidence', () => {
  const source = shards();
  assert.throws(() => aggregateRuns(source.slice(1)), /exactly 20/);
  const duplicate = [...source]; duplicate[19] = duplicate[0];
  assert.throws(() => aggregateRuns(duplicate), /duplicate condition/);
  for (const update of [{ status: 'failed' }, { status: 'running' }, { completedMeasurements: 7 }, { error: 'WebGL context lost' }]) {
    const altered = [...source]; altered[0] = { ...source[0], manifest: { ...source[0].manifest, ...update } };
    assert.throws(() => aggregateRuns(altered), /complete 8\/8|failure evidence/);
  }
  const incomplete = [...source]; incomplete[0] = { ...source[0], rows: source[0].rows.slice(1) };
  assert.throws(() => aggregateRuns(incomplete), /complete 8\/8/);
});

test('aggregation rejects mixed sampling, source, renderer or browser configurations', () => {
  const source = shards();
  for (const update of [{ sampleFrames: 240 }, { warmupFrames: 60 }, { prCommit: 'fffffff' }, { deviceScaleFactor: 2 }, { measurementTimeoutMs: 120000 }]) {
    const altered = [...source]; altered[19] = { ...source[19], manifest: { ...source[19].manifest, config: { ...source[19].manifest.config, ...update } } };
    assert.throws(() => aggregateRuns(altered), /configurations differ/);
  }
  const browser = [...source]; browser[19] = { ...source[19], manifest: { ...source[19].manifest, browserVersion: 'different' } };
  assert.throws(() => aggregateRuns(browser), /browser versions differ/);
});

test('foreign and unhealthy rows fail aggregation even if each shard claims complete', () => {
  const source = shards();
  const foreign = structuredClone(source); foreign[0].rows[0].pose = 'tunnel';
  assert.throws(() => aggregateRuns(foreign), /foreign measurements/);
  const broken = structuredClone(source); broken[0].rows[0].errors = ['shader compile failed'];
  assert.throws(() => aggregateRuns(broken), /unhealthy row/);
  const wrongCount = structuredClone(source); wrongCount[0].rows[0].sampleFrames = 240;
  assert.throws(() => aggregateRuns(wrongCount), /workload metadata/);
  const wrongTail = structuredClone(source); wrongTail[0].rows[0].frameIntervalMs.p95 = 1;
  assert.throws(() => aggregateRuns(wrongTail), /disagrees with raw samples/);
});

test('directory aggregation copies80 PNGs unchanged and retains20 original source manifests', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fidelity-shards-'));
  const input = path.join(root, 'shards'), output = path.join(root, 'aggregate');
  const images = { desktop: pngFixture(960, 540), mobile: pngFixture(844, 390) };
  const png = images.desktop;
  try {
    const source = shards(); mkdirSync(input);
    for (const shard of source) {
      const directory = path.join(input, shard.name); mkdirSync(directory);
      writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(shard.manifest));
      writeFileSync(path.join(directory, 'results.json'), JSON.stringify(shard.rows));
      for (const name of screenshotNames(shard.manifest.config)) writeFileSync(path.join(directory, name), images[shard.manifest.config.filters.viewport as 'desktop' | 'mobile']);
    }
    const missing = screenshotNames(source[0].manifest.config)[0];
    rmSync(path.join(input, source[0].name, missing));
    assert.throws(() => aggregateDirectory(input, output), /missing or unexpected screenshots/);
    writeFileSync(path.join(input, source[0].name, missing), png);
    const aggregated = aggregateDirectory(input, output);
    assert.equal(aggregated.rows.length, 160);
    assert.equal(readdirSync(output).filter(name => name.endsWith('.png')).length, 80);
    assert.equal(readdirSync(path.join(output, 'source-manifests')).length, 20);
    assert.deepEqual(readFileSync(path.join(output, missing)), png);
    const condition = source[0].manifest.runId;
    assert.equal(readFileSync(path.join(output, 'source-manifests', `${condition}.json`), 'utf8'), JSON.stringify(source[0].manifest));
    assert.equal(JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8')).status, 'complete');
    assert.throws(() => aggregateDirectory(input, output), /output directory must be empty/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


// Synthetic full-size PNGs test file validation/copying without a browser.
function pngFixture(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const value of body) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}

test('PNG headers must match the full stage size at the declared device pixel ratio', () => {
  const config = shards()[0].manifest.config;
  validateScreenshot(pngFixture(960, 540), config, 'desktop.png');
  assert.throws(() => validateScreenshot(pngFixture(1, 1), config, 'thumbnail.png'), /full stage resolution/);
  assert.throws(() => validateScreenshot(Buffer.from('not a PNG'), config, 'bad.png'), /invalid PNG header/);
  validateScreenshot(pngFixture(1920, 1080), { ...config, deviceScaleFactor: 2 }, 'retina.png');
  assert.throws(() => validateScreenshot(pngFixture(960, 540), { ...config, deviceScaleFactor: 2 }, 'undersized.png'), /full stage resolution/);
});
