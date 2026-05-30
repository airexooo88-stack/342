import * as THREE from 'three';
import { Character, buildBotMesh } from './Character';
import type { IGameWorld, SoundEvent } from '../core/Types';
import type { TeamId } from '../core/Config';
import { BOT, DIFFICULTY, type DifficultyId } from '../core/Config';
import { Settings } from '../core/Settings';
import { Audio } from '../core/AudioSynth';
import { angleDelta, clamp, gaussian, randRange } from '../core/MathUtils';
import { SITE_A, SITE_B } from '../world/Layout';

export type BotRole = 'entry' | 'support' | 'sniper' | 'defender';
export type BotState =
  | 'Idle'
  | 'Patrol'
  | 'Search'
  | 'Attack'
  | 'TakeCover'
  | 'RotateToSite'
  | 'Plant'
  | 'Defuse'
  | 'Retreat';

const _eye = new THREE.Vector3();
const _toT = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _legA = new THREE.Vector3();

/**
 * AI combatant. Runs a layered state machine: perception (vision cone + LOS +
 * hearing) feeds memory, which drives high-level decisions (engage, search,
 * play the objective). Movement uses the waypoint graph for navigation.
 */
export class Bot extends Character {
  role: BotRole;
  assignedSite: 'A' | 'B';
  state: BotState = 'Idle';

  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private armR: THREE.Object3D;
  private walkPhase = 0;

  // navigation
  private path: THREE.Vector3[] = [];
  private pathIndex = 0;
  private destination: THREE.Vector3 | null = null;
  private repathTimer = 0;

  // perception / memory
  target: Character | null = null;
  private lastKnownEnemyPos: THREE.Vector3 | null = null;
  private lastSeenTime = -99;
  private heardTime = -99;
  private investigatePos: THREE.Vector3 | null = null;
  private reactionTimer = 0;
  private thinkTimer = 0;

  // combat
  private aimJitter = new THREE.Vector3();
  private strafeDir = 1;
  private strafeTimer = 0;
  private viewRange = 34;
  private fovCos = Math.cos((100 * Math.PI) / 180 / 2);
  // recoil / burst discipline so bots are not laser-accurate
  private sprayBloom = 0;
  private burstLeft = 0;
  private burstPause = 0;

  constructor(world: IGameWorld, team: TeamId, name: string, role: BotRole, site: 'A' | 'B') {
    super(world, team, name, BOT.radius, BOT.height, BOT.eyeHeight);
    this.isBot = true;
    this.role = role;
    this.assignedSite = site;
    this.armor = BOT.maxArmor;

    const built = buildBotMesh(team);
    this.mesh = built.group;
    this.legL = built.legL;
    this.legR = built.legR;
    this.armR = built.armR;
    world.scene.add(this.mesh);

    if (role === 'sniper') this.viewRange = 44;
    this.thinkTimer = Math.random() * 0.3;
  }

  private get diff() {
    return DIFFICULTY[(Settings.get().difficulty as DifficultyId) ?? 'normal'];
  }

  override resetForRound(pos: THREE.Vector3, yaw: number) {
    super.resetForRound(pos, yaw);
    this.armor = BOT.maxArmor;
    this.state = this.team === 'crew' ? 'RotateToSite' : 'Patrol';
    this.target = null;
    this.lastKnownEnemyPos = null;
    this.lastSeenTime = -99;
    this.heardTime = -99;
    this.investigatePos = null;
    this.path = [];
    this.pathIndex = 0;
    this.destination = null;
    this.repathTimer = 0;
    this.reactionTimer = 0;
    this.sprayBloom = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    if (this.mesh) this.mesh.visible = true;
  }

  // ---------------------------------------------------------------- hearing
  hear(ev: SoundEvent) {
    if (!this.alive) return;
    if (ev.team === this.team && ev.kind === 'step') return; // ignore allied steps
    const d = this.position.distanceTo(ev.pos);
    if (d > ev.radius) return;
    // enemy noise (or plant/defuse) becomes something to investigate
    if (ev.team !== this.team || ev.kind === 'plant' || ev.kind === 'defuse') {
      this.heardTime = this.world.time;
      this.investigatePos = ev.pos.clone();
      if (!this.lastKnownEnemyPos) this.lastKnownEnemyPos = ev.pos.clone();
    }
  }

