export type MusicMode = 'ready' | 'playing' | 'draining' | 'off';
export interface MusicNote {
  frequency: number; duration: number; gain: number; kind: 'sine' | 'triangle'; end: number;
}
// Original 16-bar groove. Every step returns a bounded set of short notes;
// the AudioContext scheduler owns time, pause and interruption handling.
export function musicPattern(step: number, mode: MusicMode): MusicNote[] {
  if (mode === 'off') return [];
  const index = ((Math.floor(step) % 128) + 128) % 128, beat = index % 8, bar = Math.floor(index / 8);
  const bass = [55, 55, 65.406, 73.416, 55, 82.407, 87.307, 82.407,
    55, 65.406, 73.416, 65.406, 55, 87.307, 82.407, 55][bar];
  const notes: MusicNote[] = [];
  const add = (frequency: number, duration: number, gain: number, kind: MusicNote['kind'] = 'sine', end = frequency) => notes.push({ frequency, duration, gain, kind, end });
  if (beat % (mode === 'playing' ? 2 : 4) === 0) add(bass, 0.23, mode === 'playing' ? 0.12 : 0.07, 'triangle');
  if (beat === 0) { add(bass * 4, 0.72, 0.015); add(bass * 6, 0.72, 0.012); }
  if (mode === 'playing') {
    add(beat % 2 ? 155 : 78, 0.065, beat % 2 ? 0.022 : 0.085, 'sine', 35);
    if (beat % 2) add(2100, 0.035, 0.012, 'triangle', 1300);
    const melody = [0, 440, 0, 659.255, 523.251, 0, 0, 587.33];
    if (melody[beat] && bar % 4 !== 3) add(melody[beat] * (bar >= 8 ? 0.5 : 1), 0.17, 0.035);
  }
  return notes;
}
