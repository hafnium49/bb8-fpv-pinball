'use strict';
const viewports = ['desktop', 'mobile'];
const qualities = ['eco', 'high'];
const poses = ['ground', 'launch', 'bridge', 'tunnel', 'underdeck'];
const treatments = [
  { source: 'main', variant: 'baseline' },
  { source: 'pr', variant: 'baseline' },
  { source: 'pr', variant: 'baked' },
  { source: 'pr', variant: 'roughness' },
];

function harnessUrl(value, name) {
  if (!value) throw new Error(`${name} is required: serve the shared harness from that checkout.`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`${name} must be an HTTP(S) URL without credentials.`);
  if (url.pathname === '/') url.pathname = '/spikes/fidelity/';
  if (!/\/spikes\/fidelity\/(?:index\.html)?$/.test(url.pathname)) throw new Error(`${name} must be an origin or a full /spikes/fidelity/ URL.`);
  url.search = ''; url.hash = '';
  return url.toString();
}

function readConfig(env) {
  const baselineUrl = harnessUrl(env.FIDELITY_BASELINE_URL, 'FIDELITY_BASELINE_URL');
  const prUrl = harnessUrl(env.FIDELITY_PR_URL, 'FIDELITY_PR_URL');
  if (baselineUrl === prUrl) throw new Error('Baseline and PR must use separate checkout URLs; a PR runtime toggle cannot represent old main.');
  const baselineCommit = env.FIDELITY_BASELINE_COMMIT, prCommit = env.FIDELITY_PR_COMMIT;
  for (const [name, label] of [['FIDELITY_BASELINE_COMMIT', baselineCommit], ['FIDELITY_PR_COMMIT', prCommit]]) {
    if (!label || !/^[0-9a-f]{7,40}$/i.test(label)) throw new Error(`${name} must explicitly label the served commit (7–40 hexadecimal characters).`);
  }
  if (baselineCommit === prCommit) throw new Error('Old main and PR must have different commit labels.');
  const repeats = Number(env.FIDELITY_REPEATS || 2);
  if (!Number.isInteger(repeats) || repeats < 2 || repeats % 2 !== 0) throw new Error('FIDELITY_REPEATS must be an even integer >= 2 for paired forward/reverse runs.');
  const deviceScaleFactor = Number(env.FIDELITY_DPR || 1);
  if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor < .5 || deviceScaleFactor > 3) throw new Error('FIDELITY_DPR must be between 0.5 and 3.');
  if (env.PERF_GPU && !['software', 'hardware'].includes(env.PERF_GPU)) throw new Error('PERF_GPU must be software or hardware.');
  return { baselineUrl, prUrl, baselineCommit, prCommit, repeats, deviceScaleFactor, requestedRenderer: env.PERF_GPU || 'software' };
}

function buildMatrix(config) {
  const cases = [];
  for (const viewport of viewports) for (const quality of qualities) for (const pose of poses) {
    for (let repeat = 0; repeat < config.repeats; repeat++) {
      const order = repeat % 2 ? [...treatments].reverse() : treatments;
      for (const [orderIndex, treatment] of order.entries()) cases.push({ viewport, quality, pose, repeat,
        order: repeat % 2 ? 'reverse' : 'forward', orderIndex, ...treatment });
    }
  }
  return cases;
}

function caseUrl(config, entry) {
  const url = new URL(entry.source === 'main' ? config.baselineUrl : config.prUrl);
  for (const [key, value] of Object.entries({ source: entry.source, fidelity: entry.variant,
    quality: entry.quality, pose: entry.pose, viewport: entry.viewport,
    commit: entry.source === 'main' ? config.baselineCommit : config.prCommit })) url.searchParams.set(key, value);
  return url.toString();
}
module.exports = { readConfig, buildMatrix, caseUrl, poses, qualities, treatments, viewports };
