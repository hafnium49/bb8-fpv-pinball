'use strict';
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { readConfig, buildMatrix, caseUrl, viewports, qualities, poses, treatments } = require('./matrix.cjs');

const EXPECTED_MEASUREMENTS = 160;
const metrics = [
  { key: 'frameP95Ms', label: 'Frame delivery p95 (ms)', integer: false },
  { key: 'cpuP95Ms', label: 'CPU submission p95 (ms)', integer: false },
  { key: 'longFramesOver33ms', label: 'Frames >33.33 ms', integer: true },
  { key: 'longFramesOver50ms', label: 'Frames >50 ms', integer: true },
  { key: 'drawCalls', label: 'Draw calls', integer: true },
  { key: 'triangles', label: 'Triangles', integer: true },
  { key: 'heapBytes', label: 'JS heap (bytes)', integer: true },
  { key: 'sceneReadyMs', label: 'Scene ready (ms)', integer: false },
];
const comparisons = [
  ['pr/baseline', 'main/baseline'],
  ['pr/baked', 'main/baseline'],
  ['pr/roughness', 'main/baseline'],
  ['pr/baked', 'pr/baseline'],
  ['pr/roughness', 'pr/baked'],
];
const fail = message => { throw new Error(`Cannot summarize fidelity run: ${message}`); };
const treatmentKey = row => `${row.source}/${row.variant}`;
const caseKey = row => `${row.viewportName ?? row.viewport}/${row.quality}/${row.pose}/${row.repeat}/${treatmentKey(row)}`;

function finiteMetric(value, name, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || integer && !Number.isInteger(value)) fail(`invalid ${name}`);
  return value;
}

function checkTiming(row, key) {
  const raw = row.samples?.[key], reported = row[key];
  if (!Array.isArray(raw) || raw.length !== 240 || reported?.samples !== 240) fail(`${caseKey(row)} must contain 240 ${key} samples`);
  for (const value of raw) finiteMetric(value, `${caseKey(row)} ${key} sample`);
  if (key === 'frameIntervalMs' && raw.some(value => value === 0)) fail(`${caseKey(row)} contains a zero frame interval`);
  if (key === 'frameIntervalMs') {
    if (row.longFramesOver33ms !== raw.filter(value => value > 1000 / 30).length ||
        row.longFramesOver50ms !== raw.filter(value => value > 50).length) fail(`${caseKey(row)} long-frame counts disagree with raw samples`);
  }
  const sorted = [...raw].sort((a, b) => a - b);
  const expected = { median: (sorted[119] + sorted[120]) / 2, p95: sorted[227], max: sorted[239], samples: 240 };
  for (const field of Object.keys(expected)) if (reported[field] !== expected[field]) fail(`${caseKey(row)} ${key}.${field} disagrees with raw samples`);
}

function ratio(numerator, denominator) {
  return numerator === null || denominator === null || denominator === 0 ? null : numerator / denominator;
}

/** Reject failed, in-progress, partial, duplicated or non-comparable evidence.
 * The current report contract is intentionally the exact two-repeat/160-case
 * matrix. A larger run must not be silently trimmed to fit this report.
 */
