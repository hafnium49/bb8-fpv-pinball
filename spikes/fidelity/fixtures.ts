import {
  courseFlippers, courseLaunch, courseRamps, courseTunnels, deckHeight, deckOutline,
  pathFrame, type CoursePath,
} from '../../src/physics/reference-course';
import type { PinballSimulation, Point } from '../../src/physics/simulation';
import { BALL_RADIUS } from '../../src/physics/table';

// Keep this module portable to the unmodified main checkout. It deliberately
// imports only geometry/simulation APIs shared by main and the PR.
export const poseNames = ['ground', 'launch', 'bridge', 'tunnel', 'underdeck'] as const;
export type PoseName = typeof poseNames[number];
export type Quality = 'eco' | 'high';
export type Variant = 'baseline' | 'baked' | 'roughness';
export type Source = 'main' | 'pr';
export interface Fixture {
  name: PoseName;
  position: Point;
  heading: number;
  pitch: number;
  landmark: string;
  path?: CoursePath;
  distance?: number;
}

export function readOptions(search: string) {
  const query = new URLSearchParams(search);
  const allowed = <T extends string>(key: string, values: readonly T[], fallback: T): T => {
    const value = query.get(key) ?? fallback;
    if (!values.includes(value as T)) throw new Error(`Unsupported ${key}: ${value}`);
    return value as T;
  };
  const source = allowed('source', ['main', 'pr'], 'pr');
  const variant = allowed('fidelity', ['baseline', 'baked', 'roughness'], 'baseline');
  if (source === 'main' && variant !== 'baseline') throw new Error('Old main supports only the baseline variant.');
  return {
    source, variant,
    quality: allowed('quality', ['eco', 'high'], 'high'),
    pose: allowed('pose', poseNames, 'ground'),
    viewport: allowed('viewport', ['desktop', 'mobile'], 'desktop'),
    // A caller-supplied label is provenance, not proof of a checkout revision.
    commitLabel: query.get('commit') || 'unlabelled',
  };
}

function routeFixture(name: 'bridge' | 'tunnel', path: CoursePath, fraction: number): Fixture {
  const distance = path.length * fraction;
  const frame = pathFrame(path, distance);
  return {
    name, position: { ...frame.c }, path, distance,
    heading: Math.atan2(frame.tangent.x, -frame.tangent.z),
    pitch: Math.atan2(frame.tangent.y, 1),
    landmark: `${path.name} at ${(fraction * 100).toFixed(0)}% of measured path length`,
  };
}

export function getFixture(name: PoseName): Fixture {
  if (name === 'bridge') return routeFixture(name, courseRamps[1], .5);
  if (name === 'tunnel') return routeFixture(name, courseTunnels[0], .5);
  if (name === 'launch') return {
    name, position: { ...courseLaunch }, heading: 0, pitch: 0, landmark: 'Measured reference launch position',
  };
  if (name === 'underdeck') {
    // The bounding-box centre is inside the measured convex upper-deck outline.
    const xs = deckOutline.map(p => p.x), zs = deckOutline.map(p => p.z);
    return {
      name, position: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: BALL_RADIUS + .015,
        z: (Math.min(...zs) + Math.max(...zs)) / 2 },
      heading: Math.PI, pitch: 0,
      landmark: `Ground beneath the measured upper-deck footprint (deck height ${deckHeight})`,
    };
  }
  return {
    name, position: { x: (courseFlippers[0].x + courseFlippers[1].x) / 2,
      y: BALL_RADIUS + .015, z: courseFlippers[0].z - 2.8 },
    heading: 0, pitch: 0, landmark: 'Lower field, 2.8 world units upfield of measured flipper pivots',
  };
}

/** Reach a guided route through the real capture API, never a production debug
 * switch or a private-state cast. Preparation is outside the sampled workload.
 * The final paused pose is the exact pathFrame at the attained route distance.
 */
export function prepareFixture(sim: PinballSimulation, name: PoseName) {
  if (!sim.reference) throw new Error('Fidelity fixtures require the reference course.');
  const fixture = getFixture(name);
  sim.start(); sim.launch(.5);
  let preparationSteps = 0;
  if (fixture.path) {
    const path = fixture.path;
    const entrance = path.points[0], tangent = pathFrame(path, 0).tangent;
    sim.ball.setTranslation(path.tunnel ? { ...entrance, y: BALL_RADIUS + .015 } : {
      x: entrance.x - tangent.x * .6, y: BALL_RADIUS + .015, z: entrance.z - tangent.z * .6,
    }, true);
    sim.ball.setLinvel(path.tunnel ? { x: 0, y: 0, z: .2 } : {
      x: tangent.x * 25, y: 0, z: tangent.z * 25,
    }, true);
    while (preparationSteps < 2400 && !(sim.reference.path === path && sim.reference.routeDistance >= fixture.distance!)) {
      sim.step(); preparationSteps++;
      if (sim.phase !== 'playing') break;
    }
    if (sim.reference.path !== path || sim.reference.routeDistance < fixture.distance!) {
      throw new Error(`Could not prepare ${name} on ${path.name} through real route capture.`);
    }
    const frame = pathFrame(path, sim.reference.routeDistance);
    fixture.position = { ...frame.c };
    fixture.heading = Math.atan2(frame.tangent.x, -frame.tangent.z);
    fixture.pitch = Math.atan2(frame.tangent.y, 1);
    fixture.distance = sim.reference.routeDistance;
  }
  sim.ball.setTranslation(fixture.position, true);
  sim.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
  sim.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
  sim.ball.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  sim.paused = true; sim.events.length = 0;
  return { fixture, preparationSteps };
}

/** Match RouteCamera's production pitch envelope, including reduced motion. */
export function clampFPVPitch(pitch: number, reducedMotion: boolean) {
  const limit = (reducedMotion ? 8 : 18) * Math.PI / 180;
  return Math.max(-limit, Math.min(limit, pitch));
}

export function summarize(samples: readonly number[]) {
  if (!samples.length || samples.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('Timing samples must be non-empty, finite and non-negative.');
  }
  const sorted = [...samples].sort((a, b) => a - b), midpoint = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2,
    p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1)!, samples: sorted.length,
  };
}