  // ------------------------------------------------------------- perception
  private canSee(c: Character): boolean {
    this.eyePosition(_eye);
    c.centerMass(_toT);
    const dist = _eye.distanceTo(_toT);
    if (dist > this.viewRange) return false;
    _toT.sub(_eye).normalize();
    this.aimForward(_fwd);
    if (_fwd.dot(_toT) < this.fovCos) return false; // outside view cone
    return this.world.collision.lineOfSight(_eye, c.centerMass(_aim));
  }

  private aimForward(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
  }

  private perceive() {
    const enemies = this.world.enemiesOf(this.team);
    let best: Character | null = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (this.canSee(e)) {
        const d = this.position.distanceTo(e.position);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
    }
    if (best) {
      if (this.target !== best) {
        // new acquisition -> reaction delay
        this.reactionTimer = this.diff.reaction + randRange(0, 0.15);
      }
      this.target = best;
      this.lastKnownEnemyPos = best.position.clone();
      this.lastSeenTime = this.world.time;
    } else if (this.target && !this.canSee(this.target)) {
      this.target = null;
    }
  }

  // --------------------------------------------------------------- decisions
  private decide() {
    this.perceive();
    const now = this.world.time;

    if (this.target && this.target.alive) {
      this.state = this.health < 26 && Math.random() < 0.4 ? 'TakeCover' : 'Attack';
      return;
    }
    if (now - this.lastSeenTime < 4 && this.lastKnownEnemyPos) {
      this.setSearch(this.lastKnownEnemyPos);
      return;
    }
    if (now - this.heardTime < 5 && this.investigatePos) {
      this.setSearch(this.investigatePos);
      return;
    }
    this.decideObjective();
  }

  private setSearch(pos: THREE.Vector3) {
    if (this.state !== 'Search') {
      this.state = 'Search';
      this.setDestination(pos);
    }
  }

  private decideObjective() {
    if (this.team === 'crew') {
      // attackers
      if (this.world.bombPlanted && this.world.bombPos) {
        // hold around the planted core
        this.state = 'Patrol';
        if (!this.destination || this.destination.distanceTo(this.world.bombPos) > 6) {
          this.setDestination(this.holdSpotNear(this.world.bombPos));
        }
      } else {
        const site = this.assignedSite === 'A' ? SITE_A : SITE_B;
        if (this.position.distanceTo(site) < 2.5) {
          this.state = 'Plant';
          this.destination = null;
        } else {
          this.state = 'RotateToSite';
          if (!this.destination || this.arrived()) this.setDestination(site);
        }
      }
    } else {
      // defenders
      if (this.world.bombPlanted && this.world.bombPos) {
        this.state = 'Defuse';
        this.setDestination(this.world.bombPos);
      } else {
        this.state = 'Patrol';
        if (!this.destination || this.arrived()) {
          const site = this.assignedSite === 'A' ? SITE_A : SITE_B;
          this.setDestination(this.holdSpotNear(site));
        }
      }
    }
  }

