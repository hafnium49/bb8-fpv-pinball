import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PinballSimulation } from '../src/physics/simulation';
import { BALL_RADIUS } from '../src/physics/table';
import { guideTrial } from '../scripts/flipper-guide-harness';

for (const circuit of [false, true]) {
  test(`${circuit ? 'circuit' : 'classic'}: both guide/hinge pockets release slow balls`, async () => {
    const sim = await PinballSimulation.create({ circuit });
    try {
      for (const side of [-1, 1] as const) {
        // Before the fix these valid arrivals parked indefinitely at
        // (-3.268, .280, 6.914) and (3.244, .280, 6.898), as reported in the original stuck-ball screenshot.
        const report = guideTrial(sim, { side, start: { x: side * 2.7, y: BALL_RADIUS + .025, z: 6.5 }, velocity: { x: side * 1.5, y: 0, z: .5 } });
        assert.ok(report.valid); assert.equal(report.outcome, 'cleared', JSON.stringify(report));
        assert.equal(report.completions, 0); assert.equal(report.score, 0);
      }
    } finally { sim.dispose(); }
  });

  test(`${circuit ? 'circuit' : 'classic'}: both side-guide heads and held flipper releases stay playable`, async () => {
    const sim = await PinballSimulation.create({ circuit });
    try {
      for (const side of [-1, 1] as const) for (const controls of ['released', 'hold-release', 'pulse'] as const)
        for (const start of [{ x: 2.7, z: 6.5 }, { x: 4.13, z: 7.0 }, { x: side < 0 ? 5.0 : 4.0, z: 3.5 }, { x: side < 0 ? 5.0 : 4.13, z: 7.0 }]) {
          const report = guideTrial(sim, { side, controls, start: { x: side * start.x, y: BALL_RADIUS + .025, z: start.z }, velocity: { x: side * .8, y: 0, z: 3 }, spin: { x: -30, y: 0, z: 0 } });
          assert.ok(report.valid, JSON.stringify(report)); assert.equal(report.outcome, 'cleared', JSON.stringify(report));
        }
    } finally { sim.dispose(); }
  });
}

test('guide sweep rejects seeds inside either closed heel instead of counting unreachable arrivals', async () => {
  const sim = await PinballSimulation.create({ circuit: true });
  try {
    for (const start of [{ x: -3.3, y: BALL_RADIUS + .025, z: 0 }, { x: 3, y: BALL_RADIUS + .025, z: 3.5 }]) {
      const report = guideTrial(sim, { side: start.x < 0 ? -1 : 1, start, velocity: { x: 0, y: 0, z: 3 } });
      assert.equal(report.valid, false, JSON.stringify(report));
      assert.equal(report.excluded, 'closed ramp heel', JSON.stringify(report));
    }
  } finally { sim.dispose(); }
});
