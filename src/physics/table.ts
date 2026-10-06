export const STEP = 1 / 120;
export const BALL_RADIUS = 0.28;
export const TABLE_WIDTH = 12;
export const TABLE_LENGTH = 22;
export const LAUNCH_POSITION = { x: 5.18, y: BALL_RADIUS + 0.03, z: 8.7 };
export const FLIPPER_LENGTH = 3.0;

// Ball-centre control points in board coordinates; shared by contact geometry,
// route scoring, the scene and radar. Entry and exit have flat landing zones.
export const CIRCUIT_POINTS: ReadonlyArray<readonly [number, number, number]> = [
  [-2.75, 0.28, 3.4], [-2.80, 0.28, 2.7], [-2.95, 0.40, 1.8],
  [-3.30, 1.00, 0.0], [-3.80, 2.05, -3.0], [-3.50, 2.48, -5.1],
  [-1.80, 2.48, -5.8], [0.90, 2.48, -5.6], [3.20, 2.48, -4.0],
  [3.40, 2.20, -1.0], [3.10, 1.80, 2.0], [2.95, 1.05, 3.8],
  [2.70, 0.34, 5.4], [2.55, 0.28, 6.2],
];
export const CIRCUIT_BONUS = 750;

export const bumpers = [
  { x: 0, z: -6.4, radius: 0.82, color: 0xffaf55 },
  { x: -2.35, z: -3.7, radius: 0.82, color: 0x69d9ed },
  { x: 2.05, z: -2.7, radius: 0.82, color: 0xffaf55 },
] as const;

export const targets = [
  { x: -5.1, z: 0.0, color: 0x69d9ed },
  { x: 3.95, z: 1.0, color: 0xffaf55 },
] as const;

export const rails = [
  { ax: -5.8, az: -10.5, bx: -5.8, bz: 10.8, kind: 'outer' },
  { ax: 5.8, az: -10.5, bx: 5.8, bz: 10.8, kind: 'outer' },
  { ax: -5.8, az: -10.5, bx: 3.7, bz: -10.5, kind: 'outer' },
  { ax: 3.7, az: -10.5, bx: 5.8, bz: -8.7, kind: 'launch' },
  { ax: 4.55, az: -6.0, bx: 4.55, bz: 10.4, kind: 'launch' },
  { ax: -5.45, az: 4.5, bx: -3.65, bz: 6.95, kind: 'guide' },
  { ax: 4.1, az: 4.5, bx: 3.65, bz: 6.95, kind: 'guide' },
  { ax: -5.45, az: 8.0, bx: -3.65, bz: 9.55, kind: 'guide' },
  { ax: 4.1, az: 8.0, bx: 3.65, bz: 9.55, kind: 'guide' },
] as const;

export const flippers = [
  { x: -3.2, z: 7.35, side: 1, rest: -0.43, raised: 0.48 },
  { x: 3.2, z: 7.35, side: -1, rest: 0.43, raised: -0.48 },
] as const;
// Forecast plane ahead of the flipper tips, used by the audible return advice.
export const FLIPPER_APPROACH_Z = flippers[0].z - 0.9;
