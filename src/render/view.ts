import * as THREE from 'three';
import { BALL_RADIUS, FLIPPER_LENGTH, bumpers, flippers, rails, targets } from '../physics/table';
import type { PinballSimulation } from '../physics/simulation';

export type CameraMode = 'fpv' | 'chase' | 'table' | 'spin';
const amber = 0xffad55, cyan = 0x74d9e6;

export class PinballView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(82, 1, 0.06, 160);
  readonly renderer: THREE.WebGLRenderer;
  mode: CameraMode = 'fpv';
  heading = 0;
  private ball = new THREE.Group();
  private flipperGroups: THREE.Group[] = [];
  private bumperCaps: THREE.Mesh[] = [];
  private targetLamps: THREE.Mesh[] = [];
  private bumperFlash = [0, 0, 0];
  private targetFlash = [0, 0];
  private previousPhase = 'intro';
  private look = new THREE.Vector3();
  private position = new THREE.Vector3();
  private disposables: { dispose(): void }[] = [];

  constructor(readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x09141b);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.domElement.setAttribute('aria-label', 'Three-dimensional pinball table');
    container.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.FogExp2(0x09141b, 0.022);
    this.scene.add(new THREE.HemisphereLight(0xd3e7f4, 0x293449, 2.5));
    const sun = new THREE.DirectionalLight(0xffead1, 3.3); sun.position.set(-7, 14, -6); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(cyan, 1.5); fill.position.set(8, 5, 10); this.scene.add(fill);
    this.buildTable(); this.buildSky(); this.resize();
  }

  private material(color: number, metalness = 0.35, roughness = 0.4, glow = false) {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive: glow ? color : 0x000000, emissiveIntensity: glow ? 0.9 : 0 });
    this.disposables.push(m); return m;
  }
  private mesh(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.scene) {
    this.disposables.push(g); const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }

  private buildTable() {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 1408;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#10232c'; c.fillRect(0, 0, canvas.width, canvas.height);
    c.strokeStyle = '#243b44'; c.lineWidth = 1;
    for (let x = 0; x < 768; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 1408); c.stroke(); }
    for (let y = 0; y < 1408; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(768, y); c.stroke(); }
    c.strokeStyle = '#45616a'; c.lineWidth = 2;
    for (const radius of [130, 185, 248]) { c.beginPath(); c.arc(384, 665, radius, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = '#ffaf55'; c.lineWidth = 4;
    c.beginPath(); c.arc(384, 665, 248, 0.2, 1.3); c.stroke();
    c.beginPath(); c.arc(384, 665, 185, 3.4, 4.2); c.stroke();
    c.fillStyle = '#506770'; c.textAlign = 'center'; c.font = 'bold 86px sans-serif'; c.fillText('ORBIT', 384, 870);
    c.font = '16px monospace'; c.fillText('INERTIAL CAMERA / PILOT 01', 384, 915);
    c.strokeStyle = '#6fcfdb'; c.lineWidth = 4;
    for (let i = 0; i < 7; i++) { const y = 1050 + i * 27; c.beginPath(); c.moveTo(665, y); c.lineTo(683, y - 8); c.lineTo(701, y); c.stroke(); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    this.disposables.push(texture);
    const floor = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0.3 }); this.disposables.push(floor);
    const bed = this.mesh(new THREE.PlaneGeometry(12, 22), floor, 0, 0.005, 0); bed.rotation.x = -Math.PI / 2;
    this.mesh(new THREE.BoxGeometry(12.45, 0.55, 22.4), this.material(0x17212a, 0.65), 0, -0.3, 0);
    const white = this.material(0xd7e2e4, 0.55), dark = this.material(0x263d48, 0.65);
    const amberLight = this.material(amber, 0.3, 0.25, true), cyanLight = this.material(cyan, 0.3, 0.25, true);
    for (const r of rails) {
      const dx = r.bx - r.ax, dz = r.bz - r.az, length = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx);
      const rail = this.mesh(new THREE.BoxGeometry(length, 1.25, 0.25), dark, (r.ax + r.bx) / 2, 0.48, (r.az + r.bz) / 2); rail.rotation.y = angle;
      const light = this.mesh(new THREE.BoxGeometry(length, 0.055, 0.27), r.kind === 'launch' ? cyanLight : amberLight, rail.position.x, 1.12, rail.position.z); light.rotation.y = angle;
    }
    for (const b of bumpers) {
      this.mesh(new THREE.CylinderGeometry(b.radius + 0.14, b.radius + 0.14, 0.13, 36), dark, b.x, 0.08, b.z);
      this.mesh(new THREE.CylinderGeometry(b.radius * 0.83, b.radius * 0.93, 0.68, 36), white, b.x, 0.45, b.z);
      const glow = this.material(b.color, 0.25, 0.3, true);
      const ring = this.mesh(new THREE.TorusGeometry(b.radius, 0.11, 12, 36), glow, b.x, 0.67, b.z); ring.rotation.x = Math.PI / 2;
      const cap = this.mesh(new THREE.CylinderGeometry(b.radius, b.radius, 0.17, 36), this.material(b.color, 0.55, 0.3), b.x, 0.9, b.z);
      this.mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 28), dark, 0, 0.10, 0, cap);
      this.mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.03, 20), glow, 0, 0.13, 0, cap);
      this.bumperCaps.push(cap);
      const lamp = new THREE.PointLight(b.color, 1.8, 5, 2); lamp.position.set(b.x, 1.1, b.z); this.scene.add(lamp);
    }
    for (const t of targets) {
      this.mesh(new THREE.BoxGeometry(0.36, 1.1, 1.5), white, t.x, 0.55, t.z);
      const lamp = this.mesh(new THREE.BoxGeometry(0.39, 0.8, 1.13), this.material(t.color, 0.2, 0.3, true), t.x, 0.58, t.z);
      this.targetLamps.push(lamp);
    }
    for (const f of flippers) {
      const group = new THREE.Group(); group.position.set(f.x, 0.28, f.z); group.rotation.y = f.rest; this.scene.add(group);
      this.mesh(new THREE.BoxGeometry(FLIPPER_LENGTH, 0.45, 0.43), white, f.side * FLIPPER_LENGTH / 2, 0, 0, group);
      this.mesh(new THREE.BoxGeometry(FLIPPER_LENGTH - 0.25, 0.04, 0.32), f.side === 1 ? cyanLight : amberLight, f.side * FLIPPER_LENGTH / 2, 0.25, 0, group);
      this.mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.55, 24), dark, 0, 0.0, 0, group);
      this.flipperGroups.push(group);
    }
    this.mesh(new THREE.BoxGeometry(3.1, 0.05, 0.13), amberLight, 0, 0.03, 10.8);
    this.mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 24), this.material(0xf2f1e6, 0.65, 0.19), 0, 0, 0, this.ball);
    const stripe = this.mesh(new THREE.TorusGeometry(0.244, 0.04, 8, 32), this.material(amber, 0.5, 0.3), 0, 0, 0, this.ball);
    stripe.rotation.y = Math.PI / 2;
    this.scene.add(this.ball);
  }

  private buildSky() {
    let seed = 37; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const positions: number[] = [];
    for (let i = 0; i < 450; i++) positions.push((rand() - 0.5) * 130, 5 + rand() * 55, (rand() - 0.5) * 130);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); this.disposables.push(geo);
    const mat = new THREE.PointsMaterial({ color: 0x829cab, size: 0.07, transparent: true, opacity: 0.65 }); this.disposables.push(mat);
    this.scene.add(new THREE.Points(geo, mat));
    for (const z of [-16, -21, -27]) {
      const ring = this.mesh(new THREE.TorusGeometry(8 + (-z - 16) * 0.35, 0.045, 8, 80), this.material(0x244453, 0.3, 0.3, true), 0, 3, z);
      ring.rotation.x = 0.1;
    }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
  }

  render(sim: PinballSimulation, dt: number) {
    const p = sim.position, v = sim.velocity;
    this.ball.position.set(p.x, p.y, p.z); this.ball.quaternion.copy(sim.ball.rotation() as THREE.Quaternion);
    this.ball.visible = this.mode === 'table' || this.mode === 'chase' || sim.phase === 'intro';
    this.flipperGroups.forEach((group, i) => { group.rotation.y = sim.flipperAngles[i]; });
    for (const e of sim.events) {
      if (e.type === 'bumper') this.bumperFlash[e.index] = 1;
      if (e.type === 'target') this.targetFlash[e.index] = 1;
    }
    this.bumperCaps.forEach((cap, i) => {
      this.bumperFlash[i] = Math.max(0, this.bumperFlash[i] - dt * 3);
      cap.position.y = 0.9 - this.bumperFlash[i] * 0.13;
      const mat = cap.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(bumpers[i].color); mat.emissiveIntensity = this.bumperFlash[i] * 1.4;
    });
    this.targetLamps.forEach((lamp, i) => {
      this.targetFlash[i] = Math.max(0, this.targetFlash[i] - dt * 3);
      (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + this.targetFlash[i] * 2;
    });
    if (sim.phase === 'ready' && this.previousPhase !== 'ready') this.heading = 0;
    this.previousPhase = sim.phase;
    if (Math.hypot(v.x, v.z) > 0.65 && sim.phase === 'playing') {
      const target = Math.atan2(v.x, -v.z);
      const delta = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      this.heading += Math.sign(delta) * Math.min(Math.abs(delta) * (1 - Math.exp(-5 * dt)), 3.5 * dt);
    }
    const forward = new THREE.Vector3(Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.camera.up.set(0, 1, 0);
    if (sim.phase === 'intro') {
      this.camera.fov = 48; this.camera.position.set(12.5, 18, 19); this.camera.lookAt(0, 0, -1);
    } else if (this.mode === 'table') {
      this.camera.fov = 48;
      this.camera.position.set(0, Math.max(29, 16 / this.camera.aspect), 12); this.camera.lookAt(0, 0, 0);
    } else if (this.mode === 'chase') {
      this.camera.fov = 72;
      this.position.set(p.x, p.y + 2.6, p.z).addScaledVector(forward, -3.9);
      // A camera inside a side wall is harder to read than a slightly tighter follow.
      this.position.x = THREE.MathUtils.clamp(this.position.x, -5.45, 5.45);
      this.position.z = THREE.MathUtils.clamp(this.position.z, -10.1, 12.1);
      this.camera.position.copy(this.position);
      this.look.set(p.x, p.y + 0.2, p.z).addScaledVector(forward, 2.0); this.camera.lookAt(this.look);
    } else if (this.mode === 'spin') {
      this.camera.fov = 82; this.camera.position.set(p.x, p.y + 0.08, p.z);
      this.camera.quaternion.copy(this.ball.quaternion);
    } else {
      this.camera.fov = 82; this.camera.position.set(p.x, p.y + 0.30, p.z);
      this.look.copy(this.camera.position).addScaledVector(forward, 8); this.look.y -= 0.10; this.camera.lookAt(this.look);
    }
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() { this.disposables.forEach(d => d.dispose()); this.renderer.dispose(); }
}
