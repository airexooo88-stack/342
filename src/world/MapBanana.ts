import * as THREE from 'three';
import { CollisionWorld } from './Collision';
import { getMaterials } from './Materials';
import {
  BOUNDS,
  WALL_HEIGHT,
  BLOCKS,
  SITE_A,
  SITE_B,
  SITE_RADIUS,
} from './Layout';

export interface RadarShape {
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
}

/**
 * Builds the "Banana Yard" arena: an original compact, competitive
 * bomb-defusal layout with two lanes, a mid, two sites, cover and a balcony.
 */
export class MapBanana {
  group = new THREE.Group();
  collision = new CollisionWorld();
  radarShapes: RadarShape[] = [];
  siteMarkers: THREE.Mesh[] = [];
  private lights: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene, shadows: boolean) {
    this.build(shadows);
    scene.add(this.group);
  }

  private mat = getMaterials();

  private addSolid(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    material: THREE.Material,
    castShadow = true,
    radar?: string
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.collision.addBoxCS(cx, cy, cz, sx, sy, sz);
    if (radar) this.radarShapes.push({ x: cx, z: cz, w: sx, d: sz, color: radar });
    return mesh;
  }

  private build(shadows: boolean) {
    const width = BOUNDS.maxX - BOUNDS.minX;
    const depth = BOUNDS.maxZ - BOUNDS.minZ;
    const cx = (BOUNDS.minX + BOUNDS.maxX) / 2;
    const cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2;

    // ---- floor (no collider; ground plane handled at y=0) ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.mat.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    (this.mat.floor.map as THREE.Texture).repeat.set(width / 4, depth / 4);
    this.group.add(floor);

    // ---- ceiling glow plane (subtle, no collider) ----
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: 0x0a0d14, side: THREE.BackSide })
    );
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.set(cx, WALL_HEIGHT + 0.5, cz);
    this.group.add(ceil);

    // ---- perimeter walls ----
    const t = 1; // thickness
    const hy = WALL_HEIGHT / 2;
    this.addSolid(cx, hy, BOUNDS.minZ - t / 2, width + t * 2, WALL_HEIGHT, t, this.mat.wall, true, '#2a3346');
    this.addSolid(cx, hy, BOUNDS.maxZ + t / 2, width + t * 2, WALL_HEIGHT, t, this.mat.wall, true, '#2a3346');
    this.addSolid(BOUNDS.minX - t / 2, hy, cz, t, WALL_HEIGHT, depth + t * 2, this.mat.wall, true, '#2a3346');
    this.addSolid(BOUNDS.maxX + t / 2, hy, cz, t, WALL_HEIGHT, depth + t * 2, this.mat.wall, true, '#2a3346');

    // ---- interior lane blocks (with doorways) ----
    for (const b of BLOCKS) {
      this.addSolid(b.cx, b.h / 2, b.cz, b.sx, b.h, b.sz, this.mat.wallLight, true, '#3a4660');
    }

    // ---- cover crates for gunfights (kept clear of waypoint nodes so bots
    //      navigate cleanly; placed beside lanes/sites as peek cover) ----
    const crates: Array<[number, number, number]> = [
      [3, 5, 1.2], // mid
      [-3, -1, 1.2], // mid
      [4, -5, 1.2], // mid toward guard
      [-13, 4, 1.4], // A lane
      [-18, -1, 1.2], // A lane west wall
      [13, 4, 1.4], // B lane
      [18, -1, 1.2], // B lane east wall
      [-11, -15, 1.2], // site A near
      [-17, -16, 1.4], // site A deep
      [11, -15, 1.2], // site B near
      [17, -16, 1.4], // site B deep
      [3, -12, 1.4], // north open
      [-4, -14, 1.2], // north open
      [-6, 6, 1.0], // A doorway
      [6, 6, 1.0], // B doorway
    ];
    for (const [x, z, s] of crates) {
      this.addSolid(x, s / 2, z, s, s, s, this.mat.crate, true, '#7a5a2e');
    }
    // a couple of stacked crates for height (mid, off the node grid)
    this.addSolid(5, 0.7, -2, 1.4, 1.4, 1.4, this.mat.crate, true, '#7a5a2e');
    this.addSolid(5, 1.9, -2, 1.1, 1.1, 1.1, this.mat.crate, true, '#7a5a2e');

    // ---- balcony / platform at A with climbable stairs ----
    this.buildPlatform(-17, -21, '#445');
    // ---- a smaller raised box stack at B for verticality ----
    this.buildPlatform(17, -21, '#445');

    // ---- site markers ----
    this.siteMarkers.push(this.buildSite(SITE_A, this.mat.siteA, 'A'));
    this.siteMarkers.push(this.buildSite(SITE_B, this.mat.siteB, 'B'));
    this.radarShapes.push({ x: SITE_A.x, z: SITE_A.z, w: 1, d: 1, color: 'siteA' });
    this.radarShapes.push({ x: SITE_B.x, z: SITE_B.z, w: 1, d: 1, color: 'siteB' });

    // ---- neon decorative strips along walls (no collider) ----
    this.addNeon(BOUNDS.minX + 0.6, 4.2, 0, 0.15, 0.3, depth - 4);
    this.addNeon(BOUNDS.maxX - 0.6, 4.2, 0, 0.15, 0.3, depth - 4);

    // ---- lighting ----
    this.addLights(shadows, cx, cz, width, depth);
  }

  private buildPlatform(px: number, pz: number, _radar: string) {
    // top slab (north), with stairs leading up from the south
    const slabTop = 2.2;
    this.addSolid(px, slabTop / 2, pz - 1.5, 6, slabTop, 4, this.mat.metal, true, '#566');
    // stairs (south of slab), 6 steps of 0.34
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const h = (i + 1) * (slabTop / steps);
      const z = pz + 1.5 - i * 0.6;
      this.addSolid(px, h / 2, z, 4, h, 0.6, this.mat.metal, true);
    }
    // railing accent (no collider for simplicity)
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.1, 0.1),
      this.mat.neon
    );
    rail.position.set(px, slabTop + 0.6, pz - 3.4);
    this.group.add(rail);
  }

  private buildSite(center: THREE.Vector3, material: THREE.Material, label: string): THREE.Mesh {
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(SITE_RADIUS, SITE_RADIUS, 0.08, 32),
      material
    );
    marker.position.set(center.x, 0.05, center.z);
    marker.receiveShadow = false;
    this.group.add(marker);

    // floating letter made of thin boxes
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(SITE_RADIUS - 0.3, 0.06, 8, 40),
      material
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(center.x, 0.1, center.z);
    this.group.add(ring);
    marker.userData.label = label;
    return marker;
  }

  private addNeon(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this.mat.neon);
    m.position.set(cx, cy, cz);
    this.group.add(m);
  }

  private addLights(shadows: boolean, cx: number, cz: number, width: number, depth: number) {
    const hemi = new THREE.HemisphereLight(0x6a7da0, 0x161a24, 0.55);
    this.group.add(hemi);

    const ambient = new THREE.AmbientLight(0x404a60, 0.4);
    this.group.add(ambient);

    const dir = new THREE.DirectionalLight(0xfff0d0, 0.8);
    dir.position.set(18, 28, 12);
    dir.target.position.set(cx, 0, cz);
    // Always configure the shadow camera; live shadow on/off is controlled by
    // renderer.shadowMap.enabled so the graphics setting can toggle instantly.
    dir.castShadow = true;
    dir.shadow.mapSize.set(shadows ? 2048 : 1024, shadows ? 2048 : 1024);
    {
      const d = Math.max(width, depth) * 0.62;
      const cam = dir.shadow.camera as THREE.OrthographicCamera;
      cam.left = -d;
      cam.right = d;
      cam.top = d;
      cam.bottom = -d;
      cam.near = 1;
      cam.far = 90;
      dir.shadow.bias = -0.0004;
    }
    this.group.add(dir);
    this.group.add(dir.target);

    // neon point lights for atmosphere
    const spots: Array<[number, number, number, number]> = [
      [SITE_A.x, 3.5, SITE_A.z, 0xffd23f],
      [SITE_B.x, 3.5, SITE_B.z, 0xff5470],
      [0, 4, 0, 0x36e0c8],
      [0, 4, 18, 0xffd23f],
      [0, 4, -18, 0x4fb0ff],
    ];
    for (const [x, y, z, color] of spots) {
      const p = new THREE.PointLight(color, 18, 22, 2);
      p.position.set(x, y, z);
      this.group.add(p);
      this.lights.push(p);
    }
  }

  /** Subtle animation for site markers / neon. */
  update(time: number) {
    for (const m of this.siteMarkers) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + Math.sin(time * 3) * 0.25;
    }
  }
}
