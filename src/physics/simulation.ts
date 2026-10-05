import RAPIER from '@dimforge/rapier3d-compat';
import { BALL_RADIUS, CIRCUIT_BONUS, FLIPPER_LENGTH, LAUNCH_POSITION, STEP, bumpers, flippers, rails, targets } from './table';
import { collisionData } from './route-geometry';
import { RouteState } from './route-state';

export type Phase = 'intro' | 'ready' | 'playing' | 'draining' | 'over';
export interface Controls { left: boolean; right: boolean; launch: boolean }
export interface Point { x: number; y: number; z: number }
export interface SimulationOptions { circuit?: boolean }
export type GameEvent =
  | { type: 'bumper'; index: number; points: number }
  | { type: 'target'; index: number; points: number }
  | { type: 'circuit'; points: number }
  | { type: 'flipper-hit'; index: number }
  | { type: 'launch' | 'drain' | 'over' | 'flipper' };

export class PinballSimulation {
  readonly world: RAPIER.World;
  readonly ball: RAPIER.RigidBody;
  readonly ballCollider: RAPIER.Collider;
  readonly queue = new RAPIER.EventQueue(true);
  readonly flipperBodies: RAPIER.RigidBody[] = [];
  readonly flipperAngles = flippers.map(f => f.rest as number);
  readonly controls: Controls = { left: false, right: false, launch: false };
  readonly events: GameEvent[] = [];
  readonly route = new RouteState();
  readonly circuitEnabled: boolean;
  readonly routeColliderHandles = new Set<number>();
  phase: Phase = 'intro';
  score = 0;
  balls = 3;
  charge = 0;
  time = 0;
  paused = false;
  private remainingDrainTime = 0;
  private accumulator = 0;
  private previousLaunch = false;
  private previousFlips = [false, false];
  private scoringColliders = new Map<number, { type: 'bumper' | 'target'; index: number }>();
  private flipperColliders = new Map<number, number>();

  static async create(options: SimulationOptions = {}) { await RAPIER.init(); return new PinballSimulation(options); }

