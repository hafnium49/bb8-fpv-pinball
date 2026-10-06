import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cameraPose, type Frame } from './camera';

const traces: Record<string, Frame[]> = JSON.parse(readFileSync('artifacts/elevated-circuit/traces.json', 'utf8'));
const results = [];
for (const variant of ['guarded-mesh', 'baked-wire']) {
  const trace = traces[`flipper-${variant}`]; assert.ok(trace?.length, `No real flipper completion for ${variant}`);
  const camera = new THREE.PerspectiveCamera(82, 1.6, 0.06, 160), state = { yaw: 0, pitch: 0 };
  let maxPitch = 0, maxPitchRate = 0, maxYawRate = 0, maxRoll = 0, minClearance = Infinity, retractions = 0, minHeight = 0.3;
  for (const frame of trace) {
    const old = { ...state }, pose = cameraPose(frame, state, 1 / 120, variant);
    camera.position.copy(pose.position); camera.up.set(0, 1, 0); camera.lookAt(pose.target); camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    maxRoll = Math.max(maxRoll, Math.abs(Math.asin(right.y)));
    maxPitch = Math.max(maxPitch, Math.abs(state.pitch));
    maxPitchRate = Math.max(maxPitchRate, Math.abs(state.pitch - old.pitch) * 120);
    maxYawRate = Math.max(maxYawRate, Math.abs(state.yaw - old.yaw) * 120);
    if (pose.clearance !== null) minClearance = Math.min(minClearance, pose.clearance);
    if (pose.height < 0.299) retractions++;
    minHeight = Math.min(minHeight, pose.height);
  }
  const degrees = (x: number) => x * 180 / Math.PI;
  assert.ok(degrees(maxPitch) <= 18.00001); assert.ok(degrees(maxPitchRate) <= 30.00001);
  assert.ok(maxYawRate <= 3.50001); assert.ok(degrees(maxRoll) < 0.00001); assert.ok(minClearance >= 0.12);
  results.push({ variant, frames: trace.length, duration: trace.at(-1)!.t, maxPitchDegrees: degrees(maxPitch), maxPitchRateDegreesPerSec: degrees(maxPitchRate), maxYawRateRadiansPerSec: maxYawRate, maxRollDegrees: degrees(maxRoll), minimumAnalyticClearance: minClearance, retractedFrames: retractions, minimumCameraHeight: minHeight });
}
writeFileSync('artifacts/elevated-circuit/camera.json', JSON.stringify({ result: 'pass', basis: 'actual completing flipper traces; board-up camera; analytic cross-section clearance only', results }, null, 2));
console.log(JSON.stringify(results, null, 2));
