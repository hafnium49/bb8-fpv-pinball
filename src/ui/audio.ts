import type { SoundCue, SoundFrame } from './sound-director';
import { audioMix, musicGain, musicLevel } from './audio-presets';
import { musicPattern } from './music-pattern';
import { voiceBank, type VoiceKey } from './voice-bank';

type Bus = 'effects' | 'music' | 'voice';
interface Layer {
  bus: Bus;
  sources: Set<AudioScheduledSourceNode>;
  nodes: AudioNode[];
  input: GainNode;
  priority: number;
}
interface Mixer {
  effects: GainNode; music: GainNode; voice: GainNode;
  room: GainNode;
  roll: GainNode; rollFilter: BiquadFilterNode;
  motor: GainNode; motorPitch: AudioParam;
  continuous: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

export class GameAudio {
  enabled = false;
  private context?: AudioContext;
  private output?: GainNode;
  private mixer?: Mixer;
  private layers = new Set<Layer>();
  private speaking?: Layer;
  private voiceBuffer?: AudioBuffer;
  private loadingContext?: AudioContext;
  private retryVoiceAt = 0;
  private voiceFailed = false;
  private parameterTargets = new WeakMap<AudioParam, number>();
  private paused = false;
  private musicActive = false;
  musicVolume: number = audioMix.musicDefault;
  private nextBeat = 0;
  private beat = 0;
  private nextClack = 0;
  private noise?: AudioBuffer;
  private variant = 0;
  private musicSteps = 0;
  private warnings = 0;
  private lastVoice?: VoiceKey;
  readonly history: { kind: string; voice?: VoiceKey; accepted: boolean; at: number }[] = [];

