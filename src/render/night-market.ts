import * as THREE from 'three';
import { WALL_BASE_COLOR } from './wall-palette';
import { batchStaticMeshes, releaseStaticBuildInputs } from './static-batch';
import { bridgePendantFits, signClearsRouteEyes, tubeClearsRouteEyes, type Point3 } from './night-market-clearance';
import { atlasFace, marketColors, nightMarketAtlas, nightMarketInlayAtlas } from './night-market-art';
import { marketFronts, marketGlow, simplifyLightPath, tunnelVaultFits, type MarketFront } from './night-market-layout';
import { courseRamps, courseTunnels, courseRails, deckRails, fieldOutline, deckOutline, deckHeight, pathFrame, polygonData, type CoursePath, type CourseSegment } from '../physics/reference-course';
import { rails } from '../physics/table';
import { frames, localPoint, tunnelStart, tunnelEnd, tubeData, type Vec3 } from '../physics/route-geometry';

/** Render-only miniature night district. The physical table and camera are untouched. */
export class NightMarket {
  readonly group = new THREE.Group();
  readonly stats = { storefronts: 0, bridgeMarkers: 0, tunnelRibs: 0, tunnelPanels: 0, batches: 0, releasedGeometryBytes: 0, removedEmptyGroups: 0, releasedCanvasBytes: 0 };
  private resources = new Set<{ dispose(): void }>();
  private glow: THREE.MeshStandardMaterial[] = [];
  private time = 0;
  private routeEyes: Point3[] = [];
  private lightLevels = { value: Array(6).fill(1.6) as number[] };
  private atlas: THREE.MeshPhysicalMaterial;
  private inlay: THREE.MeshPhysicalMaterial;
  private enamel: THREE.MeshPhysicalMaterial;
  private brass: THREE.MeshStandardMaterial;
  private dark: THREE.MeshStandardMaterial;
  private boxGeometry = this.keep(new THREE.BoxGeometry(1, 1, 1));
  private pearlGeometry = this.keep(new THREE.SphereGeometry(1, 6, 3));
  private sphereGeometry = this.keep(new THREE.SphereGeometry(1, 8, 5));

