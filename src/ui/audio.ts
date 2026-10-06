export class GameAudio {
  enabled = false;
  private context?: AudioContext;
  private output?: GainNode;
  private sessionType(type: 'playback' | 'auto') {
    // WebKit's default Web Audio session obeys the iPhone's ringer mute switch.
    // Request media playback only after the player has explicitly enabled sound.
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = type;
    } catch { /* Optional API: ordinary Web Audio still works without it. */ }
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.context && this.output) this.output.gain.setValueAtTime(enabled ? 1 : 0, this.context.currentTime);
    if (!enabled) this.sessionType('auto');
  }
  async unlock(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      this.sessionType('playback');
      if (!this.context || this.context.state === 'closed') {
        this.context = new AudioContext({ latencyHint: 'interactive' });
        this.output = this.context.createGain(); this.output.gain.value = 1;
        this.output.connect(this.context.destination);
      }
      const context = this.context;
      // Call resume inside the input handler, before the first asynchronous wait.
      if (context.state !== 'running') await context.resume();
      return this.enabled && context.state === 'running';
    } catch { return false; }
  }
  tone(frequency: number, duration: number, kind: OscillatorType = 'sine', gain = 0.035, endFrequency = frequency * 0.7) {
    if (!this.enabled || !this.context || !this.output || this.context.state !== 'running') return;
    const t = this.context.currentTime, oscillator = this.context.createOscillator(), volume = this.context.createGain();
    oscillator.type = kind; oscillator.frequency.setValueAtTime(frequency, t); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration);
    volume.gain.setValueAtTime(gain, t); volume.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(volume); volume.connect(this.output);
    oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    oscillator.start(); oscillator.stop(t + duration);
  }
  dispose() { this.sessionType('auto'); if (this.context) void this.context.close().catch(() => {}); }
}