  private holdSpotNear(center: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
      center.x + randRange(-3, 3),
      0,
      center.z + randRange(-3, 3)
    );
  }

  // -------------------------------------------------------------- navigation
  private setDestination(pos: THREE.Vector3) {
    this.destination = pos.clone();
    this.path = this.world.waypoints.findPath(this.position, pos);
    this.pathIndex = 0;
    this.repathTimer = randRange(1.5, 3);
  }

  private arrived(): boolean {
    return !!this.destination && this.position.distanceTo(this.destination) < 1.6;
  }

  private nextPathPoint(): THREE.Vector3 | null {
    while (this.pathIndex < this.path.length) {
      const p = this.path[this.pathIndex];
      const dx = p.x - this.position.x;
      const dz = p.z - this.position.z;
      if (dx * dx + dz * dz < 1.4 * 1.4) {
        this.pathIndex++;
        continue;
      }
      return p;
    }
    return null;
  }

  // ------------------------------------------------------------------ combat
  private updateCombat(dt: number) {
    const t = this.target;
    if (!t || !t.alive) return;

    // aim at target center with difficulty-scaled tracking error
    t.centerMass(_toT);
    const dist = this.position.distanceTo(t.position);
    _toT.x += this.aimJitter.x * (1 + dist * 0.02);
    _toT.y += this.aimJitter.y * (0.5 + dist * 0.01);
    _toT.z += this.aimJitter.z * (1 + dist * 0.02);

    this.eyePosition(_eye);
    _aim.copy(_toT).sub(_eye);
    const desiredYaw = Math.atan2(-_aim.x, -_aim.z);
    const horiz = Math.hypot(_aim.x, _aim.z);
    const desiredPitch = Math.atan2(_aim.y, horiz);

    // slower turn so bots can't instantly snap onto a target
    const turn = (3.2 + this.diff.aggression * 3) * dt;
    this.yaw += clamp(angleDelta(this.yaw, desiredYaw), -turn, turn);
    this.pitch += clamp(angleDelta(this.pitch, desiredPitch), -turn, turn);

    this.manageWeapon();
    const w = this.weapon;
    w.update(dt);

    // recover spray bloom / burst pause when not actively firing
    this.burstPause -= dt;

    if (this.reactionTimer > 0) {
      this.reactionTimer -= dt;
      this.sprayBloom = Math.max(0, this.sprayBloom - dt * 0.4);
      return;
    }

    this.aimForward(_fwd);
    _aim.normalize();
    const onTarget = _fwd.dot(_aim) > 0.985;
    const losClear = this.world.collision.lineOfSight(_eye, t.centerMass(new THREE.Vector3()));

    if (!(onTarget && losClear) || w.isMelee) {
      // not shooting this frame -> recover accuracy
      this.sprayBloom = Math.max(0, this.sprayBloom - dt * 5);
      if (!losClear) return;
    }

    if (this.burstPause > 0) {
      this.sprayBloom = Math.max(0, this.sprayBloom - dt * 5);
      return;
    }

    if (onTarget && losClear) {
      if (w.needsReload) {
        w.startReload();
        return;
      }
      if (this.burstLeft <= 0) this.burstLeft = this.burstSize(dist, w.def.automatic);
      const out = w.tryFire(true, false);
      if (out.fired) {
        this.fireShot(t);
        this.sprayBloom = Math.min(0.12, this.sprayBloom + 0.016);
        this.burstLeft--;
        if (this.burstLeft <= 0) {
          // pause between bursts (longer for easier bots) and let aim settle
          this.burstPause = randRange(0.25, 0.5) + (1 - this.diff.fireRateScale) * 0.5;
          this.sprayBloom *= 0.25;
        }
      }
    }
  }

  private burstSize(dist: number, automatic: boolean): number {
    if (!automatic) return 1; // semi-auto: one trigger pull at a time
    if (dist > 22) return 1 + Math.floor(randRange(0, 2)); // tap at range
    if (dist > 11) return 3 + Math.floor(randRange(0, 2));
    return 6 + Math.floor(randRange(0, 4)); // hose up close
  }

  private manageWeapon() {
    // pick the first ready (non-melee, has ammo) weapon; fall back to knife
    const cur = this.weapon;
    if (cur && !cur.isMelee && cur.ammo > 0 && !cur.reloading) return;
    let bestIdx = -1;
    for (let i = 0; i < this.weapons.length; i++) {
      const w = this.weapons[i];
      if (!w.isMelee && w.ammo > 0 && !w.reloading) {
        bestIdx = i;
        break;
      }
    }
    if (bestIdx >= 0) {
      if (bestIdx !== this.weaponIndex) this.switchTo(bestIdx);
    } else {
      // nothing loaded: start reloading the primary and switch to knife to fight
      const primary = this.weapons.find((w) => !w.isMelee && w.reserve > 0 && w.ammo <= 0);
      if (primary) primary.startReload();
      this.switchTo(this.weapons.length - 1);
    }
  }

  private playShootAudio(type: string, dist: number) {
    if (type === 'shotgun') Audio.shootShotgun(dist);
    else if (type === 'sniper') Audio.shootSniper(dist);
    else if (type === 'pistol') Audio.shootPistol(dist);
    else Audio.shootRifle(dist);
  }

  private fireShot(t: Character) {
    const def = this.weapon.def;
    this.eyePosition(_eye);
    const distToListener = this.position.distanceTo(this.world.listenerPos);
    const baseDir = t.centerMass(new THREE.Vector3()).sub(_eye).normalize();
    const dist = this.position.distanceTo(t.position);
    // total inaccuracy = difficulty error + spray bloom, scaled by range
    const err = (this.diff.aimError + this.sprayBloom) * (1 + dist * 0.012);
    const pellets = def.pellets ?? 1;

    for (let i = 0; i < pellets; i++) {
      _aim.copy(baseDir);
      _aim.x += gaussian() * err;
      _aim.y += gaussian() * err * 0.7;
      _aim.z += gaussian() * err;
      _aim.normalize();
      const res = this.world.fireBullet(_eye, _aim, this, def);
      _muzzle.copy(_eye).addScaledVector(_aim, 0.5);
      this.world.fx.spawnTracer(_muzzle, res.point);
      if (res.hitCharacter) this.world.fx.spawnBlood(res.point, res.normal);
      else if (res.hitWorld) this.world.fx.spawnImpact(res.point, res.normal);
    }
    _muzzle.copy(_eye).addScaledVector(baseDir, 0.5);
    this.world.fx.spawnMuzzleFlash(_muzzle, baseDir);
    this.playShootAudio(def.type, distToListener);
  }

  // ----------------------------------------------------------------- movement
  private moveToward(target: THREE.Vector3 | null, dt: number, speed: number, faceMove: boolean) {
    const sin = 0;
    if (!target) {
      // decelerate
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
    } else {
      _legA.copy(target).sub(this.position);
      _legA.y = 0;
      const d = _legA.length();
      if (d > 0.1) {
        _legA.normalize();
        this.velocity.x = _legA.x * speed;
        this.velocity.z = _legA.z * speed;
        if (faceMove) {
          const desiredYaw = Math.atan2(-_legA.x, -_legA.z);
          this.yaw += clamp(angleDelta(this.yaw, desiredYaw), -6 * dt, 6 * dt);
        }
      } else {
        this.velocity.x *= 0.8;
        this.velocity.z *= 0.8;
      }
    }
    void sin;
    this.velocity.y -= 18 * dt;
    this.grounded = this.world.collision.moveCharacter(
      this.position,
      this.velocity,
      this.radius,
      this.height,
      dt
    );

    // footstep hearing while running
    const hv = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && hv > 3) {
      if (Math.random() < dt * 2.5) {
        this.world.emitSound({ pos: this.position.clone(), radius: 11, team: this.team, kind: 'step' });
      }
    }
  }

  // ------------------------------------------------------------------- update
  update(dt: number) {
    if (!this.alive) return;

    // Bots stand down outside the live phase (buy phase / round end).
    if (!this.world.roundLive) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      this.velocity.y -= 18 * dt;
      this.grounded = this.world.collision.moveCharacter(
        this.position,
        this.velocity,
        this.radius,
        this.height,
        dt
      );
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
      this.syncMesh();
      return;
    }

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = randRange(0.18, 0.32);
      this.decide();
      // refresh aim jitter occasionally
      const e = this.diff.aimError;
      this.aimJitter.set(gaussian() * e * 6, gaussian() * e * 4, gaussian() * e * 6);
    }

    this.repathTimer -= dt;
    if (this.repathTimer <= 0 && this.destination) {
      this.setDestination(this.destination);
    }

    switch (this.state) {
      case 'Attack':
        this.tickAttack(dt);
        break;
      case 'TakeCover':
        this.tickTakeCover(dt);
        break;
      case 'Search':
        this.tickMoveState(dt, BOT.walkSpeed, true);
        if (this.arrived()) {
          this.investigatePos = null;
          this.state = 'Idle';
        }
        break;
      case 'RotateToSite':
        this.tickMoveState(dt, BOT.runSpeed, true);
        break;
      case 'Defuse':
        this.tickObjectiveMove(dt);
        break;
      case 'Plant':
        this.tickStand(dt);
        break;
      case 'Patrol':
        this.tickMoveState(dt, BOT.walkSpeed, true);
        break;
      case 'Idle':
      default:
        this.moveToward(null, dt, 0, false);
        break;
    }

    this.animate(dt);
    this.syncMesh();
  }

  private tickAttack(dt: number) {
    // strafe around while engaging
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = randRange(0.5, 1.2);
      if (Math.random() < 0.6) this.strafeDir *= -1;
    }
    const t = this.target;
    if (t) {
      // keep a fighting distance; strafe sideways
      _legA.copy(t.position).sub(this.position);
      _legA.y = 0;
      const dist = _legA.length();
      _legA.normalize();
      const side = new THREE.Vector3(-_legA.z, 0, _legA.x).multiplyScalar(this.strafeDir);
      const approach = dist > 14 ? 1 : dist < 6 ? -0.6 : 0;
      const moveTarget = this.position.clone()
        .addScaledVector(_legA, approach * 2)
        .addScaledVector(side, 2);
      const speed = this.diff.aggression > 0.5 ? BOT.runSpeed * 0.7 : BOT.walkSpeed;
      this.moveToward(moveTarget, dt, speed, false);
    } else {
      this.moveToward(null, dt, 0, false);
    }
    this.updateCombat(dt);
  }

  private tickTakeCover(dt: number) {
    // retreat toward nearest cover node away from the threat
    if (!this.destination || this.arrived()) {
      const covers = this.world.waypoints.nodesWithTag((t) => !!t.cover);
      let best = covers[0]?.pos ?? this.position;
      let bestScore = -Infinity;
      const threat = this.lastKnownEnemyPos ?? this.position;
      for (const c of covers) {
        const away = c.pos.distanceTo(threat);
        const near = -c.pos.distanceTo(this.position) * 0.5;
        const score = away + near;
        if (score > bestScore) {
          bestScore = score;
          best = c.pos;
        }
      }
      this.setDestination(best);
    }
    this.tickMoveState(dt, BOT.runSpeed, true);
    // still shoot if we can see the target
    if (this.target && this.target.alive) this.updateCombat(dt);
  }

  private tickMoveState(dt: number, speed: number, faceMove: boolean) {
    const next = this.nextPathPoint();
    this.moveToward(next ?? this.destination, dt, speed, faceMove);
  }

  private tickObjectiveMove(dt: number) {
    // move to bomb, then stand to defuse (Round handles the progress)
    if (this.world.bombPos) {
      if (this.position.distanceTo(this.world.bombPos) > 1.8) {
        this.tickMoveState(dt, BOT.runSpeed, true);
      } else {
        this.tickStand(dt);
        // face the core
        _legA.copy(this.world.bombPos).sub(this.position);
        this.yaw += clamp(angleDelta(this.yaw, Math.atan2(-_legA.x, -_legA.z)), -4 * dt, 4 * dt);
      }
    }
  }

  private tickStand(dt: number) {
    this.moveToward(null, dt, 0, false);
  }

  // ------------------------------------------------------------------- visuals
  private animate(dt: number) {
    const hv = Math.hypot(this.velocity.x, this.velocity.z);
    if (hv > 0.3) {
      this.walkPhase += dt * hv * 2.4;
      const sw = Math.sin(this.walkPhase) * 0.5;
      this.legL.rotation.x = sw;
      this.legR.rotation.x = -sw;
    } else {
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
    }
    // raise weapon arm when attacking
    const aiming = this.state === 'Attack' ? -1.2 : -0.2;
    this.armR.rotation.x += (aiming - this.armR.rotation.x) * Math.min(1, dt * 8);
  }

  private syncMesh() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
  }
}
