import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BALL_RADIUS, FLIPPER_LENGTH, bumpers, flippers, rails, targets } from '../physics/table';
import type { PinballSimulation } from '../physics/simulation';
import { cabinetPalette as palette, cabinetMaterials } from './cabinet-theme';
import { backboardTexture, bumperBadgeTexture, playfieldTexture, railTexture, woodTexture } from './artwork';
import { batchStaticMeshes } from './static-batch';

const cyan = 0x53e4ff, amber = 0xffcf47;

export class ArcadeTable {
  readonly ball = new THREE.Group();
  readonly flipperGroups: THREE.Group[] = [];
  private caps: THREE.Group[] = [];
  private bumperLights: THREE.PointLight[] = [];
  private lenses: THREE.MeshPhysicalMaterial[] = [];
  private targetLamps: THREE.Mesh[] = [];
  private flashes = [0, 0, 0];
  private targetFlashes = [0, 0];
  private resources = new Set<{ dispose(): void }>();
  shadowRevision = 0;
  readonly batching: { removed: number; batches: number };

  constructor(readonly scene: THREE.Scene, private circuitEnabled = false) {
    this.buildCabinet(); this.buildMechanisms(); this.buildArena();
    const batch = batchStaticMeshes(scene, new Set<THREE.Object3D>([this.ball, ...this.caps, ...this.flipperGroups]));
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
    // Curved rear surround sits outside every playable contact face.
    const surround = new THREE.Shape();
    surround.moveTo(-6.16, -9.65); surround.bezierCurveTo(-6.16, -14.2, 6.16, -14.2, 6.16, -9.65);
    surround.lineTo(6.52, -9.65); surround.bezierCurveTo(6.52, -14.7, -6.52, -14.7, -6.52, -9.65); surround.closePath();
    const arch = this.mesh(new THREE.ExtrudeGeometry(surround, { depth: 1.55, bevelEnabled: false, curveSegments: 32 }), wood, 0, 1.65, 0);
    arch.rotation.x = Math.PI / 2; arch.name = 'Curved walnut cabinet surround';
    const rearCurve = new THREE.CubicBezierCurve3(new THREE.Vector3(-6.12, 1.45, -9.65), new THREE.Vector3(-6.12, 1.45, -14.15),
      new THREE.Vector3(6.12, 1.45, -14.15), new THREE.Vector3(6.12, 1.45, -9.65));
    for (const y of [1.45, .34]) {
      const rail = this.mesh(new THREE.TubeGeometry(rearCurve, 48, .045, 6, false), chrome, 0, y - 1.45, 0, this.scene, false);
      rail.name = 'Curved chrome cabinet trim';
    }
    const boardMap = this.track(backboardTexture());
    const display = this.track(new THREE.MeshStandardMaterial({ map: boardMap, roughness: .65, metalness: .2 }));
    const plate = this.mesh(new THREE.PlaneGeometry(7.8, 1.4), display, 0, .03, -11.6, this.scene, false);
    plate.rotation.x = -Math.PI / 2;
    this.mesh(this.box(3.1, 0.04, 0.15, 0.01), amberGlow, 0, 0.04, 10.8, this.scene, false);
  }

  private buildMechanisms() {
    const chrome = this.track(new THREE.MeshPhysicalMaterial({ color: palette.steel, ...cabinetMaterials.steel }));
    const dark = this.track(new THREE.MeshPhysicalMaterial({ color: palette.rubber, ...cabinetMaterials.rubber }));
    const flipperRubber = this.track(new THREE.MeshPhysicalMaterial({ color: 0xb92e3b, ...cabinetMaterials.rubber }));
    const white = this.track(new THREE.MeshPhysicalMaterial({ color: 0xd5e0de, ...cabinetMaterials.cap }));
    const badgeMap = this.track(bumperBadgeTexture());
    const badgeMaterial = this.track(new THREE.MeshStandardMaterial({ map: badgeMap, roughness: .72, metalness: 0, envMapIntensity: .2 }));
    const skirtGeometry = this.track(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(.71, 0),
      new THREE.Vector2(.8, .035), new THREE.Vector2(.82, .11), new THREE.Vector2(.75, .17), new THREE.Vector2(0, .17)], 32));
    const capGeometry = this.track(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(.70, 0),
      new THREE.Vector2(.79, .035), new THREE.Vector2(.77, .13), new THREE.Vector2(.66, .19), new THREE.Vector2(0, .19)], 32));
    for (const [i, b] of bumpers.entries()) {
      const color = i === 1 ? 0x47c9dc : 0xffce31;
      const paint = this.track(new THREE.MeshPhysicalMaterial({ color, ...cabinetMaterials.cap }));
      const glow = this.material(color, .08, .32, .25); this.lenses.push(glow);
      this.mesh(skirtGeometry, chrome, b.x, .005, b.z);
      this.mesh(new THREE.CylinderGeometry(b.radius, b.radius, .53, 32), dark, b.x, .415, b.z);
      this.mesh(new THREE.CylinderGeometry(.76, .78, .16, 32), paint, b.x, .64, b.z);
      this.ring(.79, .025, chrome, b.x, .17, b.z);
      this.ring(.76, .018, glow, b.x, .72, b.z);
      const cap = new THREE.Group(); cap.name = `Jet bumper ${i + 1}`; cap.position.set(b.x, .78, b.z);
      this.scene.add(cap); this.caps.push(cap);
      this.mesh(capGeometry, paint, 0, 0, 0, cap);
      this.ring(.645, .025, chrome, 0, .18, 0, cap);
      const face = new THREE.CircleGeometry(.615, 40), uv = face.attributes.uv;
      for (let n = 0; n < uv.count; n++) uv.setX(n, uv.getX(n) * .5 + (i === 1 ? .5 : 0));
      const badge = this.mesh(face, badgeMaterial, 0, .197, 0, cap);
      badge.rotation.x = -Math.PI / 2; badge.name = 'Star-topped jet bumper cap';
      // Illuminate the skirt and playfield without bleaching the printed star.
      const light = new THREE.PointLight(color, .45, 4, 2); light.position.set(b.x, .25, b.z); this.scene.add(light); this.bumperLights.push(light);
      const insert = this.mesh(new THREE.RingGeometry(1.12, 1.145, 48), glow, b.x, .025, b.z, this.scene, false); insert.rotation.x = -Math.PI / 2;
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
    const floor = this.track(new THREE.MeshStandardMaterial({ color: 0x08090c, roughness: 1, metalness: 0 }));
    const ground = this.mesh(new THREE.PlaneGeometry(90, 90), floor, 0, -1.1, 0, this.scene, false);
    ground.rotation.x = -Math.PI / 2;
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
      const y = 0.78 - this.flashes[i] * 0.10; if (cap.position.y !== y) changed = true; cap.position.y = y;
      this.bumperLights[i].intensity = .45 + this.flashes[i] * 2.5;
      this.lenses[i].emissiveIntensity = 0.25 + this.flashes[i] * 1.1;
    }
    for (const [i, lamp] of this.targetLamps.entries()) { this.targetFlashes[i] = Math.max(0, this.targetFlashes[i] - dt * 3); (lamp.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.6 + this.targetFlashes[i] * 1.2; }
    if (changed) this.shadowRevision++;
  }
  setQuality(high: boolean) { for (const light of this.bumperLights) light.visible = high; }
  dispose() { for (const resource of this.resources) resource.dispose(); }
}
