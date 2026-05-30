import * as THREE from 'three';

/**
 * Background 3D scene for the main menu: a slowly rotating original rifle
 * model floating in a neon-lit industrial void. Rendered by the Game while in
 * the MENU state.
 */
export class MenuScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private weapon = new THREE.Group();
  private pillars: THREE.Mesh[] = [];
  private t = 0;

  constructor() {
    this.scene.background = new THREE.Color(0x080b12);
    this.scene.fog = new THREE.FogExp2(0x080b12, 0.035);
    this.camera.position.set(0, 0.4, 4.2);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0x2a3346, 0.6));
    const key = new THREE.PointLight(0xffd23f, 40, 30, 2);
    key.position.set(3, 3, 3);
    this.scene.add(key);
    const fill = new THREE.PointLight(0x36e0c8, 30, 30, 2);
    fill.position.set(-4, 1, 2);
    this.scene.add(fill);
    const rim = new THREE.PointLight(0xff5470, 24, 30, 2);
    rim.position.set(0, -2, -3);
    this.scene.add(rim);

    this.buildWeapon();
    this.scene.add(this.weapon);
    this.buildEnvironment();

    // floating dust
    const dustGeo = new THREE.BufferGeometry();
    const N = 260;
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 20;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 16 - 4;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0x5a6c8a, size: 0.03, transparent: true, opacity: 0.5 })
    );
    this.scene.add(dust);
  }

  private buildWeapon() {
    const matBody = new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.5, metalness: 0.6 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x16191f, roughness: 0.7, metalness: 0.4 });
    const matAccent = new THREE.MeshStandardMaterial({
      color: 0xffd23f,
      emissive: 0xffd23f,
      emissiveIntensity: 0.7,
      roughness: 0.4,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 2.0), matBody);
    this.weapon.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 16), matDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.06, 1.4);
    this.weapon.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.32), matDark);
    mag.position.set(0, -0.45, -0.2);
    mag.rotation.x = 0.25;
    this.weapon.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.6), matBody);
    stock.position.set(0, -0.02, -1.2);
    this.weapon.add(stock);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), matAccent);
    sight.position.set(0, 0.26, 0.2);
    this.weapon.add(sight);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.24), matDark);
    grip.position.set(0, -0.4, -0.7);
    grip.rotation.x = -0.35;
    this.weapon.add(grip);
    // banana-yellow accent rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 1.2), matAccent);
    rail.position.set(0, 0.2, 0.4);
    this.weapon.add(rail);

    this.weapon.scale.setScalar(1.1);
  }

  private buildEnvironment() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x161a24, roughness: 0.9, metalness: 0.2 });
    const neon = new THREE.MeshStandardMaterial({ color: 0x36e0c8, emissive: 0x18b8a4, emissiveIntensity: 1 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 7;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10, 0.6), mat);
      pillar.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 4);
      this.scene.add(pillar);
      this.pillars.push(pillar);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 8, 0.08), neon);
      strip.position.copy(pillar.position);
      strip.position.x += 0.34;
      this.scene.add(strip);
    }
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x0c0f16, roughness: 0.8, metalness: 0.3 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3;
    this.scene.add(floor);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) {
    this.t += dt;
    this.weapon.rotation.y += dt * 0.5;
    this.weapon.rotation.z = Math.sin(this.t * 0.6) * 0.08;
    this.weapon.position.y = Math.sin(this.t * 0.9) * 0.12;
  }
}
