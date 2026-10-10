import * as THREE from 'three';
import { glowTexture, scoreTexture } from './artwork';
import type { Point } from '../physics/simulation';

const capacity = 192;
interface Popup { sprite: THREE.Sprite; life: number; origin: number }
interface Ring { mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>; life: number }

/** A bounded visual pool; these effects never apply forces or change game rules. */
export class ArcadeEffects {
  readonly group = new THREE.Group();
  private motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  private motionReduced = this.motionPreference.matches;
  get reducedMotion() {
    const reduced = this.motionPreference.matches;
    if (reduced && !this.motionReduced) this.reset();
    this.motionReduced = reduced;
    return reduced;
  }
  private positions = new Float32Array(capacity * 3).fill(1000);
  private colors = new Float32Array(capacity * 3);
  private velocities = new Float32Array(capacity * 3);
  private life = new Float32Array(capacity);
  private lifetime = new Float32Array(capacity);
  private baseColors = new Float32Array(capacity * 3);
  private geometry = new THREE.BufferGeometry();
  private points: THREE.Points;
  private activeParticles = 0;
  private dirty = false;
  private particleTexture = glowTexture();
  private particleMaterial = new THREE.PointsMaterial({ size: 0.24, map: this.particleTexture, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  private cursor = 0;
  private trailTime = 0;
  private popups: Popup[] = [];
  private rings: Ring[] = [];
  private scoreMaps = [scoreTexture(100), scoreTexture(250), scoreTexture(750)];
  private color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(this.geometry, this.particleMaterial); this.points.frustumCulled = false; this.points.visible = false; this.group.add(this.points);
    for (let n = 0; n < 6; n++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.scoreMaps[0], transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
      sprite.visible = false; sprite.scale.set(2.2, 0.83, 1); sprite.renderOrder = 4; this.group.add(sprite); this.popups.push({ sprite, life: 0, origin: 0 });
    }
    for (let n = 0; n < 8; n++) {
      const material = new THREE.MeshBasicMaterial({ color: 0x5de8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 6, 64), material);
      mesh.rotation.x = -Math.PI / 2; mesh.visible = false; this.group.add(mesh); this.rings.push({ mesh, life: 0 });
    }
    scene.add(this.group);
  }

  private particle(p: Point, color: number, lifetime: number, vx: number, vy: number, vz: number) {
    const i = this.cursor++ % capacity, k = i * 3;
    if (this.life[i] <= 0) this.activeParticles++;
    this.dirty = true; this.points.visible = true;
    this.positions[k] = p.x; this.positions[k + 1] = p.y; this.positions[k + 2] = p.z;
    this.velocities[k] = vx; this.velocities[k + 1] = vy; this.velocities[k + 2] = vz;
    this.color.setHex(color);
    this.baseColors[k] = this.color.r; this.baseColors[k + 1] = this.color.g; this.baseColors[k + 2] = this.color.b;
    this.life[i] = this.lifetime[i] = lifetime;
  }

  hit(x: number, z: number, color: number, points: number) {
    if (this.reducedMotion) return;
    for (let n = 0; n < 20; n++) {
      const a = n / 20 * Math.PI * 2, speed = 1.7 + (n % 4) * 0.55;
      this.particle({ x, y: 0.9, z }, color, 0.5 + (n % 5) * 0.09, Math.cos(a) * speed, 1 + (n % 3) * 0.7, Math.sin(a) * speed);
    }
    const ring = this.rings.find(r => r.life === 0) || this.rings[0];
    ring.life = 0.85; ring.mesh.position.set(x, 0.04, z); ring.mesh.material.color.setHex(color); ring.mesh.visible = true;
    const popup = this.popups.find(p => p.life === 0) || this.popups[0];
    popup.life = 1.1; popup.origin = 2.0; popup.sprite.position.set(x, popup.origin, z);
    popup.sprite.material.map = this.scoreMaps[points === 750 ? 2 : points === 250 ? 1 : 0]; popup.sprite.material.color.setHex(color); popup.sprite.visible = true;
  }

  update(dt: number, position: Point, speed: number, playing: boolean) {
    if (this.reducedMotion) return;
    if (playing && speed > 3.5) {
      this.trailTime += dt;
      while (this.trailTime > 0.035) {
        this.trailTime -= 0.035;
        this.particle(position, 0x77e9ff, 0.34, 0, 0.06, 0);
      }
    } else this.trailTime = 0;
    if (this.activeParticles > 0 && (dt > 0 || this.dirty)) for (let i = 0; i < capacity; i++) {
      const k = i * 3;
      if (this.life[i] <= 0) { this.positions[k + 1] = 1000; continue; }
      this.life[i] = Math.max(0, this.life[i] - dt);
      if (this.life[i] === 0) { this.activeParticles--; this.positions[k + 1] = 1000; continue; }
      const alpha = this.life[i] / this.lifetime[i];
      this.positions[k] += this.velocities[k] * dt; this.positions[k + 1] += this.velocities[k + 1] * dt; this.positions[k + 2] += this.velocities[k + 2] * dt;
      this.velocities[k + 1] -= dt * 2.5;
      this.colors[k] = this.baseColors[k] * alpha; this.colors[k + 1] = this.baseColors[k + 1] * alpha; this.colors[k + 2] = this.baseColors[k + 2] * alpha;
    }
    if (this.activeParticles > 0 && (dt > 0 || this.dirty)) {
      this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.color.needsUpdate = true;
    }
    this.points.visible = this.activeParticles > 0; this.dirty = false;
    for (const ring of this.rings) if (ring.life > 0) {
      ring.life = Math.max(0, ring.life - dt); const progress = 1 - ring.life / 0.85;
      ring.mesh.scale.setScalar(0.8 + progress * 2.4); ring.mesh.material.opacity = (1 - progress) * 0.7; ring.mesh.visible = ring.life > 0;
    }
    for (const popup of this.popups) if (popup.life > 0) {
      popup.life = Math.max(0, popup.life - dt); const progress = 1 - popup.life / 1.1;
      popup.sprite.position.y = popup.origin + progress * 1.2; popup.sprite.material.opacity = Math.min(1, popup.life * 2); popup.sprite.visible = popup.life > 0;
    }
  }

  reset() {
    this.life.fill(0); this.positions.fill(1000); this.trailTime = 0; this.activeParticles = 0; this.points.visible = false; this.dirty = false;
    this.geometry.attributes.position.needsUpdate = true;
    for (const p of this.popups) { p.life = 0; p.sprite.visible = false; }
    for (const r of this.rings) { r.life = 0; r.mesh.visible = false; }
  }

  dispose() {
    this.group.removeFromParent(); this.geometry.dispose(); this.particleMaterial.dispose(); this.particleTexture.dispose();
    for (const map of this.scoreMaps) map.dispose();
    for (const p of this.popups) p.sprite.material.dispose();
    for (const r of this.rings) { r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
  }
}
