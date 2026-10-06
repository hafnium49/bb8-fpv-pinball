import * as THREE from 'three';
import { cageWires, length, nearest, samples, widthAt, wireStart, wireEnd, WIRE_RADIUS } from './route';

export type Frame = { t: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; s: number };
export type CameraState = { yaw: number; pitch: number; direction?: number; reversalTime?: number };
export const radians = (degrees: number) => degrees * Math.PI / 180;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const approach = (old: number, target: number, rate: number, damping: number, dt: number, angular = false) => {
  const delta = angular ? wrap(target - old) : target - old;
  return old + Math.sign(delta) * Math.min(Math.abs(delta) * (1 - Math.exp(-damping * dt)), rate * dt);
};

export function clearance(point: THREE.Vector3, variant = 'baked-wire') {
  const a = nearest(point), local = point.clone().sub(a.c), y = local.dot(a.up), x = local.dot(a.right);
  const onWire = variant === 'baked-wire' && a.index > wireStart + 6 && a.index < wireEnd - 6;
  if (onWire) return Math.min(...cageWires.map(([wx, wy]) => Math.hypot(x - wx, y - wy) - WIRE_RADIUS));
  const roof = a.s > 2 && a.s < length - 1.6 ? 1.37 - y : Infinity;
  return Math.min(roof, y + 0.28, widthAt(a.index, variant === 'baked-wire') - Math.abs(x));
}

export function cameraPose(frame: Frame, state: CameraState, dt = 1 / 120, variant = 'baked-wire') {
  const a = nearest(frame), speed = Math.hypot(frame.vx, frame.vz), onRoute = a.distance < 0.8 && frame.s > 0.5;
  let targetYaw = speed > 1 ? Math.atan2(frame.vx, -frame.vz) : state.yaw, targetPitch = 0;
  if (onRoute) {
    const along = new THREE.Vector3(frame.vx, frame.vy, frame.vz).dot(a.tangent);
    const intended = along < -2 ? -1 : along > 2 ? 1 : (state.direction ?? 1);
    state.direction ??= 1;
    state.reversalTime = intended !== state.direction ? (state.reversalTime ?? 0) + dt : 0;
    if (state.reversalTime > 0.15) { state.direction = intended; state.reversalTime = 0; }
    const direction = state.direction;
    const aheadSteps = Math.round(Math.max(0.5, Math.min(1.4, speed * 0.08)) / 0.18);
    const ahead = samples[Math.max(0, Math.min(samples.length - 1, a.index + aheadSteps * direction))].tangent;
    // Within a physical route, guide the view with its tangent to remove rail-impact jitter.
    // The ball remains a free rigid body. Production must use ordered route state here.
    targetYaw = Math.atan2(ahead.x * direction, -ahead.z * direction);
    targetPitch = Math.max(-radians(18), Math.min(radians(18), Math.atan2(ahead.y * direction, Math.hypot(ahead.x, ahead.z))));
  }
  state.yaw = approach(state.yaw, targetYaw, 3.5, 5, dt, true);
  state.pitch = approach(state.pitch, targetPitch, radians(30), 4, dt);
  const position = new THREE.Vector3(frame.x, frame.y, frame.z);
  let height = 0.30;
  if (onRoute) while (height > 0.10001 && clearance(position.clone().add(new THREE.Vector3(0, height, 0)), variant) < 0.12) height -= 0.025;
  position.y += height;
  const forward = new THREE.Vector3(Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch));
  return { position, target: position.clone().addScaledVector(forward, 8), yaw: state.yaw, pitch: state.pitch, height, clearance: onRoute ? clearance(position, variant) : null };
}