  constructor(scene: THREE.Scene, reference: boolean, circuit: boolean) {
    this.group.name = 'Tropical neon night district';
    const texture = this.keep(nightMarketAtlas());
    this.atlas = this.keep(new THREE.MeshPhysicalMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: .58,
      metalness: .24, roughness: .26, clearcoat: 1, clearcoatRoughness: .13 }));
    const inlay = this.keep(nightMarketInlayAtlas());
    this.inlay = this.keep(new THREE.MeshPhysicalMaterial({ map: inlay, emissiveMap: inlay, emissive: 0xffffff, emissiveIntensity: .65,
      metalness: .45, roughness: .22, clearcoat: 1, clearcoatRoughness: .10, side: THREE.DoubleSide }));
    this.enamel = this.keep(new THREE.MeshPhysicalMaterial({ color: WALL_BASE_COLOR, metalness: .45, roughness: .24, clearcoat: 1, clearcoatRoughness: .12 }));
    this.brass = this.keep(new THREE.MeshStandardMaterial({ color: 0xcfaa6b, metalness: .8, roughness: .26 }));
    this.dark = this.keep(new THREE.MeshStandardMaterial({ color: 0x18273f, metalness: .4, roughness: .32 }));
    this.glow = marketColors.map(color => this.keep(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, metalness: .35, roughness: .22 })));
    for (const [i, front] of marketFronts(reference).entries()) this.front(front, i);
    this.lanternCanopy();
    if (reference) {
      [...courseRails, ...deckRails].forEach((rail, i) => this.railSkin(rail, i));
      for (let i = 0; i < 48; i++) {
        const a = fieldOutline[i], b = fieldOutline[i + 1];
        this.railSkin({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: 0, height: 1.02, thickness: .007 } as CourseSegment, i + 70, true);
      }
    } else rails.forEach((rail, i) => this.railSkin({ ...rail, y: -.2, height: 1.5, thickness: .13 } as CourseSegment, i));
    if (reference) this.referencePaths();
    else if (circuit) this.circuitPaths();
    this.consolidateGlow();
    this.consolidateMetal();
    this.consolidateArtwork();
    const batch = batchStaticMeshes(this.group, new Set(), 6);
    batch.geometries.forEach(g => this.keep(g)); this.stats.batches = batch.batches;
    const released=releaseStaticBuildInputs(this.group,this.resources);
    this.stats.releasedGeometryBytes=released.bytes; this.stats.removedEmptyGroups=released.emptyGroups;
    scene.add(this.group);
  }
  private keep<T extends { dispose(): void }>(r: T): T { this.resources.add(r); return r; }
  private mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = this.group) {
    this.keep(g); const mesh = new THREE.Mesh(g, m); mesh.castShadow = false; mesh.receiveShadow = false; parent.add(mesh); return mesh;
  }
  private box(x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material, parent: THREE.Object3D = this.group) {
    const mesh = this.mesh(this.boxGeometry, m, parent); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); return mesh;
  }
  private tube(points: Vec3[], radius: number, m: THREE.Material, parent: THREE.Object3D = this.group) {
    const line = simplifyLightPath(points, .004);
    let start = 0, distance = 0, mesh: THREE.Mesh | undefined;
    for (let end = 1; end < line.length; end++) {
      distance += Math.hypot(line[end].x - line[end - 1].x, line[end].y - line[end - 1].y, line[end].z - line[end - 1].z);
      if (distance < 3.5 && end !== line.length - 1) continue;
      const data = tubeData(line.slice(start, end + 1), radius, 5), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(data.vertices.length / 3 * 2), 2));
      g.setIndex(new THREE.BufferAttribute(data.indices, 1)); g.computeVertexNormals();
      mesh = this.mesh(g, m, parent); start = end; distance = 0;
    }
    return mesh;
  }
  private consolidateGlow() {
    const pixels = new Uint8Array(8 * 4);
    marketColors.forEach((color, i) => pixels.set([color >> 16, color >> 8 & 255, color & 255, 255], i * 4));
    const palette = this.keep(new THREE.DataTexture(pixels, 8, 1));
    palette.colorSpace = THREE.SRGBColorSpace; palette.magFilter = palette.minFilter = THREE.NearestFilter;
    palette.generateMipmaps = false; palette.needsUpdate = true;
    const material = this.keep(new THREE.MeshStandardMaterial({ map: palette, emissiveMap: palette, emissive: 0xffffff,
      emissiveIntensity: 1.6, metalness: .35, roughness: .22 }));
    material.name = 'Batched six-channel neon palette';
    material.onBeforeCompile = shader => {
      shader.uniforms.marketLevels = this.lightLevels;
      shader.fragmentShader = 'uniform float marketLevels[6];\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance *= marketLevels[int(floor(vEmissiveMapUv.x * 8.0))] / 1.6;');
    };
    material.customProgramCacheKey = () => 'night-market-palette-v1';
    this.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const channel = this.glow.indexOf(object.material as THREE.MeshStandardMaterial);
      if (channel < 0) return;
      // Shared primitives need private UVs until the one-time static merge.
      const g = this.keep(object.geometry.clone()), uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (channel + .5) / 8, .5);
      object.geometry = g; object.material = material;
    });
  }

  private consolidateMetal() {
    const originals = [this.enamel, this.brass, this.dark];
    const pixels = new Uint8Array(4 * 4), parameters = new Uint8Array(4 * 4);
    originals.forEach((m, i) => {
      const color = m.color.getHex(THREE.SRGBColorSpace);
      pixels.set([color >> 16, color >> 8 & 255, color & 255, 255], i * 4);
      parameters.set([0, Math.round(m.roughness * 255), Math.round(m.metalness * 255), 255], i * 4);
    });
    const palette = this.keep(new THREE.DataTexture(pixels, 4, 1)), properties = this.keep(new THREE.DataTexture(parameters, 4, 1));
    palette.colorSpace = THREE.SRGBColorSpace;
    for (const map of [palette, properties]) { map.magFilter = map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; map.needsUpdate = true; }
    const material = this.keep(new THREE.MeshPhysicalMaterial({ map: palette, roughnessMap: properties, metalnessMap: properties,
      roughness: 1, metalness: 1, clearcoat: 1, clearcoatRoughness: .14 }));
    material.name = 'Batched enamel brass and dark metal palette';
    this.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const channel = originals.indexOf(object.material as THREE.MeshPhysicalMaterial);
      if (channel < 0) return;
      const g = this.keep(object.geometry.clone()), uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (channel + .5) / 4, .5);
      object.geometry = g; object.material = material;
    });
  }
  private consolidateArtwork() {
    const canvas = document.createElement('canvas'); canvas.width = 4096; canvas.height = 2048;
    const context = canvas.getContext('2d')!;
    context.drawImage(this.atlas.map!.image as HTMLCanvasElement, 0, 0);
    context.drawImage(this.inlay.map!.image as HTMLCanvasElement, 2048, 0);
    const map = this.keep(new THREE.CanvasTexture(canvas)); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    map.name = 'Combined original shop and ceramic atlas';
    const material = this.keep(new THREE.MeshPhysicalMaterial({ map, emissiveMap: map, emissive: 0xffffff,
      emissiveIntensity: .62, metalness: .35, roughness: .24, clearcoat: 1, clearcoatRoughness: .12, side: THREE.DoubleSide }));
    this.group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || (object.material !== this.atlas && object.material !== this.inlay)) return;
      const offset = object.material === this.inlay ? .5 : 0, g = this.keep(object.geometry.clone()), uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setX(i, offset + uv.getX(i) * .5);
      object.geometry = g; object.material = material;
    });
    // Only the combined atlas is needed after the static conversion. Release
    // both 2048² source canvases instead of retaining a second 32 MiB copy.
    for (const original of [this.atlas,this.inlay]) {
      const source=original.map!;
      const image=source.image as HTMLCanvasElement;
      this.stats.releasedCanvasBytes+=image.width*image.height*4;
      original.map=null;original.emissiveMap=null;
      source.dispose();this.resources.delete(source);original.dispose();this.resources.delete(original);
    }
  }
  private sign(w: number, h: number, tile: number, x: number, y: number, z: number, parent: THREE.Object3D) {
    const sign = this.mesh(atlasFace(w, h, tile), this.atlas, parent); sign.position.set(x, y, z); return sign;
  }
  private panel(corners: Vec3[], tile: number) {
    const g = this.keep(atlasFace(1, 1, tile)), a = g.getAttribute('position');
    // PlaneGeometry vertex order: top-left, top-right, bottom-left, bottom-right.
    corners.forEach((p, i) => a.setXYZ(i, p.x, p.y, p.z));
    g.computeVertexNormals(); this.mesh(g, this.inlay); this.stats.tunnelPanels++;
  }
  private tunnelLining(path: CoursePath, index: number) {
    const step = .28;
    for (let s = 0; s < path.length - step; s += step) {
      const a = pathFrame(path, s), b = pathFrame(path, Math.min(path.length, s + step));
      // Only the fully submerged portion gets a vault. Leave real portal openings free.
      if (!tunnelVaultFits(Math.max(a.c.y, b.c.y))) continue;
      const at = (f: typeof a, x: number, y: number) => ({ x:f.c.x-f.tangent.z*x, y:f.c.y+y, z:f.c.z+f.tangent.x*x });
      const w = path.width + .016;
      const section = [[-w,-.28],[-w,.32],[-w*.72,.46],[w*.72,.46],[w,.32],[w,-.28]];
      for (let n = 0; n < section.length - 1; n++) {
        const [x0,y0] = section[n], [x1,y1] = section[n+1];
        this.panel([at(a,x1,y1),at(b,x1,y1),at(a,x0,y0),at(b,x0,y0)], (index*5+n*3+Math.floor(s/step))%16);
      }
    }
  }
  private railSkin(rail: CourseSegment, index: number, insideOnly = false) {
    const dx = rail.bx - rail.ax, dz = rail.bz - rail.az, length = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx);
    const sections = Math.max(1, Math.ceil(length / .72));
    // Keep the skin within the existing wall's extent; cap trims remain visible as collision cues.
    for (const side of insideOnly ? [1] : [-1, 1]) for (let n = 0; n < sections; n++) {
      const t = (n + .5) / sections, p = new THREE.Group();
      p.position.set(rail.ax + dx * t - dz / length * side * (rail.thickness + .006), rail.y + rail.height / 2,
        rail.az + dz * t + dx / length * side * (rail.thickness + .006));
      p.rotation.y = angle + (side < 0 ? Math.PI : 0); this.group.add(p);
      const w = length / sections * .985, h = Math.max(.05, rail.height - .065);
      this.mesh(atlasFace(w, h, (index * 3 + n) % 16), this.inlay, p);
      this.box(0, h / 2, .003, w, .009, .006, this.glow[index % 6], p);
      this.box(-w / 2 + .009, 0, .006, .011, h, .01, this.brass, p);
      if (w > .3) {
        const gem = this.box(0, 0, .011, .045, Math.min(h * .33, .09), .016, this.glow[(index + n + 2) % 6], p);
        gem.rotation.z = Math.PI / 4;
      }
    }
  }
  private lanternCanopy() {
    // High suspended street festoons leave every gameplay route and sightline clear.
    for (let row = 0; row < 6; row++) {
      const z = -8.5 + row * 3.45, points: Vec3[] = [];
      for (let n = 0; n <= 20; n++) {
        const x = -6.4 + n * .64, y = 4.05 - .55 * Math.sin(n / 20 * Math.PI);
        points.push({ x, y, z: z + .16 * Math.sin(n * .4 + row) });
      }
      this.tube(points, .013, this.brass);
      for (let n = 1; n < 20; n += 3) {
        const p = points[n], glow = this.glow[(n + row * 2) % 6];
        this.tube([p, { ...p, y: p.y - .18 }], .007, this.brass);
        const lantern = this.mesh(this.sphereGeometry, glow); lantern.position.set(p.x, p.y - .27, p.z); lantern.scale.set(.09, .13 + row % 2 * .035, .09);
        for (const h of [-.39, -.15]) this.box(p.x, p.y + h, p.z, .10, .02, .10, this.brass);
        this.tube([{ x: p.x, y: p.y - .4, z: p.z }, { x: p.x, y: p.y - .50, z: p.z }], .009, glow);
        // Fine equatorial ribs give the lantern a volume rather than a flat bulb.
        const ring: Vec3[] = [];
        for (let q = 0; q <= 10; q++) { const angle = q * Math.PI / 5; ring.push({x:p.x+Math.cos(angle)*.092,y:p.y-.27,z:p.z+Math.sin(angle)*.092}); }
        this.tube(ring, .004, this.brass);
      }
    }
  }
  private front(f: MarketFront, i: number) {
    const p = new THREE.Group(); p.name = `Night storefront ${i} district ${f.district}`;
    p.position.set(f.x, 0, f.z); p.rotation.y = f.angle; this.group.add(p); this.stats.storefronts++;
    const w = f.width, h = f.height, a = this.glow[i % 6], b = this.glow[(i + 2) % 6], kind = i % 7;
    this.box(0, h / 2 - .02, -.13, w, h, .13, this.enamel, p);
    const skin = this.mesh(atlasFace(w - .04, h - .06, (i * 3 + 5) % 16), this.inlay, p);
    skin.position.set(0, h / 2, -.061);
    // Shop bays have different real depths, fascias and sill heights. The whole
    // block lives outside the playable rail; projecting signs stay above it.
    const sill = .85 + (i % 3) * .06, fascia = h - .30;
    for (const x of [-w / 2 + .035, w / 2 - .035]) {
      this.box(x, h / 2, -.008, .045, h, .035, this.brass, p);
      this.box(x + .018, h / 2, .011, .009, h - .1, .015, a, p);
    }
    this.box(0, sill, -.015, w - .10, .075, .12, this.brass, p);
    if (kind === 0 || kind === 4) {
      // Open late noodle counter / arcade: small warm bays and a split marquee.
      this.box(0, (sill + fascia) / 2, -.022, w * .85, fascia - sill - .08, .05, this.dark, p);
      for (let n = 0; n < 3; n++) {
        const x = (n - 1) * w * .25;
        this.box(x, sill + .29, .002, w * .19, .38, .025, this.enamel, p);
        this.sign(w * .17, .30, (f.tile + n) % 16, x, sill + .30, .018, p);
        this.box(x, sill + .08, .032, w * .20, .03, .11, n % 2 ? a : b, p);
      }
      this.sign(w * .88, .38, f.tile, 0, fascia + .08, .015, p);
    } else if (kind === 1 || kind === 5) {
      // Tall arched lattice / tropical conservatory, with a small hanging sign.
      const center = sill + (fascia - sill) * .48, height = Math.max(.3, fascia - sill - .13);
      this.box(0, center, -.014, w * .82, height, .04, this.dark, p);
      for (let n = 0; n < 6; n++) {
        const x = -w * .34 + n * w * .136;
        this.box(x, center, .016, .013, height, .02, this.brass, p);
      }
      for (let y = sill + .12; y < fascia; y += .14) this.box(0, y, .024, w * .78, .012, .017, b, p);
      const arch: Vec3[] = [];
      for (let n = 0; n <= 12; n++) { const t = n / 12 * Math.PI; arch.push({ x:Math.cos(t)*w*.37,y:fascia-.11+Math.sin(t)*.21,z:.028 }); }
      this.tube(arch, .018, a, p);
      this.sign(w * .48, .40, f.tile, w * .12, h - .16, .058, p);
    } else if (kind === 2) {
      // A vinyl window: circular records against a recessed coloured ceramic bay.
      this.box(0, (sill + fascia) / 2, -.02, w * .86, fascia - sill, .03, this.dark, p);
      for (const side of [-1, 1]) {
        const ring = this.mesh(new THREE.TorusGeometry(w * .15, .018, 4, 18), side < 0 ? a : b, p);
        ring.position.set(side * w * .22, sill + .34, .018);
        this.box(side * w * .22, sill + .34, .020, .05, .05, .016, this.brass, p);
      }
      this.sign(w * .87, .34, f.tile, 0, fascia + .10, .040, p);
    } else if (kind === 3) {
      // Offset shutter plus vertical menu: deliberately asymmetrical frontage.
      const x = -w * .19;
      this.box(x, (sill + fascia) / 2, -.018, w * .48, fascia - sill, .03, this.dark, p);
      for (let y = sill + .05; y < fascia; y += .065) {
        const slat = this.box(x, y, .008, w * .48, .021, .065, this.brass, p); slat.rotation.x = -.25;
      }
      this.sign(w * .29, Math.max(.45, fascia - sill), f.tile, w * .27, (sill + fascia) / 2, .035, p);
      this.box(0, fascia + .12, .026, w * .88, .055, .045, a, p);
    } else {
      // Lantern tea window, with inset diamond screens rather than a billboard.
      this.box(0, (sill + fascia) / 2, -.021, w * .85, fascia - sill, .035, this.dark, p);
      for (let n = 0; n < 3; n++) {
        const x = (n - 1) * w * .26, y = sill + .28;
        const diamond = this.box(x, y, .01, .16, .16, .025, this.brass, p); diamond.rotation.z = Math.PI / 4;
        const bulb = this.mesh(this.pearlGeometry, n % 2 ? a : b, p); bulb.scale.set(.055, .11, .055); bulb.position.set(x, fascia - .12, .043);
      }
      this.sign(w * .77, .34, f.tile, 0, fascia + .16, .043, p);
    }
    // Set-back upper rooms create an irregular street silhouette. They stay
    // behind the cabinet wall and never lower a canopy into the playable space.
    if (i % 3 === 0) {
      const rise = .42 + (i % 5) * .09, x = (i % 2 ? 1 : -1) * w * .08;
      this.box(x, h + rise / 2 - .05, -.21, w * .86, rise, .09, this.enamel, p);
      this.box(x, h + rise - .05, -.16, w * .92, .035, .13, this.brass, p);
      for (const side of [-1, 1]) {
        const xx = x + side * w * .23;
        this.box(xx, h + rise * .48, -.148, w * .23, rise * .58, .01, this.glow[(i + 2) % 6], p);
        this.box(xx, h + rise * .48, -.139, .013, rise * .61, .014, this.dark, p);
        this.box(xx, h + rise * .48, -.136, w * .25, .017, .015, this.dark, p);
      }
    }
    // Awnings alternate striped canvas, scalloped metal, and narrow flat canopies.
    const awningY = kind === 3 ? h - .03 : fascia + .35, awningDepth = .10 + (i % 3) * .025;
    this.box(0, awningY, -.005, w + .02, .04, awningDepth, this.dark, p);
    const slats = 5 + i % 4;
    for (let n = 0; n < slats; n++) {
      const x = -w / 2 + (n + .5) * w / slats;
      const flap = this.box(x, awningY - .035, .03, w / slats * .87, .06 + .025 * ((n + i) % 3), awningDepth, n % 3 ? this.brass : b, p);
      flap.rotation.x = .28;
    }
    // Lower embossed friezes remain present behind the close playable rail.
    this.box(0, .13, -.01, w - .08, .018, .028, b, p);
    for (let n = 0; n < 4; n++) {
      const gem = this.box(-w * .35 + n * w * .235, .32, -.012, .10, .10, .025, n % 2 ? a : this.brass, p); gem.rotation.z = Math.PI / 4;
    }
    if (i % 2 === 0) {
      const side = i % 4 ? 1 : -1, x = side * w * .35;
      this.box(x, h + .10, -.10, w * .29, .52, .075, this.enamel, p);
      // Reconstructed narrow hanging sign after recovery of the surrounding facade.
      this.sign(w * .25, .46, f.tile, x, h + .10, -.055, p);
    }
    for (let n = 0; n < 6; n++) {
      const bulb = this.mesh(this.pearlGeometry, n % 2 ? a : b, p);
      bulb.scale.setScalar(.022); bulb.position.set(-w * .44 + n * w * .176, h + .11 + .1 * Math.abs(n - 2.5) / 2.5, -.13);
    }
    if (i % 3 === 1) {
      const y = h + .32;
      this.tube([{ x:.12,y:h,z:-.2 },{ x:.06,y:y+.1,z:-.2 }], .015, this.brass, p);
      for (let n = 0; n < 7; n++) {
        const a0 = n / 6 * Math.PI;
        this.tube([{x:.06,y:y+.1,z:-.19},{x:.06+Math.cos(a0)*.22,y:y+Math.sin(a0)*.25,z:-.18},
          {x:.06+Math.cos(a0)*.34,y:y-.12+Math.sin(a0)*.29,z:-.17}], .011, b, p);
      }
    }
  }

  private referencePaths() {
    this.routeEyes = courseRamps.flatMap(path => Array.from({length:Math.ceil(path.length/.08)+1},(_,i)=>{
      const p=pathFrame(path,Math.min(path.length,i*.08)).c; return {...p,y:p.y+.20};
    }));
    for (const [index, path] of courseRamps.entries()) this.pathDecor(path, index, false);
    for (const [index, path] of courseTunnels.entries()) this.pathDecor(path, index + 3, true);
    // Mini-playfield fascia and underside are visible from the lower course.
    for (let i = 0; i < deckOutline.length; i++) {
      const a = deckOutline[i], b = deckOutline[(i + 1) % deckOutline.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      const pieces = Math.max(1, Math.ceil(length / .55));
      for (let n = 0; n < pieces; n++) {
        const t = (n + .5) / pieces, p = new THREE.Group(); p.position.set(a.x + (b.x - a.x) * t, deckHeight - .0175, a.z + (b.z - a.z) * t);
        p.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); this.group.add(p);
        this.box(0, 0, 0, length / pieces * .96, .035, .02, this.enamel, p);
        this.sign(length / pieces * .90, .026, (i + n) % 16, 0, 0, .023, p);
        this.box(0, -.012, 0, length / pieces, .007, .026, this.glow[i % 6], p);
      }
    }
    // Flush patterned soffit: add no hanging mass in the ramp's narrow headroom.
    const soffitData = polygonData(deckOutline, deckHeight - .004), soffit = new THREE.BufferGeometry();
    soffit.setAttribute('position', new THREE.BufferAttribute(soffitData.vertices, 3));
    soffit.setIndex(new THREE.BufferAttribute(soffitData.indices, 1)); soffit.computeVertexNormals();
    const uv: number[] = [];
    for (let i = 0; i < soffitData.vertices.length; i += 3) uv.push((soffitData.vertices[i] - .4) / 5.3, (soffitData.vertices[i + 2] + 10.6) / 5.7);
    soffit.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); this.mesh(soffit, this.inlay);
    // Suspended lattice below the upper deck, above ground-ball headroom.
    for (let x = .7; x < 5.35; x += .38) {
      const inside: Vec3[] = [];
      for (let z = -10; z < -5.2; z += .12) {
        let hit = false;
        for (let i = 0, j = deckOutline.length - 1; i < deckOutline.length; j = i++) {
          const a = deckOutline[i], b = deckOutline[j];
          if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) hit = !hit;
        }
        if (hit) inside.push({ x, y: deckHeight - .07, z });
      }
      if (inside.length > 1) this.tube([inside[0], inside.at(-1)!], .012, this.glow[Math.floor(x * 3) % 6]);
    }
  }

  private pathDecor(path: CoursePath, index: number, tunnel: boolean) {
    const a = this.glow[index % 6], b = this.glow[(index + 2) % 6];
    if (tunnel) this.tunnelLining(path, index);
    // Continuous ribbons hug the same surfaces; no obstacle is inserted into a lane.
    for (const side of [-1, 1]) {
      const edge = path.points.map((p, i) => {
        const f = pathFrame(path, path.lengths[i]);
        return { x: p.x - f.tangent.z * side * (path.width + .025), y: p.y + (tunnel ? .1 : -.14), z: p.z + f.tangent.x * side * (path.width + .025) };
      }).filter((p, i) => !tunnel || path.points[i].y <= -.32);
      if (edge.length > 1) this.tube(edge, .016, a);
    }
    const step = tunnel ? .42 : .70;
    for (let s = .25; s < path.length - .25; s += step) {
      const f = pathFrame(path, s), r = { x: -f.tangent.z, z: f.tangent.x };
      if (tunnel && f.c.y > -.32) continue; // Portal lips must not grow decorative spikes above the tabletop.
      const at = (lateral: number, y: number) => ({ x: f.c.x + r.x * lateral, y: f.c.y + y, z: f.c.z + r.z * lateral });
      if (tunnel) {
        // Fixtures stay against/outside the tunnel walls, clear of the eye line.
        const width = path.width + .025;
        if (tunnelVaultFits(f.c.y)) {
        this.tube([at(-width, -.25), at(-width, .32), at(-width * .72, .455), at(width * .72, .455), at(width, .32), at(width, -.25)], .013, s % .84 < .42 ? a : b);
        this.stats.tunnelRibs++;
        }
      } else {
        const brace=[at(-path.width - .04, -.315), at(0, -.46), at(path.width + .04, -.315)];
        if (bridgePendantFits(f.c.y) && tubeClearsRouteEyes(brace,this.routeEyes,.014)) {
          this.tube(brace, .014, b); this.stats.bridgeMarkers++;
        }
      }
      for (const side of [-1, 1]) {
        const p = at(side * (path.width + .035), tunnel ? -.08 : -.375), group = new THREE.Group();
        if (!tunnel && (!bridgePendantFits(f.c.y) || !signClearsRouteEyes(p,f.tangent,.42,.14,this.routeEyes))) continue;
        group.position.set(p.x, p.y, p.z); group.rotation.y = Math.atan2(-side * r.x, -side * r.z); this.group.add(group);
        this.sign(tunnel ? .30 : .42, tunnel ? .19 : .14, (index * 3 + Math.floor(s / step)) % 16, 0, 0, 0, group);
      }
    }
  }

  private circuitPaths() {
    // Elevated tunnel: lining follows its exact banked local frame, including roof.
    for (let i = tunnelStart; i < tunnelEnd; i += 3) {
      const a = frames[i], b = frames[Math.min(tunnelEnd, i + 3)];
      const outline = (f: typeof a) => [[-f.width+.008,-.26],[-f.width+.008,f.roof-.292],[f.width-.008,f.roof-.292],[f.width-.008,-.26]];
      const aa = outline(a), bb = outline(b);
      for (let n = 0; n < 3; n++) this.panel([localPoint(a,aa[n+1][0],aa[n+1][1]),localPoint(b,bb[n+1][0],bb[n+1][1]),
        localPoint(a,aa[n][0],aa[n][1]),localPoint(b,bb[n][0],bb[n][1])],(Math.floor(i/3)+n*5)%16);
    }
    for (const side of [-1, 1]) this.tube(frames.map(f => localPoint(f, side * (f.width + .025), -.19)), .016, this.glow[side < 0 ? 0 : 1]);
    for (let i = 5; i < frames.length - 5; i += 7) {
      const f = frames[i], tunnel = i >= tunnelStart && i <= tunnelEnd;
      if (tunnel) {
        this.tube([localPoint(f, -f.width - .014, -.2), localPoint(f, -f.width - .014, f.roof - .28),
          localPoint(f, f.width + .014, f.roof - .28), localPoint(f, f.width + .014, -.2)], .011, this.glow[Math.floor(i / 7) % 6]);
        this.stats.tunnelRibs++;
      } else if (f.c.y > 1) {
        this.tube([localPoint(f, -f.width, -.24), localPoint(f, 0, -.40), localPoint(f, f.width, -.24)], .014, this.glow[Math.floor(i / 7) % 6]);
        this.stats.bridgeMarkers++;
      }
    }
  }
  update(dt: number, reducedMotion: boolean) {
    if (!reducedMotion) this.time += Math.min(.1, Math.max(0, dt));
    this.glow.forEach((m, i) => { m.emissiveIntensity = marketGlow(this.time, i, reducedMotion); this.lightLevels.value[i] = m.emissiveIntensity; });
  }
  dispose() { this.group.removeFromParent(); for (const r of this.resources) r.dispose(); this.resources.clear(); }
}
