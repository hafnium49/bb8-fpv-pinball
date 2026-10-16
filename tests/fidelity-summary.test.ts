import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { summarizeRun, renderMarkdown, ratio } = require('../spikes/fidelity/summarize.cjs');
const { readConfig, buildMatrix, caseUrl } = require('../spikes/fidelity/matrix.cjs');

function timing(raw: number[]) {
  const sorted = [...raw].sort((a, b) => a - b);
  return { median: (sorted[119] + sorted[120]) / 2, p95: sorted[227], max: sorted[239], samples: 240 };
}

function completeRun() {
  const config = readConfig({ FIDELITY_BASELINE_URL: 'http://127.0.0.1:5188', FIDELITY_PR_URL: 'http://127.0.0.1:5198',
    FIDELITY_BASELINE_COMMIT: '1234567890abcdef', FIDELITY_PR_COMMIT: 'abcdef1234567890' });
  const cases = buildMatrix(config).map((entry: any) => ({ ...entry, url: caseUrl(config, entry) }));
  const rows = cases.map((entry: any) => {
    const multiplier = entry.source === 'main' ? 1 : entry.variant === 'baseline' ? 2 : entry.variant === 'baked' ? 3 : 4;
    const frameIntervalMs = Array.from({ length: 240 }, (_, i) => (10 + i / 1000) * multiplier + entry.repeat);
    const cpuSubmitMs = Array.from({ length: 240 }, (_, i) => (1 + i / 1000) * multiplier + entry.repeat);
    const viewport = entry.viewport === 'mobile' ? [844, 390] : [960, 540];
    return {
      ...entry, schemaVersion: 2, status: 'complete', healthChecks: 'context-loss-latched-v1',
      sourceUrl: entry.url, commitLabel: entry.source === 'main' ? config.baselineCommit : config.prCommit,
      viewportName: entry.viewport, viewport, buffer: [...viewport], highQuality: entry.quality === 'high',
      dpr: config.deviceScaleFactor, adaptiveResolution: false, reducedMotion: true,
      requestedRenderer: 'software', gpu: 'ANGLE SwiftShader', softwareRendererDetected: true,
      warmupFrames: 60, sampleFrames: 240, livePhysics: false, audio: false, gpuTime: 'not measured', inputLatency: 'not measured',
      errors: [], fixedState: { cameraPosition: [0, .5, 0], cameraQuaternion: [0, 0, 0, 1],
        cameraProjection: Array.from({ length: 16 }, (_, i) => i % 5 === 0 ? 1 : 0), buffer: [...viewport] },
      frameIntervalMs: timing(frameIntervalMs), cpuSubmitMs: timing(cpuSubmitMs),
      longFramesOver33ms: frameIntervalMs.filter(value => value > 1000 / 30).length,
      longFramesOver50ms: frameIntervalMs.filter(value => value > 50).length, samples: { frameIntervalMs, cpuSubmitMs },
      drawCalls: 10 * multiplier, triangles: 1000 * multiplier, heapBytes: 1000000 * multiplier,
      startupTimingsMs: { sceneReady: 100 * multiplier + entry.repeat },
    };
  });
  const manifest = { schemaVersion: 2, runId: 'test-run', status: 'complete', expectedMeasurements: 160,
    completedMeasurements: 160, startedAt: '2026-10-16T02:00:00Z', finishedAt: '2026-10-16T02:20:00Z',
    browserVersion: 'test-browser', config, cases };
  return { manifest, rows };
}