function summarizeRun(manifest, rows) {
  if (!manifest || manifest.status !== 'complete') fail('manifest status must be complete; failed or running results are not valid evidence');
  if (manifest.schemaVersion !== 2 || manifest.expectedMeasurements !== EXPECTED_MEASUREMENTS ||
      manifest.completedMeasurements !== EXPECTED_MEASUREMENTS || !Array.isArray(rows) || rows.length !== EXPECTED_MEASUREMENTS ||
      !Array.isArray(manifest.cases) || manifest.cases.length !== EXPECTED_MEASUREMENTS) fail('requires exactly 160 planned and completed measurements');
  if (manifest.error || manifest.failedCase || manifest.failedBrowserErrors?.length) fail('manifest retains failure evidence');
  if (!manifest.finishedAt || !Number.isFinite(Date.parse(manifest.finishedAt))) fail('missing final completion timestamp');
  const saved = manifest.config;
  if (!saved || saved.repeats !== 2) fail('requires exactly two paired forward/reverse repeats');
  const config = readConfig({
    FIDELITY_BASELINE_URL: saved.baselineUrl, FIDELITY_PR_URL: saved.prUrl,
    FIDELITY_BASELINE_COMMIT: saved.baselineCommit, FIDELITY_PR_COMMIT: saved.prCommit,
    FIDELITY_REPEATS: String(saved.repeats), FIDELITY_DPR: String(saved.deviceScaleFactor), PERF_GPU: saved.requestedRenderer,
  });
  const expected = buildMatrix(config), plans = new Map(), measurements = new Map();
  for (const planned of manifest.cases) {
    const key = caseKey(planned);
    if (plans.has(key)) fail(`duplicate planned case ${key}`);
    plans.set(key, planned);
  }
  for (const row of rows) {
    const key = caseKey(row);
    if (measurements.has(key)) fail(`duplicate measurement ${key}`);
    measurements.set(key, row);
  }
  const fixedStates = new Map();
  for (const entry of expected) {
    const key = caseKey(entry), planned = plans.get(key), row = measurements.get(key);
    if (!planned || !row) fail(`missing required case ${key}`);
    for (const field of ['order', 'orderIndex', 'repeat', 'source', 'variant', 'pose', 'quality']) {
      if (planned[field] !== entry[field] || row[field] !== entry[field]) fail(`wrong ${field} for ${key}`);
    }
    const expectedUrl = caseUrl(config, entry);
    if (planned.url !== expectedUrl || row.sourceUrl !== expectedUrl) fail(`source URL differs from the declared checkout for ${key}`);
    if (row.commitLabel !== (entry.source === 'main' ? config.baselineCommit : config.prCommit)) fail(`commit label mismatch for ${key}`);
    if (row.status !== 'complete' || row.schemaVersion !== 2 || row.healthChecks !== 'context-loss-latched-v1' ||
        !Array.isArray(row.errors) || row.errors.length) fail(`incomplete or unhealthy row ${key}`);
    if (row.viewportName !== entry.viewport || !isDeepStrictEqual(row.viewport, entry.viewport === 'mobile' ? [844, 390] : [960, 540]) ||
        row.highQuality !== (entry.quality === 'high') || row.dpr !== config.deviceScaleFactor || row.adaptiveResolution !== false ||
        row.reducedMotion !== true || row.requestedRenderer !== config.requestedRenderer) fail(`requested rendering settings did not match for ${key}`);
    if (typeof row.gpu !== 'string' || !row.gpu || typeof row.softwareRendererDetected !== 'boolean') fail(`missing renderer identity for ${key}`);
    if (config.requestedRenderer === 'hardware' && row.softwareRendererDetected) fail(`software renderer reported in requested hardware run ${key}`);
    if (row.warmupFrames !== 60 || row.sampleFrames !== 240 || row.livePhysics !== false || row.audio !== false ||
        row.gpuTime !== 'not measured' || row.inputLatency !== 'not measured') fail(`workload metadata mismatch for ${key}`);
    if (!row.fixedState || !Array.isArray(row.fixedState.cameraPosition) || !Array.isArray(row.fixedState.cameraQuaternion) ||
        !Array.isArray(row.fixedState.cameraProjection) || !Array.isArray(row.fixedState.buffer) ||
        !isDeepStrictEqual(row.buffer, row.fixedState.buffer)) fail(`missing fixed-camera state for ${key}`);
    const groupKey = `${entry.viewport}/${entry.quality}/${entry.pose}`;
    if (fixedStates.has(groupKey) && !isDeepStrictEqual(fixedStates.get(groupKey), row.fixedState)) fail(`non-comparable fixed state for ${groupKey}`);
    fixedStates.set(groupKey, row.fixedState);
    checkTiming(row, 'frameIntervalMs'); checkTiming(row, 'cpuSubmitMs');
    finiteMetric(row.drawCalls, `${key} drawCalls`, true); finiteMetric(row.triangles, `${key} triangles`, true);
    if (row.heapBytes !== null) finiteMetric(row.heapBytes, `${key} heapBytes`, true);
    finiteMetric(row.startupTimingsMs?.sceneReady, `${key} startup sceneReady`);
  }
  const groups = [];
  for (const viewport of viewports) for (const quality of qualities) for (const pose of poses) {
    const repeats = [];
    for (let repeat = 0; repeat < 2; repeat++) {
      const values = treatments.map(treatment => {
        const row = measurements.get(caseKey({ viewport, quality, pose, repeat, ...treatment }));
        return { treatment: treatmentKey(row), orderIndex: row.orderIndex, metrics: {
          frameP95Ms: row.frameIntervalMs.p95, cpuP95Ms: row.cpuSubmitMs.p95,
          longFramesOver33ms: row.longFramesOver33ms, longFramesOver50ms: row.longFramesOver50ms,
          drawCalls: row.drawCalls, triangles: row.triangles, heapBytes: row.heapBytes,
          sceneReadyMs: row.startupTimingsMs.sceneReady,
        } };
      });
      const byTreatment = new Map(values.map(value => [value.treatment, value.metrics]));
      const ratios = comparisons.map(([numerator, denominator]) => ({ numerator, denominator,
        metrics: Object.fromEntries(metrics.map(({ key }) => [key, ratio(byTreatment.get(numerator)[key], byTreatment.get(denominator)[key])])),
      }));
      repeats.push({ repeat, order: repeat ? 'reverse' : 'forward', values, ratios });
    }
    groups.push({ viewport, quality, pose, fixedState: fixedStates.get(`${viewport}/${quality}/${pose}`), repeats });
  }
  return {
    runId: manifest.runId, startedAt: manifest.startedAt, finishedAt: manifest.finishedAt,
    browserVersion: manifest.browserVersion ?? 'not recorded', config,
    gpu: [...new Set(rows.map(row => row.gpu))], softwareDetected: rows.some(row => row.softwareRendererDetected),
    measurements: rows.length, groups,
  };
}

