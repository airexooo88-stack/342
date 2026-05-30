import * as THREE from 'three';

/**
 * Procedural materials & canvas textures. No external image assets — every
 * texture is drawn at runtime to a 2D canvas, giving the map its cyber
 * industrial "Banana Yard" look.
 */

function makeCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function texFromCanvas(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Concrete / floor texture with subtle grime and a grid. */
function concreteTexture(base: string, line: string): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // noise speckle
  for (let i = 0; i < 2600; i++) {
    const v = Math.random();
    ctx.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // grid lines
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  return c;
}

/** Metal panel texture with rivets. */
function panelTexture(base: string, accent: string): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 244, 244);
  ctx.strokeRect(28, 28, 200, 200);
  // rivets
  ctx.fillStyle = accent;
  const r = 4;
  for (const [x, y] of [[18, 18], [238, 18], [18, 238], [238, 238], [128, 18], [128, 238], [18, 128], [238, 128]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/** Crate / wood-ish texture with banana stencil. */
function crateTexture(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(256);
  ctx.fillStyle = '#7a5a2e';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#6a4d26';
  for (let i = 0; i < 256; i += 32) ctx.fillRect(0, i, 256, 16);
  ctx.strokeStyle = '#4d3818';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 240);
  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(248, 248);
  ctx.moveTo(248, 8);
  ctx.lineTo(8, 248);
  ctx.stroke();
  // banana stencil
  ctx.save();
  ctx.translate(128, 128);
  ctx.rotate(-0.5);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 56, 20, 0, 0.2, Math.PI - 0.2);
  ctx.fill();
  ctx.restore();
  return c;
}

let cache: Record<string, THREE.Material> | null = null;

export function getMaterials(): Record<string, THREE.MeshStandardMaterial> {
  if (cache) return cache as Record<string, THREE.MeshStandardMaterial>;

  const floor = new THREE.MeshStandardMaterial({
    map: texFromCanvas(concreteTexture('#1b2030', '#2a3346'), 1),
    roughness: 0.92,
    metalness: 0.05,
  });
  const wall = new THREE.MeshStandardMaterial({
    map: texFromCanvas(panelTexture('#252b3a', '#3a4256'), 1),
    roughness: 0.7,
    metalness: 0.3,
  });
  const wallLight = new THREE.MeshStandardMaterial({
    map: texFromCanvas(panelTexture('#33405a', '#536283'), 1),
    roughness: 0.6,
    metalness: 0.35,
  });
  const crate = new THREE.MeshStandardMaterial({
    map: texFromCanvas(crateTexture(), 1),
    roughness: 0.85,
    metalness: 0.05,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x6a7488,
    roughness: 0.35,
    metalness: 0.85,
  });
  const accentCrew = new THREE.MeshStandardMaterial({
    color: 0xffce42,
    emissive: 0x6a4f00,
    roughness: 0.4,
    metalness: 0.2,
  });
  const accentGuard = new THREE.MeshStandardMaterial({
    color: 0x4fb0ff,
    emissive: 0x103a66,
    roughness: 0.4,
    metalness: 0.2,
  });
  const neon = new THREE.MeshStandardMaterial({
    color: 0x36e0c8,
    emissive: 0x18b8a4,
    emissiveIntensity: 1.4,
    roughness: 0.3,
    metalness: 0.1,
  });
  const siteA = new THREE.MeshStandardMaterial({
    color: 0xffd23f,
    emissive: 0x7a5c00,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.35,
    roughness: 0.6,
  });
  const siteB = new THREE.MeshStandardMaterial({
    color: 0xff5470,
    emissive: 0x6a1226,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.35,
    roughness: 0.6,
  });

  cache = { floor, wall, wallLight, crate, metal, accentCrew, accentGuard, neon, siteA, siteB };
  return cache as Record<string, THREE.MeshStandardMaterial>;
}
