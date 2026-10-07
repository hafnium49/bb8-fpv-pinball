import type { GameEvent, Phase } from '../physics/simulation';

export const HEAD_LOSS_CHANCE = 1 / 20;
export const HEAD_LOSS_SECONDS = 3;
export const HEAD_LOSS_CAPTION = 'Oh no, BB-8 lost its head!';

interface CameraState { phase: Phase; paused: boolean; time: number; position: { x: number } }

/** One random draw per launch; a selected ball spins after leaving the lane. */
export class HeadLossCamera {
  mode: 'fpv' | 'spin' = 'fpv';
  private selected = false;
  private endsAt = 0;
  private lastTime = 0;
  constructor(private draw: () => number = () => Math.random()) {}

  reset() { this.mode = 'fpv'; this.selected = false; this.endsAt = 0; this.lastTime = 0; }

  update(s: CameraState, events: readonly GameEvent[], reducedMotion = false) {
    const wasSpinning = this.mode === 'spin';
    if (s.time < this.lastTime) this.reset();
    this.lastTime = s.time;
    if (s.paused || s.phase !== 'playing' || reducedMotion) {
      this.mode = 'fpv'; this.selected = false;
    } else {
      if (events.some(e => e.type === 'launch')) {
        this.mode = 'fpv'; this.selected = this.draw() < HEAD_LOSS_CHANCE;
      }
      if (this.selected && s.position.x < 4.4) {
        this.selected = false; this.mode = 'spin'; this.endsAt = s.time + HEAD_LOSS_SECONDS;
      }
      if (this.mode === 'spin' && s.time >= this.endsAt) this.mode = 'fpv';
    }
    return { mode: this.mode, started: !wasSpinning && this.mode === 'spin', ended: wasSpinning && this.mode === 'fpv' };
  }
}
