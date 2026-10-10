import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PinballSimulation } from '../src/physics/simulation';
import { BALL_RADIUS, STEP } from '../src/physics/table';
import { courseBumpers, courseFlippers, courseGate, courseLaunch, courseRamps, courseTargets, courseTunnels, deckHeight, pathFrame } from '../src/physics/reference-course';
import { SoundDirector, flipperWarning } from '../src/ui/sound-director';
async function sim() { const s = await PinballSimulation.create({ course: 'reference' }); s.start(); s.launch(.5); s.events.length = 0; return s; }
function place(s: PinballSimulation, x: number, y: number, z: number, vx: number, vz: number) { s.ball.setTranslation({ x, y, z }, true); s.ball.setLinvel({ x: vx, y: 0, z: vz }, true); s.ball.setAngvel({ x: 0, y: 0, z: 0 }, true); s.events.length = 0; }
test('course contains the measured six ground bumpers, three deck bumpers, two flipper pairs and three separate ramps', () => {
  assert.equal(courseBumpers.length, 9);
  assert.equal(courseFlippers.length, 4);
  assert.equal(courseRamps.length, 3);
  assert.equal(courseTargets.length, 12);
  assert.deepEqual(courseBumpers.slice(0, 3).map(b => [Math.round(b.x / .028 + 240), Math.round(b.z / .028 + 410)]), [[160, 262], [280, 262], [220, 332]]);
  assert.deepEqual(courseRamps.map(r => r.pointsAward), [1000, 1500, 2500]);
  assert.equal(courseRamps[2].deck, true);
  assert.ok(Math.abs(deckHeight - 1.624) < 1e-9);
});
for (const path of courseRamps)
  test(`${path.name}: a real entrance shot reaches the measured exit and awards once`, async () => {
    const s = await sim();
    try {
      const p = path.points[0], t = pathFrame(path, 0).tangent;
      place(s, p.x - t.x * .6, .295, p.z - t.z * .6, t.x * 25, t.z * 25);
      let captured = false, peak = 0;
      for (let n = 0; n < 1600; n++) {
        s.step();
        captured ||= s.reference!.guided;
        peak = Math.max(peak, s.position.y);
        if (s.events.some(e => e.type === 'ramp' && e.name === path.name))
          break;
      }
      assert.ok(captured);
      const awards = s.events.filter(e => e.type === 'ramp' && e.name === path.name);
      assert.equal(awards.length, 1);
      assert.ok(peak > 1.1);
      assert.ok(Math.hypot(s.position.x - path.points.at(-1)!.x, s.position.z - path.points.at(-1)!.z) < .2);
      assert.equal(s.reference!.onDeck, path.deck);
      assert.equal(s.route.completions, 1);
      const before = s.score;
      s.paused = true;
      for (let n = 0; n < 120; n++)
        s.step();
      assert.equal(s.score, before);
    }
    finally {
      s.dispose();
    }
  });
for (const path of courseRamps)
  test(`${path.name}: a weak captured shot rolls back without a ramp award`, async () => {
    const s = await sim();
    try {
      const p = path.points[8], t = pathFrame(path, 0).tangent;
      place(s, p.x, .295, p.z, t.x * 5, t.z * 5);
      let captured = false, released = false;
      for (let n = 0; n < 600; n++) {
        s.step();
        captured ||= s.reference!.guided;
        if (captured && !s.reference!.guided) {
          released = true;
          break;
        }
      }
      assert.ok(captured && released);
      assert.equal(s.route.completions, 0);
      assert.equal(s.events.filter(e => e.type === 'ramp' && e.name === path.name).length, 0);
      assert.ok(s.velocity.z > 0);
    }
    finally {
      s.dispose();
    }
  });
