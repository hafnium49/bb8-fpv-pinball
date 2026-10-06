import RAPIER from '@dimforge/rapier3d-compat';
import type { PinballSimulation, Point } from '../physics/simulation';
import { dot, frameAt, frames } from '../physics/route-geometry';

const radians = Math.PI / 180;

/** Upright heading and bounded pitch. Ball rotation never enters this controller. */
export class RouteCamera {
  heading = 0;
  pitch = 0;
  private direction = 1;
  private reverseTime = 0;
  private wasActive = false;
  private previousPhase = 'intro';

  reset() { this.heading = 0; this.pitch = 0; this.direction = 1; this.reverseTime = 0; this.wasActive = false; }

  update(sim: PinballSimulation, dt: number, reducedMotion = false) {
    if (sim.paused) return;
    if (sim.phase === 'ready' && this.previousPhase !== 'ready') this.reset();
    this.previousPhase = sim.phase;
    const p = sim.position, v = sim.velocity, speed = Math.hypot(v.x, v.z);
    let targetHeading = this.heading, targetPitch = 0;
    if (sim.route.active) {
      if (!this.wasActive) { this.direction = 1; this.reverseTime = 0; }
      const frame = frames[sim.route.projection.index];
      const along = dot(v, frame.tangent);
      if (along * this.direction < -0.5) this.reverseTime += dt;
      else this.reverseTime = 0;
      if (this.reverseTime > 0.15) { this.direction *= -1; this.reverseTime = 0; }
      const ahead = frameAt(Math.max(0, sim.route.projection.s + this.direction * Math.min(1.4, 0.5 + speed * 0.04)));
      const dx = ahead.c.x - p.x, dy = ahead.c.y - p.y, dz = ahead.c.z - p.z;
      if (Math.hypot(dx, dz) > 0.12) {
        targetHeading = Math.atan2(dx, -dz);
        targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
      }
    } else if (speed > 0.65 && sim.phase === 'playing') targetHeading = Math.atan2(v.x, -v.z);
    this.wasActive = sim.route.active;
    const delta = Math.atan2(Math.sin(targetHeading - this.heading), Math.cos(targetHeading - this.heading));
    this.heading += Math.sign(delta) * Math.min(Math.abs(delta) * (1 - Math.exp(-5 * dt)), 3.5 * dt);
    const limit = (reducedMotion ? 8 : 18) * radians, rate = (reducedMotion ? 15 : 30) * radians;
    targetPitch = Math.max(-limit, Math.min(limit, targetPitch));
    this.pitch += Math.sign(targetPitch - this.pitch) * Math.min(Math.abs(targetPitch - this.pitch) * (1 - Math.exp(-8 * dt)), rate * dt);
  }
}

/** Sweep the camera's near-plane envelope against real cabinet colliders. */
export class CameraClearance {
  private shape = new RAPIER.Ball(0.12);
  private rotation = { x: 0, y: 0, z: 0, w: 1 };
  private delta = { x: 0, y: 0, z: 0 };
  private fraction = 1;

  reset() { this.fraction = 1; }

  place(sim: PinballSimulation, desired: Point, out: Point, aspect: number, fov: number, dt: number) {
    const p = sim.position;
    const tangent = Math.tan(fov * Math.PI / 360);
    // Include the corners at wide mobile aspect ratios; keep the probe inside
    // the ball's guaranteed free volume when beginning a cast at its centre.
    this.shape.radius = Math.max(0.12, Math.min(0.25, 0.06 * Math.sqrt(1 + tangent * tangent * (1 + aspect * aspect))));
    this.delta.x = desired.x - p.x; this.delta.y = desired.y - p.y; this.delta.z = desired.z - p.z;
    const hit = sim.world.castShape(p, this.rotation, this.delta, this.shape, 0.015, 1, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, sim.ball);
    const safe = hit ? Math.max(0, hit.time_of_impact - 0.01) : 1;
    // Obstructions retract immediately. Restoration is smoothed, then bounded
    // by a fresh sweep so interpolation can never carry the camera through it.
    this.fraction = Math.min(safe, this.fraction + (1 - this.fraction) * (1 - Math.exp(-7 * dt)));
    out.x = p.x + this.delta.x * this.fraction;
    out.y = p.y + this.delta.y * this.fraction;
    out.z = p.z + this.delta.z * this.fraction;
  }
}
