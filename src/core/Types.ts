import * as THREE from 'three';
import type { TeamId, HitZone } from './Config';
import type { CollisionWorld } from '../world/Collision';
import type { WaypointGraph } from '../world/Waypoints';
import type { Character } from '../entities/Character';
import type { Effects } from '../fx/Effects';
import type { WeaponDef } from '../weapons/WeaponDefs';

export type SoundKind = 'shot' | 'step' | 'plant' | 'defuse' | 'reload';

export interface SoundEvent {
  pos: THREE.Vector3;
  radius: number;
  team: TeamId | null;
  kind: SoundKind;
}

export interface BulletResult {
  hitCharacter: Character | null;
  zone: HitZone | null;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  hitWorld: boolean;
}

/**
 * The surface area the Game exposes to entities, weapons and AI.
 * Declared as an interface so entities never import the Game class directly
 * (keeps the dependency graph acyclic).
 */
export interface IGameWorld {
  readonly collision: CollisionWorld;
  readonly waypoints: WaypointGraph;
  readonly fx: Effects;
  readonly scene: THREE.Scene;
  readonly time: number;
  readonly listenerPos: THREE.Vector3;

  bombPlanted: boolean;
  bombSite: 'A' | 'B' | null;
  bombPos: THREE.Vector3 | null;
  roundLive: boolean;

  characters(): Character[];
  enemiesOf(team: TeamId): Character[];
  alliesOf(team: TeamId): Character[];

  emitSound(ev: SoundEvent): void;

  /** Resolve a hitscan shot against world + characters and apply damage. */
  fireBullet(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    attacker: Character,
    def: WeaponDef
  ): BulletResult;

  onKill(victim: Character, attacker: Character | null, weapon: string, headshot: boolean): void;
}

export interface HitboxSet {
  zone: HitZone;
  min: THREE.Vector3;
  max: THREE.Vector3;
}
