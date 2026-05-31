import * as THREE from 'three';
import { Character } from './Character';
import type { IGameWorld } from '../core/Types';
import { PLAYER } from '../core/Config';
import { Input } from '../core/Input';
import { Settings } from '../core/Settings';
import { Audio } from '../core/AudioSynth';
import { Viewmodel } from '../weapons/Viewmodel';
import { clamp, damp, moveTowards } from '../core/MathUtils';

const _wish = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export interface PlayerFeedback {
  onHitConfirm?: (kill: boolean, headshot: boolean) => void;
  onTookDamage?: (fromDir: THREE.Vector3, amount: number) => void;
}

/**
 * The human player: first-person camera controller with movement, shooting,
 * recoil, crouch/sprint/jump and ADS.
 */
export class Player extends Character {
  camera: THREE.PerspectiveCamera;
  viewmodel: Viewmodel;
  input: Input;
  feedback: PlayerFeedback = {};

  ads = false;
  frozen = false; // true during buy phase (can look, can't move/shoot)
  money = 0;
  private recoilYaw = 0;
  private recoilPitch = 0;
  private targetFov: number;
  private currentFov: number;
  private stepDistance = 0;
  private shakeT = 0;
  private shakeMag = 0;

  constructor(world: IGameWorld, camera: THREE.PerspectiveCamera, input: Input) {
    super(world, 'crew', 'You', PLAYER.radius, PLAYER.height, PLAYER.eyeHeight);
    this.camera = camera;
    this.input = input;
    this.viewmodel = new Viewmodel();
    this.armor = PLAYER.maxArmor;
    this.targetFov = this.currentFov = Settings.get().fov;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
    this.viewmodel.setWeapon(this.weapon.def);
  }

  setTeam(team: 'crew' | 'guard') {
    this.team = team;
  }

  override resetForRound(pos: THREE.Vector3, yaw: number) {
    super.resetForRound(pos, yaw);
    this.armor = PLAYER.maxArmor;
    this.recoilYaw = this.recoilPitch = 0;
    this.ads = false;
    this.viewmodel.setWeapon(this.weapon.def);
  }

  private handleLook() {
    const sens = Settings.get().sensitivity * 0.0022;
    this.yaw -= this.input.mouseDX * sens;
    this.pitch -= this.input.mouseDY * sens;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = clamp(this.pitch, -lim, lim);
  }

  private handleWeaponSwitch() {
    if (this.input.pressed('Digit1')) this.selectSlot(1);
    if (this.input.pressed('Digit2')) this.selectSlot(2);
    if (this.input.pressed('Digit3')) this.selectSlot(3);
    if (this.input.wheel !== 0) {
      let idx = this.weaponIndex + (this.input.wheel > 0 ? 1 : -1);
      idx = (idx + this.weapons.length) % this.weapons.length;
      this.switchTo(idx);
      this.viewmodel.setWeapon(this.weapon.def);
      Audio.reloadClick();
    }
    if (this.input.pressed('KeyR')) {
      this.weapon.startReload();
      if (this.weapon.reloading) Audio.reloadClick();
    }
  }

  private selectSlot(slot: 1 | 2 | 3) {
    const prev = this.weaponIndex;
    this.switchToSlot(slot);
    if (prev !== this.weaponIndex) {
      this.viewmodel.setWeapon(this.weapon.def);
      Audio.reloadClick();
    }
  }

  private handleMovement(dt: number) {
    const wantCrouch = this.input.isDown('ControlLeft') || this.input.isDown('KeyC');
    const wantWalk = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');

    // crouch height transition (only stand up if there's headroom)
    const targetH = wantCrouch ? PLAYER.crouchHeight : PLAYER.height;
    if (targetH > this.height) {
      // attempt to stand: check clearance
      const saved = this.height;
      this.height = targetH;
      if (this.world.collision.overlapAny(this.position, this.radius, this.height)) {
        this.height = saved; // blocked, stay crouched
      }
    } else {
      this.height = damp(this.height, targetH, 14, dt);
    }
    const crouchRatio = (this.height - PLAYER.crouchHeight) / (PLAYER.height - PLAYER.crouchHeight);
    this.eyeHeight = PLAYER.crouchEyeHeight + (PLAYER.eyeHeight - PLAYER.crouchEyeHeight) * crouchRatio;

    // desired horizontal direction
    let f = 0;
    let s = 0;
    if (this.input.isDown('KeyW')) f += 1;
    if (this.input.isDown('KeyS')) f -= 1;
    if (this.input.isDown('KeyD')) s += 1;
    if (this.input.isDown('KeyA')) s -= 1;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, 0, -cos); right = (cos, 0, -sin)
    _wish.set(-sin * f + cos * s, 0, -cos * f - sin * s);
    if (_wish.lengthSq() > 0) _wish.normalize();

