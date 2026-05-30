import * as THREE from 'three';

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const randRange = (min: number, max: number) => min + Math.random() * (max - min);
export const randInt = (min: number, max: number) => Math.floor(randRange(min, max + 1));
export const choice = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Smooth exponential damping that is frame-rate independent. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Move `current` toward `target` by at most `maxDelta`. */
export const moveTowards = (current: number, target: number, maxDelta: number) => {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
};

/** Shortest signed angular difference (radians) between two angles. */
export const angleDelta = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** Gaussian-ish random using the central limit trick. Returns ~[-1,1]. */
export const gaussian = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export const TMP_V1 = new THREE.Vector3();
export const TMP_V2 = new THREE.Vector3();
export const TMP_V3 = new THREE.Vector3();
