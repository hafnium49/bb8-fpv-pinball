export class GameAudio {
  enabled = false;
  private context?: AudioContext;
  unlock() {
    if (!this.enabled) return;
    this.context ??= new AudioContext(); void this.context.resume();
  }
  tone(frequency: number, duration: number, kind: OscillatorType = 'sine', gain = 0.035, endFrequency = frequency * 0.7) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime, oscillator = this.context.createOscillator(), volume = this.context.createGain();
    oscillator.type = kind; oscillator.frequency.setValueAtTime(frequency, t); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration);
    volume.gain.setValueAtTime(gain, t); volume.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(volume); volume.connect(this.context.destination); oscillator.start(); oscillator.stop(t + duration);
  }
  dispose() { if (this.context) void this.context.close(); }
}
