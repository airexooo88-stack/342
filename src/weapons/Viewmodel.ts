import * as THREE from 'three';
import { WeaponDef } from './WeaponDefs';
import { damp, lerp, clamp } from '../core/MathUtils';

type ReloadKind = 'mag' | 'pump' | 'none';

interface HandPose {
  rPos: THREE.Vector3;
  rRot: THREE.Euler;
  lPos: THREE.Vector3;
  lRot: THREE.Euler;
  lVisible: boolean;
}

/**
 * First-person weapon viewmodel. Rendered in its own overlay scene/camera on
 * top of the world (depth cleared) so it never clips into walls.
 *
 * Builds detailed procedural models for every weapon plus gloved player hands,
 * and animates sway, bob, recoil, a multi-stage reload and melee swings.
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
  private pose: HandPose;

  private recoilZ = 0;
  private recoilPitch = 0;
  private swingT = 0;
  private adsAmount = 0;
  private bobPhase = 0;

  private basePos = new THREE.Vector3(0.22, -0.26, -0.55);
  private adsPos = new THREE.Vector3(0, -0.16, -0.42);

  // shared materials
  private mGlove = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.85, metalness: 0.1 });
  private mGloveDark = new THREE.MeshStandardMaterial({ color: 0x181b22, roughness: 0.9, metalness: 0.1 });
  private mGlovePad = new THREE.MeshStandardMaterial({ color: 0x36e0c8, emissive: 0x0c4a44, roughness: 0.6 });

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
    this.pose = this.poseFor('rifle', 'primary');
  }

  // ------------------------------------------------------------------ hands
  /**
   * Builds a gloved hand. Local origin sits at the wrist: the forearm runs back
   * toward the camera (+Z), the palm + curled fingers reach forward (-Z) so the
   * hand reads as gripping whatever it's placed on.
   */
  private buildHand(): THREE.Group {
    const g = new THREE.Group();

    // forearm tapering into a glove cuff
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.072, 0.32, 12), this.mGlove);
    forearm.rotation.x = Math.PI / 2;
    forearm.position.z = 0.2;
    g.add(forearm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.06, 12), this.mGloveDark);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = 0.05;
    g.add(cuff);
    const cuffPad = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, 0.05), this.mGlovePad);
    cuffPad.position.set(0, 0.055, 0.06);
    g.add(cuffPad);

    // palm / back of hand
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.05, 0.11), this.mGlove);
    palm.position.set(0, 0, -0.06);
    g.add(palm);
    // knuckle pad
    const knucklePad = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.024, 0.045), this.mGloveDark);
    knucklePad.position.set(0, 0.028, -0.1);
    g.add(knucklePad);

    // four fingers that curl down over the front edge (two segments each)
    for (let i = 0; i < 4; i++) {
      const x = -0.033 + i * 0.022;
      const finger = new THREE.Group();
      finger.position.set(x, 0.012, -0.12);
      const prox = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.022), this.mGlove);
      prox.position.set(0, -0.022, 0);
      finger.add(prox);
      const dist = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.042, 0.02), this.mGloveDark);
      dist.position.set(0, -0.045, -0.016);
      dist.rotation.x = -0.9; // curl the tip under
      finger.add(dist);
      // slight stagger so the fist isn't flat
      finger.rotation.x = 0.2 + i * 0.04;
      g.add(finger);
    }

    // thumb wrapping from the side
    const thumb = new THREE.Group();
    thumb.position.set(0.05, -0.01, -0.05);
    const tprox = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.05), this.mGlove);
    tprox.position.set(0.01, 0, -0.02);
    thumb.add(tprox);
    const tdist = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.045), this.mGloveDark);
    tdist.position.set(-0.01, -0.01, -0.06);
    tdist.rotation.y = 0.7;
    thumb.add(tdist);
    thumb.rotation.z = -0.3;
    g.add(thumb);

    return g;
  }

  private buildHands() {
    this.handL = this.buildHand();
    this.handR = this.buildHand();
    this.root.add(this.handL);
    this.root.add(this.handR);
  }

  /** Per-archetype hand placement (position + orientation). */
  private poseFor(type: string, slotKind: string): HandPose {
    if (type === 'knife') {
      return {
        rPos: new THREE.Vector3(0.0, -0.11, -0.3),
        rRot: new THREE.Euler(-0.5, -0.2, 0.25),
        lPos: new THREE.Vector3(0.2, -0.3, -0.1),
        lRot: new THREE.Euler(0, 0, 0),
        lVisible: false, // knife is one-handed
      };
    }
    if (type === 'shotgun') {
      return {
        rPos: new THREE.Vector3(0.02, -0.15, -0.34),
        rRot: new THREE.Euler(-0.55, -0.25, 0.15),
        lPos: new THREE.Vector3(0.0, -0.085, -0.74),
        lRot: new THREE.Euler(-0.6, 0.18, -0.18),
        lVisible: true,
      };
    }
    if (slotKind === 'secondary') {
      // two-handed pistol grip
      return {
        rPos: new THREE.Vector3(0.0, -0.14, -0.31),
        rRot: new THREE.Euler(-0.5, -0.15, 0.12),
        lPos: new THREE.Vector3(0.05, -0.17, -0.39),
        lRot: new THREE.Euler(-0.4, 0.3, -0.15),
        lVisible: true,
      };
    }
    // rifle / smg / sniper
    return {
      rPos: new THREE.Vector3(0.02, -0.15, -0.3),
      rRot: new THREE.Euler(-0.55, -0.22, 0.15),
      lPos: new THREE.Vector3(-0.02, -0.07, -0.66),
      lRot: new THREE.Euler(-0.5, 0.2, -0.2),
      lVisible: true,
    };
  }

  private applyPose() {
    const p = this.pose;
    this.handR.position.copy(p.rPos);
    this.handR.rotation.copy(p.rRot);
    this.handL.position.copy(p.lPos);
    this.handL.rotation.copy(p.lRot);
    this.handL.visible = p.lVisible;
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

  private addModel(id: string, g: THREE.Group, mag?: THREE.Mesh, kind: ReloadKind = mag ? 'mag' : 'none', charging = false) {
    g.visible = false;
    if (mag) {
      g.userData.mag = mag;
      g.userData.magBase = mag.position.clone();
    }
    g.userData.kind = kind;
    g.userData.charging = charging;
    this.models.set(id, g);
    this.root.add(g);
  }

  private buildRifle() {
    const body = this.mat(0x3a3f4b, 0.55, 0.55);
    const dark = this.mat(0x16191f, 0.8, 0.3);
    const accent = this.emis(0xffd23f);
    const g = new THREE.Group();
    this.box(g, 0.1, 0.13, 0.72, body, 0, 0, -0.56);
    this.box(g, 0.08, 0.09, 0.34, dark, 0, 0.01, -0.8);
    this.cyl(g, 0.022, 0.022, 0.5, dark, 0, 0.02, -0.98);
    const mag = this.box(g, 0.07, 0.24, 0.12, dark, 0, -0.17, -0.5);
    mag.rotation.x = 0.18;
    this.box(g, 0.085, 0.12, 0.22, body, 0, -0.01, -0.18); // stock
    this.box(g, 0.022, 0.06, 0.02, accent, 0, 0.1, -0.5); // sight post
    this.box(g, 0.05, 0.03, 0.12, dark, 0, 0.1, -0.34); // rail/sight
    const grip = this.box(g, 0.06, 0.17, 0.08, dark, 0, -0.15, -0.34);
    grip.rotation.x = -0.3;
    this.addModel('spray47', g, mag, 'mag', true);
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
    this.addModel('buzz9', g, mag, 'mag', true);
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
    this.box(g, 0.09, 0.13, 0.22, body, 0, -0.02, -0.2); // stock
    this.box(g, 0.03, 0.03, 0.08, accent, 0, 0.09, -0.5);
    const grip = this.box(g, 0.06, 0.15, 0.08, dark, 0, -0.14, -0.34);
    grip.rotation.x = -0.3;
    this.addModel('thumper', g, pump, 'pump', false);
  }

  private buildSniper() {
    const body = this.mat(0x2a2f38, 0.45, 0.6);
    const dark = this.mat(0x101216, 0.8, 0.3);
    const accent = this.emis(0x9b7bff);
    const g = new THREE.Group();
    this.box(g, 0.1, 0.12, 0.95, body, 0, 0, -0.62);
    this.cyl(g, 0.02, 0.02, 0.7, dark, 0, 0.02, -1.05); // long barrel
    this.cyl(g, 0.05, 0.05, 0.34, dark, 0, 0.12, -0.5); // scope
    this.box(g, 0.02, 0.04, 0.02, accent, 0, 0.12, -0.66);
    const mag = this.box(g, 0.06, 0.16, 0.12, dark, 0, -0.14, -0.45);
    this.box(g, 0.09, 0.14, 0.3, body, 0, -0.02, -0.14); // long stock
    const grip = this.box(g, 0.06, 0.16, 0.08, dark, 0, -0.15, -0.32);
    grip.rotation.x = -0.3;
    this.addModel('longscope', g, mag, 'mag', true);
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
    this.addModel('click9', g, mag, 'mag', false);
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
    this.addModel('handCannon', g, mag, 'mag', false);
  }

  /**
   * A detailed tactical combat knife: clip-point blade with a bright edge, a
   * fuller groove and spine jimping, an accent crossguard, a ridged wrapped
   * handle and a pommel with a lanyard ring.
   */
  private buildKnife() {
    const steel = this.mat(0xc6ccd6, 0.28, 0.92);
    const edge = new THREE.MeshStandardMaterial({ color: 0xeef3fb, roughness: 0.15, metalness: 0.95 });
    const coat = this.mat(0x23272f, 0.7, 0.4); // spine coating
    const handle = this.mat(0x1b1e25, 0.75, 0.2);
    const handleRidge = this.mat(0x2c313b, 0.7, 0.2);
    const accent = this.emis(0xff5470);

    const g = new THREE.Group();

    // --- blade (flat in X, tall in Y, long in Z, edge facing down) ---
    const blade = this.box(g, 0.014, 0.05, 0.34, steel, 0, 0.005, -0.53);
    // spine coating (top of blade)
    this.box(g, 0.016, 0.016, 0.34, coat, 0, 0.028, -0.53);
    // bright cutting edge (bottom of blade)
    this.box(g, 0.016, 0.012, 0.33, edge, 0, -0.022, -0.52);
    // fuller groove (thin inset line on the blade side)
    this.box(g, 0.006, 0.01, 0.22, coat, 0.007, 0.006, -0.5);
    // clip point: angled top cut near the tip
    const clip = this.box(g, 0.015, 0.03, 0.12, coat, 0, 0.02, -0.66);
    clip.rotation.x = -0.25;
    // tip (flattened pyramid pointing forward)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.14, 4), steel);
    tip.rotation.x = -Math.PI / 2;
    tip.rotation.z = Math.PI / 4;
    tip.scale.set(0.5, 1, 1); // flatten to a blade tip
    tip.position.set(0, -0.003, -0.74);
    g.add(tip);
    // spine jimping (grip notches near the ricasso)
    for (let i = 0; i < 4; i++) {
      this.box(g, 0.018, 0.012, 0.012, coat, 0, 0.03, -0.4 - i * 0.02);
    }
    void blade;

    // --- crossguard ---
    this.box(g, 0.13, 0.034, 0.045, accent, 0, 0, -0.35);
    this.box(g, 0.05, 0.05, 0.04, coat, 0, 0, -0.33); // ricasso collar

    // --- handle: tapered core + alternating grip ridges ---
    const core = this.box(g, 0.045, 0.058, 0.2, handle, 0, -0.004, -0.24);
    core.rotation.x = 0.04;
    for (let i = 0; i < 5; i++) {
      const z = -0.16 - i * 0.035;
      this.box(g, 0.052, 0.066, 0.016, handleRidge, 0, -0.006, z);
    }
    // --- pommel with lanyard ring ---
    this.box(g, 0.05, 0.062, 0.04, accent, 0, -0.008, -0.15);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 8, 16), this.mat(0x9aa0ad, 0.4, 0.8));
    ring.position.set(0, -0.008, -0.13);
    g.add(ring);

    this.addModel('bonkKnife', g, undefined, 'none', false);
  }

  // ------------------------------------------------------------------- api
  setWeapon(def: WeaponDef) {
    this.activeId = def.id;
    for (const [id, g] of this.models) g.visible = id === def.id;
    this.recoilZ = 0;
    this.recoilPitch = 0;
    this.pose = this.poseFor(def.type, def.slotKind);
    this.applyPose();
    // reset any mag/forend offset left over from a previous reload
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

  // easing helpers
  private seg(p: number, a: number, b: number) {
    return clamp((p - a) / (b - a), 0, 1);
  }
  private smooth(t: number) {
    return t * t * (3 - 2 * t);
  }

  /**
   * Drives the reload animation. Returns the extra root transform (dip/roll/
   * pitch/z) while also moving the magazine/forend and the left (support) hand.
   */
  private animateReload(p: number, dt: number): { dipY: number; pitch: number; roll: number; z: number } {
    const out = { dipY: 0, pitch: 0, roll: 0, z: 0 };
    const active = this.models.get(this.activeId);
    if (!active) return out;
    const kind = (active.userData.kind as ReloadKind) ?? 'none';
    const mag = active.userData.mag as THREE.Mesh | undefined;
    const magBase = active.userData.magBase as THREE.Vector3 | undefined;
    const lBase = this.pose.lPos;

    if (p >= 1 || kind === 'none') {
      // settle back to rest
      if (mag && magBase) {
        mag.position.copy(magBase);
        mag.rotation.set(0, 0, 0);
      }
      this.handL.position.x = damp(this.handL.position.x, lBase.x, 14, dt);
      this.handL.position.y = damp(this.handL.position.y, lBase.y, 14, dt);
      this.handL.position.z = damp(this.handL.position.z, lBase.z, 14, dt);
      return out;
    }

    if (kind === 'pump') {
      // shotgun: rack the forend back and forth a few times
      const cycles = 3;
      const slide = 0.5 - 0.5 * Math.cos(p * cycles * Math.PI * 2); // 0..1 oscillation
      if (mag && magBase) mag.position.z = magBase.z + slide * 0.12; // slide toward camera
      out.pitch = Math.sin(p * Math.PI) * 0.14;
      out.dipY = -Math.sin(p * Math.PI) * 0.05;
      // support hand rides the forend
      this.handL.position.set(lBase.x, lBase.y - slide * 0.03, lBase.z + slide * 0.12);
      return out;
    }

    // ---- magazine swap (rifle / smg / pistol / sniper) ----
    const bringIn = this.smooth(this.seg(p, 0.0, 0.16));
    const bringOut = this.smooth(this.seg(p, 0.82, 1.0));
    const present = bringIn - bringOut; // ~1 through the middle
    out.pitch = present * 0.42; // tilt the weapon toward the camera
    out.roll = present * 0.5; // roll to expose the magwell
    out.dipY = -present * 0.12;

    // magazine: eject (down/out) then a fresh one inserts (up into place)
    const eject = this.smooth(this.seg(p, 0.16, 0.42));
    const insert = this.smooth(this.seg(p, 0.56, 0.8));
    let magY = 0;
    let magRot = 0;
    if (p < 0.5) {
      magY = -eject * 0.34;
      magRot = eject * 0.6;
    } else {
      magY = -0.34 * (1 - insert);
      magRot = 0.6 * (1 - insert);
    }
    if (mag && magBase) {
      mag.position.y = magBase.y + magY;
      mag.position.x = magBase.x + (1 - Math.abs(insert - eject)) * 0.0;
      mag.rotation.z = magRot;
    }

    // support hand: drop to belt to fetch a fresh mag, then push it home
    const grab = this.smooth(this.seg(p, 0.3, 0.55)); // dips off-screen to grab
    const ret = this.smooth(this.seg(p, 0.56, 0.82)); // comes back up
    const handDip = -0.26 * grab + 0.26 * ret;
    this.handL.position.set(
      lBase.x + present * 0.04,
      lBase.y + magY * 0.4 + handDip,
      lBase.z + present * 0.05
    );

    // charging-handle tug near the end (rifles/smgs/snipers)
    if (active.userData.charging) {
      const tug = Math.exp(-Math.pow((p - 0.9) / 0.035, 2));
      out.z = tug * 0.07;
    }
    return out;
  }

  update(
    dt: number,
    opts: { moveSpeed: number; ads: boolean; reloadProgress: number; isMelee: boolean }
  ) {
    this.recoilZ = damp(this.recoilZ, 0, 10, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);

    const reloading = opts.reloadProgress < 1 && !opts.isMelee;
    // can't ADS mid-reload
    const adsTarget = opts.ads && !opts.isMelee && !reloading ? 1 : 0;
    this.adsAmount = damp(this.adsAmount, adsTarget, 12, dt);

    // walk bob
    this.bobPhase += dt * opts.moveSpeed * 1.4;
    const bobMag = Math.min(1, opts.moveSpeed / 5);
    const bobX = Math.cos(this.bobPhase) * 0.012 * bobMag;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.014 * bobMag;

    const px = lerp(this.basePos.x, this.adsPos.x, this.adsAmount) + bobX;
    const py = lerp(this.basePos.y, this.adsPos.y, this.adsAmount) + bobY;
    const pz = lerp(this.basePos.z, this.adsPos.z, this.adsAmount) + this.recoilZ;

    // reload animation (mag swap / pump / settle)
    const r = this.animateReload(opts.reloadProgress, dt);

    this.root.position.set(px, py + r.dipY, pz + r.z);

    // melee swing
    let swingRot = 0;
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt * 5);
      swingRot = Math.sin((1 - this.swingT) * Math.PI) * -1.1;
    }

    this.root.rotation.set(this.recoilPitch + r.pitch + swingRot, 0, r.roll);

    // muzzle flash fade
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      const m = this.muzzle.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, m.opacity - dt * 18);
    }
  }
}