  constructor(options: SimulationOptions = {}) {
    this.circuitEnabled = options.circuit ?? false;
    // Gravity along the board supplies the slope; the rendered tabletop stays level.
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 3.0 });
    this.world.timestep = STEP;
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(6.15, 0.2, 11.3).setTranslation(0, -0.2, 0).setFriction(0.035));

    for (const rail of rails) {
      const dx = rail.bx - rail.ax, dz = rail.bz - rail.az;
      const angle = -Math.atan2(dz, dx);
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.hypot(dx, dz) / 2, 0.75, 0.13)
        .setTranslation((rail.ax + rail.bx) / 2, 0.55, (rail.az + rail.bz) / 2)
        .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
        .setRestitution(0.8).setFriction(0.02));
    }
    for (const [index, bumper] of bumpers.entries()) {
      const collider = this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.52, bumper.radius)
        .setTranslation(bumper.x, 0.52, bumper.z).setRestitution(0.95)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
      this.scoringColliders.set(collider.handle, { type: 'bumper', index });
    }
    for (const [index, target] of targets.entries()) {
      const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.18, 0.55, 0.75)
        .setTranslation(target.x, 0.55, target.z).setRestitution(0.85)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
      this.scoringColliders.set(collider.handle, { type: 'target', index });
    }
    for (const [index, f] of flippers.entries()) {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(f.x, 0.28, f.z)
        .setRotation({ x: 0, y: Math.sin(f.rest / 2), z: 0, w: Math.cos(f.rest / 2) }));
      const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(FLIPPER_LENGTH / 2, 0.25, 0.23)
        .setTranslation(f.side * FLIPPER_LENGTH / 2, 0, 0).setRestitution(0.7).setFriction(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
      this.flipperColliders.set(collider.handle, index);
      this.flipperBodies.push(body);
    }
    this.ball = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(LAUNCH_POSITION.x, LAUNCH_POSITION.y, LAUNCH_POSITION.z)
      .setCcdEnabled(true).setLinearDamping(0.04).setAngularDamping(0.18)
      .enabledTranslations(true, true, true));
    this.ballCollider = this.world.createCollider(RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setDensity(1.0).setRestitution(0.65).setFriction(0.07)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), this.ball);
    this.ball.setEnabled(false);
    if (this.circuitEnabled) for (const data of collisionData) {
      const collider = this.world.createCollider(RAPIER.ColliderDesc.trimesh(data.vertices, data.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
        .setFriction(0.02).setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min));
      this.routeColliderHandles.add(collider.handle);
    }
  }

  get position(): Point { return this.ball.translation(); }
  get velocity(): Point { return this.ball.linvel(); }

  start() {
    this.score = 0; this.balls = 3; this.time = 0; this.paused = false;
    this.events.length = 0; this.accumulator = 0;
    this.controls.left = this.controls.right = this.controls.launch = false;
    this.previousLaunch = false; this.previousFlips = [false, false];
    this.route.reset(true);
    this.prepareBall();
  }

  private prepareBall() {
    this.route.reset();
    this.ball.setTranslation(LAUNCH_POSITION, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.ball.setEnabled(false);
    this.phase = 'ready'; this.charge = 0; this.previousLaunch = false;
  }

  launch(power = this.charge) {
    if (this.phase !== 'ready' || this.paused) return;
    this.ball.setEnabled(true);
    this.ball.setTranslation(LAUNCH_POSITION, true);
    this.ball.setLinvel({ x: 0, y: 0, z: -(14.5 + Math.min(1, Math.max(0, power)) * 7) }, true);
    this.ball.setAngvel({ x: -30, y: 0, z: 0 }, true);
    this.phase = 'playing'; this.charge = 0;
    this.events.push({ type: 'launch' });
  }

  releaseControls() {
    this.controls.left = this.controls.right = this.controls.launch = false;
    this.previousLaunch = false;
  }

  update(dt: number) {
    if (this.paused || this.phase === 'intro' || this.phase === 'over') return;
    this.accumulator += Math.max(0, Math.min(dt, 0.1));
    while (this.accumulator + 1e-10 >= STEP) {
      this.step(); this.accumulator -= STEP;
    }
  }

  step() {
    if (this.paused || this.phase === 'intro' || this.phase === 'over') return;
    this.time += STEP;
    if (this.phase === 'ready') {
      if (this.controls.launch) this.charge = Math.min(1, this.charge + STEP / 1.0);
      if (this.previousLaunch && !this.controls.launch) this.launch();
      this.previousLaunch = this.controls.launch;
    }
    for (const [i, f] of flippers.entries()) {
      const pressed = i === 0 ? this.controls.left : this.controls.right;
      const target = pressed ? f.raised : f.rest;
      const delta = target - this.flipperAngles[i];
      this.flipperAngles[i] += Math.sign(delta) * Math.min(Math.abs(delta), (pressed ? 13 : 8) * STEP);
      const angle = this.flipperAngles[i];
      this.flipperBodies[i].setNextKinematicRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
      if (pressed && !this.previousFlips[i]) this.events.push({ type: 'flipper' });
      this.previousFlips[i] = pressed;
    }
    const previousPosition = this.position;
    this.world.step(this.queue);
    this.queue.drainCollisionEvents((a, b, started) => {
      if (!started || this.phase !== 'playing') return;
      const other = a === this.ballCollider.handle ? b : b === this.ballCollider.handle ? a : undefined;
      if (other === undefined) return;
      const flipper = this.flipperColliders.get(other);
      if (flipper !== undefined) this.events.push({ type: 'flipper-hit', index: flipper });
      const item = this.scoringColliders.get(other);
      if (!item) return;
      const center = item.type === 'bumper' ? bumpers[item.index] : targets[item.index];
      const p = this.position;
      const dx = p.x - center.x, dz = p.z - center.z;
      const d = Math.max(0.001, Math.hypot(dx, dz));
      this.ball.applyImpulse({ x: dx / d * 0.40, y: 0.013, z: dz / d * 0.40 }, true);
      const points = item.type === 'bumper' ? 100 : 250;
      this.score += points;
      this.events.push({ type: item.type, index: item.index, points });
    });
    if (this.phase === 'playing') {
      if (this.circuitEnabled && this.route.update(previousPosition, this.position, STEP)) {
        this.score += CIRCUIT_BONUS; this.events.push({ type: 'circuit', points: CIRCUIT_BONUS });
      }
      // Bound rare energetic contacts without smoothing away collisions.
      const v = this.velocity, speed = Math.hypot(v.x, v.z);
      if (speed > 28) this.ball.setLinvel({ x: v.x * 28 / speed, y: v.y, z: v.z * 28 / speed }, true);
      const p = this.position;
      if (p.z > 11.15 || p.y < -2 || Math.abs(p.x) > 7.5) {
        this.route.reset();
        this.ball.setEnabled(false); this.balls--;
        this.events.push({ type: 'drain' });
        if (!this.balls) { this.phase = 'over'; this.events.push({ type: 'over' }); }
        else { this.phase = 'draining'; this.remainingDrainTime = 0.9; }
      }
    } else if (this.phase === 'draining') {
      this.remainingDrainTime -= STEP;
      if (this.remainingDrainTime <= 0) this.prepareBall();
    }
  }

  dispose() { this.queue.free(); this.world.free(); }
}
