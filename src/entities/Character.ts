import * as THREE from 'three';
import type { TeamId } from '../core/Config';
import { HITZONE } from '../core/Config';
import type { IGameWorld, HitboxSet } from '../core/Types';
import { Weapon } from '../weapons/Weapon';
import { WEAPON_DEFS, LOADOUT_ORDER } from '../weapons/WeaponDefs';

let CHAR_ID = 0;

/**
 * Base for any living entity (the human player and AI bots).
 * Holds health/armor, team, weapons, and exposes hit zones used by the
 * shooting resolver. Bots get a procedural humanoid mesh; the player does not.
 */
export abstract class Character {
  readonly id = CHAR_ID++;
  world: IGameWorld;
  team: TeamId;
  name: string;
  isBot = false;

  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  yaw = 0; // radians, around Y
  pitch = 0; // radians, look up/down

  health = 100;
  armor = 0;
  alive = true;

  kills = 0;
  deaths = 0;
  assists = 0;

  radius: number;
  height: number;
  standHeight: number;
  eyeHeight: number;
  standEye: number;
  grounded = true;

  weapons: Weapon[] = [];
  weaponIndex = 0;

  mesh: THREE.Group | null = null;

  constructor(world: IGameWorld, team: TeamId, name: string, radius: number, height: number, eye: number) {
    this.world = world;
    this.team = team;
    this.name = name;
    this.radius = radius;
    this.height = this.standHeight = height;
    this.eyeHeight = this.standEye = eye;
    this.weapons = LOADOUT_ORDER.map((id) => new Weapon(WEAPON_DEFS[id]));
  }

  get weapon(): Weapon {
    return this.weapons[this.weaponIndex];
  }

  switchTo(index: number) {
    if (index < 0 || index >= this.weapons.length) return;
    if (index === this.weaponIndex) return;
    this.weaponIndex = index;
  }

  switchToSlot(slot: 1 | 2 | 3) {
    const idx = this.weapons.findIndex((w) => w.def.slot === slot);
    if (idx >= 0) this.switchTo(idx);
  }

  eyePosition(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  /** Forward look direction from yaw/pitch. */
  aimDirection(out = new THREE.Vector3()): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out
      .set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp)
      .normalize();
  }

  /** Center-of-mass target point (for AI aiming). */
  centerMass(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + this.height * 0.62, this.position.z);
  }

  headPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + this.height * 0.92, this.position.z);
  }

  getHitboxes(): HitboxSet[] {
    const p = this.position;
    const r = this.radius;
    const h = this.height;
    const legsTop = 0.48 * h;
    const bodyTop = 0.86 * h;
    return [
      {
        zone: HITZONE.LEGS,
        min: new THREE.Vector3(p.x - r * 0.7, p.y + 0.05, p.z - r * 0.7),
        max: new THREE.Vector3(p.x + r * 0.7, p.y + legsTop, p.z + r * 0.7),
      },
      {
        zone: HITZONE.BODY,
        min: new THREE.Vector3(p.x - r, p.y + legsTop, p.z - r),
        max: new THREE.Vector3(p.x + r, p.y + bodyTop, p.z + r),
      },
      {
        zone: HITZONE.HEAD,
        min: new THREE.Vector3(p.x - r * 0.55, p.y + bodyTop, p.z - r * 0.55),
        max: new THREE.Vector3(p.x + r * 0.55, p.y + h, p.z + r * 0.55),
      },
    ];
  }

  takeDamage(
    amount: number,
    zone: string,
    attacker: Character | null,
    weapon: string,
    dir: THREE.Vector3,
    armorPen: number
  ) {
    if (!this.alive) return;
    let dmg = amount;
    if (this.armor > 0) {
      const armorLoss = Math.min(this.armor, dmg * 0.5);
      this.armor -= armorLoss;
      dmg *= 0.5 + 0.5 * armorPen; // armored hits hurt less unless high pen
    }
    this.health -= dmg;
    this.onDamaged(attacker, dir, dmg, zone);
    if (this.health <= 0) {
      this.health = 0;
      this.die(attacker, weapon, zone === HITZONE.HEAD);
    }
  }

  protected onDamaged(_attacker: Character | null, _dir: THREE.Vector3, _dmg: number, _zone: string) {
    /* subclasses override for feedback */
  }

  die(attacker: Character | null, weapon: string, headshot: boolean) {
    if (!this.alive) return;
    this.alive = false;
    this.velocity.set(0, 0, 0);
    if (this.mesh) this.mesh.visible = false;
    this.world.onKill(this, attacker, weapon, headshot);
  }

  resetForRound(pos: THREE.Vector3, yaw: number) {
    this.alive = true;
    this.health = 100;
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.weaponIndex = 0;
    this.height = this.standHeight;
    this.eyeHeight = this.standEye;
    for (const w of this.weapons) w.resetForRound();
    if (this.mesh) this.mesh.visible = true;
  }

  abstract update(dt: number): void;
}

/**
 * Builds a stylised low-poly humanoid out of primitives, tinted by team.
 * Returns the group plus references for simple walk animation.
 */
export function buildBotMesh(team: TeamId): {
  group: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armR: THREE.Mesh;
} {
  const group = new THREE.Group();
  const bodyColor = team === 'crew' ? 0xb88a1f : 0x2f6da8;
  const accent = team === 'crew' ? 0xffd23f : 0x4fb0ff;

  const matBody = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, metalness: 0.2 });
  const matAccent = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.35,
    roughness: 0.5,
  });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x1c2029, roughness: 0.8 });

  // torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.32), matBody);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);

  // chest accent stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.34), matAccent);
  stripe.position.y = 1.28;
  group.add(stripe);

  // head + visor
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), matDark);
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.04), matAccent);
  visor.position.set(0, 1.68, 0.17);
  group.add(visor);

  // arms
  const armGeo = new THREE.BoxGeometry(0.16, 0.6, 0.16);
  const armL = new THREE.Mesh(armGeo, matBody);
  armL.position.set(-0.4, 1.12, 0);
  armL.castShadow = true;
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, matBody);
  armR.position.set(0.4, 1.12, 0.06);
  armR.castShadow = true;
  group.add(armR);

  // a stubby gun in the right hand so bots read as armed
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), matDark);
  gun.position.set(0.42, 1.0, 0.32);
  group.add(gun);

  // legs
  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.22);
  const legL = new THREE.Mesh(legGeo, matDark);
  legL.position.set(-0.16, 0.4, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, matDark);
  legR.position.set(0.16, 0.4, 0);
  legR.castShadow = true;
  group.add(legR);

  return { group, legL, legR, armR };
}
