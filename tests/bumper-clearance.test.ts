import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PinballSimulation } from '../src/physics/simulation';
import { courseBumpers, courseTargets, deckRails } from '../src/physics/reference-course';
import { BALL_RADIUS, STEP } from '../src/physics/table';

test('deck bumper passages clear a whole ball, including the stand-up target tips', () => {
  const deck = courseBumpers.filter(b => b.y > 0);
  const minimum = BALL_RADIUS * 2 + .05;
  for (const [i, b] of deck.entries()) {
    for (const rail of [...deckRails, ...courseTargets.filter(t => t.y > 0)]) {
      const dx = rail.bx - rail.ax, dz = rail.bz - rail.az;
      const u = Math.max(0, Math.min(1, ((b.x - rail.ax) * dx + (b.z - rail.az) * dz) / (dx * dx + dz * dz)));
      // A capsule around the segment conservatively bounds its box corners.
      const gap = Math.hypot(b.x - rail.ax - u * dx, b.z - rail.az - u * dz) - b.radius - rail.thickness;
      assert.ok(gap >= minimum, `bumper ${i} / ${rail.kind}: ${gap} < ${minimum}`);
    }
    for (const other of deck.slice(i + 1)) {
      const gap = Math.hypot(b.x - other.x, b.z - other.z) - b.radius - other.radius;
      assert.ok(gap >= minimum, `bumper-to-bumper gap ${gap} < ${minimum}`);
    }
  }
});

test('the upper-right deck pocket releases an unattended ball without repeated bumper awards', async () => {
  const s = await PinballSimulation.create({ course: 'reference' });
  try {
    s.start(); s.launch(.5); s.events.length = 0;
    s.ball.setTranslation({ x: 4.34, y: 1.919, z: -8.69 }, true);
    s.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    s.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    // This is a valid resting location, not an overlap-injected reproduction.
    s.world.propagateModifiedBodyPositionsToColliders();
    s.world.forEachCollider(c => {
      if (c.handle !== s.ballCollider.handle) assert.equal(c.contactCollider(s.ballCollider, 0), null);
    });
    let reachedLowerField = false;
    for (let n = 0; n < Math.ceil(60 / STEP) && s.phase === 'playing'; n++) {
      s.step();
      reachedLowerField ||= s.position.z > 0;
    }
    assert.ok(reachedLowerField, 'the ball escapes the deck through normal physics');
    assert.ok(s.events.some(e => e.type === 'drain'), 'an unattended ball drains naturally');
    assert.ok(s.events.filter(e => e.type === 'bumper' && e.index === 7).length < 20);
  } finally { s.dispose(); }
});

test('deck bumpers still kick and score each distinct legitimate approach', async () => {
  for (const index of [6, 7, 8]) {
    const s = await PinballSimulation.create({ course: 'reference' });
    try {
      s.start(); s.launch(.5);
      const b = courseBumpers[index];
      for (let attempt = 0; attempt < 2; attempt++) {
        s.ball.setTranslation({ x: b.x, y: b.y + BALL_RADIUS + .015, z: b.z + b.radius + BALL_RADIUS + .12 }, true);
        s.ball.setLinvel({ x: 0, y: 0, z: -4 }, true);
        s.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
        s.events.length = 0;
        for (let n = 0; n < 15; n++) { s.step(); if (s.events.some(e => e.type === 'bumper' && e.index === index)) break; }
        const hits = s.events.filter(e => e.type === 'bumper' && e.index === index);
        assert.equal(hits.length, 1);
        assert.equal(hits[0].points, 200);
        assert.ok(s.velocity.z > 5, 'normal powered rebound is preserved');
        // Clear contact before returning for a separate, scoreable hit.
        s.ball.setTranslation({ x: 1.1, y: 1.919, z: -6.3 }, true);
        s.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
        for (let n = 0; n < 3; n++) s.step();
      }
    } finally { s.dispose(); }
  }
});
