import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BALL_RADIUS, FLIPPER_LENGTH, bumpers, flippers, rails, targets } from '../physics/table';
import type { PinballSimulation } from '../physics/simulation';
import { cabinetPalette as palette, cabinetMaterials } from './cabinet-theme';
import { backboardTexture, nebulaTexture, playfieldTexture, railTexture, woodTexture } from './artwork';
import { batchStaticMeshes } from './static-batch';

const cyan = 0x53e4ff, amber = 0xffae52, violet = 0x9274ff;

export class ArcadeTable {
  readonly ball = new THREE.Group();
  readonly flipperGroups: THREE.Group[] = [];
  private caps: THREE.Group[] = [];
  private bumperLights: THREE.PointLight[] = [];
  private lenses: THREE.MeshPhysicalMaterial[] = [];
  private targetLamps: THREE.Mesh[] = [];
  private flashes = [0, 0, 0];
  private targetFlashes = [0, 0];
  private portals: THREE.Mesh[] = [];
  private resources = new Set<{ dispose(): void }>();
  shadowRevision = 0;
  readonly batching: { removed: number; batches: number };

  constructor(readonly scene: THREE.Scene, private circuitEnabled = false) {
    this.buildCabinet(); this.buildMechanisms(); this.buildArena();
    const batch = batchStaticMeshes(scene, new Set<THREE.Object3D>([this.ball, ...this.caps, ...this.flipperGroups, ...this.portals]));
    batch.geometries.forEach(geometry => this.track(geometry));
    this.batching = { removed: batch.removed, batches: batch.batches };
  }
  private track<T extends { dispose(): void }>(resource: T) { this.resources.add(resource); return resource; }
  private material(color: number, metalness = 0.6, roughness = 0.24, emission = 0) {
    return this.track(new THREE.MeshPhysicalMaterial({ color, metalness, roughness, clearcoat: 0.15, clearcoatRoughness: 0.45, envMapIntensity: metalness > 0.9 ? 0.8 : 0.3, emissive: emission ? color : 0, emissiveIntensity: emission }));
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
    const chrome = this.material(palette.steel, 0.90, 0.32);
    const wood = this.track(new THREE.MeshPhysicalMaterial({ map: this.track(woodTexture()), metalness: 0, roughness: 0.52, clearcoat: 0.22, clearcoatRoughness: 0.45 }));
    const cyanGlow = this.material(cyan, 0.2, 0.32, 0.65), amberGlow = this.material(amber, 0.2, 0.32, 0.65);
    this.mesh(this.box(12.85, 0.88, 22.85, 0.22), wood, 0, -0.51, 0);
    this.mesh(this.box(12.48, 0.13, 22.48, 0.055), chrome, 0, -0.09, 0);
    const map = this.track(playfieldTexture(this.circuitEnabled));
    const lacquer = this.track(new THREE.MeshPhysicalMaterial({ map, metalness: 0.04, roughness: 0.78, clearcoat: 0.35, clearcoatRoughness: 0.6, envMapIntensity: 0.2, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.08 }));
    const floor = this.mesh(new THREE.PlaneGeometry(12, 22), lacquer, 0, 0.012, 0, this.scene, false); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    for (const side of [-1, 1]) {
      this.mesh(this.box(0.12, 0.08, 21.9, 0.03), side < 0 ? cyanGlow : amberGlow, side * 6.32, -0.53, 0, this.scene, false);
      this.mesh(this.box(0.12, 0.3, 22.3), wood, side * 6.17, 0.12, 0);
      for (const z of [-8.7, 8.7]) this.mesh(this.box(0.62, 1.0, 0.7, 0.1), chrome, side * 5.9, -0.76, z);
    }
    const railMap = this.track(railTexture());
    const railBody = this.track(new THREE.MeshStandardMaterial({ map: railMap, metalness: 0.3, roughness: 0.55, envMapIntensity: 0.25 }));
    const woodenRail = this.track(new THREE.MeshPhysicalMaterial({ map: this.track(railTexture(true)), metalness: 0, roughness: 0.58, clearcoat: 0.18 }));
    for (const rail of rails) {
      const dx = rail.bx - rail.ax, dz = rail.bz - rail.az, length = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx);
      const x = (rail.ax + rail.bx) / 2, z = (rail.az + rail.bz) / 2;
      const body = this.mesh(this.box(length, 1.50, 0.26, 0.035), rail.kind === 'outer' ? woodenRail : railBody, x, 0.55, z); body.rotation.y = angle;
      const trim = this.mesh(this.box(length, 0.08, 0.26, 0.025), chrome, x, 1.26, z); trim.rotation.y = angle;
      const led = this.mesh(this.box(length - 0.05, 0.015, 0.06, 0.005), rail.kind === 'launch' ? cyanGlow : amberGlow, x, 1.287, z, this.scene, false); led.rotation.y = angle;
    }
    // Batched rail fasteners add detail without one draw call per screw.
    const screwGeo = this.track(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 6));
    const screws = new THREE.InstancedMesh(screwGeo, chrome, rails.length * 2), transform = new THREE.Object3D();
    let index = 0;
    for (const rail of rails) for (const t of [0.12, 0.88]) {
      transform.position.set(rail.ax + (rail.bx - rail.ax) * t, 1.278, rail.az + (rail.bz - rail.az) * t);
      transform.updateMatrix(); screws.setMatrixAt(index++, transform.matrix);
    }
    screws.computeBoundingSphere(); this.scene.add(screws);
    // A real backboard, rather than a floating title in the sky.
    this.mesh(this.box(12.6, 2.9, 0.48, 0.17), wood, 0, 2.2, -11.55);
    this.mesh(this.box(12.45, 0.05, 0.54, 0.02), cyanGlow, 0, 3.62, -11.52, this.scene, false);
    this.mesh(this.box(12.45, 0.05, 0.54, 0.02), amberGlow, 0, 0.78, -11.52, this.scene, false);
    const boardMap = this.track(backboardTexture());
    const display = this.track(new THREE.MeshStandardMaterial({ map: boardMap, emissiveMap: boardMap, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.45 }));
    this.mesh(new THREE.PlaneGeometry(11.9, 2.54), display, 0, 2.2, -11.295, this.scene, false);
    this.mesh(this.box(3.1, 0.04, 0.15, 0.01), amberGlow, 0, 0.04, 10.8, this.scene, false);
  }

  private buildMechanisms() {
    const chrome = this.track(new THREE.MeshPhysicalMaterial({ color: palette.steel, ...cabinetMaterials.steel }));
    const dark = this.track(new THREE.MeshPhysicalMaterial({ color: palette.rubber, ...cabinetMaterials.rubber }));
    const flipperRubber = this.track(new THREE.MeshPhysicalMaterial({ color: 0xb92e3b, ...cabinetMaterials.rubber }));
    const white = this.track(new THREE.MeshPhysicalMaterial({ color: 0xd5e0de, ...cabinetMaterials.cap }));
    for (const b of bumpers) {
      const paint = this.track(new THREE.MeshPhysicalMaterial({ color: b.color, ...cabinetMaterials.cap }));
      const glow = this.material(b.color, 0.05, 0.32, 0.55); this.lenses.push(glow);
      // The fixed rubber shell occupies the actual contact footprint. Only
      // the inset lens moves; no bright cap conceals a larger invisible body.
      this.mesh(new THREE.CylinderGeometry(b.radius, b.radius, 0.65, 40), dark, b.x, 0.325, b.z);
      this.mesh(new THREE.CylinderGeometry(b.radius, b.radius, 0.11, 40), chrome, b.x, 0.065, b.z);
      this.mesh(new THREE.CylinderGeometry(b.radius * 0.96, b.radius * 0.96, 0.18, 40), chrome, b.x, 0.70, b.z);
      this.mesh(new THREE.CylinderGeometry(b.radius * 0.97, b.radius * 0.97, 0.16, 40), paint, b.x, 0.90, b.z);
      const cap = new THREE.Group(); cap.position.set(b.x, 0.89, b.z); this.scene.add(cap); this.caps.push(cap);
      this.mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.035, 32), dark, 0, 0.09, 0, cap);
      this.mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.028, 32), glow, 0, 0.112, 0, cap, false);
      const fasteners = new THREE.InstancedMesh(this.track(new THREE.CylinderGeometry(0.035, 0.035, 0.018, 6)), chrome, 6);
      const transform = new THREE.Object3D();
      for (let n = 0; n < 6; n++) { const a = n / 6 * Math.PI * 2;
        transform.position.set(Math.sin(a) * 0.61, 0.971, Math.cos(a) * 0.61); transform.updateMatrix(); fasteners.setMatrixAt(n, transform.matrix); }
      fasteners.position.set(b.x, 0, b.z); fasteners.computeBoundingSphere(); this.scene.add(fasteners);
      const light = new THREE.PointLight(b.color, 2, 4, 2); light.position.set(b.x, 1.15, b.z); this.scene.add(light); this.bumperLights.push(light);
      const insert = this.mesh(new THREE.RingGeometry(1.12, 1.145, 48), glow, b.x, 0.025, b.z, this.scene, false); insert.rotation.x = -Math.PI / 2;
    }
    for (const t of targets) {
      this.mesh(this.box(0.36, 1.1, 1.5, 0.06), chrome, t.x, 0.55, t.z);
      const material = this.material(t.color, 0.15, 0.32, 0.6);
      const lamp = this.mesh(this.box(0.35, 0.63, 1.08, 0.045), material, t.x, 0.61, t.z, this.scene, false); this.targetLamps.push(lamp);
      for (const z of [-0.45, 0, 0.45]) this.mesh(this.box(0.355, 0.09, 0.12, 0.035), dark, t.x, 0.65, t.z + z, this.scene, false);
    }
    for (const f of flippers) {
      const glow = this.material(f.side === 1 ? cyan : amber, 0.2, 0.32, 0.6);
      const group = new THREE.Group(); group.position.set(f.x, 0.28, f.z); group.rotation.y = f.rest; this.scene.add(group); this.flipperGroups.push(group);
      this.mesh(this.box(FLIPPER_LENGTH, 0.50, 0.46, 0.10), flipperRubber, f.side * FLIPPER_LENGTH / 2, 0, 0, group);
      // Expose the ivory plate above the rubber top (y=0.25); the old plate
      // was buried inside the body. Its footprint and the contact shell stay fixed.
      this.mesh(this.box(FLIPPER_LENGTH - 0.26, 0.025, 0.36, 0.01), white, f.side * FLIPPER_LENGTH / 2, 0.253, 0, group);
      this.mesh(this.box(FLIPPER_LENGTH - 0.62, 0.006, 0.08, 0.002), glow, f.side * FLIPPER_LENGTH / 2, 0.269, 0, group, false);
      this.mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.50, 24), dark, 0, 0, 0, group);
      this.mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.018, 12), chrome, 0, 0.260, 0, group);
      this.ring(0.18, 0.015, glow, 0, 0.260, 0, group);
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
    for (const [i, radius] of [13.4, 15.4, 17].entries()) this.ring(radius, 0.04, this.material(i === 1 ? violet : cyan, 0.2, 0.4, 0.55), 0, -1.07, 0);
    for (const [i, z] of [-17, -22, -28].entries()) {
      const material = this.material(i === 1 ? amber : cyan, 0.3, 0.4, 0.5);
      const portal = this.mesh(new THREE.TorusGeometry(8.2 + i * 1.7, 0.08, 8, 96, Math.PI * 1.66), material, 0, 5, z, this.scene, false);
      portal.rotation.z = i * 0.8; this.portals.push(portal);
      this.mesh(new THREE.TorusGeometry(8.5 + i * 1.7, 0.15, 8, 96), this.material(0x293755, 0.8, 0.3), 0, 5, z, this.scene, false);
    }
    for (const side of [-1, 1]) {
      const base = this.material(0x172b47, 0.75), lamp = this.material(side < 0 ? cyan : amber, 0.2, 0.35, 0.65);
      this.mesh(this.box(0.7, 5.1, 0.8, 0.13), base, side * 8.6, 1.25, -9.5, this.scene, false);
      this.mesh(this.box(0.11, 4.4, 0.84, 0.04), lamp, side * 8.6, 1.3, -9.5, this.scene, false);
    }
  }

  update(sim: PinballSimulation, dt: number) {
    const p = sim.position, rotation = sim.ball.rotation(), visible = sim.phase === 'intro';
    let changed = this.ball.visible !== visible || (visible && (this.ball.position.x !== p.x || this.ball.position.y !== p.y || this.ball.position.z !== p.z
      || this.ball.quaternion.x !== rotation.x || this.ball.quaternion.y !== rotation.y || this.ball.quaternion.z !== rotation.z || this.ball.quaternion.w !== rotation.w));
    this.ball.position.set(p.x, p.y, p.z); this.ball.quaternion.copy(rotation as THREE.Quaternion);
    this.ball.visible = visible;
    this.flipperGroups.forEach((group, i) => { if (group.rotation.y !== sim.flipperAngles[i]) changed = true; group.rotation.y = sim.flipperAngles[i]; });
    for (const e of sim.events) { if (e.type === 'bumper') this.flashes[e.index] = 1; if (e.type === 'target') this.targetFlashes[e.index] = 1; }
    for (const [i, cap] of this.caps.entries()) {
      this.flashes[i] = Math.max(0, this.flashes[i] - dt * 3.2);
      const y = 0.89 - this.flashes[i] * 0.10; if (cap.position.y !== y) changed = true; cap.position.y = y;
      this.bumperLights[i].intensity = 2 + this.flashes[i] * 8;
      this.lenses[i].emissiveIntensity = 0.55 + this.flashes[i] * 1.1;
    }
    for (const [i, lamp] of this.targetLamps.entries()) { this.targetFlashes[i] = Math.max(0, this.targetFlashes[i] - dt * 3); (lamp.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.6 + this.targetFlashes[i] * 1.2; }
    if (changed) this.shadowRevision++;
  }
  setQuality(high: boolean) { for (const light of this.bumperLights) light.visible = high; }
  animate(dt: number) { this.portals.forEach((ring, i) => { ring.rotation.z += dt * (i % 2 ? -0.035 : 0.025); }); }
  dispose() { for (const resource of this.resources) resource.dispose(); }
}
