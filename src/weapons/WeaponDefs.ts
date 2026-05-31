/**
 * Original weapon definitions for Clutch Ops: Banana Protocol.
 * Archetypes: rifle, SMG, shotgun, sniper, pistol, melee. All names/stats are
 * original to this parody.
 */

export type WeaponType = 'rifle' | 'smg' | 'shotgun' | 'sniper' | 'pistol' | 'knife';
export type SlotKind = 'primary' | 'secondary' | 'melee';

export interface WeaponDef {
  id: string;
  name: string;
  slot: 1 | 2 | 3;
  type: WeaponType;
  slotKind: SlotKind;
  category: string; // human-readable for the buy menu
  price: number;

  damage: number; // base body damage (per pellet for shotguns)
  headMult: number;
  legMult: number;
  armorPen: number; // 0..1, fraction of damage that bypasses armor mitigation

  rpm: number; // rounds per minute (fire rate)
  automatic: boolean;
  pellets?: number; // >1 for shotguns

  magazine: number;
  reserveMax: number;
  reloadTime: number; // seconds

  range: number;
  adsZoom: number; // fov multiplier when aiming (lower = more zoom)

  // accuracy (radians)
  baseSpread: number; // standing, hip
  adsSpread: number; // aiming down sights
  moveSpread: number; // additional spread while moving

  // recoil (radians of camera kick per shot)
  recoilPitch: number;
  recoilYaw: number;
  recoilRise: number; // how fast vertical kick grows over a burst
  recoverSpeed: number; // recoil recovery lambda

  knifeRange?: number;
  color: number; // viewmodel base color
  accent: number;
}