for (const path of courseTunnels)
  test(`${path.name}: the subway travels below the board and returns to its specified destination`, async () => {
    const s = await sim();
    try {
      const p = path.points[0];
      place(s, p.x, .295, p.z, 0, .2);
      let captured = false, low = 1;
      for (let n = 0; n < 1200; n++) {
        s.step();
        captured ||= s.reference!.guided;
        low = Math.min(low, s.position.y);
        if (s.events.some(e => e.type === 'ramp' && e.name === path.name))
          break;
      }
      assert.ok(captured && low < -.5);
      assert.equal(s.events.filter(e => e.type === 'ramp' && e.name === path.name).length, 1);
      assert.equal(s.score, path.pointsAward);
      if (path.exitKind === 'lane') {
        assert.ok(Math.abs(s.position.x - courseLaunch.x) < .01);
        assert.ok(s.velocity.z < -20);
      }
    }
    finally {
      s.dispose();
    }
  });
test('every flipper pair returns an approaching ball; the same side key drives both levels', async () => {
  for (const [i, f] of courseFlippers.entries()) {
    const s = await sim();
    try {
      place(s, f.x + f.side * .7, f.y + .295, f.z - .3, 0, 3);
      s.controls[i % 2 === 0 ? 'left' : 'right'] = true;
      let returned = false;
      for (let n = 0; n < 30; n++) {
        s.step();
        returned ||= s.velocity.z < -3;
      }
      assert.ok(returned, `flipper ${i}`);
      assert.ok(s.events.some(e => e.type === 'flipper-hit' && e.index === i));
      const partner = i < 2 ? i + 2 : i - 2;
      assert.ok(Math.abs(s.flipperAngles[i] - courseFlippers[i].raised) < .001);
      assert.ok(Math.abs(s.flipperAngles[partner] - courseFlippers[partner].raised) < .001);
      s.start();
      assert.ok(s.flipperAngles.every((angle, n) => Math.abs(angle - courseFlippers[n].rest) < 1e-6));
    }
    finally {
      s.dispose();
    }
  }
});
test('launch strengths leave the curved launch lane without escaping the arch', async () => {
  for (const power of [0, .25, .5, .75, 1]) {
    const s = await sim();
    try {
      s.start();
      s.launch(power);
      let entered = false;
      for (let n = 0; n < 380; n++) {
        s.step();
        entered ||= s.position.x < 4.6 && s.position.z < -5;
        assert.ok(s.position.z > -12 && Math.abs(s.position.x) < 6.5);
      }
      assert.ok(entered, `power ${power}`);
    }
    finally {
      s.dispose();
    }
  }
});
test('CCD protects both course walls at extreme incoming speed', async () => {
  for (const side of [-1, 1]) {
    const s = await sim();
    try {
      place(s, side < 0 ? -5.1 : 5.6, .295, 0, side * 160, 0);
      for (let n = 0; n < 2; n++) {
        s.step();
        assert.ok(Math.abs(s.position.x) < 6.02);
      }
      assert.ok(s.velocity.x * side < 0);
    }
    finally {
      s.dispose();
    }
  }
});
test('the launch gate passes an outgoing ball and blocks a return into the lane', async () => {
  const s = await sim();
  try {
    const g = courseGate, x = (g.ax + g.bx) / 2, z = (g.az + g.bz) / 2;
    place(s, courseLaunch.x, .295, z + .8, 0, -12);
    for (let n = 0; n < 20; n++) s.step();
    assert.ok(s.reference!.gateClosed);
    assert.ok((s.position.x - x) * g.nx + (s.position.z - z) * g.nz > BALL_RADIUS);
    place(s, x + g.nx * .9, .295, z + g.nz * .9, -g.nx * 8, -g.nz * 8);
    let rebounded = false;
    for (let n = 0; n < 24; n++) {
      s.step();
      assert.ok((s.position.x - x) * g.nx + (s.position.z - z) * g.nz > .25);
      rebounded ||= s.velocity.x * g.nx + s.velocity.z * g.nz > 0;
    }
    assert.ok(rebounded);
  } finally { s.dispose(); }
});
test('drop banks lower their actual collider, reject repeat awards and reset in simulation time', async () => {
  const s = await sim();
  try {
    const i = 0, t = courseTargets[i];
    place(s, t.ax - 1, .295, (t.az + t.bz) / 2, 9, 0);
    for (let n = 0; n < 20; n++)
      s.step();
    assert.ok(s.reference!.targetDown[i]);
    assert.equal(s.reference!.targetColliders[i].isEnabled(), false);
    const count = s.events.filter(e => e.type === 'target' && e.index === i).length;
    assert.equal(count, 1);
    s.paused = true;
    for (let n = 0; n < 400; n++)
      s.step();
    assert.equal(s.reference!.targetColliders[i].isEnabled(), false);
    s.paused = false;
    place(s, 0, 3, 0, 0, 0);
    for (let n = 0; n < 380; n++)
      s.step();
    assert.equal(s.reference!.targetDown[i], false);
    assert.equal(s.reference!.targetColliders[i].isEnabled(), true);
  }
  finally {
    s.dispose();
  }
});
test('guided motion freezes on pause and resets to a dynamic ball through the three-ball lifecycle', async () => {
  const s = await sim();
  try {
    const path = courseRamps[0], p = path.points[8], t = pathFrame(path, 0).tangent;
    place(s, p.x, .295, p.z, t.x * 25, t.z * 25);
    for (let n = 0; n < 20; n++)
      s.step();
    assert.ok(s.reference!.guided);
    const before = { p: s.position, s: s.reference!.routeDistance, time: s.time };
    s.paused = true;
    s.update(.1);
    s.step();
    assert.deepEqual({ p: s.position, s: s.reference!.routeDistance, time: s.time }, before);
    s.paused = false;
    for (let ball = 0; ball < 3; ball++) {
      s.reference!.release();
      place(s, 0, .4, 11.7, 0, 0);
      s.step();
      assert.equal(s.balls, 2 - ball);
      if (ball < 2) {
        for (let n = 0; n < 120; n++)
          s.step();
        assert.equal(s.phase, 'ready');
        s.launch(.5);
      }
    }
    assert.equal(s.phase, 'over');
    s.start();
    assert.equal(s.phase, 'ready');
    assert.equal(s.balls, 3);
    assert.equal(s.reference!.guided, false);
    assert.equal(s.route.completions, 0);
  }
  finally {
    s.dispose();
  }
});
test('the reference is deterministic at 60 and 120 render updates per second', async () => {
  const a = await sim(), b = await sim();
  try {
    for (let n = 0; n < 240; n++)
      a.update(1 / 60);
    for (let n = 0; n < 480; n++)
      b.update(1 / 120);
    assert.ok(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z) < 1e-5);
    assert.equal(a.score, b.score);
  }
  finally {
    a.dispose();
    b.dispose();
  }
});
test('droid cues follow new routes and advise the correct flipper on both decks', async () => {
  const s = await sim();
  try {
    const director = new SoundDirector();
    const p = courseRamps[0].points[8], t = pathFrame(courseRamps[0], 0).tangent;
    place(s, p.x, .295, p.z, t.x * 25, t.z * 25);
    s.step();
    let frame = director.update(s, s.events);
    assert.ok(frame.cues.some(c => c.kind === 'ascent' && c.voice === 'ramp'));
    s.reference!.release();
    place(s, -1.8, .295, 6.2, 0, 4);
    assert.equal(flipperWarning(s)?.voice, 'left');
    place(s, 2.1, deckHeight + BALL_RADIUS + .015, -6.9, 0, 2);
    s.reference!.afterStep(s.position, []);
    assert.equal(flipperWarning(s)?.voice, 'left');
    frame = director.update(s, [{ type: 'ramp', name: 'SKY RAMP', points: 2500 }]);
    assert.ok(frame.cues.some(c => c.kind === 'circuit'));
    assert.ok(frame.cues.every(c => typeof c.voice !== 'string' || !c.voice.includes('english')));
    frame = director.update(s, [{ type: 'ramp', name: 'SPINNER', points: 100 }]);
    assert.ok(frame.cues.some(c => c.kind === 'target'));
    assert.ok(!frame.cues.some(c => c.kind === 'circuit'), 'a spinner must not announce a completed ramp');
  }
  finally {
    s.dispose();
  }
});
