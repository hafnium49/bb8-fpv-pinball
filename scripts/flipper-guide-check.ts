import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import { PinballSimulation } from '../src/physics/simulation';
import { guideInputs, guideTrial } from './flipper-guide-harness';

await RAPIER.init();
const groups = [];
for (const circuit of [false, true]) {
  const sim = new PinballSimulation({ circuit });
  try {
    const trials = guideInputs().map(input => guideTrial(sim, input));
    const valid = trials.filter(t => t.valid), excluded = trials.filter(t => !t.valid);
    const failures = valid.filter(t => t.outcome !== 'cleared');
    const summary = { table: circuit ? 'circuit' : 'classic', attempted: trials.length, valid: valid.length,
      cleared: valid.filter(t => t.outcome === 'cleared').length,
      exclusions: { overlap: excluded.filter(t => t.excluded === 'collider overlap').length, closedHeel: excluded.filter(t => t.excluded === 'closed ramp heel').length },
      left: valid.filter(t => t.input.side < 0).length, right: valid.filter(t => t.input.side > 0).length,
      maxQuiet: Math.max(...valid.map(t => t.maxQuiet)), maxDuration: Math.max(...valid.map(t => t.duration)), failures };
    groups.push({ ...summary, trials });
    console.log(JSON.stringify(summary, null, 2));
    assert.equal(failures.length, 0, 'A released ball remains trapped at a guide or flipper');
  } finally { sim.dispose(); }
}
mkdirSync('artifacts/pivot', { recursive: true });
writeFileSync('artifacts/pivot/physics.json', JSON.stringify({ result: 'pass', scope: 'synthetic nonoverlapping ground arrivals outside closed ramp heels, both tables/sides, 120 Hz CCD, released/hold-release/pulsed flippers, spin and fast approaches', groups }, null, 2));
