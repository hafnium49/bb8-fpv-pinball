import type { GameEvent, Phase } from '../physics/simulation';

export const HEAD_LOSS_CHANCE = 1 / 20;
export const HEAD_LOSS_SECONDS = 3;
export const HEAD_LOSS_CAPTION = 'Oh no, BB-8 lost its head!';

interface CameraState { phase: Phase; paused: boolean; time: number; position: { x: number } }

/** One random draw per launch; a selected ball spins after leaving the lane. */
export class HeadLossCamera {
  mode: 'fpv' | 'spin' = 'fpv';
  eventActive = false;
  private suppressEpisode = false;
  private selected = false;
  private endsAt = 0;
  private lastTime = 0;
  constructor(private draw: () => number = () => Math.random()) {}

  reset() { this.mode = 'fpv'; this.eventActive = false; this.suppressEpisode = false; this.selected = false; this.endsAt = 0; this.lastTime = 0; }

  update(s: CameraState, events: readonly GameEvent[], reducedMotion = false, manualLook = false) {
    const wasSpinning = this.eventActive;
    if (s.time < this.lastTime) this.reset();
    this.lastTime = s.time;
    if (s.paused || s.phase !== 'playing' || (reducedMotion && !manualLook && !this.suppressEpisode)) {
      this.eventActive = false; this.selected = false; this.suppressEpisode = false;
    } else {
      if (events.some(e => e.type === 'launch')) {
        this.eventActive = false; this.selected = this.draw() < HEAD_LOSS_CHANCE; this.suppressEpisode = manualLook;
      }
      if (manualLook && (this.selected || this.eventActive)) this.suppressEpisode = true;
      if (this.selected && s.position.x < 4.4) {
        this.selected = false; this.eventActive = true; this.endsAt = s.time + HEAD_LOSS_SECONDS;
      }
      if (this.eventActive && s.time >= this.endsAt) this.eventActive = false;
    }
    this.mode = this.eventActive && !this.suppressEpisode ? 'spin' : 'fpv';
    return { mode: this.mode, started: !wasSpinning && this.eventActive, ended: wasSpinning && !this.eventActive };
  }
}
