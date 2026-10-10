import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PinballSimulation } from '../physics/simulation';
import { BALL_RADIUS } from '../physics/table';
import { courseBumpers, courseFlippers, courseGate, courseHoles, coursePosts, courseRails, courseRamps, courseSpinners, courseTargets, courseTunnels, deckData, deckHeight, deckRails, fieldData, fieldOutline, pathSurface, pathWires } from '../physics/reference-course';
import { mergeData, tubeData, type MeshData } from '../physics/route-geometry';
import { bumperBadgeTexture, woodTexture } from './artwork';
import { referencePlayfield, referenceDeckArtwork } from './reference-artwork';
import { batchStaticMeshes } from './static-batch';
/** Course rendering shares every coordinate with the reference simulation. */
export class ReferenceTable {
  readonly ball = new THREE.Group();
  readonly flipperGroups: THREE.Group[] = [];
  private caps: THREE.Group[] = [];
  private capBase: number[] = [];
  private lenses: THREE.MeshStandardMaterial[] = [];
  private flashes = courseBumpers.map(() => 0);
  private targetFlashes = courseTargets.map(() => 0);
  private targetLamps: THREE.Mesh[] = [];
  private spinnerGroups: THREE.Group[] = [];
  private spinnerSupports: THREE.Mesh[] = [];
  private gateGroup = new THREE.Group();
  private bumperLights: THREE.PointLight[] = [];
  private resources = new Set<{
    dispose(): void;
  }>();
  shadowRevision = 0;
  readonly batching: {
    removed: number;
    batches: number;
  };
  constructor(readonly scene: THREE.Scene) {
    this.build();
    const batch = batchStaticMeshes(scene, new Set<THREE.Object3D>([this.ball, this.gateGroup, ...this.caps, ...this.flipperGroups, ...this.targetLamps, ...this.spinnerGroups]));
    batch.geometries.forEach(g => this.keep(g));
    this.batching = { removed: batch.removed, batches: batch.batches };
  }
  private keep<T extends {
    dispose(): void;
  }>(r: T) { this.resources.add(r); return r; }
  private paint(color: number, metalness = .3, roughness = .4, emission = 0) { return this.keep(new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive: emission ? color : 0, emissiveIntensity: emission })); }
  private mesh(g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D = this.scene, shadow = true) { this.keep(g); const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; p.add(o); return o; }
  private box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = this.scene) { const o = this.mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(.04, w / 2, h / 2, d / 2)), m, p); o.position.set(x, y, z); return o; }
  private data(data: MeshData, m: THREE.Material, p: THREE.Object3D = this.scene, shadow = true, uv?: 'field' | 'deck') {
    if (!data.vertices.every(Number.isFinite))
      throw new Error(`Nonfinite course geometry in ${p.name || 'cabinet'}`);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    if (uv) {
      const coords = [];
      for (let i = 0; i < data.vertices.length; i += 3) {
        const x = data.vertices[i], z = data.vertices[i + 2];
        coords.push(uv === 'field' ? (x / .028 + 240) / 480 : (x / .028 + 240 - 255) / 185, uv === 'field' ? 1 - (z / .028 + 410) / 820 : 1 - (z / .028 + 410 - 36) / 196);
      }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(coords, 2));
    }
    g.computeVertexNormals();
    return this.mesh(g, m, p, shadow);
  }
  private ring(r: number, tube: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = this.scene) { const o = this.mesh(new THREE.TorusGeometry(r, tube, 6, 40), m, p, false); o.rotation.x = -Math.PI / 2; o.position.set(x, y, z); return o; }
  private build() {
    const chrome = this.paint(0xc5d1d6, .9, .28), black = this.paint(0x16191e, .1, .6), red = this.paint(0xbb3542, .15, .55), ivory = this.paint(0xf4f1dd, .1, .46);
    const wood = this.keep(new THREE.MeshStandardMaterial({ map: this.keep(woodTexture()), roughness: .5, metalness: 0 }));
    const floor = this.keep(new THREE.MeshStandardMaterial({ map: this.keep(referencePlayfield()), roughness: .68, metalness: .02, side: THREE.DoubleSide }));
    const base = this.data({ ...fieldData, vertices: new Float32Array(fieldData.vertices.map((n, i) => i % 3 === 1 ? n + .008 : n)) }, floor, this.scene, false, 'field');
    base.name = 'Reference playfield';
    this.data({ ...fieldData, vertices: new Float32Array(fieldData.vertices.map((n, i) => i % 3 === 1 ? n - .9 : n)) }, black);
    // Rounded cabinet perimeter is the actual rail, not a decorative arch
    // behind the original rectangular table.
    for (const side of [-1, 1])
      this.box(.32, .85, 16.85, wood, side * 6.38, .14, 3.08);
    this.box(12.9, .65, .35, wood, 0, -.25, 11.63);
    const arch = fieldOutline.slice(0, 49), outer = arch.map(p => { const x = p.x, z = p.z + 5.32, r = Math.hypot(x, z); return { x: p.x + x / r * .38, y: p.y, z: p.z + z / r * .38 }; });
    const archData: MeshData = { vertices: new Float32Array(arch.flatMap((p, i) => [p.x, -.4, p.z, p.x, 1.03, p.z, outer[i].x, -.4, outer[i].z, outer[i].x, 1.03, outer[i].z])), indices: new Uint32Array(arch.slice(1).flatMap((_, i) => { const a = i * 4; return [a, a + 4, a + 1, a + 1, a + 4, a + 5, a + 1, a + 5, a + 3, a + 3, a + 5, a + 7, a + 2, a + 3, a + 6, a + 3, a + 7, a + 6]; })) };
    this.data(archData, wood).name = 'Rounded playable cabinet arch';
    for (const y of [.3, .82])
      this.data(tubeData(arch.map(p => ({ ...p, y })), .025, 6), chrome, this.scene, false);
    const rail = (s: typeof courseRails[number]) => {
      if (s.y === 0 && s.kind === 'rail' && Math.max(s.az, s.bz) <= -5.32 + .00001)
        return;
      const dx = s.bx - s.ax, dz = s.bz - s.az, l = Math.hypot(dx, dz), a = -Math.atan2(dz, dx), x = (s.ax + s.bx) / 2, z = (s.az + s.bz) / 2;
      // Thin raised guides, proportional to the original cabinet.
      const b = this.box(l, s.height, s.thickness * 2, chrome, x, s.y + s.height / 2, z);
      b.rotation.y = a;
      if (s.kick) {
        const rubber = this.box(l, .12, s.thickness * 2 + .022, red, x, s.y + .29, z);
        rubber.rotation.y = a;
      }
    };
    [...courseRails, ...deckRails].forEach(rail);
    const gateLength = Math.hypot(courseGate.bx - courseGate.ax, courseGate.bz - courseGate.az);
    this.gateGroup.name = 'One-way launch gate';
    this.gateGroup.position.set(courseGate.ax, .32, courseGate.az);
    this.gateGroup.rotation.y = -Math.atan2(courseGate.bz - courseGate.az, courseGate.bx - courseGate.ax);
    this.box(gateLength, .04, .055, chrome, gateLength / 2, 0, 0, this.gateGroup);
    this.scene.add(this.gateGroup);
    const deckMat = this.keep(new THREE.MeshStandardMaterial({ map: this.keep(referenceDeckArtwork()), roughness: .5, metalness: .15, side: THREE.DoubleSide }));
    this.data(deckData, deckMat, this.scene, true, 'deck').name = 'Playable upper deck';
    // The mini playfield's support legs are outside its ground shot entrances.
    for (const [x, z] of [[.47, -9.55], [5.5, -7.0], [.47, -5.37], [5.5, -5.37]])
      this.box(.075, deckHeight, .075, chrome, x, deckHeight / 2, z);
    const rampRed = this.paint(0xb83f58, .25, .36), glass = this.keep(new THREE.MeshStandardMaterial({ color: 0xf06d87, roughness: .2, metalness: .05, transparent: true, opacity: .32, depthWrite: false, side: THREE.DoubleSide }));
    courseRamps.forEach((path, i) => {
      const group = new THREE.Group();
      group.name = path.name;
      this.scene.add(group);
      if (i === 0) {
        this.data(pathSurface(path, 'floor'), rampRed, group);
        this.data(pathSurface(path, 'walls'), glass, group, false);
      }
      const offsets: readonly (readonly [
        number,
        number
      ])[] = i === 0 ? [[-path.width, .14], [path.width, .14]] : [[-.2, -.235], [.2, -.235], [-path.width, .12], [path.width, .12]];
      this.data(pathWires(path, offsets), chrome, group);
      if (i > 0) {
        this.data(pathSurface({ ...path, points: path.points.slice(0, 48), lengths: path.lengths.slice(0, 48), length: path.lengths[47] }, 'floor'), rampRed, group);
      }
      const supports: MeshData[] = [];
      for (let n = 50; n < path.points.length - 40; n += 75) {
        const p = path.points[n];
        supports.push(tubeData([{ x: p.x, y: .01, z: p.z }, { x: p.x, y: p.y - BALL_RADIUS - .11, z: p.z }], .035, 6));
      }
      if (supports.length)
        this.data(mergeData(supports), chrome, group);
    });
    // Actual below-board subway routes. Warm strips give FPV a readable tunnel.
    const tunnelPaint = this.paint(0x2b3148, .35, .55), tunnelLight = this.paint(0x57cfe6, .2, .4, .8);
    courseTunnels.forEach(path => {
      const group = new THREE.Group();
      group.name = `${path.name} subway`;
      this.scene.add(group);
      this.data(pathSurface(path, 'floor'), tunnelPaint, group);
      this.data(pathSurface(path, 'walls'), tunnelPaint, group);
      this.data(pathWires(path, [[-.38, .16], [.38, .16]], .018), tunnelLight, group, false);
    });
    for (const [i, hole] of courseHoles.entries())
      if (i !== 2) {
        const p = hole[0], x = hole.reduce((n, p) => n + p.x, 0) / hole.length, z = hole.reduce((n, p) => n + p.z, 0) / hole.length, r = Math.hypot(p.x - x, p.z - z);
        this.ring(r + .025, .035, chrome, x, .024, z);
      }
    this.data(tubeData([...courseHoles[2], courseHoles[2][0]].map(p => ({ ...p, y: .024 })), .035, 6), chrome);
    // The characteristic curved scoop joins the black-hole and slot mouths.
    const kidney = courseTunnels[2].points;
    this.data(pathWires({ ...courseTunnels[2], points: kidney.map(p => ({ ...p, y: BALL_RADIUS + .015 })) }, [[-.37, -.22], [.37, -.22]], .035), chrome);
    const badge = this.keep(new THREE.MeshStandardMaterial({ map: this.keep(bumperBadgeTexture()), roughness: .68, metalness: 0 }));
    courseBumpers.forEach((b, i) => {
      const scale = b.radius / .82, cap = new THREE.Group();
      cap.position.set(b.x, b.y + b.height - .19 * scale, b.z);
      this.caps.push(cap);
      this.capBase.push(cap.position.y);
      this.scene.add(cap);
      cap.name = `Reference bumper ${i + 1}`;
      const paint = this.paint(b.color, .2, .4), glow = this.paint(b.color, .1, .4, .25);
      this.lenses.push(glow);
      const base = this.mesh(new THREE.CylinderGeometry(b.radius, b.radius * .92, .17 * scale, 24), chrome);
      base.position.set(b.x, b.y + .08 * scale, b.z);
      const barrel = this.mesh(new THREE.CylinderGeometry(b.radius * .96, b.radius * .96, b.height * .66, 24), black);
      barrel.position.set(b.x, b.y + b.height * .45, b.z);
      const capMesh = this.mesh(new THREE.CylinderGeometry(b.radius * .91, b.radius * .98, .19 * scale, 32), paint, cap);
      capMesh.position.y = .095 * scale;
      this.ring(b.radius * .78, .018, chrome, 0, .19 * scale, 0, cap);
      this.ring(b.radius * .96, .018, glow, b.x, b.y + b.height * .64, b.z);
      const g = new THREE.CircleGeometry(b.radius * .73, 32), uv = g.attributes.uv;
      for (let j = 0; j < uv.count; j++)
        uv.setX(j, uv.getX(j) * .5 + (i === 2 ? .5 : 0));
      const face = this.mesh(g, badge, cap, false);
      face.rotation.x = -Math.PI / 2;
      face.position.y = .194 * scale;
      face.name = 'Star-topped jet bumper cap';
      if (i < 3) {
        const light = new THREE.PointLight(b.color, .25, 3, 2);
        light.position.set(b.x, b.y + .16, b.z);
        this.scene.add(light);
        this.bumperLights.push(light);
      }
    });
    courseTargets.forEach((t, i) => {
      const dx = t.bx - t.ax, dz = t.bz - t.az, l = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx), material = this.paint(t.kind.includes('drop') ? 0xca283b : t.y ? 0xe5bf3e : 0x72c77a, .2, .35, .15);
      const target = this.box(l, t.height, t.thickness * 2 + .045, material, (t.ax + t.bx) / 2, t.y + t.height / 2, (t.az + t.bz) / 2);
      target.rotation.y = angle;
      this.targetLamps.push(target);
      this.box(.045, t.height + .08, .045, chrome, t.ax, t.y + t.height / 2, t.az);
      this.box(.045, t.height + .08, .045, chrome, t.bx, t.y + t.height / 2, t.bz);
    });
    coursePosts.forEach(p => { const o = this.mesh(new THREE.CylinderGeometry(p.radius, p.radius, .3, 16), black); o.position.set(p.x, .15, p.z); this.ring(p.radius, .02, chrome, p.x, .24, p.z); });
    // Triangular slingshot covers at their measured source corners.
    for (const [i, s] of [...courseRails, ...deckRails].filter(s => s.kind.endsWith('sling')).entries()) {
      const adjoining = [...courseRails, ...deckRails].find(o => o.y === s.y && o.bx === s.ax && o.bz === s.az && o.ax === s.bx)!;
      const outline = [{ x: s.ax, y: 0, z: s.az }, { x: s.bx, y: 0, z: s.bz }, { x: adjoining.ax, y: 0, z: adjoining.az }];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(outline.flatMap(p => [p.x, s.y + .34, p.z]), 3));
      g.setIndex([0, 1, 2]);
      g.computeVertexNormals();
      const material = this.paint(i < 2 ? 0x762284 : 0x2e3765, .3, .5);
      material.side = THREE.DoubleSide;
      this.mesh(g, material);
    }
    courseFlippers.forEach(f => {
      const group = new THREE.Group();
      group.position.set(f.x, f.y + BALL_RADIUS, f.z);
      group.rotation.y = f.rest;
      this.scene.add(group);
      this.flipperGroups.push(group);
      const geo = new THREE.CapsuleGeometry(f.radius, f.length, 4, 12);
      geo.rotateZ(Math.PI / 2);
      const rubber = this.mesh(geo, red, group);
      rubber.position.x = f.side * f.length / 2;
      const plateGeo = new THREE.CapsuleGeometry(f.radius * .78, f.length - .08, 4, 12);
      plateGeo.rotateZ(Math.PI / 2);
      plateGeo.scale(1, .09, 1);
      const plate = this.mesh(plateGeo, ivory, group);
      plate.position.set(f.side * f.length / 2, f.radius + .006, 0);
      const pivot = this.mesh(new THREE.CylinderGeometry(f.radius * .62, f.radius * .62, .03, 16), chrome, group);
      pivot.position.y = f.radius + .02;
    });
    courseSpinners.forEach(s => {
      const group = new THREE.Group(), x = (s.a.x + s.b.x) / 2, z = s.a.z, y = .55;
      group.position.set(x, y, z);
      this.scene.add(group);
      this.spinnerGroups.push(group);
      this.box(s.b.x - s.a.x, .22, .055, ivory, 0, 0, 0, group);
      // Supports are stationary scene objects in world coordinates. Only the
      // blade is a child of the translated, rotating spinner group.
      for (const xx of [s.a.x, s.b.x])
        this.spinnerSupports.push(this.box(.045, .6, .045, chrome, xx, .3, z, this.scene));
    });
    const steelBall = this.mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 20), this.paint(0xe9eef3, 1, .12), this.ball);
    steelBall.name = 'BB-8 ball';
    this.ring(.249, .022, this.paint(0xe79934, .55, .3), 0, 0, 0, this.ball);
    this.scene.add(this.ball);
    const ground = this.mesh(new THREE.PlaneGeometry(90, 90), this.paint(0x07080c, 0, .9), this.scene, false);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.2;
  }
  setQuality(high: boolean) { this.bumperLights.forEach(l => l.visible = high); }
  update(sim: PinballSimulation, dt: number) {
    const visible = sim.phase === 'intro', p = sim.position, q = sim.ball.rotation();
    let dirty = visible !== this.ball.visible || visible &&
      (this.ball.position.x !== p.x || this.ball.position.y !== p.y || this.ball.position.z !== p.z ||
       this.ball.quaternion.x !== q.x || this.ball.quaternion.y !== q.y || this.ball.quaternion.z !== q.z || this.ball.quaternion.w !== q.w);
    this.ball.visible = visible;
    this.ball.position.copy(p);
    this.ball.quaternion.copy(q);
    const gateAngle = sim.reference?.gateClosed ? 0 : Math.PI / 2;
    if (this.gateGroup.rotation.z !== gateAngle) {
      this.gateGroup.rotation.z = gateAngle;
      dirty = true;
    }
    this.flipperGroups.forEach((g, i) => { if (g.rotation.y !== sim.flipperAngles[i]) {
      g.rotation.y = sim.flipperAngles[i];
      dirty = true;
    } });
    for (const e of sim.events) {
      if (e.type === 'bumper')
        this.flashes[e.index] = 1;
      if (e.type === 'target')
        this.targetFlashes[e.index] = 1;
    }
    this.caps.forEach((cap, i) => { this.flashes[i] = Math.max(0, this.flashes[i] - dt * 3.6); const y = this.capBase[i] - .07 * this.flashes[i]; if (cap.position.y !== y) {
      cap.position.y = y;
      dirty = true;
    } this.lenses[i].emissiveIntensity = .25 + this.flashes[i] * 1.2; if (this.bumperLights[i])
      this.bumperLights[i].intensity = .25 + this.flashes[i] * 1.2; });
    this.targetLamps.forEach((t, i) => {
      this.targetFlashes[i] = Math.max(0, this.targetFlashes[i] - dt * 3);
      const down = sim.reference?.targetDown[i], s = courseTargets[i], y = s.y + s.height / 2 - (down ? s.height : .0);
      if (t.position.y !== y) {
        t.position.y = y;
        dirty = true;
      }
      (t.material as THREE.MeshStandardMaterial).emissiveIntensity = sim.reference?.targetLit[i] ? .8 : .15 + this.targetFlashes[i];
    });
    this.spinnerGroups.forEach((g, i) => { const angle = sim.reference?.spinnerAngles[i] || 0; if (g.rotation.x !== angle) {
      g.rotation.x = angle;
      dirty = true;
    } });
    if (dirty)
      this.shadowRevision++;
  }
  dispose() { for (const r of this.resources)
    r.dispose(); this.resources.clear(); }
}