  constructor(private voiceUrl?: string) {}
  get diagnostics() {
    return { voiceReady: !!this.voiceBuffer, voiceFailed: this.voiceFailed,
      effects: [...this.layers].filter(l => l.bus === 'effects').length,
      music: [...this.layers].filter(l => l.bus === 'music').length,
      speaking: !!this.speaking, priority: this.speaking?.priority ?? 0,
      loops: this.mixer?.continuous.length ?? 0, musicSteps: this.musicSteps,
      warnings: this.warnings, musicVolume: this.musicVolume, lastVoice: this.lastVoice };
  }
  private sessionType(type: 'playback' | 'auto') {
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = type;
    } catch { /* Ordinary Web Audio still works without this optional API. */ }
  }
  setMusicVolume(value: number) {
    this.musicVolume = musicLevel(value);
    if (this.mixer) this.smooth(this.mixer.music.gain, musicGain(this.musicVolume, this.speaking?.priority), audioMix.duckRecovery);
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.context && this.output) this.output.gain.setValueAtTime(enabled && !this.paused ? 1 : 0, this.context.currentTime);
    if (!enabled) { this.stopAll(); this.sessionType('auto'); }
  }
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (this.context && this.output) this.output.gain.setValueAtTime(this.enabled && !paused ? 1 : 0, this.context.currentTime);
    if (paused) { this.stopAll(); this.sessionType('auto'); }
  }
  reset() { this.stopAll(); this.beat = 0; this.setPaused(false); }
  async unlock(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      this.sessionType('playback');
      if (!this.context || this.context.state === 'closed') {
        this.stopAll(); this.context = new AudioContext({ latencyHint: 'interactive' });
        this.output = this.context.createGain(); this.output.gain.value = this.paused ? 0 : 1;
        this.output.connect(this.context.destination); this.noise = undefined; this.voiceBuffer = undefined;
        const created = this.context;
        created.onstatechange = () => { if (this.context === created && created.state !== 'running') this.stopAll(); };
      }
      const context = this.context;
      // Resume stays inside the input gesture, before any asynchronous wait.
      const resume = context.state !== 'running' ? context.resume() : undefined;
      void this.loadVoice(context);
      if (resume) await resume;
      return this.enabled && context.state === 'running';
    } catch { return false; }
  }
  private async loadVoice(context: AudioContext) {
    if (!this.voiceUrl || this.voiceBuffer || this.loadingContext === context || Date.now() < this.retryVoiceAt) return;
    this.loadingContext = context;
    try {
      const response = await fetch(this.voiceUrl);
      if (!response.ok) throw new Error('Voice asset unavailable');
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (this.context === context) { this.voiceBuffer = buffer; this.voiceFailed = false; }
    } catch {
      if (this.context === context) { this.voiceFailed = true; this.retryVoiceAt = Date.now() + 30000; }
    } finally { if (this.loadingContext === context) this.loadingContext = undefined; }
    // Never replay a cue after decode completes: a late warning is misleading.
  }
  private get ready() { return this.enabled && !this.paused && this.context?.state === 'running'; }
  private smooth(parameter: AudioParam, value: number, seconds = 0.04) {
    const previous = this.parameterTargets.get(parameter);
    if (previous !== undefined && Math.abs(previous - value) < Math.max(0.0001, Math.abs(value) * 0.002)) return;
    this.parameterTargets.set(parameter, value);
    const t = this.context!.currentTime;
    if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(t); else parameter.cancelScheduledValues(t);
    parameter.setTargetAtTime(value, t, seconds);
  }
  private noiseBuffer() {
    if (this.noise) return this.noise;
    const context = this.context!, buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0); let seed = 71931, brown = 0;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = seed / 2147483648 - 1;
      brown = (brown + white * 0.06) / 1.06; data[i] = brown * 2.3 + white * 0.25;
    }
    return this.noise = buffer;
  }
  private mix() {
    if (this.mixer) return this.mixer;
    const c = this.context!, nodes: AudioNode[] = [];
    const gain = (value: number) => { const n = c.createGain(); n.gain.value = value; nodes.push(n); return n; };
    const effects = gain(audioMix.effects), music = gain(musicGain(this.musicVolume)), voice = gain(0.9);
    const limiter = c.createDynamicsCompressor(); nodes.push(limiter);
    limiter.threshold.value = -6; limiter.knee.value = 8; limiter.ratio.value = 8;
    limiter.attack.value = 0.003; limiter.release.value = 0.16;
    effects.connect(limiter); music.connect(limiter); voice.connect(limiter); limiter.connect(this.output!);
    const reverb = c.createConvolver(); nodes.push(reverb);
    const impulse = c.createBuffer(1, Math.floor(c.sampleRate * 0.55), c.sampleRate), data = impulse.getChannelData(0);
    let seed = 331;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 2147483648 - 1) * Math.pow(1 - i / data.length, 3) * 0.3;
    }
    reverb.buffer = impulse; const room = gain(0.03);
    effects.connect(reverb); reverb.connect(room); room.connect(limiter);
    const rollFilter = c.createBiquadFilter(); nodes.push(rollFilter); rollFilter.type = 'lowpass'; rollFilter.Q.value = 0.7;
    const roll = gain(0), rollSource = c.createBufferSource(); rollSource.buffer = this.noiseBuffer(); rollSource.loop = true;
    rollSource.connect(rollFilter); rollFilter.connect(roll); roll.connect(effects); rollSource.start();
    const motor = gain(0), motorSource = c.createOscillator(); motorSource.type = 'triangle';
    motorSource.frequency.value = 90; motorSource.connect(motor); motor.connect(effects); motorSource.start();
    return this.mixer = { effects, music, voice, room, roll, rollFilter, motor, motorPitch: motorSource.frequency,
      continuous: [rollSource, motorSource], nodes };
  }
  private clean(layer: Layer) {
    for (const source of layer.sources) { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
    for (const node of layer.nodes) node.disconnect();
    layer.sources.clear(); this.layers.delete(layer);
    if (this.speaking === layer) this.speaking = undefined;
  }
  private stopAll() {
    for (const layer of [...this.layers]) this.clean(layer);
    if (this.mixer) {
      for (const source of this.mixer.continuous) { try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
      for (const node of this.mixer.nodes) node.disconnect();
      this.mixer = undefined;
    }
    this.musicActive = false; this.nextBeat = this.nextClack = 0;
  }
  private layer(bus: Bus, priority = 0, pan = 0) {
    const same = [...this.layers].filter(l => l.bus === bus), limit = bus === 'music' ? 10 : 12;
    if (same.length >= limit) this.clean(same[0]);
    const c = this.context!, input = c.createGain(), panner = c.createStereoPanner();
    panner.pan.value = Math.max(-0.7, Math.min(0.7, pan)); input.connect(panner); panner.connect(this.mix()[bus]);
    const layer: Layer = { bus, priority, input, nodes: [input, panner], sources: new Set() };
    this.layers.add(layer); return layer;
  }
  private attach(layer: Layer, source: AudioScheduledSourceNode) {
    layer.sources.add(source);
    source.onended = () => { source.disconnect(); layer.sources.delete(source); if (!layer.sources.size) this.clean(layer); };
  }
  private note(layer: Layer, frequency: number, duration: number, kind: OscillatorType, gain: number, end: number, at = this.context!.currentTime) {
    const c = this.context!, oscillator = c.createOscillator(), volume = c.createGain();
    oscillator.type = kind; oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), at + duration);
    volume.gain.setValueAtTime(0.0001, at); volume.gain.linearRampToValueAtTime(gain, at + 0.004);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(volume); volume.connect(layer.input); layer.nodes.push(volume); this.attach(layer, oscillator);
    oscillator.start(at); oscillator.stop(at + duration);
  }
  tone(frequency: number, duration: number, kind: OscillatorType = 'sine', gain = 0.035, endFrequency = frequency * 0.7) {
    if (!this.ready) return;
    this.note(this.layer('effects'), frequency, duration, kind, gain, endFrequency);
  }
  private noiseHit(layer: Layer, duration: number, gain: number, frequency = 1600) {
    const c = this.context!, at = c.currentTime, source = c.createBufferSource(), filter = c.createBiquadFilter(), volume = c.createGain();
    source.buffer = this.noiseBuffer(); filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 0.9;
    volume.gain.setValueAtTime(gain, at); volume.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter); filter.connect(volume); volume.connect(layer.input); layer.nodes.push(filter, volume); this.attach(layer, source);
    source.start(); source.stop(at + duration);
  }
  private mechanical(cue: SoundCue) {
    if (cue.kind === 'chatter' || cue.kind === 'ready' || cue.kind === 'head-loss') return;
    const layer = this.layer('effects', 0, cue.pan), strength = cue.strength ?? 0.7;
    switch (cue.kind) {
      case 'warning': this.note(layer, 960, 0.06, 'sine', 0.05, 1250); break;
      case 'flipper': this.note(layer, 130, 0.055, 'triangle', 0.075, 60); this.noiseHit(layer, 0.035, 0.08, 1200); break;
      case 'launch': this.note(layer, 110, 0.35, 'sawtooth', 0.03, 750); this.noiseHit(layer, 0.28, 0.14, 2000); break;
      case 'bumper': this.note(layer, 510, 0.095, 'sine', 0.12, 160); this.noiseHit(layer, 0.045, 0.16, 1900); break;
      case 'target': this.note(layer, 1280, 0.09, 'triangle', 0.08, 1380); this.noiseHit(layer, 0.035, 0.12, 3400); break;
      case 'wall': this.note(layer, 160 + strength * 260, 0.085, 'triangle', 0.04 + strength * 0.08, 75); this.noiseHit(layer, 0.045, 0.05 + strength * 0.15); break;
      case 'save': this.note(layer, 240, 0.1, 'triangle', 0.08, 130); break;
      case 'ascent': this.note(layer, 200, 0.25, 'sine', 0.045, 880); break;
      case 'bridge': this.noiseHit(layer, 0.12, 0.12, 2600); break;
      case 'tunnel': this.note(layer, 220, 0.25, 'sine', 0.06, 70); break;
      case 'circuit':
        for (const [i, f] of [523.25, 659.25, 783.99, 1046.5].entries()) this.note(layer, f, 0.24, 'triangle', 0.065, f, this.context!.currentTime + i * 0.09);
        break;
      case 'over':
        for (const [i, f] of [330, 261.63, 220].entries()) this.note(layer, f, 0.22, 'triangle', 0.04, f, this.context!.currentTime + i * 0.14);
        break;
      case 'drain': this.note(layer, 350, 0.5, 'sine', 0.08, 55); this.noiseHit(layer, 0.25, 0.08, 600); break;
    }
  }
  private vocal(cue: SoundCue) {
    const priority = cue.priority ?? 20;
    const transition = cue.kind === 'ascent' || cue.kind === 'bridge' || cue.kind === 'tunnel';
    if (this.speaking && priority < 90 && (this.speaking.priority > priority || this.speaking.priority === priority && !transition)) return false;
    if (this.speaking) this.clean(this.speaking);
    // Direction is carried by rhythm/pitch even on a mono speaker; stereo
    // positioning is an additional hint, never the only way to tell sides.
    const pan = cue.kind === 'warning' ? cue.voice === 'left' ? -0.65 : cue.voice === 'right' ? 0.65 : 0 : cue.pan;
    const layer = this.layer('voice', priority, pan); this.speaking = layer;
    if (cue.voice && this.voiceBuffer) {
      const c = this.context!, source = c.createBufferSource(), clip = voiceBank[cue.voice];
      source.buffer = this.voiceBuffer; source.connect(layer.input); this.attach(layer, source);
      layer.input.gain.value = cue.kind === 'warning' ? 1 : 0.85;
      source.start(c.currentTime, clip.offset, clip.duration); this.lastVoice = cue.voice;
    } else {
      this.chirp(layer, cue);
    }
    this.smooth(this.mix().music.gain, musicGain(this.musicVolume, priority), audioMix.duckAttack); this.smooth(this.mix().effects.gain, priority >= 90 ? audioMix.urgentEffects : audioMix.ordinaryEffects, audioMix.duckAttack);
    return true;
  }
  private chirp(layer: Layer, cue: SoundCue) {
    // Original FM/formant vocals: questioning burbles, excited trills and a
    // pitch-breaking cry for hard impacts or danger.
    const c = this.context!, at = c.currentTime, strength = cue.strength ?? 0.35;
    if (cue.kind === 'warning') {
      // Immediate nonverbal fallback while the sprite is unavailable. Keep
      // left low/falling, right high/rising and both alternating, as in the WAV.
      const pitches = cue.voice === 'left' ? [690, 580] : cue.voice === 'right' ? [1050, 1210, 1370]
        : cue.voice === 'both' ? [620, 1320, 620, 1320] : [1500, 1600, 1800];
      const interval = cue.voice === 'left' ? 0.17 : cue.voice === 'danger' ? 0.15 : 0.11;
      for (const [i, pitch] of pitches.entries()) {
        this.note(layer, pitch * 0.6, 0.10, 'triangle', 0.16,
          pitch * 0.6 * (cue.voice === 'left' || cue.voice === 'danger' ? 0.7 : 1.12), at + i * interval);
      }
      return;
    }
    const scream = (cue.kind === 'chatter' && strength > 0.55) || cue.kind === 'drain' || cue.kind === 'head-loss';
    const duration = scream ? 0.48 : 0.32;
    const carrier = c.createOscillator(), modulator = c.createOscillator(), modulation = c.createGain();
    const formant = c.createBiquadFilter(), volume = c.createGain();
    carrier.type = 'sawtooth'; modulator.type = 'sine'; formant.type = 'bandpass'; formant.Q.value = 1.6;
    const variant = this.variant++ % 4, base = (scream ? 500 : 380 + variant * 70) * 0.6;
    carrier.frequency.setValueAtTime(base, at);
    for (let i = 1; i <= 5; i++) carrier.frequency.exponentialRampToValueAtTime(base * (scream ? [1, 2.8, 2.2, 3.1, 0.6][i - 1] : [1.7, 1.15, 2.0, 1.4, 0.8][i - 1]), at + duration * i / 5);
    modulator.frequency.value = scream ? 27 : 42 + variant * 11; modulation.gain.value = scream ? 130 : 60;
    modulator.connect(modulation); modulation.connect(carrier.frequency);
    formant.frequency.setValueAtTime(900, at); formant.frequency.linearRampToValueAtTime(scream ? 1620 : 540, at + duration);
    volume.gain.setValueAtTime(0.0001, at); volume.gain.linearRampToValueAtTime(scream ? 0.2 : 0.12, at + 0.018); volume.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    carrier.connect(formant); formant.connect(volume); volume.connect(layer.input); layer.nodes.push(modulation, formant, volume);
    this.attach(layer, carrier); this.attach(layer, modulator); carrier.start(); modulator.start(); carrier.stop(at + duration); modulator.stop(at + duration);
  }
  play(cue: SoundCue) {
    if (!this.ready) return false;
    this.mechanical(cue);
    const accepted = cue.voice || cue.kind === 'chatter' ? this.vocal(cue) : false;
    if (accepted && cue.kind === 'warning') this.warnings++;
    this.history.push({ kind: cue.kind, voice: cue.voice, accepted, at: this.context!.currentTime });
    if (this.history.length > 48) this.history.shift();
    return accepted;
  }
  update(frame: SoundFrame) {
    this.setPaused(frame.paused);
    if (!this.ready) return;
    if (!frame.music && !frame.rolling && !frame.charge && !this.mixer) return;
    const c = this.context!, t = c.currentTime, mix = this.mix();
    this.smooth(mix.music.gain, musicGain(this.musicVolume, this.speaking?.priority), this.speaking ? audioMix.duckAttack : audioMix.duckRecovery);
    this.smooth(mix.effects.gain, this.speaking ? this.speaking.priority >= 90 ? 0.3 : 0.55 : 0.75);
    this.smooth(mix.room.gain, frame.surface === 'tunnel' ? 0.22 : 0.03);
    this.smooth(mix.roll.gain, frame.rolling * (frame.surface === 'bridge' ? 0.1 : 0.07));
    mix.rollFilter.type = frame.surface === 'bridge' ? 'bandpass' : 'lowpass';
    this.smooth(mix.rollFilter.frequency, 600 + frame.speed * (frame.surface === 'bridge' ? 150 : 80));
    this.smooth(mix.motor.gain, frame.charge * 0.015 + frame.rolling * 0.008);
    this.smooth(mix.motorPitch, frame.charge ? 140 + frame.charge * 420 : 65 + frame.speed * 7);
    if (frame.surface === 'bridge' && frame.rolling > 0.08 && t >= this.nextClack) {
      this.nextClack = t + Math.max(0.065, 0.22 - frame.speed * 0.009);
      const layer = this.layer('effects'); this.noiseHit(layer, 0.055, 0.045, 2700);
      this.note(layer, 1100 + (this.variant++ % 3) * 220, 0.075, 'sine', 0.025, 780);
    }
    if (!frame.music || this.musicVolume === 0) {
      if (this.musicActive) for (const layer of [...this.layers]) if (layer.bus === 'music') this.clean(layer);
      if (!frame.music && !frame.rolling && !frame.charge) {
        for (const source of mix.continuous) { try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
        mix.continuous.length = 0;
      }
      this.musicActive = false; return;
    }
    if (!this.musicActive || t - this.nextBeat > 0.3) this.nextBeat = t + 0.015;
    this.musicActive = true;
    // Original 16-bar A-minor arcade groove. Bounded lookahead prevents a burst
    // of overdue notes after a slow render frame or resumed tab.
    let scheduled = 0;
    while (this.nextBeat < t + 0.12 && scheduled++ < 2) {
      const at = this.nextBeat, notes = musicPattern(this.beat++, frame.musicMode ?? 'playing');
      if (notes.length) {
        const layer = this.layer('music');
        for (const note of notes) this.note(layer, note.frequency, note.duration, note.kind, note.gain, note.end, at);
      }
      this.nextBeat += 60 / 108 / 2; this.musicSteps++;
    }
  }
  dispose() {
    this.stopAll(); this.sessionType('auto');
    if (this.context) void this.context.close().catch(() => {});
  }
}
