import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { bumpers, targets } from '../physics/table';
import type { PinballSimulation } from '../physics/simulation';
import { ArcadeTable } from './table-model';
import { ArcadeEffects } from './effects';
import { ElevatedCircuit } from './route-model';
import { CameraClearance, RouteCamera } from './route-camera';

export type CameraMode = 'fpv' | 'chase' | 'table' | 'spin';

export class PinballView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(82, 1, 0.06, 160);
  readonly renderer: THREE.WebGLRenderer;
  readonly effects: ArcadeEffects;
  mode: CameraMode = 'fpv';
  readonly routeCamera = new RouteCamera();
  get heading() { return this.routeCamera.heading; }
  set heading(value: number) { this.routeCamera.heading = value; }
  highQuality = !window.matchMedia('(pointer: coarse)').matches && window.innerWidth > 760;
  private table: ArcadeTable;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private output: OutputPass;
  private environment: THREE.WebGLRenderTarget;
  private circuit?: ElevatedCircuit;
  private clearance = new CameraClearance();
  private previousMode: CameraMode = 'fpv';
  private look = new THREE.Vector3();
  private position = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private restoreEnvironment = () => {
    this.environment.dispose(); this.environment = this.createEnvironment();
    this.scene.environment = this.environment.texture;
  };

  constructor(readonly container: HTMLElement, circuitEnabled = false) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x080e24);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.setAttribute('aria-label', 'Illuminated orbital arcade pinball table');
    container.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.FogExp2(0x080e24, 0.009);
    this.scene.add(new THREE.HemisphereLight(0xcbdfff, 0x23325e, 1.1));
    const sun = new THREE.DirectionalLight(0xffe7d2, 1.8);
    sun.position.set(-7, 15, -6); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 18, bottom: -18, near: 0.1, far: 45 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6bbfff, 1.0); fill.position.set(8, 5, 10); this.scene.add(fill);
    this.environment = this.createEnvironment();
    this.scene.environment = this.environment.texture; this.scene.environmentIntensity = 0.55;
    this.renderer.domElement.addEventListener('webglcontextrestored', this.restoreEnvironment);
    this.table = new ArcadeTable(this.scene); this.effects = new ArcadeEffects(this.scene);
    if (circuitEnabled) this.circuit = new ElevatedCircuit(this.scene);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.07, 0.1, 2.0);
    this.output = new OutputPass(); this.composer.addPass(this.bloom); this.composer.addPass(this.output);
    this.setQuality(this.highQuality);
  }

  private createEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment();
    const result = pmrem.fromScene(room, 0.04); room.dispose(); pmrem.dispose(); return result;
  }

  /** Eco keeps the same artwork and mechanics, with fewer pixels and no bloom/shadow pass. */
  setQuality(high: boolean) {
    this.highQuality = high; this.renderer.shadowMap.enabled = high;
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.needsUpdate = true;
      }
    });
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    const ratio = Math.min(window.devicePixelRatio, this.highQuality ? 1.5 : 1);
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(w, h);
    this.composer.setPixelRatio(ratio); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  resetEffects() { this.effects.reset(); this.routeCamera.reset(); this.clearance.reset(); }

  render(sim: PinballSimulation, dt: number) {
    const p = sim.position, v = sim.velocity, visualDt = sim.paused ? 0 : dt;
    this.table.update(sim, visualDt, this.mode);
    this.circuit?.update(sim);
    if (!this.effects.reducedMotion) this.table.animate(visualDt);
    for (const event of sim.events) {
      if (event.type === 'bumper') { const b = bumpers[event.index]; this.effects.hit(b.x, b.z, b.color, 100); }
      if (event.type === 'target') { const t = targets[event.index]; this.effects.hit(t.x, t.z, t.color, 250); }
      if (event.type === 'circuit') this.effects.hit(p.x, p.z, 0x79ecf7, event.points);
    }
    this.effects.update(visualDt, p, Math.hypot(v.x, v.z), sim.phase === 'playing' && !sim.paused);
    this.routeCamera.update(sim, visualDt, this.effects.reducedMotion);
    if (this.mode !== this.previousMode) { this.clearance.reset(); this.previousMode = this.mode; }
    this.forward.set(Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.camera.up.set(0, 1, 0);
    if (sim.phase === 'intro') {
      this.camera.fov = 48; this.camera.position.set(13, 19, 20); this.camera.lookAt(-3, 0, -1);
    } else if (this.mode === 'table') {
      this.camera.fov = 48;
      this.camera.position.set(0, Math.max(29, 16 / this.camera.aspect), 12); this.camera.lookAt(0, 0, -0.5);
    } else if (this.mode === 'chase') {
      this.camera.fov = 72;
      this.position.set(p.x, p.y + 2.6, p.z).addScaledVector(this.forward, -3.9);
      this.position.x = THREE.MathUtils.clamp(this.position.x, -5.45, 5.45);
      this.position.z = THREE.MathUtils.clamp(this.position.z, -10.1, 12.1);
      this.clearance.place(sim, this.position, this.camera.position, this.camera.aspect, 72, visualDt);
      this.look.set(p.x, p.y + 0.2, p.z).addScaledVector(this.forward, 2.0); this.camera.lookAt(this.look);
    } else if (this.mode === 'spin') {
      this.camera.fov = 82; this.camera.position.set(p.x, p.y + 0.08, p.z);
      this.camera.quaternion.copy(this.table.ball.quaternion);
    } else {
      this.camera.fov = 82; this.position.set(p.x, p.y + 0.30, p.z);
      this.clearance.place(sim, this.position, this.camera.position, this.camera.aspect, 82, visualDt);
      this.look.copy(this.camera.position).addScaledVector(this.forward, 8 * Math.cos(this.routeCamera.pitch));
      this.look.y += 8 * Math.sin(this.routeCamera.pitch); this.camera.lookAt(this.look);
    }
    // Keep the near-plane corners within the swept envelope at extreme aspect ratios.
    const tangent = Math.tan(this.camera.fov * Math.PI / 360);
    this.camera.near = Math.min(0.06, 0.24 / Math.sqrt(1 + tangent * tangent * (1 + this.camera.aspect * this.camera.aspect)));
    this.camera.updateProjectionMatrix();
    this.renderer.info.reset();
    if (this.highQuality) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.restoreEnvironment);
    this.effects.dispose(); this.circuit?.dispose(); this.table.dispose(); this.environment.dispose();
    this.bloom.dispose(); this.output.dispose(); this.composer.dispose(); this.renderer.dispose();
  }
}
