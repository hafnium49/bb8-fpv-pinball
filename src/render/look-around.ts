/** Upright, gravity-aligned phone look. No ball rotation or route state is used. */
export interface LookPose { heading: number; pitch: number }
export interface Forward { x: number; y: number; z: number }
const RAD = Math.PI / 180;
export const shortestAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Expanded G * Rz(alpha) * Rx(beta) * Ry(gamma) * Rz(-screen) applied to -Z.
 * The local screen-Z correction leaves this roll-free optical ray unchanged.
 * This is exactly quaternion rotation, without allocating quaternion temporaries. */
export function deviceForward(alpha: number, beta: number, gamma: number, _screenAngle = 0,
  out: Forward = { x: 0, y: 0, z: 0 }): Forward {
  const a = alpha * RAD, b = beta * RAD, g = gamma * RAD;
  const sa = Math.sin(a), ca = Math.cos(a), sb = Math.sin(b), cb = Math.cos(b);
  const sg = Math.sin(g), cg = Math.cos(g);
  out.x = -ca * sg - sa * sb * cg;
  out.y = -cb * cg;
  out.z = sa * sg - ca * sb * cg;
  return out;
}

export class LookAround {
  readonly orientation: LookPose = { heading: 0, pitch: 0 };
  pole = false;
  private readonly forward: Forward = { x: 0, y: 0, z: -1 };
  private yaw = 0;
  private pitch = 0;
  private initialized = false;
  private calibrated = false;
  private referenceYaw = 0;
  private referencePitch = 0;
  private referenceHeading = 0;
  private referenceViewPitch = 0;
  constructor(public reducedMotion = false) {}
  get pitchLimit() { return (this.reducedMotion ? 20 : 45) * RAD; }
  sample(alpha: number, beta: number, gamma: number, screenAngle: number): boolean {
    if (!Number.isFinite(alpha) || !Number.isFinite(beta) || !Number.isFinite(gamma) || !Number.isFinite(screenAngle)) return false;
    const f = deviceForward(alpha, beta, gamma, screenAngle, this.forward);
    const horizontal = Math.hypot(f.x, f.z);
    const wasPole = this.pole;
    this.pole = horizontal < (wasPole ? .08 : .05);
    this.pitch = Math.asin(clamp(f.y, -1, 1));
    if (!this.pole) {
      const raw = Math.atan2(f.x, -f.z);
      this.yaw = this.initialized ? this.yaw + shortestAngle(raw - this.yaw) : raw;
      if (wasPole && this.calibrated) {
        this.referenceYaw = this.yaw;
        this.referenceHeading = this.orientation.heading;
      }
      this.initialized = true;
    }
    if (this.calibrated) {
      this.orientation.heading = this.referenceHeading + this.yaw - this.referenceYaw;
      this.orientation.pitch = clamp(this.referenceViewPitch + this.pitch - this.referencePitch, -this.pitchLimit, this.pitchLimit);
    }
    return true;
  }
  calibrate(pose: LookPose): boolean {
    if (!this.initialized || this.pole) return false;
    this.referenceYaw = this.yaw; this.referencePitch = this.pitch;
    this.referenceHeading = pose.heading;
    this.referenceViewPitch = clamp(pose.pitch, -this.pitchLimit, this.pitchLimit);
    this.orientation.heading = this.referenceHeading; this.orientation.pitch = this.referenceViewPitch;
    this.calibrated = true;
    return true;
  }
}
