import { LookAround, shortestAngle, type LookPose } from '../render/look-around';
export type PhoneLookState = 'follow' | 'requesting' | 'waiting' | 'calibrating' | 'active' | 'rebasing' | 'suspended' | 'unavailable';
export interface OrientationReading { alpha: number | null; beta: number | null; gamma: number | null }
export interface PhoneLookEnvironment {
  available(): boolean;
  secure(): boolean;
  hidden(): boolean;
  screenAngle(): number;
  requestPermission?: () => Promise<string>;
  listen(receive: (sample: OrientationReading) => void): () => void;
  frame(callback: () => void): void;
}
export interface PhoneLookOptions {
  pause(reason: string): void;
  now?: () => number;
  environment?: PhoneLookEnvironment;
  reducedMotion?: boolean | (() => boolean);
}
export function readScreenAngle(): number {
  const legacy = (window as Window & { orientation?: number }).orientation;
  const modern = screen.orientation?.angle;
  const angle = typeof modern === 'number' && Number.isFinite(modern) ? modern : legacy;
  return typeof angle === 'number' && Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0;
}
function browserEnvironment(): PhoneLookEnvironment {
  const ctor = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  return {
    available: () => !!ctor, secure: () => window.isSecureContext, hidden: () => document.hidden,
    screenAngle: readScreenAngle,
    requestPermission: ctor?.requestPermission ? () => ctor.requestPermission!() : undefined,
    listen(receive) { const listener = (e: DeviceOrientationEvent) => receive(e); window.addEventListener('deviceorientation', listener); return () => window.removeEventListener('deviceorientation', listener); },
    frame: callback => { requestAnimationFrame(callback); },
  };
}

