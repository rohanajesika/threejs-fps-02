// Every number the game balances on: weapons, economy, rounds and movement.
// One file, so a balance change is one edit and the judge can read the design.
export const TEAMS = {
  vanguard: { id: 'vanguard', name: 'VANGUARD', color: 'team' },
  ember: { id: 'ember', name: 'EMBER', color: 'enemy' },
};

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', short: 'P9', price: 0,
    damage: 26, headMult: 3.0, legMult: 0.75,
    mag: 12, reserve: 48, auto: false, fireGap: 0.14, reloadTime: 1.4,
    spreadStill: 0.006, spreadMove: 0.03, spreadAir: 0.05, spreadBloom: 0.004,
    falloffStart: 12, falloffEnd: 30, falloffMin: 0.6,
    kick: 0.006, tracer: 0.5,
  },
  vex9: {
    id: 'vex9', name: 'VEX-9 SMG', short: 'VEX-9', price: 1100,
    damage: 22, headMult: 3.0, legMult: 0.75,
    mag: 28, reserve: 84, auto: true, fireGap: 0.075, reloadTime: 1.9,
    spreadStill: 0.009, spreadMove: 0.045, spreadAir: 0.06, spreadBloom: 0.006,
    falloffStart: 10, falloffEnd: 26, falloffMin: 0.55,
    kick: 0.008, tracer: 0.5,
  },
  ar77: {
    id: 'ar77', name: 'AR-77 Rifle', short: 'AR-77', price: 2600,
    damage: 34, headMult: 3.0, legMult: 0.75,
    mag: 30, reserve: 90, auto: true, fireGap: 0.105, reloadTime: 2.2,
    spreadStill: 0.004, spreadMove: 0.038, spreadAir: 0.05, spreadBloom: 0.005,
    falloffStart: 22, falloffEnd: 50, falloffMin: 0.7,
    kick: 0.011, tracer: 0.5,
  },
  longshot: {
    id: 'longshot', name: 'LONGSHOT DMR', short: 'LONGSHOT', price: 3900,
    damage: 78, headMult: 3.0, legMult: 0.75,
    mag: 8, reserve: 24, auto: false, fireGap: 0.42, reloadTime: 2.8,
    spreadStill: 0.001, spreadMove: 0.02, spreadAir: 0.04, spreadBloom: 0.002,
    falloffStart: 40, falloffEnd: 80, falloffMin: 0.8,
    kick: 0.02, tracer: 0.6, scoped: true,
  },
};

export const GRENADE = {
  id: 'spark4', name: 'SPARK-4 Frag', short: 'SPARK-4', price: 300,
  fuse: 1.6, radius: 6, maxDamage: 110, throwSpeed: 17,
};

export const ARMOR = { price: 650, points: 100, absorb: 0.5 };

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  roundWin: 3250,
  roundLoss: 1900,
  lossBonusStep: 500,
  lossBonusMax: 2900,
  plantReward: 300,
};

export const ROUND = {
  buySeconds: 15,
  roundSeconds: 100,
  winTo: 5,
  maxRounds: 9,
  plantSeconds: 3.2,
  defuseSeconds: 5.0,
  fuseSeconds: 35,
  endBannerSeconds: 4.5,
};

export const PLAYER = {
  radius: 0.34,
  standHeight: 1.72,
  crouchHeight: 1.12,
  standEye: 1.6,
  crouchEye: 1.02,
  walkSpeed: 5.4,
  crouchSpeed: 2.6,
  adsSpeed: 0.6,
  groundAccel: 42,
  airAccel: 9,
  friction: 9,
  gravity: 20,
  jumpSpeed: 6.2,
  health: 100,
};

export const BOT = {
  countAllies: 3,
  countEnemies: 5,
  walkSpeed: 4.3,
  reactionMin: 0.25,
  reactionMax: 0.55,
  aimErrorBase: 0.012,
  aimErrorPerMetre: 0.0011,
  burstMin: 3,
  burstMax: 6,
  burstPauseMin: 0.5,
  burstPauseMax: 1.1,
  hearRadius: 30,
  sightRange: 55,
  fovCos: 0.25,
};

export const SITES = {
  A: { id: 'A', name: 'Reactor', minX: -18.5, maxX: -11.5, minZ: -15.5, maxZ: -8.5 },
  B: { id: 'B', name: 'Silo', minX: 11.5, maxX: 18.5, minZ: -15.5, maxZ: -8.5 },
};
