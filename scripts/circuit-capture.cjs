// Compact review evidence; full physical cases and screenshots stay in artifacts/.
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const assert = require('node:assert/strict');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const physics = read('artifacts/circuit/physics.json'), browser = read('artifacts/circuit/browser.json');
const classic = read('artifacts/browser-report.json'), mobileLayout = read('artifacts/circuit/mobile-layout.json');
for (const r of [physics, browser, classic, mobileLayout]) assert.equal(r.result, 'pass');
const counts = rows => Object.fromEntries(['returned', 'rollback', 'drain', 'timeout'].map(k => [k, rows.filter(r => r.outcome === k).length]));
const report = {
  scope: 'implemented opt-in circuit; free Rapier body and actual scene collision queries; classic remains default',
  runtime: { node: process.version, rapier: '0.21.0', three: '0.186.1', fixedStepHz: 120, ccd: true },
  geometry: physics.geometry,
  grid: { count: physics.grid.count, counts: physics.grid.counts, bySpeed: [4, 8, 12, 16, 20, 24, 28].map(speed => ({ speed, counts: counts(physics.grid.cases.filter(r => r.speed === speed)) })),
    maxTrialDuration: Math.max(...physics.grid.cases.map(r => r.duration)), maxBallHeight: Math.max(...physics.grid.cases.map(r => r.maxY)), failures: physics.grid.cases.filter(r => !['returned', 'rollback'].includes(r.outcome)) },
  spinAndPartialStep: { count: physics.spinAndPartialStep.count, counts: physics.spinAndPartialStep.counts, basis: 'three speeds, three angular velocity vectors, quarter/three-quarter-step entry advances, initial height +0.08', failures: physics.spinAndPartialStep.cases.filter(r => !['returned', 'rollback'].includes(r.outcome)) },
  launches: physics.launches,
  browser,
  mobileLayout,
  classic: { result: classic.result, checks: classic.checks, browserErrors: classic.browserErrors },
  reviewFixes: ['scan and trial angular velocities both start at zero', 'bridge-entrance reversal is classified as rollback before later ordinary-playfield drains', 'browser-launch failure closes the Vite server; missing executable exits with status 1 in under one second'],
  limitations: ['Synthetic entry sweeps are not player completion rates.', 'The two launch trials use reproducible flipper inputs; human playtesting remains necessary.', 'Software WebGL does not establish device FPS.', 'Representative phone/desktop performance and human FPV motion comfort remain gates before default enablement.', 'Fullscreen and audible sound were not separately verified for this upgrade.'],
};
mkdirSync('docs/validation', { recursive: true });
writeFileSync('docs/validation/elevated-circuit.json', JSON.stringify(report, null, 2) + '\n');
console.log('Captured docs/validation/elevated-circuit.json');
