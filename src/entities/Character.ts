import * as THREE from 'three';
import type { TeamId } from '../core/Config';
import { HITZONE } from '../core/Config';
import type { IGameWorld, HitboxSet } from '../core/Types';
import { Weapon } from '../weapons/Weapon';
import { WEAPON_DEFS, KNIFE_ID, DEFAULT_SECONDARY } from '../weapons/WeaponDefs';

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

  // current loadout (ids). primaryId may be null (pistol + knife only).
  primaryId: string | null = 'spray47';
  secondaryId: string = DEFAULT_SECONDARY;

  mesh: THREE.Group | null = null;

  constructor(world: IGameWorld, team: TeamId, name: string, radius: number, height: number, eye: number) {
    this.world = world;
    this.team = team;
    this.name = name;
    this.radius = radius;
    this.height = this.standHeight = height;
    this.eyeHeight = this.standEye = eye;
    this.setLoadout(this.primaryId, this.secondaryId);
  }

  get weapon(): Weapon {
    return this.weapons[Math.min(this.weaponIndex, this.weapons.length - 1)];
  }

  /** Rebuild the held weapons from a loadout. primary may be null. */
  setLoadout(primaryId: string | null, secondaryId: string) {
    this.primaryId = primaryId;
    this.secondaryId = secondaryId;
    const list: Weapon[] = [];
    if (primaryId && WEAPON_DEFS[primaryId]) list.push(new Weapon(WEAPON_DEFS[primaryId]));
    list.push(new Weapon(WEAPON_DEFS[secondaryId] ?? WEAPON_DEFS[DEFAULT_SECONDARY]));
    list.push(new Weapon(WEAPON_DEFS[KNIFE_ID]));
    this.weapons = list;
    this.weaponIndex = 0; // primary if present, else the secondary
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
    this.height = this.standHeight;
    this.eyeHeight = this.standEye;
    // rebuild loadout (fresh ammo) from current selection
    this.setLoadout(this.primaryId, this.secondaryId);
    if (this.mesh) this.mesh.visible = true;
  }

  abstract update(dt: number): void;
}

/**
 * Builds a stylised low-poly humanoid out of primitives, tinted by team.
 * Limbs use pivot groups (hip/shoulder) so walk + aim animation reads well.
 */
export function buildBotMesh(team: TeamId): {
  group: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armR: THREE.Object3D;
} {
  const group = new THREE.Group();
  const bodyColor = team === 'crew' ? 0x9c7420 : 0x2b5f93;
  const suit = team === 'crew' ? 0x2a2620 : 0x1f2733;
  const accent = team === 'crew' ? 0xffd23f : 0x4fb0ff;

  const matBody = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.65, metalness: 0.25 });
  const matSuit = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.85, metalness: 0.15 });
  const matAccent = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.4,
    roughness: 0.5,
  });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.8 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x6a7488, roughness: 0.4, metalness: 0.7 });

  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // hips / pelvis
  add(group, new THREE.BoxGeometry(0.46, 0.26, 0.3), matSuit, 0, 0.92, 0);
  // torso (tapered with a chest plate)
  add(group, new THREE.BoxGeometry(0.58, 0.55, 0.32), matBody, 0, 1.32, 0);
  add(group, new THREE.BoxGeometry(0.5, 0.34, 0.36), matSuit, 0, 1.5, 0.02);
  // chest accent + shoulder lights
  add(group, new THREE.BoxGeometry(0.16, 0.16, 0.38), matAccent, 0, 1.46, 0.02);
  add(group, new THREE.BoxGeometry(0.62, 0.08, 0.34), matAccent, 0, 1.62, 0);
  // backpack
  add(group, new THREE.BoxGeometry(0.4, 0.42, 0.18), matDark, 0, 1.34, -0.24);

  // neck + head + visor + antenna
  add(group, new THREE.CylinderGeometry(0.08, 0.1, 0.12, 8), matSuit, 0, 1.74, 0);
  add(group, new THREE.BoxGeometry(0.32, 0.34, 0.34), matDark, 0, 1.94, 0);
  add(group, new THREE.BoxGeometry(0.34, 0.1, 0.04), matAccent, 0, 1.96, 0.16);
  const antenna = add(group, new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), matMetal, 0.12, 2.18, -0.08);
  add(antenna, new THREE.SphereGeometry(0.025, 6, 6), matAccent, 0, 0.12, 0);

  // ---- left arm (pivot at shoulder) ----
  const armL = new THREE.Group();
  armL.position.set(-0.36, 1.56, 0.02);
  group.add(armL);
  add(armL, new THREE.BoxGeometry(0.16, 0.34, 0.16), matBody, 0, -0.17, 0);
  add(armL, new THREE.BoxGeometry(0.14, 0.32, 0.14), matSuit, 0, -0.46, 0.04);
  add(armL, new THREE.BoxGeometry(0.13, 0.13, 0.13), matDark, 0, -0.62, 0.08); // hand

  // ---- right arm (pivot at shoulder) holds the gun ----
  const armR = new THREE.Group();
  armR.position.set(0.36, 1.56, 0.08);
  group.add(armR);
  add(armR, new THREE.BoxGeometry(0.16, 0.34, 0.16), matBody, 0, -0.17, 0);
  add(armR, new THREE.BoxGeometry(0.14, 0.3, 0.14), matSuit, 0, -0.42, 0.1);
  add(armR, new THREE.BoxGeometry(0.13, 0.13, 0.13), matDark, 0, -0.54, 0.2); // hand
  // a stubby rifle in the hands
  const gun = new THREE.Group();
  gun.position.set(0, -0.5, 0.28);
  armR.add(gun);
  add(gun, new THREE.BoxGeometry(0.1, 0.12, 0.46), matDark, 0, 0, 0);
  add(gun, new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), matMetal, 0, 0.02, 0.34).rotation.x = Math.PI / 2;
  add(gun, new THREE.BoxGeometry(0.06, 0.16, 0.08), matDark, 0, -0.12, -0.06);

  // ---- legs (pivot at hip) ----
  const makeLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, 0.84, 0);
    group.add(leg);
    add(leg, new THREE.BoxGeometry(0.2, 0.42, 0.22), matSuit, 0, -0.22, 0); // thigh
    add(leg, new THREE.BoxGeometry(0.17, 0.4, 0.19), matBody, 0, -0.62, 0.01); // shin
    add(leg, new THREE.BoxGeometry(0.2, 0.12, 0.3), matDark, 0, -0.82, 0.05); // boot
    return leg;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  return { group, legL, legR, armR };
}