const escape = value => String(value).replace(/\\/g, '\\\\').replace(/[|`<>\[\]*_]/g, character => `\\${character}`).replace(/[\r\n]+/g, ' ');
const formatMetric = (value, integer) => value === null ? 'n/a' : integer ? String(value) : value.toFixed(3);

function renderMarkdown(summary) {
  const lines = [
    '# Fixed-pose fidelity comparison', '',
    `Run: ${escape(summary.runId)}. Completed ${escape(summary.finishedAt)}.`,
    'Validated coverage: 160/160 measurements; 20 viewport/quality/pose groups; four treatments; two reversed-order repeats.', '',
    `- Old-main commit label: ${escape(summary.config.baselineCommit)}`,
    `- PR commit label: ${escape(summary.config.prCommit)}`,
    '- Commit labels are operator-declared; this report does not independently verify the served source revision.',
    `- Browser: ${escape(summary.browserVersion)}. Requested renderer: ${escape(summary.config.requestedRenderer)}. Device pixel ratio: ${summary.config.deviceScaleFactor}.`,
    `- Reported renderer(s): ${summary.gpu.map(escape).join('; ')}. Software signature detected: ${summary.softwareDetected ? 'yes' : 'no'}.`,
    '- Every measurement uses 60 warmup frames followed by 240 sampled frames. Adaptive resolution is disabled and reduced motion is enabled.', '',
    '## Interpretation limits', '',
    summary.config.requestedRenderer === 'software' || summary.softwareDetected
      ? '- Software rendering was requested and/or detected. These timings characterize this software-renderer workload and cannot establish hardware-GPU playability.'
      : '- Hardware rendering was requested. A renderer string or absence of a software signature does not independently validate a specific physical GPU.',
    '- This is paused, fixed-camera rendering. Live physics, audio, input latency and touch responsiveness are not measured; screenshots need separate visual review.',
    '- Frame p95 is the 95th percentile of RAF delivery intervals. CPU p95 is JavaScript render-submission time, not GPU execution time.',
    '- Long-frame columns count sampled RAF intervals strictly above 1000/30 ms (shown as 33.33 ms) and 50 ms; these are descriptive counters, not acceptance thresholds.',
    '- Draw calls and triangles are final-frame renderer counters. JS heap is an optional snapshot, not total process memory or GPU memory.',
    '- Scene ready runs from simulation creation through first submitted render, including pose preparation and shader warmup. It excludes module evaluation, navigation and downloads; it is not time to interactive.',
    '- Ratios divide the named numerator by the denominator within the same repeat, viewport, quality and pose. Above 1 means a larger measured value; below 1 means a smaller one. No acceptance threshold or statistical-significance claim is applied.',
    '- Repeats stay separate; this report does not pool frame samples across runs or call the p95 of one run a cross-run p95. A missing heap value or zero denominator produces n/a.',
    '- main/baseline → pr/baseline compares the wall/material integration; pr/baseline → pr/baked isolates the contact approximation; pr/baked → pr/roughness isolates glaze roughness.', '',
  ];
  const headings = metrics.map(metric => metric.label);
  for (const group of summary.groups) {
    lines.push(`## ${group.viewport} / ${group.quality} / ${group.pose}`, '',
      `Render buffer: ${group.fixedState.buffer.join(' × ')} pixels. Camera position: ${group.fixedState.cameraPosition.map(value => value.toFixed(6)).join(', ')}.`, '');
    for (const repeat of group.repeats) {
      lines.push(`### Repeat ${repeat.repeat + 1}: ${repeat.order} order`, '',
        `Execution order: ${[...repeat.values].sort((a, b) => a.orderIndex - b.orderIndex).map(value => value.treatment).join(' → ')}.`, '',
        `| Raw treatment | ${headings.join(' | ')} |`, `| --- | ${metrics.map(() => '---:').join(' | ')} |`);
      for (const value of repeat.values) lines.push(`| ${value.treatment} | ${metrics.map(metric => formatMetric(value.metrics[metric.key], metric.integer)).join(' | ')} |`);
      lines.push('', `| Ratio: numerator / denominator | ${headings.map(label => label.replace(/ \((?:ms|bytes)\)/g, '')).join(' | ')} |`,
        `| --- | ${metrics.map(() => '---:').join(' | ')} |`);
      for (const value of repeat.ratios) lines.push(`| ${value.numerator} / ${value.denominator} | ${metrics.map(metric => value.metrics[metric.key] === null ? 'n/a' : `${value.metrics[metric.key].toFixed(3)}×`).join(' | ')} |`);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}

function main(argv) {
  if (argv.length < 1 || argv.length > 2) throw new Error('Usage: node spikes/fidelity/summarize.cjs RUN_DIRECTORY [OUTPUT.md]');
  const directory = path.resolve(argv[0]);
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const rows = JSON.parse(readFileSync(path.join(directory, 'results.json'), 'utf8'));
  const markdown = renderMarkdown(summarizeRun(manifest, rows));
  if (argv[1]) writeFileSync(path.resolve(argv[1]), markdown); else process.stdout.write(markdown);
}

module.exports = { summarizeRun, renderMarkdown, ratio, main };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
