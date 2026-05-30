/**
 * Central tunable constants for Clutch Ops: Banana Protocol.
 * Keeping these in one place makes balancing the prototype easy.
 */

export const GAME = {
  title: 'CLUTCH OPS',
  subtitle: 'BANANA PROTOCOL',
  build: 'proto-0.1.0',
};

export const TEAM = {
  CREW: 'crew', // Protocol Crew — attackers, plant the Banana Core
  GUARD: 'guard', // Null Guards — defenders
} as const;
export type TeamId = (typeof TEAM)[keyof typeof TEAM];

export const TEAM_NAME: Record<TeamId, string> = {
  crew: 'Protocol Crew',
  guard: 'Null Guards',
};

export const ROUND = {
  freezeTime: 4, // seconds of buy/freeze before live
  roundTime: 95, // seconds for the attackers to plant
  plantTime: 3.2, // seconds to plant the Banana Core
  defuseTime: 5.0, // seconds to defuse
  coreTimer: 35, // seconds until detonation after plant
  endDelay: 4.5, // seconds to show the round result
  scoreToWin: 8, // first team to N round wins
  teamSize: 5, // players per team (incl. the human)
};

export const PLAYER = {
  radius: 0.42,
  height: 1.75,
  crouchHeight: 1.15,
  eyeHeight: 1.62,
  crouchEyeHeight: 1.05,
  walkSpeed: 3.2,
  runSpeed: 6.0,
  crouchSpeed: 1.9,
  accel: 60,
  airAccel: 12,
  friction: 10,
  jumpSpeed: 5.4,
  gravity: 18,
  maxHealth: 100,
  maxArmor: 100,
};

export const BOT = {
  radius: 0.42,
  height: 1.75,
  eyeHeight: 1.55,
  walkSpeed: 3.0,
  runSpeed: 5.2,
  maxHealth: 100,
  maxArmor: 60,
};

export const DIFFICULTY = {
  easy: { aimError: 0.09, reaction: 0.55, aggression: 0.4, fireRateScale: 0.7 },
  normal: { aimError: 0.045, reaction: 0.35, aggression: 0.6, fireRateScale: 0.85 },
  hard: { aimError: 0.02, reaction: 0.18, aggression: 0.8, fireRateScale: 1.0 },
} as const;
export type DifficultyId = keyof typeof DIFFICULTY;

// Damage hit zones
export const HITZONE = {
  HEAD: 'head',
  BODY: 'body',
  LEGS: 'legs',
} as const;
export type HitZone = (typeof HITZONE)[keyof typeof HITZONE];
