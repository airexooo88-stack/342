import * as THREE from 'three';

export interface AABB {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface RayHit {
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

const EPS = 0.001;
const _p = new THREE.Vector3();

/**
 * Lightweight axis-aligned collision world.
 * Characters are treated as vertical boxes (radius r, height h) whose origin is
 * at the feet. Static geometry is a set of AABBs. We resolve movement per-axis
 * with a simple auto step-up so stairs / low ledges are walkable.
 *
 * A custom solver is used (instead of Rapier/Cannon) to keep the prototype
 * dependency-light and 100% deterministic — see README for how to swap it out.
 */
export class CollisionWorld {
  boxes: AABB[] = [];

  addBox(min: THREE.Vector3, max: THREE.Vector3) {
    this.boxes.push({ min: min.clone(), max: max.clone() });
  }

  /** Add a box from a center position and full size. */
  addBoxCS(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
    this.addBox(
      new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2)
    );
  }

  private overlaps(box: AABB, pos: THREE.Vector3, r: number, h: number): boolean {
    return (
      pos.x - r < box.max.x &&
      pos.x + r > box.min.x &&
      pos.y < box.max.y &&
      pos.y + h > box.min.y &&
      pos.z - r < box.max.z &&
      pos.z + r > box.min.z
    );
  }

  overlapAny(pos: THREE.Vector3, r: number, h: number): boolean {
    for (const b of this.boxes) if (this.overlaps(b, pos, r, h)) return true;
    return false;
  }

  private moveAxis(
    pos: THREE.Vector3,
    r: number,
    h: number,
    delta: number,
    axis: 'x' | 'z',
    stepHeight: number
  ) {
    if (delta === 0) return;
    const before = pos[axis];
    pos[axis] += delta;
    if (!this.overlapAny(pos, r, h)) return; // path is clear

    // Try to step up over a low ledge / stair.
    const savedY = pos.y;
    pos.y += stepHeight;
    if (!this.overlapAny(pos, r, h)) return; // stepped up successfully
    pos.y = savedY;

    // Blocked: hug the wall by sub-stepping back to the contact point.
    pos[axis] = before;
    const steps = 5;
    const sub = delta / steps;
    for (let i = 0; i < steps; i++) {
      pos[axis] += sub;
      if (this.overlapAny(pos, r, h)) {
        pos[axis] -= sub;
        break;
      }
    }
  }

  /**
   * Integrate a character's velocity against the world, resolving collisions.
   * Mutates `pos` and `vel`. Returns true when the character is on the ground.
   */
  moveCharacter(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    r: number,
    h: number,
    dt: number,
    stepHeight = 0.4
  ): boolean {
    let grounded = false;

    this.moveAxis(pos, r, h, vel.x * dt, 'x', stepHeight);
    this.moveAxis(pos, r, h, vel.z * dt, 'z', stepHeight);

    // Vertical
    pos.y += vel.y * dt;
    for (const b of this.boxes) {
      if (this.overlaps(b, pos, r, h)) {
        if (vel.y <= 0) {
          pos.y = b.max.y + EPS;
          vel.y = 0;
          grounded = true;
        } else {
          pos.y = b.min.y - h - EPS;
          vel.y = 0;
        }
      }
    }

    // Ground plane at y = 0
    if (pos.y <= 0) {
      pos.y = 0;
      if (vel.y < 0) vel.y = 0;
      grounded = true;
    }

    return grounded;
  }

  /** Ray vs single AABB (slab method). Returns entry distance + normal, or null. */
  static rayAABB(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    box: AABB
  ): { t: number; nx: number; ny: number; nz: number } | null {
    let tmin = -Infinity;
    let tmax = Infinity;
    let nx = 0,
      ny = 0,
      nz = 0;

    const axes: Array<['x' | 'y' | 'z', number, number]> = [
      ['x', ox, dx],
      ['y', oy, dy],
      ['z', oz, dz],
    ];

    for (const [axis, o, d] of axes) {
      const mn = box.min[axis];
      const mx = box.max[axis];
      if (Math.abs(d) < 1e-8) {
        if (o < mn || o > mx) return null; // parallel & outside slab
      } else {
        const ood = 1 / d;
        let t1 = (mn - o) * ood;
        let t2 = (mx - o) * ood;
        let sign = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          sign = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          nx = axis === 'x' ? sign : 0;
          ny = axis === 'y' ? sign : 0;
          nz = axis === 'z' ? sign : 0;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
    }
    if (tmax < 0) return null; // box behind ray
    const t = tmin >= 0 ? tmin : 0; // origin may be inside the box
    return { t, nx, ny, nz };
  }

  /** Raycast against static world geometry only. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
    let best: RayHit | null = null;
    let bestT = maxDist;
    for (const b of this.boxes) {
      const r = CollisionWorld.rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, b);
      if (r && r.t <= bestT && r.t >= 0) {
        bestT = r.t;
        _p.copy(origin).addScaledVector(dir, r.t);
        best = {
          distance: r.t,
          point: _p.clone(),
          normal: new THREE.Vector3(r.nx, r.ny, r.nz),
        };
      }
    }
    return best;
  }

  /** True if there is an unobstructed straight line between two points. */
  lineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    _p.copy(b).sub(a);
    const dist = _p.length();
    if (dist < 1e-4) return true;
    _p.normalize();
    const hit = this.raycast(a, _p, dist - 0.05);
    return !hit;
  }
}
