export const audioMix = {
  musicMaximum: 0.7, musicDefault: 0.6, effects: 0.75,
  ordinaryDuck: 0.238, urgentDuck: 0.126,
  ordinaryEffects: 0.55, urgentEffects: 0.30,
  duckAttack: 0.015, duckRecovery: 0.12,
};
export function musicLevel(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : audioMix.musicDefault;
}
export function musicGain(value: number, priority = 0) {
  return audioMix.musicMaximum * musicLevel(value) * (priority >= 90 ? audioMix.urgentDuck : priority > 0 ? audioMix.ordinaryDuck : 1);
}
