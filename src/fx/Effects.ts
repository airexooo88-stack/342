import * as THREE from 'three';

/**
 * Pooled visual effects: bullet tracers, muzzle flashes, wall impact decals,
 * blood puffs and a small particle system. Everything is pre-allocated and
 * recycled so no garbage is created during combat.
 */

interface Tracer {
  line: THREE.Line;
  life: number;
}

interface Flash {
  sprite: THREE.Mesh;
  light: THREE.PointLight;
  life: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface Decal {
  mesh: THREE.Mesh;
  life: number;
}

const MAX_TRACERS = 48;
const MAX_FLASHES = 16;
const MAX_PARTICLES = 220;
const MAX_DECALS = 64;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export class Effects {
  private scene: THREE.Scene;
  private group = new THREE.Group();

  private tracers: Tracer[] = [];
  private flashes: Flash[] = [];
  private particles: Particle[] = [];
  private decals: Decal[] = [];
  private decalCursor = 0;
  private particleCursor = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'fx';
    scene.add(this.group);
    this.initTracers();
    this.initFlashes();
    this.initParticles();
    this.initDecals();
  }

  private initTracers() {
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
    for (let i = 0; i < MAX_TRACERS; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, mat.clone());
      line.frustumCulled = false;
      line.visible = false;
      this.group.add(line);
      this.tracers.push({ line, life: 0 });
    }
  }

  private initFlashes() {
    const geo = new THREE.PlaneGeometry(0.6, 0.6);
    for (let i = 0; i < MAX_FLASHES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Mesh(geo, mat);
      sprite.visible = false;
      this.group.add(sprite);
      const light = new THREE.PointLight(0xffcf7a, 0, 6, 2);
      this.group.add(light);
      this.flashes.push({ sprite, light, life: 0 });
    }
  }

  private initParticles() {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
  }

  private initDecals() {
    const geo = new THREE.CircleGeometry(0.12, 8);
    for (let i = 0; i < MAX_DECALS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x0a0a0a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.decals.push({ mesh, life: 0 });
    }
  }

  // ----------------------------------------------------------------- spawners
  spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const t = this.tracers.find((x) => x.life <= 0) ?? this.tracers[0];
    const pos = t.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    (t.line.material as THREE.LineBasicMaterial).opacity = 0.9;
    t.life = 0.06;
  }

  spawnMuzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3) {
    const f = this.flashes.find((x) => x.life <= 0) ?? this.flashes[0];
    f.sprite.position.copy(pos);
    f.sprite.lookAt(_v.copy(pos).add(dir));
    f.sprite.rotation.z = Math.random() * Math.PI;
    const s = 0.6 + Math.random() * 0.5;
    f.sprite.scale.set(s, s, s);
    f.sprite.visible = true;
    (f.sprite.material as THREE.MeshBasicMaterial).opacity = 1;
    f.light.position.copy(pos);
    f.light.intensity = 6;
    f.life = 0.05;
  }

  spawnImpact(point: THREE.Vector3, normal: THREE.Vector3) {
    // sparks
    this.burst(point, normal, 6, 0xffd27a, 2.6);
    // smoke-ish dark puff
    this.burst(point, normal, 3, 0x9aa0ad, 1.0);
    this.placeDecal(point, normal);
  }

  spawnBlood(point: THREE.Vector3, normal: THREE.Vector3) {
    this.burst(point, normal, 9, 0xff4d6a, 2.2);
  }

  private burst(origin: THREE.Vector3, normal: THREE.Vector3, count: number, color: number, speed: number) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      p.mesh.position.copy(origin);
      // spray roughly along the surface normal with random spread
      _v.copy(normal)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.4))
        .normalize();
      p.vel.copy(_v).multiplyScalar(speed * (0.5 + Math.random()));
      p.vel.y += 0.6;
      p.life = p.maxLife = 0.35 + Math.random() * 0.35;
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      m.color.setHex(color);
      m.opacity = 1;
      const sc = 0.6 + Math.random() * 0.8;
      p.mesh.scale.set(sc, sc, sc);
      p.mesh.visible = true;
    }
  }

  private placeDecal(point: THREE.Vector3, normal: THREE.Vector3) {
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % MAX_DECALS;
    d.mesh.position.copy(point).addScaledVector(normal, 0.02);
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    d.mesh.quaternion.copy(_q);
    const sc = 0.7 + Math.random() * 0.7;
    d.mesh.scale.set(sc, sc, sc);
    (d.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85;
    d.mesh.visible = true;
    d.life = 8; // decals linger
  }

  // ------------------------------------------------------------------- update
  update(dt: number) {
    void _up;
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        const m = t.line.material as THREE.LineBasicMaterial;
        m.opacity = Math.max(0, (t.life / 0.06) * 0.9);
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        const m = f.sprite.material as THREE.MeshBasicMaterial;
        m.opacity = Math.max(0, f.life / 0.05);
        f.light.intensity = Math.max(0, (f.life / 0.05) * 6);
        if (f.life <= 0) {
          f.sprite.visible = false;
          f.light.intensity = 0;
        }
      }
    }
    for (const p of this.particles) {
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= 9 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        const m = p.mesh.material as THREE.MeshBasicMaterial;
        m.opacity = Math.max(0, p.life / p.maxLife);
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
    for (const d of this.decals) {
      if (d.life > 0) {
        d.life -= dt;
        if (d.life < 1.5) {
          (d.mesh.material as THREE.MeshBasicMaterial).opacity = (d.life / 1.5) * 0.85;
        }
        if (d.life <= 0) d.mesh.visible = false;
      }
    }
  }
}