test('complete evidence groups by viewport, quality and pose, preserving paired repeats and raw metrics', () => {
  const { manifest, rows } = completeRun();
  const original = JSON.stringify(rows);
  const summary = summarizeRun(manifest, [...rows].reverse());
  assert.equal(summary.measurements, 160); assert.equal(summary.groups.length, 20);
  assert.equal(summary.gpu.length, 1); assert.equal(summary.softwareDetected, true);
  const group = summary.groups.find((group: any) => group.viewport === 'desktop' && group.quality === 'eco' && group.pose === 'ground');
  assert.equal(group.repeats.length, 2);
  const [forward, reverse] = group.repeats;
  assert.equal(forward.order, 'forward'); assert.equal(reverse.order, 'reverse');
  assert.deepEqual(forward.values.map((value: any) => value.treatment), ['main/baseline', 'pr/baseline', 'pr/baked', 'pr/roughness']);
  assert.equal(forward.values[0].metrics.frameP95Ms, rows[0].frameIntervalMs.p95);
  assert.equal(forward.values[0].metrics.cpuP95Ms, rows[0].cpuSubmitMs.p95);
  assert.equal(forward.values[0].metrics.longFramesOver33ms, 0);
  assert.equal(forward.values[3].metrics.longFramesOver33ms, 240);
  assert.equal(forward.values[0].metrics.longFramesOver50ms, 0);
  assert.equal(forward.values[0].metrics.drawCalls, 10);
  assert.equal(forward.values[0].metrics.triangles, 1000);
  assert.equal(forward.values[0].metrics.heapBytes, 1000000);
  assert.equal(forward.values[0].metrics.sceneReadyMs, 100);
  assert.equal(reverse.values[0].metrics.sceneReadyMs, 101);
  assert.equal(forward.ratios[0].metrics.drawCalls, 2);
  assert.equal(forward.ratios[3].metrics.drawCalls, 1.5);
  assert.equal(forward.ratios[4].metrics.drawCalls, 4 / 3);
  assert.equal(reverse.ratios[0].metrics.sceneReadyMs, 201 / 101);
  assert.equal(JSON.stringify(rows), original, 'input results are never rewritten or relabelled');
});

