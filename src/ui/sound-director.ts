import type { Controls, GameEvent, Phase, Point } from '../physics/simulation';
import type { RoutePhase } from '../physics/route-state';
import { routeLength } from '../physics/route-geometry';
import { BALL_RADIUS, FLIPPER_APPROACH_Z, bumpers, flippers, targets } from '../physics/table';
import { voiceBank, type VoiceKey } from './voice-bank';

export interface SoundState {
  phase: Phase;
  paused: boolean;
  time: number;
  position: Point;
  velocity: Point;
  controls: Controls;
  charge: number;
  route: { phase: RoutePhase; active: boolean; projection: { s: number; vertical: number } };
}
export type CueKind = 'ready' | 'launch' | 'bumper' | 'target' | 'wall' | 'flipper' | 'save'
  | 'ascent' | 'bridge' | 'tunnel' | 'circuit' | 'drain' | 'over' | 'chatter' | 'warning' | 'head-loss';
export interface SoundCue {
  kind: CueKind;
  strength?: number;
  pan?: number;
  voice?: VoiceKey;
  priority?: number;
  caption?: string;
}
export interface SoundFrame {
  paused: boolean;
  music: boolean;
  rolling: number;
  speed: number;
  surface: RoutePhase;
  charge: number;
  cues: SoundCue[];
}
export interface FlipperWarning { voice: 'left' | 'right' | 'both' | 'danger'; eta: number }

// A short forecast, not an autopilot: it never changes controls or physics.
// The centre gap/outlane can still drain even after a timely warning.
export function flipperWarning(s: SoundState): FlipperWarning | undefined {
  if (s.paused || s.phase !== 'playing') return;
  const p = s.position, v = s.velocity;
  if (v.z < 1.2 || p.z >= flippers[0].z - 0.4) return;
  let eta: number, x: number;
  if (s.route.active) {
    if (s.route.phase !== 'tunnel' && s.route.phase !== 'return') return;
    // A verified descending route is predictable before the ball reaches the
    // low landing. Warn at the end of the tunnel, ahead of the right return.
    const speed = Math.hypot(v.x, v.y, v.z);
    eta = (Math.max(0, routeLength - s.route.projection.s) + 0.35) / speed;
    x = 2.55;
  } else {
    if (p.x >= 4.45 || p.y > BALL_RADIUS + 0.5 || p.y < 0) return;
    const dz = FLIPPER_APPROACH_Z - p.z;
    if (dz <= 0) return;
    // dz = vz*t + 0.5*3*t², matching the table's downslope gravity.
    eta = (Math.sqrt(v.z * v.z + 6 * dz) - v.z) / 3;
    x = p.x + v.x * eta;
    // Fast, clear returns need earlier advice. Suppress forecasts through a
    // pin/target, whose imminent rebound would invalidate the selected side.
    const xAt = (z: number) => p.x + v.x * (Math.sqrt(v.z * v.z + 6 * (z - p.z)) - v.z) / 3;
    for (const b of bumpers) if (b.z > p.z && b.z < FLIPPER_APPROACH_Z && Math.abs(xAt(b.z) - b.x) < b.radius + BALL_RADIUS + 0.15) return;
    for (const t of targets) if (t.z > p.z && t.z < FLIPPER_APPROACH_Z && Math.abs(xAt(t.z) - t.x) < 0.18 + BALL_RADIUS + 0.15) return;
  }
  if (!Number.isFinite(eta) || eta > 1.15 || eta < 0.10) return;
  const voice = Math.abs(x) > 4.0 ? 'danger' : x < -0.45 ? 'left' : x > 0.45 ? 'right' : 'both';
  if ((voice === 'left' && s.controls.left) || (voice === 'right' && s.controls.right)
    || (voice === 'both' && s.controls.left && s.controls.right)) return;
  return { voice, eta };
}

export class SoundDirector {
  private phase: Phase = 'intro';
  private route: RoutePhase = 'free';
  private warned = false;
  private nextReaction = 0;
  private nextPhrase = 0;
  private nextIdle = 6;
  private hitCount = 0;
  reset() {
    this.phase = 'intro'; this.route = 'free'; this.warned = false;
    this.nextReaction = this.nextPhrase = this.hitCount = 0; this.nextIdle = 6;
  }
  resume() { this.warned = false; }
  update(s: SoundState, events: readonly GameEvent[]): SoundFrame {
    const cues: SoundCue[] = [];
    const frame: SoundFrame = { paused: s.paused, music: !s.paused && ['ready', 'playing', 'draining'].includes(s.phase),
      rolling: 0, speed: Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z),
      surface: s.route.phase, charge: s.phase === 'ready' ? s.charge : 0, cues };
    if (s.paused || s.phase === 'intro') return frame;
    const say = (kind: CueKind, voice: VoiceKey, priority: number, strength?: number, pan = 0) => {
      cues.push({ kind, voice, priority, strength, pan, caption: voiceBank[voice].caption });
      this.nextPhrase = s.time + 2.2;
    };
    if (s.phase !== this.phase) {
      this.warned = false;
      if (s.phase === 'ready') say('ready', 'ready', 40);
      this.phase = s.phase;
    }
    if (s.velocity.z < -1.2 || s.phase !== 'playing') this.warned = false;
    if (s.phase === 'playing' && (s.route.active ? Math.abs(s.route.projection.vertical) < 0.22 : s.position.y > 0.18 && s.position.y < BALL_RADIUS + 0.14)) {
      frame.rolling = Math.min(1, frame.speed / 22);
    }
    for (const e of events) {
      if (e.type === 'flipper') cues.push({ kind: 'flipper' });
      if (e.type === 'launch') { say('launch', 'launch', 65); this.nextIdle = s.time + 6; }
      if (e.type === 'drain') say('drain', 'drain', 90);
      if (e.type === 'over') say('over', 'over', 95);
      if (e.type === 'circuit') say('circuit', 'circuit', 65);
      if (e.type === 'flipper-hit' && s.velocity.z < -2 && s.time >= this.nextPhrase) say('save', 'save', 55);
      if (e.type === 'bumper' || e.type === 'target' || e.type === 'wall') {
        const kind = e.type, strength = e.type === 'wall' ? Math.min(1, e.speed / 16) : 0.8;
        const pan = Math.max(-0.7, Math.min(0.7, s.position.x / 6));
        // Mechanical contact sounds are independent of the voice budget.
        cues.push({ kind, strength, pan });
        if (s.time >= this.nextReaction) {
          this.nextReaction = s.time + 0.18; this.nextIdle = s.time + 5;
          if (strength > 0.65 && s.time >= this.nextPhrase) {
            say('chatter', ++this.hitCount % 2 ? 'whoa' : 'ouch', 45, strength, pan);
          } else cues.push({ kind: 'chatter', strength, pan, priority: 20 });
        }
      }
    }
    if (s.route.phase !== this.route) {
      this.route = s.route.phase;
      if (s.route.phase === 'ascent') say('ascent', 'ramp', 50);
      if (s.route.phase === 'bridge') say('bridge', 'bridge', 55);
      if (s.route.phase === 'tunnel') say('tunnel', 'tunnel', 55);
    }
    const warning = flipperWarning(s);
    if (warning && !this.warned) {
      this.warned = true; say('warning', warning.voice, 100);
      this.nextIdle = s.time + 5;
    }
    if (s.phase === 'playing' && s.time >= this.nextIdle && s.time >= this.nextPhrase && !warning) {
      cues.push({ kind: 'chatter', strength: 0.2, priority: 15, caption: '[curious electronic chatter]' });
      this.nextIdle = s.time + 7;
    }
    return frame;
  }
}
