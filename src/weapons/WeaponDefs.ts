/**
 * Original weapon definitions for Clutch Ops: Banana Protocol.
 * Three archetypes — automatic rifle, semi pistol, melee knife.
 * All names/stats are original to this parody.
 */

export type WeaponType = 'rifle' | 'pistol' | 'knife';

export interface WeaponDef {
  id: string;
  name: string;
  slot: 1 | 2 | 3;
  type: WeaponType;

  damage: number; // base body damage
  headMult: number;
  legMult: number;
  armorPen: number; // 0..1, fraction of damage that bypasses armor mitigation

  rpm: number; // rounds per minute (fire rate)
  automatic: boolean;

  magazine: number;
  reserveMax: number;
  reloadTime: number; // seconds

  range: number;

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
  spray47: {
    id: 'spray47',
    name: 'Spray-47',
    slot: 1,
    type: 'rifle',
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
  click9: {
    id: 'click9',
    name: 'Click-9',
    slot: 2,
    type: 'pistol',
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
  bonkKnife: {
    id: 'bonkKnife',
    name: 'Bonk Knife',
    slot: 3,
    type: 'knife',
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

export const LOADOUT_ORDER = ['spray47', 'click9', 'bonkKnife'];
