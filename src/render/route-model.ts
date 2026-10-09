import * as THREE from 'three';
import { cabinetMaterials, cabinetPalette } from './cabinet-theme';
import type { PinballSimulation } from '../physics/simulation';
import { BALL_RADIUS } from '../physics/table';
import {
  ascentFloor, descentFloor, apronData, sideData, roofData, wireData, tiesData, supportData,
  channelData, frames, localPoint, mergeData, tubeData, tunnelStart, tunnelEnd,
  ascentEnd, descentStart, type MeshData,
} from '../physics/route-geometry';
import { gates } from '../physics/route-state';

/** Static batched cabinet parts, built from the simulation's exact mesh data. */
export class ElevatedCircuit {
  readonly group = new THREE.Group();
  private resources = new Set<{ dispose(): void }>();
  private lamps: THREE.MeshStandardMaterial[] = [];
  private phase = -1;

  constructor(scene: THREE.Scene) {
    this.group.name = 'Elevated circuit';
    const chrome = this.keep(new THREE.MeshStandardMaterial({ color: 0xc9deea, metalness: 0.94, roughness: 0.28, envMapIntensity: 0.85 }));
    const deck = this.keep(new THREE.MeshPhysicalMaterial({ color: 0x28434b, ...cabinetMaterials.deck, side: THREE.DoubleSide }));
    const glass = this.keep(new THREE.MeshPhysicalMaterial({ color: 0x76d6e8, metalness: 0.12, roughness: 0.23, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    const canopy = this.keep(new THREE.MeshStandardMaterial({ color: cabinetPalette.panel, ...cabinetMaterials.paint, side: THREE.DoubleSide }));
    this.mesh(mergeData([ascentFloor, descentFloor, apronData]), deck);
    this.mesh(wireData, chrome);
    const support = this.keep(new THREE.MeshStandardMaterial({ color: 0x73858b, ...cabinetMaterials.steel }));
    this.mesh(mergeData([tiesData, supportData]), support);
    this.mesh(sideData, glass, false);
    this.mesh(roofData, glass, false);
    this.mesh(channelData(tunnelStart, tunnelEnd, 'roof'), canopy);

    // Bright trim follows the outside of the existing solid channel boundary;
    // it never introduces an invisible obstruction in the ball's free volume.
    const edges: MeshData[] = [];
    for (const [from, to] of [[0, ascentEnd], [descentStart, frames.length - 1]]) for (const side of [-1, 1]) {
      edges.push(tubeData(frames.slice(from, to + 1).map(f => localPoint(f, side * (f.width + 0.022), -BALL_RADIUS - 0.018)), 0.018, 6));
    }
    const trim = this.keep(new THREE.MeshStandardMaterial({ color: 0x65e5f5, emissive: 0x33cddd, emissiveIntensity: 0.65, metalness: 0.2, roughness: 0.4 }));
    this.mesh(mergeData(edges), trim, false);

    // Tunnel ribs share the opaque roof/walls' exterior; one batch, not one
    // mesh or light per rib. Portals leave a full-height forward sight line.
    const ribs: MeshData[] = [];
    for (let i = tunnelStart; i <= tunnelEnd; i += 5) {
      const f = frames[i];
      ribs.push(tubeData([localPoint(f, -f.width - 0.025, -BALL_RADIUS), localPoint(f, -f.width - 0.025, f.roof - BALL_RADIUS + 0.025),
        localPoint(f, f.width + 0.025, f.roof - BALL_RADIUS + 0.025), localPoint(f, f.width + 0.025, -BALL_RADIUS)], 0.025, 6));
    }
    this.mesh(mergeData(ribs), trim, false);

    for (const [i, gate] of gates.entries()) {
      const f = gate.frame, width = i === 0 ? f.width : i === 1 || i === 2 ? 0.5 : f.width;
      const material = this.keep(new THREE.MeshStandardMaterial({ color: 0xffb76c, emissive: 0xff982e, emissiveIntensity: 0.55, metalness: 0.45, roughness: 0.28 }));
      this.lamps.push(material);
      // Markers sit below the contact deck/wires, so a ground ball still sees
      // the crossing without treating this decoration as a collision surface.
      this.mesh(tubeData([localPoint(f, -width, -0.36), localPoint(f, width, -0.36)], 0.027, 8), material, false);
    }

    // The chevron insert is a decal on the existing tabletop, beside the lip.
    const image = document.createElement('canvas'); image.width = 512; image.height = 256;
    const c = image.getContext('2d')!; c.fillStyle = '#ffbf78'; c.textAlign = 'center';
    c.font = 'bold 42px monospace'; c.fillText('CIRCUIT +750', 256, 195);
    c.lineWidth = 12; c.strokeStyle = '#ffbf78';
    for (const y of [48, 98]) { c.beginPath(); c.moveTo(172, y + 30); c.lineTo(256, y); c.lineTo(340, y + 30); c.stroke(); }
    const map = this.keep(new THREE.CanvasTexture(image)); map.colorSpace = THREE.SRGBColorSpace;
    const decal = this.keep(new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
    const insert = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(2.1, 1.05)), decal);
    insert.rotation.x = -Math.PI / 2; insert.position.set(frames[0].c.x, 0.022, 4.55); this.group.add(insert);
    scene.add(this.group);
  }

  private keep<T extends { dispose(): void }>(resource: T) { this.resources.add(resource); return resource; }
  private mesh(data: MeshData, material: THREE.Material, shadow = true) {
    const geometry = this.keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3)); geometry.setIndex(new THREE.BufferAttribute(data.indices, 1)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = shadow; mesh.receiveShadow = shadow;
    this.group.add(mesh); return mesh;
  }

  update(sim: PinballSimulation) {
    const phase = sim.route.completionFlash > 0 ? 6 : sim.route.active ? sim.route.nextGate : 0;
    if (phase === this.phase) return;
    this.phase = phase;
    this.lamps.forEach((lamp, i) => {
      const done = phase === 6 || (phase > 0 && i < phase);
      lamp.color.setHex(done ? 0x79ecf7 : 0xffb76c); lamp.emissive.setHex(done ? 0x39d9f0 : 0xff982e);
      lamp.emissiveIntensity = done ? 1.8 : i === phase ? 1.0 : 0.45;
    });
  }

  dispose() { this.group.removeFromParent(); for (const resource of this.resources) resource.dispose(); this.resources.clear(); }
}
