import { WeaponDef } from './WeaponDefs';
import { clamp } from '../core/MathUtils';

export interface FireOutput {
  fired: boolean;
  kickPitch: number;
  kickYaw: number;
  spread: number;
}

/**
 * Runtime state for a single weapon instance (ammo, cooldown, recoil ramp,
 * reload). Pure logic — does not perform the hitscan itself; the owner calls
 * the game world to resolve bullets.
 */
export class Weapon {
  def: WeaponDef;
  ammo: number;
  reserve: number;
  reloading = false;
  reloadTimer = 0;
  private cooldown = 0;
  private recoilStep = 0; // how many shots into the current burst
  private timeSinceShot = 99;

  constructor(def: WeaponDef) {
    this.def = def;
    this.ammo = def.magazine;
    this.reserve = def.reserveMax;
  }

  get isMelee() {
    return this.def.type === 'knife';
  }

  get fireInterval() {
    return 60 / this.def.rpm;
  }

  get canShootNow() {
    return this.cooldown <= 0 && !this.reloading && (this.isMelee || this.ammo > 0);
  }

  get needsReload() {
    return !this.isMelee && this.ammo <= 0 && this.reserve > 0;
  }

  update(dt: number) {
    if (this.cooldown > 0) this.cooldown -= dt;
    this.timeSinceShot += dt;
    // recoil ramp recovers when not shooting
    if (this.timeSinceShot > 0.25) {
      this.recoilStep = Math.max(0, this.recoilStep - dt * 20);
    }
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
  }

  /** Attempt to fire. Returns recoil + spread info to apply, or fired=false. */
  tryFire(moving: boolean, ads: boolean): FireOutput {
    const out: FireOutput = { fired: false, kickPitch: 0, kickYaw: 0, spread: 0 };
    if (!this.canShootNow) return out;

    this.cooldown = this.fireInterval;
    this.timeSinceShot = 0;

    if (!this.isMelee) {
      this.ammo--;
    }

    const d = this.def;
    const step = this.recoilStep;
    // vertical kick grows over the burst then plateaus
    const rise = 1 + Math.min(2.4, step * 0.12 * d.recoilRise);
    out.kickPitch = d.recoilPitch * rise;
    // horizontal kick alternates pseudo-randomly like a recoil pattern
    const dir = Math.sin(step * 1.7) + (Math.random() - 0.5) * 0.6;
    out.kickYaw = d.recoilYaw * dir * (1 + step * 0.05);

    let spread = ads ? d.adsSpread : d.baseSpread;
    if (moving) spread += d.moveSpread;
    spread += step * 0.0012; // bloom during sustained fire
    out.spread = spread;

    this.recoilStep++;
    out.fired = true;
    return out;
  }

  startReload() {
    if (this.isMelee || this.reloading) return;
    if (this.ammo >= this.def.magazine || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = this.def.reloadTime;
  }

  private finishReload() {
    this.reloading = false;
    const need = this.def.magazine - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
  }

  /** Reset to a fresh round (full ammo, no recoil). */
  resetForRound() {
    this.ammo = this.def.magazine;
    this.reserve = this.def.reserveMax;
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.recoilStep = 0;
  }

  get reloadProgress() {
    if (!this.reloading) return 1;
    return clamp(1 - this.reloadTimer / this.def.reloadTime, 0, 1);
  }
}
