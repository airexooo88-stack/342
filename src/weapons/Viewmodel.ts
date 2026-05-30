import * as THREE from 'three';
import { WeaponDef } from './WeaponDefs';
import { damp, lerp } from '../core/MathUtils';

/**
 * First-person weapon viewmodel. Rendered in its own overlay scene/camera on
 * top of the world (depth cleared) so it never clips into walls. Builds three
 * procedural weapon models and animates sway, bob, recoil, reload and melee.
 */
export class Viewmodel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);

  private root = new THREE.Group();
  private models = new Map<string, THREE.Group>();
  private muzzle = new THREE.Mesh();
  private muzzleTimer = 0;

  private recoilZ = 0;
  private recoilPitch = 0;
  private swingT = 0;
  private adsAmount = 0;
  private bobPhase = 0;

  private basePos = new THREE.Vector3(0.22, -0.26, -0.55);
  private adsPos = new THREE.Vector3(0, -0.16, -0.4);

  constructor() {
    this.camera.position.set(0, 0, 0);
    this.scene.add(this.root);

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(0.5, 1, 1);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x8090b0, 0.9));

    this.buildRifle();
    this.buildPistol();
    this.buildKnife();

    // muzzle flash plane (hidden until firing)
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    this.muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
    this.muzzle.position.set(0, 0.02, -0.95);
    this.root.add(this.muzzle);

    this.root.position.copy(this.basePos);
  }

  private addModel(id: string, g: THREE.Group) {
    g.visible = false;
    this.models.set(id, g);
    this.root.add(g);
  }

  private buildRifle() {
    const def = { color: 0x3a3f4b, accent: 0xffd23f };
    const g = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6, metalness: 0.5 });
    const matAccent = new THREE.MeshStandardMaterial({ color: def.accent, emissive: def.accent, emissiveIntensity: 0.4, roughness: 0.4 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x16191f, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.7), matBody);
    body.position.set(0, 0, -0.55);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 10), matDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.95);
    g.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.12), matDark);
    mag.position.set(0, -0.16, -0.5);
    mag.rotation.x = 0.2;
    g.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.2), matBody);
    stock.position.set(0, -0.01, -0.18);
    g.add(stock);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), matAccent);
    sight.position.set(0, 0.09, -0.55);
    g.add(sight);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), matDark);
    grip.position.set(0, -0.14, -0.35);
    grip.rotation.x = -0.3;
    g.add(grip);
    this.addModel('spray47', g);
  }

  private buildPistol() {
    const def = { color: 0x2c3038, accent: 0x36e0c8 };
    const g = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.5, metalness: 0.55 });
    const matAccent = new THREE.MeshStandardMaterial({ color: def.accent, emissive: def.accent, emissiveIntensity: 0.4, roughness: 0.4 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.34), matBody);
    slide.position.set(0, 0, -0.42);
    g.add(slide);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), matBody);
    grip.position.set(0, -0.16, -0.28);
    grip.rotation.x = -0.25;
    g.add(grip);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), matAccent);
    dot.position.set(0, 0.06, -0.42);
    g.add(dot);
    this.addModel('click9', g);
  }

  private buildKnife() {
    const def = { color: 0x8a8f9a, accent: 0xff5470 };
    const g = new THREE.Group();
    const matBlade = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.25, metalness: 0.9 });
    const matGrip = new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.7 });
    const matAccent = new THREE.MeshStandardMaterial({ color: def.accent, emissive: def.accent, emissiveIntensity: 0.4 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.34), matBlade);
    blade.position.set(0, 0, -0.5);
    g.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), matBlade);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0, 0, -0.72);
    g.add(tip);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.16), matGrip);
    grip.position.set(0, -0.02, -0.28);
    g.add(grip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), matAccent);
    guard.position.set(0, 0, -0.36);
    g.add(guard);
    this.addModel('bonkKnife', g);
  }

  setWeapon(def: WeaponDef) {
    for (const [id, g] of this.models) g.visible = id === def.id;
    this.recoilZ = 0;
    this.recoilPitch = 0;
  }

  onFire(def: WeaponDef) {
    if (def.type === 'knife') {
      this.swingT = 1;
      return;
    }
    this.recoilZ = Math.min(0.14, this.recoilZ + 0.06);
    this.recoilPitch = Math.min(0.3, this.recoilPitch + def.recoilPitch * 6);
    this.muzzleTimer = 0.05;
    (this.muzzle.material as THREE.MeshBasicMaterial).opacity = 0.9;
    this.muzzle.rotation.z = Math.random() * Math.PI;
    const s = 0.7 + Math.random() * 0.6;
    this.muzzle.scale.set(s, s, s);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(
    dt: number,
    opts: { moveSpeed: number; ads: boolean; reloadProgress: number; isMelee: boolean }
  ) {
    // recoil recovery
    this.recoilZ = damp(this.recoilZ, 0, 10, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);

    // ADS lerp (no ADS for melee)
    const adsTarget = opts.ads && !opts.isMelee ? 1 : 0;
    this.adsAmount = damp(this.adsAmount, adsTarget, 12, dt);

    // walk bob
    this.bobPhase += dt * opts.moveSpeed * 1.4;
    const bobX = Math.cos(this.bobPhase) * 0.012 * Math.min(1, opts.moveSpeed / 5);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.014 * Math.min(1, opts.moveSpeed / 5);

    // base position blend toward ADS
    const px = lerp(this.basePos.x, this.adsPos.x, this.adsAmount) + bobX;
    const py = lerp(this.basePos.y, this.adsPos.y, this.adsAmount) + bobY;
    const pz = lerp(this.basePos.z, this.adsPos.z, this.adsAmount) + this.recoilZ;
    this.root.position.set(px, py, pz);

    // reload dip
    let reloadDip = 0;
    let reloadRot = 0;
    if (opts.reloadProgress < 1) {
      const r = Math.sin(opts.reloadProgress * Math.PI);
      reloadDip = -r * 0.18;
      reloadRot = r * 0.6;
    }
    this.root.position.y += reloadDip;

    // melee swing
    let swingRot = 0;
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt * 5);
      swingRot = Math.sin((1 - this.swingT) * Math.PI) * -1.1;
    }

    this.root.rotation.set(this.recoilPitch + reloadRot + swingRot, 0, 0);

    // muzzle flash fade
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      const m = this.muzzle.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, m.opacity - dt * 18);
    }
  }
}
