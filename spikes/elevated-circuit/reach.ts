// Isolated experiment. Does not change the production table or flipper tuning.
import { mkdirSync, writeFileSync } from 'node:fs';
import { PinballSimulation } from '../../src/physics/simulation';
import { STEP } from '../../src/physics/table';

export async function scanFlippers() {
  const shots: any[] = [];
  for (const side of [-1, 1]) for (const x of [0.7, 1.1, 1.5, 1.9, 2.3, 2.7])
    for (const z of [6.8, 7.2, 7.6, 8.0]) for (const delay of [0, 4, 8, 12]) {
      const sim = await PinballSimulation.create(); sim.start(); sim.launch(0.5);
      sim.ball.setTranslation({ x: side * x, y: 0.30, z }, true);
      sim.ball.setLinvel({ x: 0, y: 0, z: 2 }, true);
      const trace: any[] = [];
      let entry: any;
      for (let n = 0; n < 360 && sim.phase === 'playing'; n++) {
        sim.controls.left = side < 0 && n >= delay;
        sim.controls.right = side > 0 && n >= delay;
        const old = sim.position; sim.step(); const p = sim.position, v = sim.velocity;
        trace.push({ t: (n + 1) * STEP, ...p, vx: v.x, vy: v.y, vz: v.z });
        if (!entry && old.z >= 3 && p.z < 3 && v.z < -3) entry = { ...p, ...{ vx: v.x, vy: v.y, vz: v.z }, speed: Math.hypot(v.x, v.z) };
      }
      if (entry) shots.push({ start: { x: side * x, y: 0.30, z, delaySteps: delay, flipper: side < 0 ? 'left' : 'right' }, entry, trace });
      sim.dispose();
    }
  return shots;
}

if (process.argv[1]?.endsWith('reach.ts')) {
  const shots = await scanFlippers();
  mkdirSync('artifacts/elevated-circuit', { recursive: true });
  writeFileSync('artifacts/elevated-circuit/flipper-scan.json', JSON.stringify(shots));
  console.log(JSON.stringify({ crossings: shots.length, examples: shots.filter(s => s.entry.x < -2.6 && s.entry.x > -4.7).map(({ trace, ...s }) => s).slice(0, 15), rangeX: [Math.min(...shots.map(s => s.entry.x)), Math.max(...shots.map(s => s.entry.x))] }, null, 2));
}
