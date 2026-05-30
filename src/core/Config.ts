/**
 * Central tunable constants for Clutch Ops: Banana Protocol.
 * Keeping these in one place makes balancing the prototype easy.
 */

export const GAME = {
  title: 'CLUTCH OPS',
  subtitle: 'BANANA PROTOCOL',
  build: 'proto-0.2.0',
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
  buyTime: 15, // seconds of buy phase before the round goes live
  freezeTime: 2, // (legacy) brief settle time, mostly unused now
  roundTime: 95, // seconds for the attackers to plant
  plantTime: 3.2, // seconds to plant the Banana Core
  defuseTime: 5.0, // seconds to defuse
  coreTimer: 35, // seconds until detonation after plant
  endDelay: 4.5, // seconds to show the round result
  scoreToWin: 8, // first team to N round wins
  teamSize: 5, // players per team (incl. the human)
};

// Simple economy for the buy menu. Money persists between rounds.
export const ECONOMY = {
  startMoney: 1600,
  maxMoney: 16000,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
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

// Bot difficulty. Higher aimError + reaction = easier (they miss and react slow).
// These were deliberately softened so bots feel fair, not aimbotty.
export const DIFFICULTY = {
  easy: { aimError: 0.14, reaction: 0.75, aggression: 0.35, fireRateScale: 0.55 },
  normal: { aimError: 0.08, reaction: 0.5, aggression: 0.55, fireRateScale: 0.78 },
  hard: { aimError: 0.045, reaction: 0.32, aggression: 0.75, fireRateScale: 1.0 },
} as const;
export type DifficultyId = keyof typeof DIFFICULTY;

// Damage hit zones
export const HITZONE = {
  HEAD: 'head',
  BODY: 'body',
  LEGS: 'legs',
} as const;
export type HitZone = (typeof HITZONE)[keyof typeof HITZONE];