export const WEAPON_DEFS: Record<string, WeaponDef> = {
  // ---- primaries ----
  spray47: {
    id: 'spray47',
    name: 'Spray-47',
    slot: 1,
    type: 'rifle',
    slotKind: 'primary',
    category: 'Assault Rifle',
    price: 2700,
    damage: 27,
    headMult: 4.0,
    legMult: 0.75,
    armorPen: 0.75,
    rpm: 600,
    automatic: true,
    magazine: 30,
    reserveMax: 90,
    reloadTime: 2.4,
    range: 120,
    adsZoom: 0.82,
    baseSpread: 0.022,
    adsSpread: 0.006,
    moveSpread: 0.05,
    recoilPitch: 0.012,
    recoilYaw: 0.006,
    recoilRise: 1.7,
    recoverSpeed: 7,
    color: 0x3a3f4b,
    accent: 0xffd23f,
  },
  buzz9: {
    id: 'buzz9',
    name: 'Buzz-9',
    slot: 1,
    type: 'smg',
    slotKind: 'primary',
    category: 'SMG',
    price: 1100,
    damage: 22,
    headMult: 3.2,
    legMult: 0.85,
    armorPen: 0.55,
    rpm: 850,
    automatic: true,
    magazine: 30,
    reserveMax: 120,
    reloadTime: 2.1,
    range: 80,
    adsZoom: 0.86,
    baseSpread: 0.03,
    adsSpread: 0.012,
    moveSpread: 0.035,
    recoilPitch: 0.009,
    recoilYaw: 0.005,
    recoilRise: 1.3,
    recoverSpeed: 9,
    color: 0x33373f,
    accent: 0x36e0c8,
  },
  thumper: {
    id: 'thumper',
    name: 'Thumper-12',
    slot: 1,
    type: 'shotgun',
    slotKind: 'primary',
    category: 'Shotgun',
    price: 1700,
    damage: 13,
    headMult: 1.8,
    legMult: 0.9,
    armorPen: 0.5,
    rpm: 80,
    automatic: false,
    pellets: 9,
    magazine: 7,
    reserveMax: 32,
    reloadTime: 3.2,
    range: 35,
    adsZoom: 0.95,
    baseSpread: 0.07,
    adsSpread: 0.05,
    moveSpread: 0.03,
    recoilPitch: 0.05,
    recoilYaw: 0.012,
    recoilRise: 0.6,
    recoverSpeed: 6,
    color: 0x4a3526,
    accent: 0xff8a3f,
  },
  longscope: {
    id: 'longscope',
    name: 'LongScope-X',
    slot: 1,
    type: 'sniper',
    slotKind: 'primary',
    category: 'Sniper',
    price: 4700,
    damage: 115,
    headMult: 2.0,
    legMult: 0.45,
    armorPen: 0.95,
    rpm: 41,
    automatic: false,
    magazine: 5,
    reserveMax: 20,
    reloadTime: 3.4,
    range: 220,
    adsZoom: 0.4,
    baseSpread: 0.05, // very inaccurate from the hip
    adsSpread: 0.0009, // pin-point when scoped & still
    moveSpread: 0.12,
    recoilPitch: 0.06,
    recoilYaw: 0.01,
    recoilRise: 0.4,
    recoverSpeed: 4,
    color: 0x2a2f38,
    accent: 0x9b7bff,
  },
  // ---- secondaries ----
  click9: {
    id: 'click9',
    name: 'Click-9',
    slot: 2,
    type: 'pistol',
    slotKind: 'secondary',
    category: 'Pistol (free)',
    price: 0,
    damage: 24,
    headMult: 4.2,
    legMult: 0.8,
    armorPen: 0.55,
    rpm: 360,
    automatic: false,
    magazine: 13,
    reserveMax: 52,
    reloadTime: 1.8,
    range: 90,
    adsZoom: 0.86,
    baseSpread: 0.016,
    adsSpread: 0.005,
    moveSpread: 0.04,
    recoilPitch: 0.018,
    recoilYaw: 0.004,
    recoilRise: 1.1,
    recoverSpeed: 9,
    color: 0x2c3038,
    accent: 0x36e0c8,
  },
  handCannon: {
    id: 'handCannon',
    name: 'Hand-Cannon',
    slot: 2,
    type: 'pistol',
    slotKind: 'secondary',
    category: 'Heavy Pistol',
    price: 700,
    damage: 56,
    headMult: 2.4,
    legMult: 0.85,
    armorPen: 0.8,
    rpm: 150,
    automatic: false,
    magazine: 7,
    reserveMax: 28,
    reloadTime: 2.3,
    range: 100,
    adsZoom: 0.9,
    baseSpread: 0.02,
    adsSpread: 0.006,
    moveSpread: 0.06,
    recoilPitch: 0.045,
    recoilYaw: 0.012,
    recoilRise: 1.0,
    recoverSpeed: 6,
    color: 0x3b3026,
    accent: 0xffd23f,
  },
  // ---- melee ----
  bonkKnife: {
    id: 'bonkKnife',
    name: 'Bonk Knife',
    slot: 3,
    type: 'knife',
    slotKind: 'melee',
    category: 'Melee',
    price: 0,
    damage: 55,
    headMult: 1.6,
    legMult: 1.0,
    armorPen: 0.9,
    rpm: 120,
    automatic: false,
    magazine: 0,
    reserveMax: 0,
    reloadTime: 0,
    range: 2.4,
    adsZoom: 1,
    baseSpread: 0,
    adsSpread: 0,
    moveSpread: 0,
    recoilPitch: 0.01,
    recoilYaw: 0.01,
    recoilRise: 1,
    recoverSpeed: 10,
    knifeRange: 2.4,
    color: 0x8a8f9a,
    accent: 0xff5470,
  },
};

// Buy-menu catalogs.
export const BUY_PRIMARIES = ['buzz9', 'thumper', 'spray47', 'longscope'];
export const BUY_SECONDARIES = ['click9', 'handCannon'];
export const KNIFE_ID = 'bonkKnife';
export const DEFAULT_SECONDARY = 'click9';

// Legacy export kept for compatibility.
export const LOADOUT_ORDER = ['spray47', 'click9', 'bonkKnife'];
