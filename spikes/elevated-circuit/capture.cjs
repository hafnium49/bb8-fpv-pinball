// Capture compact, reviewable evidence. Full case logs remain in ignored artifacts/.
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const read = name => JSON.parse(readFileSync(`artifacts/elevated-circuit/${name}.json`, 'utf8'));
const physics = read('physics'), camera = read('camera'), invariants = read('invariants'), browser = read('browser');
const counts = rows => Object.fromEntries(['complete', 'rollback', 'escape', 'stuck', 'timeout', 'drain'].map(k => [k, rows.filter(a => a.outcome === k).length]));
const speeds = [4, 8, 12, 16, 20, 24, 28];
const evidence = {
  sourceBase: { repository: 'hafnium49/bb8-fpv-pinball', mainCommit: '26ca301bfc3364bfeb7fe21bd7f151cc47d0719b', tree: 'fd73c0a42e48aa9bbb040260e75539e18a46f099' },
  scope: 'historical candidate geometry on the classic simulation; finished implementation evidence is recorded separately',
  physics: { basis: physics.basis, routeLength: physics.routeLength, samples: physics.samples, scannedFlipperSetups: physics.scannedFlipperSetups, forwardCrossings: physics.forwardCrossings, candidateFlipperSetups: physics.candidateFlipperSetups, summary: physics.summary,
    preferredVariantBySpeed: speeds.map(speed => ({ speed, cases: 9, outcomes: counts(physics.injected.filter(a => a.variant === 'baked-wire' && a.speed === speed)) })),
    preferredFlipperSetups: physics.flipper.filter(a => a.variant === 'baked-wire').map(({ start, outcome, orderedGatesPassed, maxY, duration }) => ({ start, outcome, orderedGatesPassed, maxY, duration })),
    unresolvedPreferredCases: physics.injected.filter(a => a.variant === 'baked-wire' && !['complete', 'rollback'].includes(a.outcome)).map(({ speed, offset, veer, outcome, orderedGatesPassed, final }) => ({ speed, offset, veer, outcome, orderedGatesPassed, final })), gravity: physics.gravity },
  camera, invariants, browser,
  limitations: ['Synthetic placement of incoming balls at the flippers is not end-to-end human playtesting.', 'Gate completion stops near the return exit; it does not prove a subsequent player-controlled flipper return.', 'Timeout and drain classify the whole trial, not a confirmed collider defect.', 'Camera clearance uses an analytic route cross-section, not a swept scene query.', 'Tunnel ribs, bridge ties and outboard supports are visual concepts and were not included in the collision comparison.', 'Renderer measurements use software WebGL; no physical-device frame-rate or motion-comfort claim.'],
};
mkdirSync('docs/spikes', { recursive: true });
writeFileSync('docs/spikes/elevated-circuit-results.json', JSON.stringify(evidence, null, 2) + '\n');
console.log('Captured docs/spikes/elevated-circuit-results.json');
