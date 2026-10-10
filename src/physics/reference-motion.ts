import RAPIER from '@dimforge/rapier3d-compat';
import { BALL_RADIUS, STEP } from './table';
import type { GameEvent, Point } from './simulation';
import type { RouteState } from './route-state';
import { COURSE_GRAVITY, courseBumpers, courseFlippers, courseGate, courseLaunch, coursePosts, courseRails, courseRamps, courseSaucer, courseSpinners, courseTargets, courseTunnels, courseWell, coursePortals, deckData, deckHeight, deckRails, fieldData, pathFrame, type CoursePath, type CourseSegment } from './reference-course';
interface Contact {
  kind: 'wall' | 'bumper' | 'target' | 'sling' | 'post';
  index: number;
  x: number;
  z: number;
  nx?: number;
  nz?: number;
  kick?: number;
}
/** Reference ramps use a constrained rider; the free ball and both flipper
* pairs remain in Rapier. Paths, entrances and exits use the same geometry as
* rendering. Weak shots roll back without receiving a completion award. */
export class ReferenceMotion {
  readonly contacts = new Map<number, Contact>();
  readonly flipperBodies: RAPIER.RigidBody[] = [];
  readonly flipperHandles = new Map<number, number>();
  readonly targetColliders: RAPIER.Collider[] = [];
  readonly targetLit = courseTargets.map(() => false);
  readonly targetDown = courseTargets.map(() => false);
  readonly targetReset = courseTargets.map(() => 0);
  readonly spinnerAngles = [0, 0, 0];
  private spinnerSpeeds = [0, 0, 0];
  private active?: CoursePath;
  private progress = 0;
  private speed = 0;
  private cooldown = 0;
  private hold = 0;
  private held?: Point;
  private holdExit?: Point;
  private holdVelocity?: Point;
  private ball!: RAPIER.RigidBody;
  private collider!: RAPIER.Collider;
  private savedGroups = 0;
  private deck = false;
  private gate: RAPIER.Collider;
  get gateClosed() { return this.gate.isEnabled(); }
  get guided() { return !!this.active || this.hold > 0; }
  get path() { return this.active; }
  get routeDistance() { return this.progress; }
  get onDeck() { return this.deck; }
  get name() { return this.active?.name || (this.deck ? 'UPPER DECK' : ''); }
  constructor(private world: RAPIER.World, private route: RouteState) {
    for (const mesh of [fieldData, deckData])
      world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.035).setRestitution(.05));
    const rail = (s: CourseSegment, index: number, target = false) => {
      const dx = s.bx - s.ax, dz = s.bz - s.az, length = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx);
      const c = world.createCollider(RAPIER.ColliderDesc.cuboid(length / 2, s.height / 2, s.thickness)
        .setTranslation((s.ax + s.bx) / 2, s.y + s.height / 2, (s.az + s.bz) / 2)
        .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
        .setRestitution(s.restitution).setFriction(.02).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
      this.contacts.set(c.handle, { kind: target ? 'target' : s.kick ? 'sling' : 'wall', index, x: (s.ax + s.bx) / 2, z: (s.az + s.bz) / 2, nx: -dz / length, nz: dx / length, kick: s.kick });
      if (target)
        this.targetColliders.push(c);
      return c;
    };
    [...courseRails, ...deckRails].forEach((s, i) => rail(s, i));
    this.gate = rail(courseGate, -1);
    this.gate.setEnabled(false);
    courseTargets.forEach((s, i) => rail(s, i, true));
    courseBumpers.forEach((b, index) => {
      const c = world.createCollider(RAPIER.ColliderDesc.cylinder(b.height / 2, b.radius).setTranslation(b.x, b.y + b.height / 2, b.z)
        .setRestitution(.6).setFriction(.03).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
      this.contacts.set(c.handle, { kind: 'bumper', index, x: b.x, z: b.z, kick: b.kick });
    });
    coursePosts.forEach((b, index) => {
      const c = world.createCollider(RAPIER.ColliderDesc.cylinder(.15, b.radius).setTranslation(b.x, .15, b.z)
        .setRestitution(.6).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
      this.contacts.set(c.handle, { kind: 'post', index, x: b.x, z: b.z });
    });
    courseFlippers.forEach((f, index) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(f.x, f.y + BALL_RADIUS, f.z)
        .setRotation({ x: 0, y: Math.sin(f.rest / 2), z: 0, w: Math.cos(f.rest / 2) }));
      const c = world.createCollider(RAPIER.ColliderDesc.capsule(f.length / 2, f.radius).setTranslation(f.side * f.length / 2, 0, 0)
        .setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setRestitution(.3).setFriction(.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
      this.flipperBodies.push(body);
      this.flipperHandles.set(c.handle, index);
    });
  }
  attach(ball: RAPIER.RigidBody, collider: RAPIER.Collider) { this.ball = ball; this.collider = collider; this.savedGroups = collider.collisionGroups(); }
  reset() {
    if (this.ball) {
      this.ball.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      this.collider.setCollisionGroups(this.savedGroups);
    }
    this.active = undefined;
    this.hold = 0;
    this.cooldown = 0;
    this.deck = false;
    this.gate.setEnabled(false);
    this.targetLit.fill(false);
    this.targetDown.fill(false);
    this.targetReset.fill(0);
    this.spinnerSpeeds.fill(0);
    this.spinnerAngles.fill(0);
    this.targetColliders.forEach(c => c.setEnabled(true));
  }
  release() {
    this.active = undefined;
    this.hold = 0;
    this.route.phase = 'free';
    this.route.nextGate = 0;
    this.cooldown = .4;
    this.ball.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.collider.setCollisionGroups(this.savedGroups);
  }
  private capture(path: CoursePath, s: number, speed: number) {
    this.active = path;
    this.progress = s;
    this.speed = speed;
    this.deck = false;
    this.ball.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.collider.setCollisionGroups(0);
    this.route.phase = path.tunnel ? 'tunnel' : 'ascent';
    this.route.nextGate = 1;
  }
  private finish(path: CoursePath, events: GameEvent[]) {
    const end = pathFrame(path, path.length), speed = Math.max(path.deck ? 3.36 : 4.2, Math.min(this.speed, path.deck ? 12.6 : 19.6));
    this.release();
    this.deck = path.deck;
    this.ball.setTranslation(end.c, true);
    let velocity = { x: end.tangent.x * speed, y: 0, z: end.tangent.z * speed };
    if (path.tunnel) {
      if (path.exitKind === 'lane') {
        this.ball.setTranslation({ ...courseLaunch, z: courseLaunch.z - 1.12 }, true);
        velocity = { x: 0, y: 0, z: -39 };
      }
      else if (path.exitKind === 'saucer') {
        this.ball.setTranslation({ ...courseSaucer, y: BALL_RADIUS + .015 }, true);
        this.scoop(courseSaucer, { x: 7, y: 0, z: -18 }, 1);
      }
      else
        velocity = path.exitVelocity;
    }
    this.ball.setLinvel(velocity, true);
    this.route.completions++;
    this.route.completionFlash = 1.5;
    events.push({ type: 'ramp', name: path.name, points: path.pointsAward });
  }
  private scoop(p: Point, velocity: Point, seconds: number, exit = p) {
    this.held = { ...p, y: BALL_RADIUS - .14 };
    this.holdExit = exit;
    this.holdVelocity = velocity;
    this.hold = seconds;
    this.ball.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.collider.setCollisionGroups(0);
  }
  beforeStep(events: GameEvent[]) {
    const p = this.ball.translation();
    const gateSide = (p.x - courseGate.ax) * courseGate.nx + (p.z - courseGate.az) * courseGate.nz;
    // Let a launch pass the whole ball through before closing. Keep the gate
    // enabled during a return contact, so CCD cannot tunnel back into the lane.
    if (gateSide < -.01) this.gate.setEnabled(false);
    else if (gateSide > BALL_RADIUS + courseGate.thickness + .005) this.gate.setEnabled(true);
    this.cooldown = Math.max(0, this.cooldown - STEP);
    this.route.completionFlash = Math.max(0, this.route.completionFlash - STEP);
    this.targetReset.forEach((time, i) => { if (time > 0) {
      this.targetReset[i] = Math.max(0, time - STEP);
      if (this.targetReset[i] === 0) {
        this.targetDown[i] = false;
        this.targetLit[i] = false;
        this.targetColliders[i].setEnabled(true);
      }
    } });
    this.spinnerAngles.forEach((angle, i) => { this.spinnerAngles[i] = angle + this.spinnerSpeeds[i] * STEP; this.spinnerSpeeds[i] *= Math.exp(-.75 * STEP); });
    if (this.hold > 0) {
      this.hold -= STEP;
      if (this.hold <= 0) {
        const exit = this.holdExit!, v = this.holdVelocity!;
        this.release();
        this.cooldown = 1;
        this.ball.setTranslation({ ...exit, y: BALL_RADIUS + .015 }, true);
        this.ball.setLinvel(v, true);
      }
      else
        this.ball.setNextKinematicTranslation(this.held!);
      return;
    }
    const path = this.active;
    if (!path)
      return;
    const f = pathFrame(path, this.progress);
    this.speed = path.tunnel ? 12.04 : this.speed + (COURSE_GRAVITY * f.tangent.z - Math.sign(this.speed) * 1.68) * STEP;
    this.progress += this.speed * STEP;
    if (this.progress >= path.length) {
      this.finish(path, events);
      return;
    }
    if (this.progress <= 0) {
      const p = path.points[0], v = pathFrame(path, 0).tangent, speed = Math.abs(this.speed);
      this.release();
      this.ball.setTranslation(p, true);
      this.ball.setLinvel({ x: -v.x * speed, y: 0, z: -v.z * speed }, true);
      return;
    }
    const frame = pathFrame(path, this.progress);
    this.ball.setNextKinematicTranslation(frame.c);
    this.route.projection.s = this.progress;
    this.route.projection.index = frame.index;
    this.route.projection.vertical = 0;
    this.route.phase = path.tunnel ? 'tunnel' : this.progress < 2.4 ? 'ascent' : this.progress > path.length - 2.4 && !path.deck ? 'return' : 'bridge';
  }
  afterStep(previous: Point, events: GameEvent[]) {
    if (this.guided)
      return;
    const p = this.ball.translation(), v = this.ball.linvel();
    this.deck = p.y > deckHeight - .1 && p.x > .1 && p.z < -4.9;
    if (p.y > BALL_RADIUS + .35 || this.cooldown > 0 || this.deck)
      return;
    // Sweep the mouth sensor, so a fast shot cannot step over the entrance.
    for (const path of courseRamps) {
      const mouth = path.points[8], a = pathFrame(path, 0).tangent, dx = p.x - previous.x, dz = p.z - previous.z;
      const denom = dx * dx + dz * dz, u = denom > 0 ? Math.max(0, Math.min(1, ((mouth.x - previous.x) * dx + (mouth.z - previous.z) * dz) / denom)) : 0;
      if (Math.hypot(previous.x + dx * u - mouth.x, previous.z + dz * u - mouth.z) < .448 && v.x * a.x + v.z * a.z > 4.2) {
        this.capture(path, path.lengths[8], Math.hypot(v.x, v.z) * .95);
        return;
      }
    }
    for (const path of courseTunnels)
      if (Math.hypot(p.x - path.points[0].x, p.z - path.points[0].z) < .35) {
        this.capture(path, 0, 12.04);
        return;
      }
    const trough = courseTunnels[2];
    for (let i = 1; i < trough.points.length; i++)
      if (Math.hypot(p.x - trough.points[i].x, p.z - trough.points[i].z) < .40) {
        this.capture(trough, trough.lengths[i], 12.04);
        return;
      }
    if (Math.hypot(p.x - courseSaucer.x, p.z - courseSaucer.z) < .43) {
      this.scoop(courseSaucer, { x: 7, y: 0, z: -18 }, 1);
      events.push({ type: 'ramp', name: 'SLOT SCOOP', points: 500 });
      return;
    }
    const wx = courseWell.x - p.x, wz = courseWell.z - p.z, d = Math.hypot(wx, wz);
    if (d < .35) {
      this.scoop(courseWell, { x: 8, y: 0, z: -15 }, .9);
      events.push({ type: 'ramp', name: 'GRAVITY WELL', points: 5000 });
      return;
    }
    if (d < courseWell.radius && d > 0) {
      const k = 1 - d / courseWell.radius;
      this.ball.setLinvel({ x: v.x + (wx / d * 30 - wz / d * 10) * k * STEP, y: v.y, z: v.z + (wz / d * 30 + wx / d * 10) * k * STEP }, true);
    }
    for (const [i, portal] of coursePortals.entries())
      if (Math.hypot(p.x - portal.x, p.z - portal.z) < .34) {
        this.scoop(portal, { x: i ? 6 : -6, y: 0, z: 10 }, .3, coursePortals[1 - i]);
        events.push({ type: 'ramp', name: 'WORMHOLE', points: 1500 });
        return;
      }
    courseSpinners.forEach((s, i) => { if (p.x >= s.a.x && p.x <= s.b.x && (previous.z - s.a.z) * (p.z - s.a.z) <= 0 && Math.abs(v.z) > 1) {
      this.spinnerSpeeds[i] = Math.min(60, this.spinnerSpeeds[i] + Math.abs(v.z) * 2);
      events.push({ type: 'ramp', name: 'SPINNER', points: 100 });
    } });
  }
  collision(handle: number, previousVelocity: Point): GameEvent | undefined {
    if (this.guided)
      return;
    const flipper = this.flipperHandles.get(handle);
    if (flipper !== undefined)
      return { type: 'flipper-hit', index: flipper };
    const c = this.contacts.get(handle);
    if (!c)
      return;
    const p = this.ball.translation(), v = this.ball.linvel();
    if (c.kind === 'bumper' || c.kind === 'sling') {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
      const normal = v.x * nx + v.z * nz, kick = Math.max(0, (c.kick || 0) - normal);
      this.ball.setLinvel({ x: v.x + nx * kick, y: v.y, z: v.z + nz * kick }, true);
    }
    if (c.kind === 'bumper')
      return { type: 'bumper', index: c.index, points: courseBumpers[c.index].points };
    if (c.kind === 'target') {
      const i = c.index;
      if (this.targetLit[i] || this.targetDown[i])
        return;
      this.targetLit[i] = true;
      if (courseTargets[i].kind.includes('drop')) {
        this.targetDown[i] = true;
        this.targetColliders[i].setEnabled(false);
        this.targetReset[i] = 3;
      }
      return { type: 'target', index: i, points: courseTargets[i].y > 0 ? 300 : 150 };
    }
    const speed = Math.abs(previousVelocity.x * (c.nx || 0) + previousVelocity.z * (c.nz || 0));
    if (speed > 1.4 || c.kind === 'sling')
      return { type: 'wall', speed: Math.max(speed, c.kick || 0) };
  }
  lookAhead() { return this.active ? pathFrame(this.active, this.progress + (this.speed < 0 ? -1 : 1) * 1.1).c : undefined; }
}
