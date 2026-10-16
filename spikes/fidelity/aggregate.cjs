'use strict';
const { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { readSavedConfig, buildMatrix, caseUrl } = require('./matrix.cjs');
const { summarizeRun } = require('./summarize.cjs');

const fail = message => { throw new Error(`Cannot aggregate fidelity shards: ${message}`); };
const caseKey = row => `${row.viewportName ?? row.viewport}/${row.quality}/${row.pose}/${row.repeat}/${row.source}/${row.variant}`;
const withoutFilters = config => ({ ...config, filters: { viewport: null, quality: null, pose: null } });
const screenshotNames = config => buildMatrix(config).filter(entry => entry.repeat === 0)
  .map(entry => `${entry.viewport}-${entry.quality}-${entry.pose}-${entry.source}-${entry.variant}.png`);

function validateScreenshot(bytes, config, name) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') fail(`invalid PNG header for ${name}`);
  const [width, height] = config.filters.viewport === 'mobile' ? [844, 390] : [960, 540];
  // Browser screenshot clipping may round fractional device pixels up/down.
  const matches = (actual, css) => actual === Math.floor(css * config.deviceScaleFactor) || actual === Math.ceil(css * config.deviceScaleFactor);
  if (!matches(bytes.readUInt32BE(16), width) || !matches(bytes.readUInt32BE(20), height)) fail(`screenshot dimensions do not match full stage resolution for ${name}`);
}

/** Only combine complete, paired conditions. No failed rows are relabelled and
 * no timing samples are pooled across conditions or independent CI hosts.
 */
function aggregateRuns(shards) {
  if (!Array.isArray(shards) || shards.length !== 20) fail('exactly 20 completed condition shards are required');
  let config, browserVersion;
  const conditions = new Set(), allRows = [], sourceManifests = [], starts = [], finishes = [];
  for (const shard of shards) {
    const { manifest, rows } = shard;
    if (!manifest || manifest.status !== 'complete' || manifest.schemaVersion !== 2 ||
        manifest.expectedMeasurements !== 8 || manifest.completedMeasurements !== 8 ||
        !Array.isArray(rows) || rows.length !== 8 || !Array.isArray(manifest.cases) || manifest.cases.length !== 8) fail('every shard must have a final complete 8/8 manifest and eight rows');
    if (manifest.error || manifest.failedCase || manifest.failedBrowserErrors?.length) fail('a shard retains failure evidence');
    if (!Number.isFinite(Date.parse(manifest.startedAt)) || !Number.isFinite(Date.parse(manifest.finishedAt)) ||
        Date.parse(manifest.finishedAt) < Date.parse(manifest.startedAt)) fail('each shard needs valid start and completion timestamps');
    const shardConfig = readSavedConfig(manifest.config), filters = shardConfig.filters;
    if (shardConfig.repeats !== 2 || !filters.viewport || !filters.quality || !filters.pose) fail('each shard must select exactly one viewport, quality and pose with two repeats');
    const condition = `${filters.viewport}-${filters.quality}-${filters.pose}`;
    if (conditions.has(condition)) fail(`duplicate condition ${condition}`);
    conditions.add(condition);
    const common = withoutFilters(shardConfig);
    if (config && !isDeepStrictEqual(config, common)) fail('shard source, renderer, sampling or timeout configurations differ');
    config = common;
    if (typeof manifest.browserVersion !== 'string' || !manifest.browserVersion) fail('missing shard browser version');
    if (browserVersion && browserVersion !== manifest.browserVersion) fail('shard browser versions differ');
    browserVersion = manifest.browserVersion;
    const expected = buildMatrix(shardConfig), expectedKeys = new Set(expected.map(caseKey));
    const planned = new Map(manifest.cases.map(entry => [caseKey(entry), entry]));
    const measured = new Set(rows.map(caseKey));
    if (planned.size !== 8 || measured.size !== 8 || rows.some(row => !expectedKeys.has(caseKey(row)))) fail(`duplicate or foreign measurements in ${condition}`);
    for (const entry of expected) {
      const item = planned.get(caseKey(entry));
      if (!item || !isDeepStrictEqual(item, { ...entry, url: caseUrl(shardConfig, entry) })) fail(`incorrect planned matrix for ${condition}`);
    }
    allRows.push(...rows); starts.push(Date.parse(manifest.startedAt)); finishes.push(Date.parse(manifest.finishedAt));
    sourceManifests.push({ condition, runId: manifest.runId, startedAt: manifest.startedAt, finishedAt: manifest.finishedAt,
      sourceDirectory: shard.name ?? condition, manifest: `source-manifests/${condition}.json` });
  }
  const cases = buildMatrix(config).map(entry => ({ ...entry, url: caseUrl(config, entry) }));
  const rowMap = new Map(allRows.map(row => [caseKey(row), row]));
  const rows = cases.map(entry => rowMap.get(caseKey(entry)));
  if (rowMap.size !== 160 || rows.some(row => !row)) fail('twenty shards do not cover all 160 unique expected cases');
  const manifest = { schemaVersion: 2, runId: `aggregated-${config.prCommit}-${Math.max(...finishes)}`,
    status: 'complete', expectedMeasurements: 160, completedMeasurements: 160,
    startedAt: new Date(Math.min(...starts)).toISOString(), finishedAt: new Date(Math.max(...finishes)).toISOString(),
    browserVersion, config, cases,
    provenance: 'Operator-declared commits; original completed shard manifests retained in source-manifests. Source revision is not independently verified by this aggregator.',
    workload: 'Paused full-resolution reference-course rendering; each condition retains all four treatments in forward/reverse repeats. No pooled timings.',
    aggregation: { shards: sourceManifests.sort((a, b) => a.condition.localeCompare(b.condition)),
      notes: 'Each condition runs on an independent CI host. Compare paired treatments within the same condition/repeat; do not infer cross-condition GPU performance.' },
  };
  // Reuse strict full-run validation, including raw sample-derived percentiles,
  // long-frame counts, context-health checks, fixed cameras and source labels.
  summarizeRun(manifest, rows);
  return { manifest, rows };
}

