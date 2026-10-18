import * as THREE from 'three';
import { NightMarket } from './night-market';
import { marketColors, nightMarketSky } from './night-market-art';
import { reuseMaterialSamples } from './material-optimizations';
import { bumpers, targets } from '../physics/table';
import type { PinballSimulation } from '../physics/simulation';
import { ArcadeTable } from './table-model';
import { ArcadeEffects } from './effects';
import { ElevatedCircuit } from './route-model';
import { CameraClearance, RouteCamera } from './route-camera';
import { ArcadePost } from './arcade-post';
import { RenderBudget, renderPixelRatio } from './render-budget';
import { ReferenceTable } from './reference-table';
import { courseBumpers, courseTargets } from '../physics/reference-course';

export interface ViewOrientation { heading: number; pitch: number }

export type CameraMode = 'fpv' | 'spin';

export class PinballView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(82, 1, 0.06, 160);
  readonly renderer: THREE.WebGLRenderer;
  readonly effects: ArcadeEffects;
  mode: CameraMode = 'fpv';
  manualOrientation: ViewOrientation | null = null;
  orientationInput?: (dt: number, follow: ViewOrientation) => ViewOrientation | null;
  readonly routeCamera = new RouteCamera();
  get heading() { return this.routeCamera.heading; }
  set heading(value: number) { this.routeCamera.heading = value; }
  highQuality = !window.matchMedia('(pointer: coarse)').matches && window.innerWidth > 760;
  readonly budget = new RenderBudget();
  private table: ArcadeTable | ReferenceTable;
  private post?: ArcadePost;
  private environment: THREE.WebGLRenderTarget;
  private circuit?: ElevatedCircuit;
  readonly nightMarket: NightMarket;
  private sky = nightMarketSky();
  private clearance = new CameraClearance();
  private previousMode: CameraMode = 'fpv';
  private look = new THREE.Vector3();
  private position = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private lastSubmitMs = 0;
  private shadowRevision = -1;
  private projectionFov = -1;
  private restoreEnvironment = () => {
    this.environment.dispose(); this.environment = this.createEnvironment();
    this.scene.environment = this.environment.texture;
    this.post?.dispose(); this.post = undefined; this.setQuality(this.highQuality);
  };

  constructor(readonly container: HTMLElement, circuitEnabled = false, reference = false) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x091025); this.scene.background = this.sky;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.setAttribute('aria-label', 'Illuminated orbital arcade pinball table');
    container.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.FogExp2(0x080e24, 0.009);
    this.scene.add(new THREE.HemisphereLight(0x93b5ed, 0x331a45, .75));
    const sun = new THREE.DirectionalLight(0xffd5ad, .75);
    sun.position.set(-7, 15, -6); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 18, bottom: -18, near: 0.1, far: 45 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x51b9de, .45); fill.position.set(8, 5, 10); this.scene.add(fill);
    this.environment = this.createEnvironment();
    this.scene.environment = this.environment.texture; this.scene.environmentIntensity = 0.65;
    this.renderer.domElement.addEventListener('webglcontextrestored', this.restoreEnvironment);
    this.table = reference ? new ReferenceTable(this.scene) : new ArcadeTable(this.scene, circuitEnabled); this.effects = new ArcadeEffects(this.scene);
    if (circuitEnabled && !reference) this.circuit = new ElevatedCircuit(this.scene);
    this.nightMarket = new NightMarket(this.scene, reference, circuitEnabled);
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material instanceof THREE.MeshStandardMaterial) reuseMaterialSamples(material); });
    this.setQuality(this.highQuality);
  }

  private createEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer), room = new THREE.Scene();
    const geometry = new THREE.BoxGeometry(), materials: THREE.Material[] = [];
    const wall = new THREE.MeshBasicMaterial({ color: 0x080e21, side: THREE.BackSide }); materials.push(wall);
    const shell = new THREE.Mesh(geometry, wall); shell.scale.set(30, 16, 40); room.add(shell);
    marketColors.forEach((color, i) => {
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2) }); materials.push(material);
      for (const side of [-1, 1]) { const sign = new THREE.Mesh(geometry, material); sign.position.set(side * 11, 1.5 + (i % 3) * 1.7, -12 + i * 4.6); sign.scale.set(.04, 2.0 + i % 2, .6); room.add(sign); }
      const canopy = new THREE.Mesh(geometry, material); canopy.position.set(-7 + i * 2.8, 6.5, -2 + i % 2 * 4); canopy.scale.set(.12, .025, 18); room.add(canopy);
    });
    const result = pmrem.fromScene(room, .015);
    geometry.dispose(); materials.forEach(material => material.dispose()); pmrem.dispose(); return result;
  }

  /** Eco keeps the same artwork and mechanics, with fewer pixels and no bloom/shadow pass. */
  setQuality(high: boolean) {
    this.budget.reset(); this.shadowRevision = -1;
    this.scene.environment = high ? this.environment.texture : null;
    this.highQuality = high; this.renderer.shadowMap.enabled = high; this.table.setQuality(high);
    // Render directly on older GPUs: an RGBA8 intermediate would clip HDR
    // before tone mapping and could never reach the glow's HDR threshold.
    if (high && !this.post && this.renderer.extensions.has('EXT_color_buffer_float')) this.post = new ArcadePost(this.renderer);
    if (!high && this.post) { this.post.dispose(); this.post = undefined; }
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    const ratio = renderPixelRatio(w, h, window.devicePixelRatio, this.highQuality, this.budget.scale);
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(w, h);
    this.post?.resize(this.renderer.domElement.width, this.renderer.domElement.height);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.projectionFov = -1;
  }

  async warmup() {
    try {
      if (this.post) this.renderer.setRenderTarget(this.post.target);
      await this.renderer.compileAsync(this.scene, this.camera);
    } finally { this.renderer.setRenderTarget(null); }
    await this.post?.warmup(this.renderer);
  }

  resetEffects() { this.effects.reset(); this.routeCamera.reset(); this.clearance.reset(); }

  render(sim: PinballSimulation, dt: number, frameMs = dt * 1000) {
    if (this.budget.sample(frameMs, this.lastSubmitMs, !sim.paused && !document.hidden && sim.phase !== 'over')) this.resize();
    const start = performance.now();
    const p = sim.position, v = sim.velocity, visualDt = sim.paused ? 0 : dt;
    this.table.update(sim, visualDt);
    this.nightMarket.update(visualDt, this.effects.reducedMotion);
    this.circuit?.update(sim);
    for (const event of sim.events) {
      if (event.type === 'bumper') { const b = sim.reference ? courseBumpers[event.index] : bumpers[event.index]; this.effects.hit(b.x, b.z, b.color, event.points, 'y' in b ? b.y : 0); }
      if (event.type === 'target') { const t = sim.reference ? courseTargets[event.index] : targets[event.index]; this.effects.hit('x' in t ? t.x : (t.ax + t.bx) / 2, 'z' in t ? t.z : (t.az + t.bz) / 2, 'color' in t ? t.color : 0xffb744, event.points, 'y' in t ? t.y : 0); }
      if (event.type === 'ramp') this.effects.hit(p.x, p.z, 0x79ecf7, event.points, p.y - .28);
      if (event.type === 'circuit') this.effects.hit(p.x, p.z, 0x79ecf7, event.points);
    }
    this.effects.update(visualDt, p, Math.hypot(v.x, v.z), sim.phase === 'playing' && !sim.paused);
    this.routeCamera.update(sim, visualDt, this.effects.reducedMotion);
    if (this.mode !== this.previousMode) { this.clearance.reset(); this.previousMode = this.mode; }
    this.manualOrientation = this.orientationInput?.(dt, this.routeCamera) ?? null;
    const orientation = this.manualOrientation ?? this.routeCamera;
    this.forward.set(Math.sin(orientation.heading), 0, -Math.cos(orientation.heading));
    this.camera.up.set(0, 1, 0);
    if (sim.phase === 'intro') {
      if (sim.reference) {
        // Decomposed from the reference's public ground homography: uniform
        // x/z scale .028, camera (240,1400,1400), focal length 1825.320805.
        this.camera.fov = 25.31910433535;
        this.camera.position.set(0, 39.2, 27.72); this.camera.lookAt(0, 0, .28);
      } else {
        this.camera.fov = 48;
        this.camera.position.set(0, this.camera.aspect < 1.2 ? 25 : 22, this.camera.aspect < 1.2 ? 16 : 19);
        this.camera.lookAt(0, 0, -.7);
      }
    } else if (this.mode === 'spin' && !this.manualOrientation) {
      this.camera.fov = 82; this.camera.position.set(p.x, p.y + 0.08, p.z);
      this.camera.quaternion.copy(this.table.ball.quaternion);
    } else {
      this.camera.fov = 82; this.position.set(p.x, p.y + 0.30, p.z);
      if (sim.reference?.guided && !this.manualOrientation) { this.camera.position.copy(this.position); this.camera.position.y -= .1; }
      else if (sim.reference?.guided) {
        // Manual full-circle views use the same swept near-plane envelope as
        // free play, including the guided branch that normally bypasses it.
        this.position.y -= .1;
        this.clearance.place(sim, this.position, this.camera.position, this.camera.aspect, 82, visualDt);
      }
      else this.clearance.place(sim, this.position, this.camera.position, this.camera.aspect, 82, visualDt);
      this.look.copy(this.camera.position).addScaledVector(this.forward, 8 * Math.cos(orientation.pitch));
      this.look.y += 8 * Math.sin(orientation.pitch); this.camera.lookAt(this.look);
    }
    // Keep the near-plane corners within the swept envelope at extreme aspect ratios.
    if (this.projectionFov !== this.camera.fov) {
      const tangent = Math.tan(this.camera.fov * Math.PI / 360);
      this.camera.near = Math.min(0.06, 0.24 / Math.sqrt(1 + tangent * tangent * (1 + this.camera.aspect * this.camera.aspect)));
      this.camera.updateProjectionMatrix(); this.projectionFov = this.camera.fov;
    }
    if (sim.phase === 'intro' && sim.reference) {
      // The reference principal point is above the image centre.
      this.camera.projectionMatrix.elements[9] = 2 * 374.28686481304 / 820 - 1;
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    }
    if (this.highQuality && this.shadowRevision !== this.table.shadowRevision) {
      this.renderer.shadowMap.needsUpdate = true; this.shadowRevision = this.table.shadowRevision;
    }
    this.renderer.info.reset();
    if (this.post) this.post.render(this.renderer, this.scene, this.camera); else this.renderer.render(this.scene, this.camera);
    this.lastSubmitMs = performance.now() - start;
  }

  dispose() {
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.restoreEnvironment);
    this.effects.dispose(); this.nightMarket.dispose(); this.sky.dispose(); this.circuit?.dispose(); this.table.dispose(); this.environment.dispose();
    this.post?.dispose(); this.renderer.dispose();
  }
}
