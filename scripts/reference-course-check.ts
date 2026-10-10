import RAPIER from '@dimforge/rapier3d-compat';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PinballSimulation } from '../src/physics/simulation';
import { BALL_RADIUS, STEP } from '../src/physics/table';
import { courseFlippers, deckHeight } from '../src/physics/reference-course';
const sim = await PinballSimulation.create({ course: 'reference' });
const groups = [];
try {
  for (const level of ['ground', 'deck'] as const) {
    let attempted = 0, excluded = 0, valid = 0, maxQuiet = 0;
    const failures = [];
    const pair = level === 'ground' ? courseFlippers.slice(0, 2) : courseFlippers.slice(2), mid = (pair[0].x + pair[1].x) / 2, base = level === 'ground' ? 0 : deckHeight;
    const xs = level === 'ground' ? [1, 1.8, 2.5, 3.4, 4, 4.7, 5] : [.55, 1.1, 1.65], zs = level === 'ground' ? [3.3, 4.6, 5.6, 6.6, 7.6, 8.6, 9.6] : [-8.5, -7.5, -6.5, -5.5];
    for (const side of [-1, 1])
      for (const x of xs)
        for (const z of zs)
          for (const speed of [.2, 3, 22])
            for (const control of ['released', 'hold-release', 'pulse']) {
              attempted++;
              sim.start();
              for (let n = 0; n < 30; n++)
                sim.step();
              sim.launch(.5);
              sim.step();
              const start = { x: mid + side * x, y: base + BALL_RADIUS + .025, z };
              if (sim.world.intersectionWithShape(start, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(BALL_RADIUS), undefined, undefined, undefined, sim.ball)) {
                excluded++;
                continue;
              }
              valid++;
              sim.ball.setTranslation(start, true);
              sim.ball.setLinvel({ x: side * .8, y: 0, z: speed }, true);
              sim.ball.setAngvel({ x: 30, y: 12, z: -18 }, true);
              sim.events.length = 0;
              let quiet = 0, outcome = 'timeout';
              for (let n = 0; n < 2400; n++) {
                const held = control === 'hold-release' ? n < 180 : control === 'pulse' && (n >= 30 && n < 54 || n >= 120 && n < 144);
                sim.controls.left = side < 0 && held;
                sim.controls.right = side > 0 && held;
                sim.step();
                const p = sim.position, v = sim.velocity;
                quiet = !held && !sim.reference!.guided && Math.hypot(v.x, v.y, v.z) < .12 ? quiet + STEP : 0;
                maxQuiet = Math.max(maxQuiet, quiet);
                if (sim.phase !== 'playing' || p.z > pair[0].z + 2.2 || Math.abs(p.x - mid) < .65 || p.z < start.z - 2 || level === 'deck' && p.y < deckHeight - .2) {
                  outcome = 'cleared';
                  break;
                }
                if (quiet >= 2) {
                  outcome = 'stalled';
                  break;
                }
                sim.events.length = 0;
              }
              if (outcome !== 'cleared')
                failures.push({ side, start, speed, control, outcome, p: sim.position, v: sim.velocity });
            }
    const group = { level, attempted, excluded, valid, maxQuiet, failures };
    groups.push(group);
    console.log(JSON.stringify(group));
  }
  const inputs = [];
  for (const [power, timing, expected, completion] of [[0, 7.6, 'SKY RAMP', true], [0, 7.4, 'WIRE RAMP', true], [1, 8, 'LEFT RAMP', false]] as const) {
    const trace = await PinballSimulation.create({ course: 'reference' });
    trace.start();
    trace.launch(power);
    const awards = new Set<string>();
    const entrances = new Set<string>();
    for (let n = 0; n < 5000 && trace.phase === 'playing'; n++) {
      const p = trace.position, v = trace.velocity, base = trace.reference!.onDeck ? deckHeight : 0, z = trace.reference!.onDeck ? -6.7 : timing, centre = trace.reference!.onDeck ? 3.01 : -.56;
      trace.controls.left = p.y < base + .7 && v.z > 0 && p.z > z && p.x < centre;
      trace.controls.right = p.y < base + .7 && v.z > 0 && p.z > z && p.x >= centre;
      trace.step();
      if (trace.reference!.path) entrances.add(trace.reference!.path.name);
      for (const e of trace.events)
        if (e.type === 'ramp')
          awards.add(e.name);
      trace.events.length = 0;
    }
    trace.dispose();
    assert.ok(entrances.has(expected), `input-only entrance failed: ${expected}`);
    if (completion) assert.ok(awards.has(expected), `input-only completion failed: ${expected}`);
    inputs.push({ power, timing, expected, completion, entrances: [...entrances], awards: [...awards] });
  }
  console.log(JSON.stringify({ inputOnlyShots: inputs }));
  mkdirSync('artifacts/reference-course', { recursive: true });
  writeFileSync('artifacts/reference-course/guide-report.json', JSON.stringify({ result: groups.every(g => g.failures.length === 0) ? 'pass' : 'fail', groups, inputOnlyShots: inputs }, null, 2) + '\n');
  assert.ok(groups.every(g => g.failures.length === 0), 'reachable guide arrivals must clear both sides of both playfields');
}
finally {
  sim.dispose();
}