function aggregateDirectory(inputDirectory, outputDirectory) {
  const input = path.resolve(inputDirectory), output = path.resolve(outputDirectory);
  if (existsSync(output) && readdirSync(output).length) fail('output directory must be empty to avoid mixing evidence');
  const directories = readdirSync(input, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const shards = directories.map(name => {
    const directory = path.join(input, name);
    return { name, directory, manifest: JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')),
      rows: JSON.parse(readFileSync(path.join(directory, 'results.json'), 'utf8')) };
  });
  const aggregate = aggregateRuns(shards);
  const images = new Set();
  for (const shard of shards) {
    const expected = screenshotNames(shard.manifest.config);
    const actual = readdirSync(shard.directory).filter(name => name.endsWith('.png')).sort();
    if (!isDeepStrictEqual(actual, [...expected].sort())) fail(`missing or unexpected screenshots in ${shard.name}`);
    for (const name of expected) {
      if (images.has(name)) fail(`duplicate screenshot ${name}`);
      images.add(name);
      const bytes = readFileSync(path.join(shard.directory, name));
      validateScreenshot(bytes, shard.manifest.config, name);
    }
  }
  if (images.size !== 80) fail('exactly 80 full-resolution screenshot files are required');
  mkdirSync(path.join(output, 'source-manifests'), { recursive: true });
  for (const shard of shards) {
    const filters = shard.manifest.config.filters;
    const condition = `${filters.viewport}-${filters.quality}-${filters.pose}`;
    copyFileSync(path.join(shard.directory, 'manifest.json'), path.join(output, 'source-manifests', `${condition}.json`));
    for (const name of screenshotNames(shard.manifest.config)) copyFileSync(path.join(shard.directory, name), path.join(output, name));
  }
  writeFileSync(path.join(output, 'results.json'), JSON.stringify(aggregate.rows, null, 2));
  // Publish completion last: a failed file copy cannot leave a complete manifest.
  writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(aggregate.manifest, null, 2));
  return aggregate;
}

module.exports = { aggregateRuns, aggregateDirectory, screenshotNames, validateScreenshot };
if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node spikes/fidelity/aggregate.cjs SHARD_ROOT OUTPUT_DIRECTORY');
    const { rows } = aggregateDirectory(process.argv[2], process.argv[3]);
    console.log(`Validated and combined ${rows.length} measurements, 80 unchanged PNGs and 20 original shard manifests.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
