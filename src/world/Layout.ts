import * as THREE from 'three';

/**
 * Shared layout constants for the "Banana Yard" map.
 * Both the geometry builder (MapBanana) and the navigation graph (Waypoints)
 * reference these so they never drift out of sync.
 *
 * Coordinate convention:
 *   +Z = south (Protocol Crew / attacker side)
 *   -Z = north (Null Guards / defender side)
 *   +X = east,  -X = west
 *   y  = up (floor at y = 0)
 */

export const BOUNDS = { minX: -20, maxX: 20, minZ: -28, maxZ: 28 };
export const WALL_HEIGHT = 6;

// Bomb sites (plant zones) — north corners.
export const SITE_A = new THREE.Vector3(-14, 0, -18);
export const SITE_B = new THREE.Vector3(14, 0, -18);
export const SITE_RADIUS = 3.6;

// Team spawn anchors.
export const CREW_SPAWN = new THREE.Vector3(0, 0, 24); // attackers (south)
export const GUARD_SPAWN = new THREE.Vector3(0, 0, -24); // defenders (north)

export const CREW_SPAWNS: THREE.Vector3[] = [
  new THREE.Vector3(-3, 0, 24),
  new THREE.Vector3(0, 0, 25),
  new THREE.Vector3(3, 0, 24),
  new THREE.Vector3(-1.5, 0, 26),
  new THREE.Vector3(1.5, 0, 26),
];

export const GUARD_SPAWNS: THREE.Vector3[] = [
  new THREE.Vector3(-3, 0, -24),
  new THREE.Vector3(0, 0, -25),
  new THREE.Vector3(3, 0, -24),
  new THREE.Vector3(-1.5, 0, -26),
  new THREE.Vector3(1.5, 0, -26),
];

// Interior building blocks that separate the lanes. Each is a full-height
// box with min/max footprint; gaps between pieces form the "doorways".
export interface BlockDef {
  cx: number;
  cz: number;
  sx: number;
  sz: number;
  h: number;
}

export const BLOCKS: BlockDef[] = [
  // West block (separates A-lane from Mid), split into two with a doorway @ z≈2
  { cx: -8, cz: 9.5, sx: 5, sz: 9, h: WALL_HEIGHT },
  { cx: -8, cz: -5.5, sx: 5, sz: 9, h: WALL_HEIGHT },
  // East block (separates Mid from B-lane), same doorway pattern
  { cx: 8, cz: 9.5, sx: 5, sz: 9, h: WALL_HEIGHT },
  { cx: 8, cz: -5.5, sx: 5, sz: 9, h: WALL_HEIGHT },
];