/** Sensor handlers only record readings. update applies at most one sample at a render boundary. */
export class PhoneLook {
  state: PhoneLookState = 'follow';
  selected = false;
  message = '';
  readonly orientation: LookPose = { heading: 0, pitch: 0 };
  private readonly math: LookAround;
  private readonly env: PhoneLookEnvironment;
  private readonly now: () => number;
  private generation = 0;
  private disposed = false;
  private detach?: () => void;
  private deadline = 0;
  private sequence = 0;
  private appliedSequence = 0;
  private latestSequence = 0;
  private alpha = 0; private beta = 0; private gamma = 0; private angle = 0;
  private latestTime = -Infinity;
  private lastValidTime = -Infinity;
  private silenceRebase = false;
  private invalidStart = 0; private invalidCount = 0; private invalidStream = false;
  private screenPending = false; private screenBoundary = 0; private screenReady = true;
  private screenAngle = 0;
  private acquisition: 'calibrate' | 'rebase' = 'calibrate';
  private transition: 'center' | 'follow' | null = null;
  private elapsed = 0;
  private readonly start: LookPose = { heading: 0, pitch: 0 };
  private readonly target: LookPose = { heading: 0, pitch: 0 };
  constructor(private readonly options: PhoneLookOptions) {
    this.env = options.environment ?? browserEnvironment(); this.now = options.now ?? (() => performance.now());
    this.math = new LookAround(typeof options.reducedMotion === 'function' ? options.reducedMotion() : options.reducedMotion ?? false);
  }
  get reducedMotion() { return this.math.reducedMotion; }
  set reducedMotion(value: boolean) { this.math.reducedMotion = value; }
  private copy(pose: LookPose) { this.orientation.heading = pose.heading; this.orientation.pitch = pose.pitch; }
  private stop() {
    this.generation++; this.detach?.(); this.detach = undefined; this.transition = null;
    this.latestTime = this.lastValidTime = -Infinity; this.latestSequence = this.appliedSequence = 0;
    this.invalidCount = 0; this.invalidStream = false; this.silenceRebase = false;
    this.screenPending = false; this.screenReady = true; this.screenBoundary = 0;
  }
  enable(followPose: LookPose) {
    if (this.disposed || this.env.hidden()) return;
    this.options.pause('Enable phone look'); // Before creating the acquisition generation or invoking permission.
    this.stop(); this.selected = true; this.copy(followPose); this.acquire('calibrate', true);
  }
  private acquire(mode: 'calibrate' | 'rebase', permission: boolean) {
    this.acquisition = mode;
    if (this.disposed || this.env.hidden()) { this.state = 'suspended'; return; }
    if (!this.env.secure() || !this.env.available()) { this.unavailable('Phone look needs a supported browser on HTTPS. Follow ball is available.'); return; }
    const generation = this.generation;
    if (permission && this.env.requestPermission) {
      this.state = 'requesting'; this.message = 'Allow motion access to enable phone look.';
      try {
        // Deliberately invoked directly on the enable/resume gesture, before any await.
        const result = this.env.requestPermission();
        void result.then(status => {
          if (generation !== this.generation || this.disposed || this.env.hidden()) return;
          if (status === 'granted') this.listen(generation);
          else this.unavailable('Motion access was not allowed. Retry or choose Follow ball.');
        }, () => {
          if (generation === this.generation && !this.disposed && !this.env.hidden()) this.unavailable('Motion access failed. Retry or choose Follow ball.');
        });
      } catch { if (generation === this.generation) this.unavailable('Motion access failed. Retry or choose Follow ball.'); }
    } else this.listen(generation);
  }
  private listen(generation: number) {
    if (generation !== this.generation || this.env.hidden() || this.disposed) return;
    this.state = this.acquisition === 'rebase' ? 'rebasing' : 'waiting';
    this.message = 'Waiting for phone motion readings…'; this.deadline = this.now() + 3000;
    try { this.detach = this.env.listen(sample => {
      if (generation !== this.generation || this.env.hidden() || this.disposed) return;
      const time = this.now(); this.sequence++;
      if (sample.alpha === null || sample.beta === null || sample.gamma === null ||
        !Number.isFinite(sample.alpha) || !Number.isFinite(sample.beta) || !Number.isFinite(sample.gamma)) {
        if (!this.invalidCount) this.invalidStart = time;
        this.invalidCount++;
        if (this.invalidCount >= 3 && time - this.invalidStart >= 1000) this.invalidStream = true;
        return;
      }
      this.invalidCount = 0;
      if (this.state === 'active' && Number.isFinite(this.lastValidTime) && time - this.lastValidTime > 1000) this.silenceRebase = true;
      this.alpha = sample.alpha; this.beta = sample.beta; this.gamma = sample.gamma;
      this.angle = this.env.screenAngle(); this.latestTime = this.lastValidTime = time; this.latestSequence = this.sequence;
    }); } catch { this.unavailable('Phone motion readings are unavailable. Retry or choose Follow ball.'); }
  }
  private unavailable(message: string) { this.stop(); this.state = 'unavailable'; this.message = message; this.options.pause(message); }
  suspend() {
    if (this.disposed) return;
    if (!this.selected) { this.transition = null; return; }
    if (this.state === 'suspended') return;
    this.stop(); this.state = 'suspended'; this.message = 'Phone look paused. Resume or Follow ball.';
    this.options.pause(this.message);
  }
  /** Use for explicit sensor permission/revocation errors, not ordinary event silence. */
  sensorError() { this.suspend(); }
  resume() {
    if (this.disposed || !this.selected || this.env.hidden()) return;
    this.stop(); this.acquire('rebase', true);
  }
  reset(followPose: LookPose) {
    if (this.disposed || !this.selected) return;
    this.stop(); this.copy(followPose); this.acquire('calibrate', false);
  }
  screenChanged() {
    if (this.disposed || !this.selected || !this.detach) return;
    this.transition = null; this.screenBoundary = this.sequence; this.screenReady = false;
    if (this.state === 'active' || this.state === 'rebasing') { this.state = 'rebasing'; this.acquisition = 'rebase'; }
    else { this.state = 'waiting'; this.acquisition = 'calibrate'; }
    this.deadline = this.now() + 3000;
    if (this.screenPending) return;
    this.screenPending = true; const generation = this.generation;
    this.env.frame(() => {
      if (generation !== this.generation || this.disposed) return;
      this.screenPending = false; this.screenReady = true; this.screenAngle = this.env.screenAngle();
    });
  }
  private fresh() { return this.latestSequence > 0 && this.now() - this.latestTime <= 250; }
  private applySample() {
    const maxAge = this.state === 'waiting' || this.state === 'rebasing' ? 250 : 1000;
    if (this.now() - this.latestTime > maxAge || !this.latestSequence || this.latestSequence === this.appliedSequence || !this.screenReady ||
      (this.screenBoundary > 0 && (this.latestSequence <= this.screenBoundary || this.angle !== this.screenAngle))) return false;
    this.appliedSequence = this.latestSequence;
    return this.math.sample(this.alpha, this.beta, this.gamma, this.angle);
  }
  center(followPose: LookPose) {
    if (this.disposed || !this.selected || this.env.hidden() || !['active', 'calibrating'].includes(this.state)) return;
    this.transition = null; this.applySample();
    if (!this.fresh()) { this.state = 'waiting'; this.acquisition = 'calibrate'; this.deadline = this.now() + 3000; this.message = 'Waiting for a fresh reading. Hold your phone comfortably.'; this.options.pause(this.message); return; }
    if (this.math.pole) { this.message = 'Tilt your phone slightly, then tap Center view.'; return; }
    if (this.state === 'active' && !this.reducedMotion) {
      this.beginTransition('center', followPose); return;
    }
    this.math.calibrate(followPose); this.copy(this.math.orientation); this.state = 'active';
    this.message = 'Turn your phone to look.';
  }
  private beginTransition(kind: 'center' | 'follow', target: LookPose) {
    this.transition = kind; this.elapsed = 0;
    this.start.heading = this.orientation.heading; this.start.pitch = this.orientation.pitch;
    this.target.heading = this.start.heading + shortestAngle(target.heading - this.start.heading);
    this.target.pitch = Math.max(-this.math.pitchLimit, Math.min(this.math.pitchLimit, target.pitch));
  }
  follow(_followPose?: LookPose) {
    if (this.disposed) return;
    const wasSelected = this.selected;
    this.stop(); this.selected = false; this.state = 'follow'; this.message = '';
    if (wasSelected && !this.reducedMotion) this.beginTransition('follow', _followPose ?? this.orientation);
  }
  update(dt: number, followPose: LookPose): LookPose | null {
    if (this.disposed) return null;
    if (typeof this.options.reducedMotion === 'function') this.math.reducedMotion = this.options.reducedMotion();
    if (this.selected && this.env.hidden()) this.suspend();
    if (this.invalidStream && this.selected) this.suspend();
    if (this.transition) {
      const transition = this.transition;
      if (transition === 'follow') {
        this.target.heading += shortestAngle(followPose.heading - this.target.heading);
        this.target.pitch = followPose.pitch;
      }
      this.elapsed += Math.max(0, dt); const t = this.reducedMotion ? 1 : Math.min(1, this.elapsed / .2);
      const ease = t * t * (3 - 2 * t);
      this.orientation.heading = this.start.heading + (this.target.heading - this.start.heading) * ease;
      this.orientation.pitch = this.start.pitch + (this.target.pitch - this.start.pitch) * ease;
      if (t < 1) return this.orientation;
      this.transition = null;
      if (transition === 'follow') { this.copy(followPose); return null; }
      this.applySample();
      if (this.fresh() && this.math.calibrate(this.orientation)) this.silenceRebase = false;
      else {
        this.state = 'waiting'; this.acquisition = 'calibrate'; this.deadline = this.now() + 3000;
        this.message = 'Hold your phone comfortably, then tap Center view.'; this.options.pause(this.message);
      }
      return this.orientation;
    }
    if (!this.selected) { this.copy(followPose); return null; }
    const sampled = this.applySample();
    if (sampled && this.state === 'waiting') {
      this.state = 'calibrating'; this.message = this.math.pole ? 'Tilt your phone slightly, then tap Center view.' : 'Hold your phone comfortably. Tap Center view.';
    } else if (sampled && this.state === 'rebasing' && !this.math.pole) {
      this.math.calibrate(this.orientation); this.state = 'active'; this.message = 'Turn your phone to look.';
      this.silenceRebase = false; this.screenBoundary = 0;
    } else if (sampled && this.state === 'active') {
      if (this.silenceRebase) {
        // Discard unobserved movement, preserving the last rendered pose atomically.
        if (this.math.calibrate(this.orientation)) this.silenceRebase = false;
      } else this.copy(this.math.orientation);
    }
    if ((this.state === 'waiting' || this.state === 'rebasing') && this.now() >= this.deadline) {
      if (this.state === 'rebasing' && this.screenBoundary > 0) this.suspend();
      else this.unavailable('No usable phone readings. Retry or choose Follow ball.');
    }
    return this.orientation;
  }
  dispose() { this.stop(); this.disposed = true; this.selected = false; this.state = 'follow'; }
}
