import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BALL_RADIUS, FLIPPER_LENGTH, bumpers, flippers, rails, targets } from '../physics/table';
import type { PinballSimulation } from '../physics/simulation';
import { backboardTexture, nebulaTexture, playfieldTexture, railTexture } from './artwork';

const cyan = 0x53e4ff, amber = 0xffae52, violet = 0x9274ff;

export class ArcadeTable {
  readonly ball = new THREE.Group();
  readonly flipperGroups: THREE.Group[] = [];
  private caps: THREE.Group[] = [];
  private bumperLights: THREE.PointLight[] = [];
  private targetLamps: THREE.Mesh[] = [];
  private flashes = [0, 0, 0];
  private targetFlashes = [0, 0];
  private portals: THREE.Mesh[] = [];
  private resources = new Set<{ dispose(): void }>();

  constructor(readonly scene: THREE.Scene) { this.buildCabinet(); this.buildMechanisms(); this.buildArena(); }
  private track<T extends { dispose(): void }>(resource: T) { this.resources.add(resource); return resource; }
  private material(color: number, metalness = 0.6, roughness = 0.24, emission = 0) {
    return this.track(new THREE.MeshPhysicalMaterial({ color, metalness, roughness, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: metalness > 0.9 ? 0.8 : 0.3, emissive: emission ? color : 0, emissiveIntensity: emission * 1.35 }));
  }
  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.scene, shadow = true) {
    this.track(geometry); const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
    mesh.castShadow = shadow; mesh.receiveShadow = shadow; parent.add(mesh); return mesh;
  }
  private box(w: number, h: number, d: number, radius = 0.08) { return new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)); }
  private ring(radius: number, tube: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.scene) {
    const mesh = this.mesh(new THREE.TorusGeometry(radius, tube, 8, 64), material, x, y, z, parent, false); mesh.rotation.x = Math.PI / 2; return mesh;
  }

  private buildCabinet() {
    const dark = this.material(0x111a32, 0.42, 0.5), chrome = this.material(0xbacddd, 0.95, 0.19);
    const cyanGlow = this.material(cyan, 0.2, 0.25, 2.6), amberGlow = this.material(amber, 0.2, 0.25, 2.6);
    this.mesh(this.box(12.85, 0.88, 22.85, 0.22), dark, 0, -0.51, 0);
    this.mesh(this.box(12.48, 0.13, 22.48, 0.055), chrome, 0, -0.09, 0);
    const map = this.track(playfieldTexture());
    const lacquer = this.track(new THREE.MeshPhysicalMaterial({ map, metalness: 0.04, roughness: 0.78, clearcoat: 0.35, clearcoatRoughness: 0.6, envMapIntensity: 0.2, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.3 }));
    const floor = this.mesh(new THREE.PlaneGeometry(12, 22), lacquer, 0, 0.012, 0, this.scene, false); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    for (const side of [-1, 1]) {
      this.mesh(this.box(0.12, 0.08, 21.9, 0.03), side < 0 ? cyanGlow : amberGlow, side * 6.32, -0.53, 0, this.scene, false);
      this.mesh(this.box(0.12, 0.3, 22.3), dark, side * 6.17, 0.12, 0);
      for (const z of [-8.7, 8.7]) this.mesh(this.box(0.62, 1.0, 0.7, 0.1), chrome, side * 5.9, -0.76, z);
    }
    const railMap = this.track(railTexture());
    const railBody = this.track(new THREE.MeshStandardMaterial({ map: railMap, metalness: 0.3, roughness: 0.55, envMapIntensity: 0.25 }));
    for (const rail of rails) {
      const dx = rail.bx - rail.ax, dz = rail.bz - rail.az, length = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx);
      const x = (rail.ax + rail.bx) / 2, z = (rail.az + rail.bz) / 2;
      const body = this.mesh(this.box(length, 1.16, 0.26, 0.07), railBody, x, 0.56, z); body.rotation.y = angle;
      const trim = this.mesh(this.box(length, 0.1, 0.3, 0.035), chrome, x, 1.14, z); trim.rotation.y = angle;
      const led = this.mesh(this.box(length - 0.05, 0.04, 0.09, 0.015), rail.kind === 'launch' ? cyanGlow : amberGlow, x, 1.205, z, this.scene, false); led.rotation.y = angle;
    }
    // Batched rail fasteners add detail without one draw call per screw.
    const screwGeo = this.track(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 6));
    const screws = new THREE.InstancedMesh(screwGeo, chrome, 38), transform = new THREE.Object3D();
    let index = 0;
    for (const side of [-1, 1]) for (let n = 0; n < 19; n++) {
      transform.position.set(side * 5.8, 1.22, -10 + n * 1.1); transform.updateMatrix(); screws.setMatrixAt(index++, transform.matrix);
    }
    this.scene.add(screws);
    // A real backboard, rather than a floating title in the sky.
    this.mesh(this.box(12.6, 2.9, 0.48, 0.17), dark, 0, 2.2, -11.55);
    this.mesh(this.box(12.45, 0.05, 0.54, 0.02), cyanGlow, 0, 3.62, -11.52, this.scene, false);
    this.mesh(this.box(12.45, 0.05, 0.54, 0.02), amberGlow, 0, 0.78, -11.52, this.scene, false);
    const boardMap = this.track(backboardTexture());
    const display = this.track(new THREE.MeshStandardMaterial({ map: boardMap, emissiveMap: boardMap, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.45 }));
    this.mesh(new THREE.PlaneGeometry(11.9, 2.54), display, 0, 2.2, -11.295, this.scene, false);
    this.mesh(this.box(3.1, 0.04, 0.15, 0.01), amberGlow, 0, 0.04, 10.8, this.scene, false);
  }

  private buildMechanisms() {
    const chrome = this.material(0xe0e9ef, 0.92, 0.19), dark = this.material(0x1c2944, 0.7, 0.3);
    const white = this.material(0xc9d7ec, 0.48, 0.23);
    for (const b of bumpers) {
      const glow = this.material(b.color, 0.25, 0.28, 2.5);
      this.mesh(new THREE.CylinderGeometry(b.radius + 0.1, b.radius + 0.15, 0.13, 48), dark, b.x, 0.085, b.z);
      this.ring(b.radius + 0.03, 0.048, glow, b.x, 0.19, b.z);
      this.mesh(new THREE.CylinderGeometry(b.radius * 0.87, b.radius, 0.63, 48), chrome, b.x, 0.5, b.z);
      this.ring(b.radius * 0.95, 0.075, glow, b.x, 0.71, b.z);
      const cap = new THREE.Group(); cap.position.set(b.x, 0.89, b.z); this.scene.add(cap); this.caps.push(cap);
      this.mesh(new THREE.CylinderGeometry(b.radius, b.radius * 0.92, 0.16, 48), chrome, 0, 0, 0, cap);
      this.mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.07, 36), dark, 0, 0.11, 0, cap);
      this.ring(0.39, 0.038, glow, 0, 0.155, 0, cap);
      this.mesh(new THREE.SphereGeometry(0.255, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glow, 0, 0.16, 0, cap, false);
      const fins = new THREE.InstancedMesh(this.track(this.box(0.15, 0.08, 0.055, 0.015)), dark, 12), transform = new THREE.Object3D();
      for (let n = 0; n < 12; n++) { const a = n / 12 * Math.PI * 2; transform.position.set(Math.sin(a) * 0.65, 0.105, Math.cos(a) * 0.65); transform.rotation.y = a; transform.updateMatrix(); fins.setMatrixAt(n, transform.matrix); }
      cap.add(fins);
      const light = new THREE.PointLight(b.color, 7, 5, 2); light.position.set(b.x, 1.15, b.z); this.scene.add(light); this.bumperLights.push(light);
      const insert = this.mesh(new THREE.RingGeometry(1.12, 1.145, 64), glow, b.x, 0.025, b.z, this.scene, false); insert.rotation.x = -Math.PI / 2;
    }
    for (const t of targets) {
      this.mesh(this.box(0.36, 1.1, 1.5, 0.06), chrome, t.x, 0.55, t.z);
      const material = this.material(t.color, 0.15, 0.24, 2.2);
      const lamp = this.mesh(this.box(0.38, 0.63, 1.08, 0.045), material, t.x, 0.61, t.z, this.scene, false); this.targetLamps.push(lamp);
      for (const z of [-0.45, 0, 0.45]) this.mesh(this.box(0.405, 0.09, 0.12, 0.035), dark, t.x, 0.65, t.z + z, this.scene, false);
    }
    for (const f of flippers) {
      const glow = this.material(f.side === 1 ? cyan : amber, 0.2, 0.25, 2.3);
      const group = new THREE.Group(); group.position.set(f.x, 0.28, f.z); group.rotation.y = f.rest; this.scene.add(group); this.flipperGroups.push(group);
      this.mesh(this.box(FLIPPER_LENGTH, 0.45, 0.46, 0.18), white, f.side * FLIPPER_LENGTH / 2, 0, 0, group);
      this.mesh(this.box(FLIPPER_LENGTH - 0.26, 0.055, 0.3, 0.02), chrome, f.side * FLIPPER_LENGTH / 2, 0.255, 0, group);
      this.mesh(this.box(FLIPPER_LENGTH - 0.62, 0.026, 0.095, 0.012), glow, f.side * FLIPPER_LENGTH / 2, 0.3, 0, group, false);
      this.mesh(new THREE.CylinderGeometry(0.29, 0.33, 0.54, 32), dark, 0, 0, 0, group);
      this.mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.065, 12), chrome, 0, 0.315, 0, group);
      this.ring(0.28, 0.035, glow, 0, 0.3, 0, group);
    }
    this.mesh(new THREE.SphereGeometry(BALL_RADIUS, 40, 28), this.material(0xf4f8ff, 1, 0.105), 0, 0, 0, this.ball);
    this.ring(BALL_RADIUS * 0.89, 0.028, this.material(amber, 0.6, 0.24, 0.35), 0, 0, 0, this.ball);
    this.scene.add(this.ball);
  }

  private buildArena() {
    const skyMap = this.track(nebulaTexture());
    const sky = this.track(new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, depthWrite: false }));
    this.mesh(new THREE.SphereGeometry(78, 32, 16), sky, 0, 0, 0, this.scene, false);
    const stageMaterial = this.track(new THREE.MeshStandardMaterial({ color: 0x050b19, metalness: 0.08, roughness: 0.9, envMapIntensity: 0.05 }));
    const podium = this.mesh(new THREE.CylinderGeometry(17, 18.1, 0.65, 80), stageMaterial, 0, -1.42, 0);
    podium.receiveShadow = true; podium.castShadow = false;
    for (const [i, radius] of [13.4, 15.4, 17].entries()) this.ring(radius, 0.04, this.material(i === 1 ? violet : cyan, 0.2, 0.25, 1.8), 0, -1.07, 0);
    for (const [i, z] of [-17, -22, -28].entries()) {
      const material = this.material(i === 1 ? amber : cyan, 0.3, 0.3, 1.7);
      const portal = this.mesh(new THREE.TorusGeometry(8.2 + i * 1.7, 0.08, 8, 96, Math.PI * 1.66), material, 0, 5, z, this.scene, false);
      portal.rotation.z = i * 0.8; this.portals.push(portal);
      this.mesh(new THREE.TorusGeometry(8.5 + i * 1.7, 0.15, 8, 96), this.material(0x293755, 0.8, 0.3), 0, 5, z, this.scene, false);
    }
    for (const side of [-1, 1]) {
      const base = this.material(0x172b47, 0.75), lamp = this.material(side < 0 ? cyan : amber, 0.2, 0.2, 2.5);
      this.mesh(this.box(0.7, 5.1, 0.8, 0.13), base, side * 8.6, 1.25, -9.5, this.scene, false);
      this.mesh(this.box(0.11, 4.4, 0.84, 0.04), lamp, side * 8.6, 1.3, -9.5, this.scene, false);
    }
  }

  update(sim: PinballSimulation, dt: number, mode: string) {
    const p = sim.position; this.ball.position.set(p.x, p.y, p.z); this.ball.quaternion.copy(sim.ball.rotation() as THREE.Quaternion);
    this.ball.visible = mode === 'table' || mode === 'chase' || sim.phase === 'intro';
    this.flipperGroups.forEach((group, i) => { group.rotation.y = sim.flipperAngles[i]; });
    for (const e of sim.events) { if (e.type === 'bumper') this.flashes[e.index] = 1; if (e.type === 'target') this.targetFlashes[e.index] = 1; }
    for (const [i, cap] of this.caps.entries()) {
      this.flashes[i] = Math.max(0, this.flashes[i] - dt * 3.2); cap.position.y = 0.89 - this.flashes[i] * 0.10;
      this.bumperLights[i].intensity = 7 + this.flashes[i] * 36;
    }
    for (const [i, lamp] of this.targetLamps.entries()) { this.targetFlashes[i] = Math.max(0, this.targetFlashes[i] - dt * 3); (lamp.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 2.2 + this.targetFlashes[i] * 3; }
  }
  animate(dt: number) { this.portals.forEach((ring, i) => { ring.rotation.z += dt * (i % 2 ? -0.035 : 0.025); }); }
  dispose() { for (const resource of this.resources) resource.dispose(); }
}
