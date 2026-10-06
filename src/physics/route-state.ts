import { BALL_RADIUS } from './table';
import { bridgeEndS, bridgeStartS, distance, frameAt, frames, projectRoute, routeLength, tunnelEnd, tunnelStart, type Projection, type RouteFrame, type Vec3 } from './route-geometry';

export type RoutePhase = 'free' | 'ascent' | 'bridge' | 'tunnel' | 'return';
export interface RouteGate { frame: RouteFrame; halfWidth: number; low: number; high: number }
export const gates: RouteGate[] = [
  { frame: frameAt(0.08), halfWidth: 0.84, low: -0.14, high: 0.40 },
  { frame: frameAt(bridgeStartS + 0.45), halfWidth: 0.40, low: -0.18, high: 0.58 },
  { frame: frameAt(bridgeEndS - 0.35), halfWidth: 0.40, low: -0.18, high: 0.58 },
  { frame: frames[tunnelEnd], halfWidth: 0.51, low: -0.18, high: 0.72 },
  { frame: frameAt(routeLength - 0.15), halfWidth: 0.50, low: -0.12, high: 0.24 },
];

function planeDistance(p: Vec3, f: RouteFrame) {
  return (p.x - f.c.x) * f.tangent.x + (p.y - f.c.y) * f.tangent.y + (p.z - f.c.z) * f.tangent.z;
}
export function crossesGate(previous: Vec3, current: Vec3, gate: RouteGate, reverse = false) {
  const sign = reverse ? -1 : 1, a = planeDistance(previous, gate.frame) * sign, b = planeDistance(current, gate.frame) * sign;
  if (a > 0 || b <= 0 || b - a < 1e-7) return false;
  const t = -a / (b - a), f = gate.frame;
  const dx = previous.x + (current.x - previous.x) * t - f.c.x;
  const dy = previous.y + (current.y - previous.y) * t - f.c.y;
  const dz = previous.z + (current.z - previous.z) * t - f.c.z;
  const lateral = dx * f.right.x + dy * f.right.y + dz * f.right.z, vertical = dx * f.up.x + dy * f.up.y + dz * f.up.z;
  return Math.abs(lateral) <= gate.halfWidth && vertical >= gate.low && vertical <= gate.high;
}

export class RouteState {
  phase: RoutePhase = 'free';
  nextGate = 0;
  completions = 0;
  completionFlash = 0;
  readonly projection: Projection = { s: 0, index: 0, distance: 0, lateral: 0, vertical: 0 };
  private cooldown = 0;
  get active() { return this.phase !== 'free'; }
  get progress() { return this.active ? this.nextGate / gates.length : 0; }

  reset(full = false) {
    this.phase = 'free'; this.nextGate = 0; this.cooldown = 0;
    this.completionFlash = 0; this.projection.s = 0; this.projection.index = 0;
    if (full) this.completions = 0;
  }
  private cancel() { this.phase = 'free'; this.nextGate = 0; this.cooldown = 0.15; }

  update(previous: Vec3, current: Vec3, dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.completionFlash = Math.max(0, this.completionFlash - dt);
    // Invalid jumps cannot carry gate progress across disconnected route volumes.
    if (distance(previous, current) > 1.0) { this.cancel(); return false; }
    if (!this.active) {
      if (this.cooldown || !crossesGate(previous, current, gates[0])) return false;
      this.phase = 'ascent'; this.nextGate = 1; this.projection.index = 0;
    }
    const i = this.projection.index;
    projectRoute(current, this.projection, i - 40, i + 42);
    const p = this.projection, f = frames[p.index];
    if (Math.abs(p.lateral) > f.width + BALL_RADIUS || p.vertical < -0.43 || p.vertical > 1.25 || crossesGate(previous, current, gates[0], true)) {
      this.cancel(); return false;
    }
    if (this.nextGate < gates.length && crossesGate(previous, current, gates[this.nextGate])) this.nextGate++;
    if (this.nextGate === gates.length) {
      this.completions++; this.completionFlash = 1.5; this.phase = 'free'; this.nextGate = 0; this.cooldown = 0.25;
      return true;
    }
    this.phase = p.s < bridgeStartS ? 'ascent' : p.s < bridgeEndS ? 'bridge' : p.s < frames[tunnelEnd].s ? 'tunnel' : 'return';
    // Departures past the mouth without a clean reverse crossing still cancel.
    if (p.s < 0.3 && planeDistance(current, gates[0].frame) < -0.35) this.cancel();
    return false;
  }
}

export const tunnelRange = { start: frames[tunnelStart].s, end: frames[tunnelEnd].s };