    const crouching = this.height < PLAYER.height - 0.1;
    let targetSpeed = PLAYER.runSpeed;
    if (crouching) targetSpeed = PLAYER.crouchSpeed;
    else if (wantWalk || this.ads) targetSpeed = PLAYER.walkSpeed;

    const accel = this.grounded ? PLAYER.accel : PLAYER.airAccel;
    const tvx = _wish.x * targetSpeed;
    const tvz = _wish.z * targetSpeed;
    this.velocity.x = moveTowards(this.velocity.x, tvx, accel * dt);
    this.velocity.z = moveTowards(this.velocity.z, tvz, accel * dt);

    // jump
    if (this.grounded && this.input.pressed('Space') && !crouching) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y -= PLAYER.gravity * dt;

    this.grounded = this.world.collision.moveCharacter(
      this.position,
      this.velocity,
      this.radius,
      this.height,
      dt
    );

    // footsteps & hearing
    const hv = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && hv > 0.6) {
      this.stepDistance += hv * dt;
      const stride = wantWalk || crouching ? 2.6 : 1.9;
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        Audio.footstep();
        if (!wantWalk && !crouching) {
          this.world.emitSound({ pos: this.position.clone(), radius: 13, team: this.team, kind: 'step' });
        }
      }
    }
  }

  private handleShooting(dt: number) {
    const w = this.weapon;
    w.update(dt);
    this.ads = this.input.mouse1 && !w.isMelee;

    const moving = Math.hypot(this.velocity.x, this.velocity.z) > 1.2;
    const wantFire = w.def.automatic ? this.input.mouse0 : this.input.mouse0Pressed;

    if (wantFire) {
      if (w.needsReload) {
        w.startReload();
      } else {
        const res = w.tryFire(moving, this.ads);
        if (res.fired) this.fireShot(res.spread, res.kickPitch, res.kickYaw);
      }
    }
    // auto reload when dry
    if (w.ammo <= 0 && w.needsReload && !w.reloading) w.startReload();
  }

  private fireShot(spread: number, kickPitch: number, kickYaw: number) {
    const def = this.weapon.def;
    this.eyePosition(_eye);
    this.viewDirection(_dir);

    if (def.type === 'knife') {
      const res = this.world.fireBullet(_eye, _dir, this, def);
      Audio.knifeSwing();
      if (res.hitCharacter) {
        Audio.knifeHit();
        this.world.fx.spawnBlood(res.point, res.normal);
        Audio.hitMarker();
        this.feedback.onHitConfirm?.(!res.hitCharacter.alive, res.zone === 'head');
      } else if (res.hitWorld) {
        this.world.fx.spawnImpact(res.point, res.normal);
      }
      this.viewmodel.onFire(def);
      return;
    }

    const pellets = def.pellets ?? 1;
    let anyHit = false;
    let anyKill = false;
    let anyHead = false;
    const base = _dir.clone();

    for (let i = 0; i < pellets; i++) {
      _dir.copy(base);
      if (spread > 0) {
        _tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        _dir.addScaledVector(_tmp, spread).normalize();
      }
      const res = this.world.fireBullet(_eye, _dir, this, def);
      _muzzle.copy(_eye).addScaledVector(_dir, 0.4);
      this.world.fx.spawnTracer(_muzzle, res.point);
      if (res.hitCharacter) {
        this.world.fx.spawnBlood(res.point, res.normal);
        anyHit = true;
        if (!res.hitCharacter.alive) anyKill = true;
        if (res.zone === 'head') anyHead = true;
      } else if (res.hitWorld) {
        this.world.fx.spawnImpact(res.point, res.normal);
      }
    }

    // one muzzle flash + audio per trigger pull
    _muzzle.copy(_eye).addScaledVector(base, 0.4);
    this.world.fx.spawnMuzzleFlash(_muzzle, base);
    this.playShootAudio(def.type);

    if (anyHit) {
      Audio.hitMarker();
      this.feedback.onHitConfirm?.(anyKill, anyHead);
    }

    this.viewmodel.onFire(def);
    // camera recoil kick
    this.recoilPitch += kickPitch;
    this.recoilYaw += kickYaw;
    this.shakeT = 0.08;
    this.shakeMag = def.type === 'sniper' ? 0.02 : def.type === 'shotgun' ? 0.018 : def.type === 'rifle' ? 0.012 : 0.008;
  }

  private playShootAudio(type: string) {
    if (type === 'shotgun') Audio.shootShotgun(0);
    else if (type === 'sniper') Audio.shootSniper(0);
    else if (type === 'pistol') Audio.shootPistol(0);
    else Audio.shootRifle(0);
  }

  /** View direction including recoil offset (used for shots + camera). */
  viewDirection(out = new THREE.Vector3()): THREE.Vector3 {
    const yaw = this.yaw + this.recoilYaw;
    const pitch = clamp(this.pitch + this.recoilPitch, -1.5, 1.5);
    const cp = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).normalize();
  }

  protected override onDamaged(attacker: Character | null, dir: THREE.Vector3, amount: number) {
    if (attacker) {
      _tmp.copy(attacker.position).sub(this.position).setY(0).normalize();
      this.feedback.onTookDamage?.(_tmp.clone(), amount);
    }
    Audio.hitFlesh();
  }

  /** Re-sync the viewmodel to the currently selected weapon (after buying). */
  applyViewmodel() {
    this.viewmodel.setWeapon(this.weapon.def);
  }

  update(dt: number) {
    if (!this.alive) {
      // keep camera where the player died, slightly raised (spectate self)
      this.updateCamera(dt, true);
      return;
    }

    if (this.frozen) {
      // buy phase: allow looking around but no movement/shooting
      this.handleLook();
      this.weapon.update(dt);
      this.updateCamera(dt, false);
      this.viewmodel.update(dt, {
        moveSpeed: 0,
        ads: false,
        reloadProgress: this.weapon.reloadProgress,
        isMelee: this.weapon.isMelee,
      });
      return;
    }

    this.handleLook();
    this.handleWeaponSwitch();
    this.handleMovement(dt);
    this.handleShooting(dt);

    // recoil recovery
    this.recoilPitch = damp(this.recoilPitch, 0, this.weapon.def.recoverSpeed, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, this.weapon.def.recoverSpeed, dt);

    this.updateCamera(dt, false);

    // viewmodel
    this.viewmodel.update(dt, {
      moveSpeed: Math.hypot(this.velocity.x, this.velocity.z),
      ads: this.ads,
      reloadProgress: this.weapon.reloadProgress,
      isMelee: this.weapon.isMelee,
    });
  }

  private updateCamera(dt: number, dead: boolean) {
    this.eyePosition(_eye);
    this.camera.position.copy(_eye);

    // FOV: zoom in when ADS (amount depends on the weapon — snipers zoom hard)
    const baseFov = Settings.get().fov;
    this.targetFov = this.ads ? baseFov * (this.weapon.def.adsZoom ?? 0.8) : baseFov;
    this.currentFov = damp(this.currentFov, this.targetFov, 12, dt);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    const yaw = this.yaw + (dead ? 0 : this.recoilYaw);
    const pitch = clamp(this.pitch + (dead ? 0 : this.recoilPitch), -1.55, 1.55);

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = pitch;
    this.camera.rotation.z = 0;

    // small recoil/landing shake
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.camera.rotation.z = (Math.random() - 0.5) * this.shakeMag;
    }
  }
}
