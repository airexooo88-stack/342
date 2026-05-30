import * as THREE from 'three';
import { WeaponDef } from './WeaponDefs';
import { damp, lerp } from '../core/MathUtils';

/**
 * First-person weapon viewmodel. Rendered in its own overlay scene/camera on
 * top of the world (depth cleared) so it never clips into walls.
 *
 * Builds detailed procedural models for every weapon plus gloved player hands,
 * and animates sway, bob, recoil, a two-stage magazine reload and melee swings.
 */
export class Viewmodel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);

  private root = new THREE.Group();
  private models = new Map<string, THREE.Group>();
  private muzzle!: THREE.Mesh;
  private muzzleTimer = 0;
  private activeId = 'click9';

  // hands
  private handL = new THREE.Group();
  private handR = new THREE.Group();
  private handLBase = new THREE.Vector3();
  private handRBase = new THREE.Vector3();

  private recoilZ = 0;
  private recoilPitch = 0;
  private swingT = 0;
  private adsAmount = 0;
  private bobPhase = 0;

  private basePos = new THREE.Vector3(0.22, -0.26, -0.55);
  private adsPos = new THREE.Vector3(0, -0.16, -0.42);

  // shared materials
  private mGlove = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.8, metalness: 0.1 });
  private mSkin = new THREE.MeshStandardMaterial({ color: 0xcf9d72, roughness: 0.7 });

  constructor() {
    this.camera.position.set(0, 0, 0);
    this.scene.add(this.root);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(0.5, 1, 1);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fa8ff, 0.6);
    rim.position.set(-1, 0.4, 0.6);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x8090b0, 0.85));

    this.buildHands();

    this.buildRifle();
    this.buildSMG();
    this.buildShotgun();
    this.buildSniper();
    this.buildPistol();
    this.buildHeavyPistol();
    this.buildKnife();

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    this.muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
    this.muzzle.position.set(0, 0.02, -0.98);
    this.root.add(this.muzzle);

    this.root.position.copy(this.basePos);
  }

  // ------------------------------------------------------------------ hands
  private buildHands() {
    const mkHand = () => {
      const g = new THREE.Group();
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.34, 10), this.mSkin);
      forearm.rotation.x = Math.PI / 2;
      forearm.position.z = 0.16;
      g.add(forearm);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), this.mGlove);
      wrist.rotation.x = Math.PI / 2;
      wrist.position.z = -0.02;
      g.add(wrist);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.12), this.mGlove);
      fist.position.z = -0.08;
      g.add(fist);
      // knuckles
      for (let i = 0; i < 4; i++) {
        const k = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), this.mGlove);
        k.position.set(-0.036 + i * 0.024, 0.05, -0.12);
        g.add(k);
      }
      return g;
    };
    this.handL = mkHand();
    this.handR = mkHand();
    this.root.add(this.handL);
    this.root.add(this.handR);
  }

  private setHandPositions(rifleLike: boolean, def: WeaponDef) {
    if (def.type === 'knife') {
      this.handRBase.set(0.0, -0.1, -0.34);
      this.handLBase.set(0.2, -0.18, -0.18);
    } else if (def.slotKind === 'secondary') {
      this.handRBase.set(0.0, -0.14, -0.34);
      this.handLBase.set(0.06, -0.15, -0.42);
    } else if (rifleLike) {
      this.handRBase.set(0.03, -0.13, -0.32);
      this.handLBase.set(0.0, -0.06, -0.64);
    }
    this.handR.position.copy(this.handRBase);
    this.handR.rotation.set(0.2, 0, 0);
    this.handL.position.copy(this.handLBase);
    this.handL.rotation.set(0.3, 0, 0);
  }

  // ----------------------------------------------------------------- models
  private mat(color: number, rough = 0.5, metal = 0.55) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }
  private emis(color: number) {
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4 });
  }
  private box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  private cyl(parent: THREE.Object3D, r1: number, r2: number, len: number, mat: THREE.Material, x: number, y: number, z: number) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 12), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  private addModel(id: string, g: THREE.Group, mag?: THREE.Mesh) {
    g.visible = false;
    if (mag) {
      g.userData.mag = mag;
      g.userData.magBase = mag.position.clone();
    }
    this.models.set(id, g);
    this.root.add(g);
  }

  private buildRifle() {
    const body = this.mat(0x3a3f4b, 0.55, 0.55);
    const dark = this.mat(0x16191f, 0.8, 0.3);
    const accent = this.emis(0xffd23f);
    const g = new THREE.Group();
    this.box(g, 0.1, 0.13, 0.72, body, 0, 0, -0.56);
    const handguard = this.box(g, 0.08, 0.09, 0.34, dark, 0, 0.01, -0.8);
    handguard.rotation.x = 0;
    this.cyl(g, 0.022, 0.022, 0.5, dark, 0, 0.02, -0.98);
    const mag = this.box(g, 0.07, 0.24, 0.12, dark, 0, -0.17, -0.5);
    mag.rotation.x = 0.18;
    this.box(g, 0.085, 0.12, 0.22, body, 0, -0.01, -0.18); // stock
    this.box(g, 0.022, 0.06, 0.02, accent, 0, 0.1, -0.5); // sight post
    this.box(g, 0.05, 0.03, 0.12, dark, 0, 0.1, -0.34); // rail/sight
    const grip = this.box(g, 0.06, 0.17, 0.08, dark, 0, -0.15, -0.34);
    grip.rotation.x = -0.3;
    this.addModel('spray47', g, mag);
  }

  private buildSMG() {
    const body = this.mat(0x33373f, 0.5, 0.5);
    const dark = this.mat(0x14171d, 0.8, 0.3);
    const accent = this.emis(0x36e0c8);
    const g = new THREE.Group();
    this.box(g, 0.09, 0.12, 0.5, body, 0, 0, -0.5);
    this.cyl(g, 0.018, 0.018, 0.26, dark, 0, 0.01, -0.82);
    const mag = this.box(g, 0.05, 0.26, 0.08, dark, 0, -0.2, -0.42);
    this.box(g, 0.05, 0.1, 0.18, body, 0, 0, -0.18); // folding stock
    this.box(g, 0.04, 0.03, 0.1, accent, 0, 0.09, -0.42);
    const grip = this.box(g, 0.055, 0.15, 0.07, dark, 0, -0.13, -0.3);
    grip.rotation.x = -0.25;
    this.addModel('buzz9', g, mag);
  }

  private buildShotgun() {
    const body = this.mat(0x4a3526, 0.6, 0.2);
    const dark = this.mat(0x14171d, 0.7, 0.4);
    const accent = this.emis(0xff8a3f);
    const g = new THREE.Group();
    this.box(g, 0.1, 0.12, 0.8, body, 0, 0, -0.58);
    this.cyl(g, 0.03, 0.03, 0.6, dark, 0, 0.03, -0.92); // barrel
    this.cyl(g, 0.025, 0.025, 0.5, dark, 0, -0.03, -0.86); // tube mag (pump)
    const pump = this.box(g, 0.08, 0.07, 0.16, dark, 0, -0.03, -0.78); // forend
    pump.userData.pump = true;
    this.box(g, 0.09, 0.13, 0.22, body, 0, -0.02, -0.2); // stock
    this.box(g, 0.03, 0.03, 0.08, accent, 0, 0.09, -0.5);
    const grip = this.box(g, 0.06, 0.15, 0.08, dark, 0, -0.14, -0.34);
    grip.rotation.x = -0.3;
    // for shotgun "reload", animate the pump forend
    this.addModel('thumper', g, pump);
  }

  private buildSniper() {
    const body = this.mat(0x2a2f38, 0.45, 0.6);
    const dark = this.mat(0x101216, 0.8, 0.3);
    const accent = this.emis(0x9b7bff);
    const g = new THREE.Group();
    this.box(g, 0.1, 0.12, 0.95, body, 0, 0, -0.62);
    this.cyl(g, 0.02, 0.02, 0.7, dark, 0, 0.02, -1.05); // long barrel
    // scope
    this.cyl(g, 0.05, 0.05, 0.34, dark, 0, 0.12, -0.5);
    this.box(g, 0.02, 0.04, 0.02, accent, 0, 0.12, -0.66);
    const mag = this.box(g, 0.06, 0.16, 0.12, dark, 0, -0.14, -0.45);
    this.box(g, 0.09, 0.14, 0.3, body, 0, -0.02, -0.14); // long stock
    const grip = this.box(g, 0.06, 0.16, 0.08, dark, 0, -0.15, -0.32);
    grip.rotation.x = -0.3;
    this.addModel('longscope', g, mag);
  }

  private buildPistol() {
    const body = this.mat(0x2c3038, 0.5, 0.55);
    const accent = this.emis(0x36e0c8);
    const dark = this.mat(0x14171d, 0.8, 0.3);
    const g = new THREE.Group();
    this.box(g, 0.08, 0.1, 0.36, body, 0, 0, -0.42);
    this.box(g, 0.075, 0.07, 0.1, dark, 0, 0.02, -0.6); // muzzle
    const mag = this.box(g, 0.06, 0.18, 0.08, dark, 0, -0.16, -0.28);
    const grip = this.box(g, 0.07, 0.2, 0.1, body, 0, -0.16, -0.28);
    grip.rotation.x = -0.22;
    this.box(g, 0.02, 0.03, 0.02, accent, 0, 0.06, -0.42);
    this.addModel('click9', g, mag);
  }

  private buildHeavyPistol() {
    const body = this.mat(0x3b3026, 0.45, 0.6);
    const accent = this.emis(0xffd23f);
    const dark = this.mat(0x14171d, 0.8, 0.3);
    const g = new THREE.Group();
    this.box(g, 0.095, 0.12, 0.44, body, 0, 0, -0.46);
    this.box(g, 0.085, 0.08, 0.12, dark, 0, 0.02, -0.66);
    const mag = this.box(g, 0.07, 0.2, 0.09, dark, 0, -0.18, -0.3);
    const grip = this.box(g, 0.08, 0.22, 0.11, body, 0, -0.18, -0.3);
    grip.rotation.x = -0.2;
    this.box(g, 0.025, 0.035, 0.02, accent, 0, 0.08, -0.46);
    this.addModel('handCannon', g, mag);
  }

  private buildKnife() {
    const blade = this.mat(0x9aa0ad, 0.25, 0.95);
    const grip = this.mat(0x222630, 0.7, 0.2);
    const accent = this.emis(0xff5470);
    const g = new THREE.Group();
    this.box(g, 0.04, 0.02, 0.36, blade, 0, 0, -0.5);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 4), blade);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0, 0, -0.73);
    g.add(tip);
    this.box(g, 0.05, 0.06, 0.16, grip, 0, -0.02, -0.28);
    this.box(g, 0.12, 0.03, 0.03, accent, 0, 0, -0.37);
    this.addModel('bonkKnife', g);
  }

  // ------------------------------------------------------------------- api
  setWeapon(def: WeaponDef) {
    this.activeId = def.id;
    for (const [id, g] of this.models) g.visible = id === def.id;
    this.recoilZ = 0;
    this.recoilPitch = 0;
    const rifleLike = def.slotKind === 'primary';
    this.setHandPositions(rifleLike, def);
    // reset any mag offset from a previous reload
    const g = this.models.get(def.id);
    const mag = g?.userData.mag as THREE.Mesh | undefined;
    const magBase = g?.userData.magBase as THREE.Vector3 | undefined;
    if (mag && magBase) {
      mag.position.copy(magBase);
      mag.rotation.set(0, 0, 0);
    }
  }

  onFire(def: WeaponDef) {
    if (def.type === 'knife') {
      this.swingT = 1;
      return;
    }
    const heavy = def.type === 'sniper' || def.type === 'shotgun';
    this.recoilZ = Math.min(0.18, this.recoilZ + (heavy ? 0.12 : 0.06));
    this.recoilPitch = Math.min(0.4, this.recoilPitch + def.recoilPitch * (heavy ? 5 : 6));
    this.muzzleTimer = 0.05;
    (this.muzzle.material as THREE.MeshBasicMaterial).opacity = 0.95;
    this.muzzle.rotation.z = Math.random() * Math.PI;
    const s = (heavy ? 1.0 : 0.7) + Math.random() * 0.6;
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
    this.recoilZ = damp(this.recoilZ, 0, 10, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);

    const adsTarget = opts.ads && !opts.isMelee ? 1 : 0;
    this.adsAmount = damp(this.adsAmount, adsTarget, 12, dt);

    // walk bob
    this.bobPhase += dt * opts.moveSpeed * 1.4;
    const bobMag = Math.min(1, opts.moveSpeed / 5);
    const bobX = Math.cos(this.bobPhase) * 0.012 * bobMag;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.014 * bobMag;

    const px = lerp(this.basePos.x, this.adsPos.x, this.adsAmount) + bobX;
    const py = lerp(this.basePos.y, this.adsPos.y, this.adsAmount) + bobY;
    const pz = lerp(this.basePos.z, this.adsPos.z, this.adsAmount) + this.recoilZ;
    this.root.position.set(px, py, pz);

    // ---- reload animation (two-stage mag swap) ----
    let reloadDip = 0;
    let reloadRot = 0;
    const active = this.models.get(this.activeId);
    const mag = active?.userData.mag as THREE.Mesh | undefined;
    const magBase = active?.userData.magBase as THREE.Vector3 | undefined;
    if (opts.reloadProgress < 1 && !opts.isMelee) {
      const drop = Math.sin(opts.reloadProgress * Math.PI); // 0..1..0
      reloadDip = -drop * 0.14;
      reloadRot = drop * 0.5;
      if (mag && magBase) {
        mag.position.y = magBase.y - drop * 0.22;
        mag.position.x = magBase.x + drop * 0.02;
        mag.rotation.z = drop * 0.5;
      }
      // left hand drops to grab a fresh mag, then returns
      this.handL.position.y = this.handLBase.y - drop * 0.18;
      this.handL.position.z = this.handLBase.z + drop * 0.05;
    } else {
      if (mag && magBase) {
        mag.position.copy(magBase);
        mag.rotation.set(0, 0, 0);
      }
      this.handL.position.x = damp(this.handL.position.x, this.handLBase.x, 12, dt);
      this.handL.position.y = damp(this.handL.position.y, this.handLBase.y, 12, dt);
      this.handL.position.z = damp(this.handL.position.z, this.handLBase.z, 12, dt);
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
