/** Isolated coordinate-math experiment, not production camera/input code. */
export const DEG = Math.PI / 180;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const mul = (a, b) => [
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
];
export const axis = (i, angle) => { const q=[0,0,0,Math.cos(angle/2)]; q[i]=Math.sin(angle/2); return q; };
export const rotate = (q, v) => mul(mul(q, [...v, 0]), [-q[0],-q[1],-q[2],q[3]]).slice(0,3);
export function deviceQuaternion({alpha, beta, gamma}, screenAngle = 0) {
  if (![alpha,beta,gamma,screenAngle].every(Number.isFinite)) throw new TypeError('Finite angles in degrees required');
  // Column vectors; rightmost operation acts first. Quaternion layout [x,y,z,w].
  const sensor = mul(mul(axis(2,alpha*DEG), axis(0,beta*DEG)), axis(1,gamma*DEG));
  return mul(mul(axis(0,-Math.PI/2), sensor), axis(2,-screenAngle*DEG));
}
export function opticalAngles(sample, screenAngle = 0) {
  const forward = rotate(deviceQuaternion(sample, screenAngle), [0,0,-1]);
  return { forward, heading: Math.atan2(forward[0],-forward[2]), pitch: Math.asin(clamp(forward[1],-1,1)), horizontal: Math.hypot(forward[0],forward[2]) };
}

export class LookAroundMath {
  constructor({pitchLimit=45*DEG, poleEnter=0.05, poleExit=0.08}={}) {
    if (!(pitchLimit>0 && pitchLimit<=Math.PI/2 && poleEnter>0 && poleExit>poleEnter && poleExit<1)) throw new RangeError('Invalid limits');
    Object.assign(this,{pitchLimit,poleEnter,poleExit,heading:0,lastWrapped:null,yawOffset:0,pitchOffset:0,pole:false,last:null});
  }
  raw(sample, screenAngle) {
    const a=opticalAngles(sample,screenAngle);
    const wasPole=this.pole;
    this.pole = a.horizontal < (this.pole ? this.poleExit : this.poleEnter);
    if (!this.pole) {
      // On exit discard the unobservable heading jump; resume deltas next sample.
      if (!wasPole) this.heading += this.lastWrapped===null ? wrap(a.heading-this.heading) : wrap(a.heading-this.lastWrapped);
      this.lastWrapped=a.heading;
    }
    return {...a, heading:this.heading};
  }
  output(a) {
    const yaw=a.heading+this.yawOffset;
    const pitch=clamp(a.pitch+this.pitchOffset,-this.pitchLimit,this.pitchLimit);
    // Our positive heading points right. A conventional active Ry uses opposite sign.
    const quaternion=mul(axis(1,-yaw),axis(0,pitch));
    this.last={yaw,pitch,roll:0,quaternion,poleHeld:this.pole};
    return this.last;
  }
  update(sample, screenAngle=0) { return this.output(this.raw(sample,screenAngle)); }
  recenter(sample, screenAngle=0, {heading=0,pitch=0}={}) {
    if (![heading,pitch].every(Number.isFinite)) throw new TypeError('Finite target angles in radians required');
    const preview=opticalAngles(sample,screenAngle);
    if (preview.horizontal < (this.pole ? this.poleExit : this.poleEnter)) throw new RangeError('Calibration requires observable yaw; tilt the phone away from vertical');
    const a=this.raw(sample,screenAngle);
    this.yawOffset=heading-a.heading; this.pitchOffset=pitch-a.pitch;
    return this.output(a);
  }
  rebase(sample, screenAngle=0) {
    // Call once on first fresh valid sample after resume or screen-angle change.
    // Preserve DISPLAYED pitch (including any clamp), not hidden excess pitch.
    const current=this.last ?? {yaw:0,pitch:0};
    const a=this.raw(sample,screenAngle);
    this.yawOffset=current.yaw-a.heading; this.pitchOffset=current.pitch-a.pitch;
    return this.output(a);
  }
}