test('Markdown retains raw values, ratio denominators, execution orders and evidence limitations', () => {
  const { manifest, rows } = completeRun();
  const markdown = renderMarkdown(summarizeRun(manifest, rows));
  assert.equal((markdown.match(/^## (desktop|mobile) \/ /gm) || []).length, 20);
  assert.equal((markdown.match(/^### Repeat /gm) || []).length, 40);
  assert.match(markdown, /Validated coverage: 160\/160/);
  assert.match(markdown, /Software rendering was requested and\/or detected/);
  assert.match(markdown, /cannot establish hardware-GPU playability/);
  assert.match(markdown, /not GPU execution time/);
  assert.match(markdown, /operator-declared/);
  assert.match(markdown, /No acceptance threshold or statistical-significance claim/);
  assert.match(markdown, /pr\/roughness → pr\/baked → pr\/baseline → main\/baseline/);
  assert.match(markdown, /\| pr\/baked \/ pr\/baseline \|/);
  assert.match(markdown, /\| main\/baseline \| 10\.227 \| 1\.227 \| 0 \| 0 \| 10 \| 1000 \| 1000000 \| 100\.000 \|/);
});

test('summary refuses failed, running, incomplete, oversized or contradictory final manifests', () => {
  const { manifest, rows } = completeRun();
  for (const status of ['failed', 'running', 'ready']) assert.throws(() => summarizeRun({ ...manifest, status }, rows), /status must be complete/);
  for (const update of [{ expectedMeasurements: 159 }, { completedMeasurements: 159 }, { expectedMeasurements: 320 }, { cases: manifest.cases.slice(1) }]) {
    assert.throws(() => summarizeRun({ ...manifest, ...update }, rows), /exactly 160/);
  }
  assert.throws(() => summarizeRun(manifest, rows.slice(1)), /exactly 160/);
  assert.throws(() => summarizeRun({ ...manifest, error: 'context lost' }, rows), /failure evidence/);
  assert.throws(() => summarizeRun({ ...manifest, failedCase: manifest.cases[0] }, rows), /failure evidence/);
  assert.throws(() => summarizeRun({ ...manifest, finishedAt: '' }, rows), /completion timestamp/);
  assert.throws(() => summarizeRun({ ...manifest, config: { ...manifest.config, repeats: 4 } }, rows), /two paired/);
});

test('duplicate or substituted rows cannot masquerade as complete matrix coverage', () => {
  const { manifest, rows } = completeRun();
  const duplicateRows = [...rows]; duplicateRows[1] = duplicateRows[0];
  assert.throws(() => summarizeRun(manifest, duplicateRows), /duplicate measurement/);
  const duplicateCases = [...manifest.cases]; duplicateCases[1] = duplicateCases[0];
  assert.throws(() => summarizeRun({ ...manifest, cases: duplicateCases }, rows), /duplicate planned/);
  const wrongPose = [...rows]; wrongPose[0] = { ...rows[0], pose: 'invented' };
  assert.throws(() => summarizeRun(manifest, wrongPose), /missing required case/);
  const wrongOrder = [...rows]; wrongOrder[0] = { ...rows[0], order: 'reverse' };
  assert.throws(() => summarizeRun(manifest, wrongOrder), /wrong order/);
});

test('summary rejects unhealthy or non-comparable source, camera and renderer evidence', () => {
  const { manifest, rows } = completeRun();
  for (const [update, pattern] of [
    [{ status: 'error' }, /unhealthy row/],
    [{ errors: ['shader compile error'] }, /unhealthy row/],
    [{ healthChecks: undefined }, /unhealthy row/],
    [{ commitLabel: 'fffffff' }, /commit label/],
    [{ sourceUrl: rows[1].sourceUrl }, /source URL/],
    [{ highQuality: true }, /rendering settings/],
    [{ fixedState: { ...rows[1].fixedState, cameraPosition: [1, 2, 3] } }, /non-comparable/],
  ] as const) {
    const altered = [...rows]; altered[1] = { ...rows[1], ...update };
    // Row 1 already uses its own source URL; alter row 0 for this case.
    if ('sourceUrl' in update) { altered[1] = rows[1]; altered[0] = { ...rows[0], ...update }; }
    assert.throws(() => summarizeRun(manifest, altered), pattern);
  }
});

test('p95 and sample counts must agree with recorded raw timing data', () => {
  const { manifest, rows } = completeRun();
  let altered = [...rows];
  altered[0] = { ...rows[0], frameIntervalMs: { ...rows[0].frameIntervalMs, p95: .01 } };
  assert.throws(() => summarizeRun(manifest, altered), /disagrees with raw samples/);
  altered = [...rows]; altered[0] = { ...rows[0], samples: { ...rows[0].samples, cpuSubmitMs: [1] } };
  assert.throws(() => summarizeRun(manifest, altered), /240 cpuSubmitMs samples/);
  altered = [...rows]; altered[0] = { ...rows[0], triangles: -1 };
  assert.throws(() => summarizeRun(manifest, altered), /invalid .*triangles/);
  altered = [...rows]; altered[0] = { ...rows[0], longFramesOver33ms: 240 };
  assert.throws(() => summarizeRun(manifest, altered), /long-frame counts disagree/);
  altered = [...rows]; altered[0] = { ...rows[0], longFramesOver50ms: 1 };
  assert.throws(() => summarizeRun(manifest, altered), /long-frame counts disagree/);
});

test('missing optional heap and zero-denominator ratios remain n/a rather than false zero or infinity', () => {
  const { manifest, rows } = completeRun();
  rows[0].heapBytes = null;
  const summary = summarizeRun(manifest, rows);
  assert.equal(summary.groups[0].repeats[0].values[0].metrics.heapBytes, null);
  assert.equal(summary.groups[0].repeats[0].ratios[0].metrics.heapBytes, null);
  assert.match(renderMarkdown(summary), /n\/a/);
  assert.equal(ratio(1, 0), null); assert.equal(ratio(null, 4), null); assert.equal(ratio(3, null), null);
  assert.equal(ratio(0, 4), 0);
});

test('CLI reads a run directory, emits Markdown, and never writes success output for a failed manifest', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'fidelity-summary-'));
  const script = path.resolve('spikes/fidelity/summarize.cjs');
  try {
    const { manifest, rows } = completeRun();
    writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(path.join(directory, 'results.json'), JSON.stringify(rows));
    const success = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
    assert.equal(success.status, 0, success.stderr); assert.match(success.stdout, /^# Fixed-pose fidelity comparison/);
    const output = path.join(directory, 'existing.md');
    writeFileSync(output, 'keep existing report');
    writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ ...manifest, status: 'failed' }));
    const failed = spawnSync(process.execPath, [script, directory, output], { encoding: 'utf8' });
    assert.equal(failed.status, 1); assert.equal(failed.stdout, ''); assert.match(failed.stderr, /status must be complete/);
    assert.equal(readFileSync(output, 'utf8'), 'keep existing report');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
