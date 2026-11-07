/* =====================================================================
 * Crownhold — data/defs.js
 * Global config + every data-driven definition in the game.
 * Ranges and speeds are in TILES; the engine converts to pixels.
 * Add content here; the engine, UI and save system pick it up.
 * ===================================================================== */
window.CH = window.CH || {};

CH.CONFIG = {
  VERSION: '1.0.0',
  SAVE_KEY: 'crownhold.save.v1',
  COLS: 30, ROWS: 22, T: 32,
  STEP: 1 / 60,
  MAX_CASTLE: 8,
  // Buildable kingdom area (cols, rows) for each castle level; it grows when the castle is upgraded.
  AREA: [[14, 12], [16, 13], [18, 14], [20, 15], [22, 16], [24, 17], [26, 18], [26, 18]],
  START_RES: { gold: 750, wood: 750, stone: 500, gems: 30, runes: 0 },
  RAID_TIME: 180,
  WALL_PATH_COST: 7,      // extra A* cost for walking through a wall tile (attackers break it)
  BUILDING_PATH_COST: 22, // extra A* cost for walking through any other building
};

CH.util = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  geo: (base, growth, L) => Math.round(base * Math.pow(growth, L - 1)),
  rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  pick: (arr, rnd) => arr[Math.floor(rnd() * arr.length)],
  fmt(n) { n = Math.floor(n); return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n); },
  time(s) { s = Math.max(0, Math.ceil(s)); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'm ' + (s % 60) + 's'; return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; },
};

const g = CH.util.geo;
const costFn = (gold, wood, stone, gr) => L => ({ gold: gold ? g(gold, gr, L) : 0, wood: wood ? g(wood, gr, L) : 0, stone: stone ? g(stone, gr, L) : 0 });

/* ---------------------------------------------------------------------
 * BUILDINGS
 *  cat: core | econ | storage | army | defense | wall | trap | obstacle | objective
 *  counts[castleLevel-1] = how many you may own at that castle level
 *  cost(L) / time(L): price and seconds to build or upgrade TO level L
 *  Max building level is min(maxLevel, castleLevel + 1) (castle: maxLevel)
 * ------------------------------------------------------------------- */
CH.BUILDINGS = {
  castle: { name: 'Castle', cat: 'core', size: 3, unlock: 1, counts: [1, 1, 1, 1, 1, 1, 1, 1], maxLevel: 8,
    cost: costFn(450, 450, 300, 2.05), time: L => g(12, 1.75, L - 1), hp: L => g(2600, 1.35, L),
    cap: L => g(1500, 1.6, L), loot: 0.3,
    atk: { kind: 'arrow', dmg: L => g(20, 1.3, L), rate: 1.0, range: 5, air: true, ground: true },
    desc: 'The heart of your kingdom. Its garrison of archers defends it. Its level caps every other building and unlocks new structures, regions and modes. If it falls in a defense, the battle is lost.' },
  builderHut: { name: 'Builder Hut', cat: 'core', size: 2, unlock: 1, counts: [2, 2, 3, 3, 3, 4, 4, 5], maxLevel: 1,
    cost: () => ({ gold: 0, wood: 0, stone: 0 }), countCost: n => ({ gold: g(900, 2.6, n - 1), wood: g(600, 2.6, n - 1), stone: 0 }),
    time: () => 5, hp: () => 400, desc: 'Each hut is one builder. More builders let you construct more things at once.' },
  goldMine: { name: 'Gold Mine', cat: 'econ', size: 2, unlock: 1, counts: [1, 2, 2, 3, 3, 3, 4, 4], maxLevel: 8, res: 'gold',
    cost: costFn(0, 140, 50, 1.85), time: L => g(4, 1.8, L), hp: L => g(420, 1.3, L),
    prod: L => g(36, 1.4, L), buf: L => g(36, 1.4, L) * 40, loot: 0.5, desc: 'Digs up gold over time. Tap it to collect.' },
  lumberMill: { name: 'Lumber Mill', cat: 'econ', size: 2, unlock: 1, counts: [1, 2, 2, 3, 3, 3, 4, 4], maxLevel: 8, res: 'wood',
    cost: costFn(140, 0, 50, 1.85), time: L => g(4, 1.8, L), hp: L => g(420, 1.3, L),
    prod: L => g(36, 1.4, L), buf: L => g(36, 1.4, L) * 40, loot: 0.5, desc: 'Cuts wood over time. Tap it to collect.' },
  stoneQuarry: { name: 'Stone Quarry', cat: 'econ', size: 2, unlock: 1, counts: [1, 1, 2, 2, 3, 3, 3, 4], maxLevel: 8, res: 'stone',
    cost: costFn(140, 100, 0, 1.85), time: L => g(5, 1.8, L), hp: L => g(460, 1.3, L),
    prod: L => g(26, 1.4, L), buf: L => g(26, 1.4, L) * 40, loot: 0.5, desc: 'Quarries stone for walls, defenses and research.' },
  goldStorage: { name: 'Gold Vault', cat: 'storage', size: 2, unlock: 1, counts: [1, 1, 2, 2, 2, 3, 3, 3], maxLevel: 8, res: 'gold',
    cost: costFn(0, 220, 120, 1.9), time: L => g(5, 1.8, L), hp: L => g(700, 1.3, L), cap: L => g(2000, 1.7, L), loot: 0.25,
    desc: 'Raises how much gold you can hold.' },
  woodStorage: { name: 'Timber Yard', cat: 'storage', size: 2, unlock: 1, counts: [1, 1, 2, 2, 2, 3, 3, 3], maxLevel: 8, res: 'wood',
    cost: costFn(220, 0, 120, 1.9), time: L => g(5, 1.8, L), hp: L => g(700, 1.3, L), cap: L => g(2000, 1.7, L), loot: 0.25,
    desc: 'Raises how much wood you can hold.' },
  stoneStorage: { name: 'Stone Depot', cat: 'storage', size: 2, unlock: 1, counts: [1, 1, 1, 2, 2, 2, 3, 3], maxLevel: 8, res: 'stone',
    cost: costFn(220, 160, 0, 1.9), time: L => g(5, 1.8, L), hp: L => g(800, 1.3, L), cap: L => g(1600, 1.7, L), loot: 0.25,
    desc: 'Raises how much stone you can hold.' },
  barracks: { name: 'Barracks', cat: 'army', size: 2, unlock: 1, counts: [1, 1, 1, 1, 1, 1, 1, 1], maxLevel: 8,
    cost: costFn(180, 260, 0, 1.95), time: L => g(5, 1.8, L), hp: L => g(600, 1.3, L), housing: L => 20 + 12 * (L - 1),
    desc: 'Trains troops. Each level adds army space and unlocks a stronger unit.' },
  heroHall: { name: 'Hero Hall', cat: 'army', size: 2, unlock: 2, counts: [0, 1, 1, 1, 1, 1, 1, 1], maxLevel: 5,
    cost: costFn(700, 300, 450, 2.2), time: L => g(15, 1.9, L), hp: L => g(900, 1.3, L),
    desc: 'Recruits heroes. Each level unlocks a new hero and raises the hero level cap by 2.' },
  lab: { name: 'Arcane Laboratory', cat: 'army', size: 2, unlock: 3, counts: [0, 0, 1, 1, 1, 1, 1, 1], maxLevel: 5,
    cost: costFn(650, 450, 450, 2.1), time: L => g(15, 1.9, L), hp: L => g(800, 1.3, L),
    desc: 'Researches permanent troop and spell upgrades.' },

  archerTower: { name: 'Archer Tower', cat: 'defense', size: 2, unlock: 1, counts: [1, 2, 2, 3, 3, 4, 4, 5], maxLevel: 8,
    cost: costFn(200, 160, 0, 1.85), time: L => g(5, 1.8, L), hp: L => g(520, 1.3, L),
    atk: { kind: 'arrow', dmg: L => g(17, 1.28, L), rate: 1.4, range: 5.5, air: true, ground: true },
    special: 'Level 4+: fires a second arrow at another target.',
    desc: 'Fast, long-range single-target arrows. Hits ground and air.' },
  cannon: { name: 'Cannon', cat: 'defense', size: 2, unlock: 2, counts: [0, 1, 2, 2, 3, 3, 4, 4], maxLevel: 8,
    cost: costFn(250, 0, 220, 1.85), time: L => g(6, 1.8, L), hp: L => g(700, 1.3, L),
    atk: { kind: 'ball', dmg: L => g(48, 1.3, L), rate: 0.6, range: 4.6, air: false, ground: true },
    special: 'Level 4+: shots knock enemies back and briefly stun them.',
    desc: 'Heavy, slow shots. Ground only.' },
  mageTower: { name: 'Mage Tower', cat: 'defense', size: 2, unlock: 3, counts: [0, 0, 1, 1, 2, 2, 3, 3], maxLevel: 8,
    cost: costFn(330, 100, 260, 1.9), time: L => g(8, 1.8, L), hp: L => g(480, 1.3, L),
    atk: { kind: 'orb', dmg: L => g(30, 1.3, L), rate: 0.7, range: 4.6, air: true, ground: true, splash: 1.0, magic: true },
    special: 'Blast radius grows with level. Ignores armor.',
    desc: 'Arcane blasts that damage everything in an area.' },
  frostTower: { name: 'Frost Spire', cat: 'defense', size: 2, unlock: 4, counts: [0, 0, 0, 1, 1, 2, 2, 2], maxLevel: 8,
    cost: costFn(380, 0, 320, 1.9), time: L => g(9, 1.8, L), hp: L => g(520, 1.3, L),
    atk: { kind: 'frost', dmg: L => g(9, 1.3, L), rate: 1.0, range: 4.2, air: true, ground: true, splash: 1.2, magic: true },
    special: 'Slows enemies by 30% (+4% per level). Level 5+: chance to freeze solid.',
    desc: 'Chills groups of enemies so other towers get more shots.' },
  mortar: { name: 'Mortar', cat: 'defense', size: 2, unlock: 4, counts: [0, 0, 0, 1, 1, 2, 2, 3], maxLevel: 8,
    cost: costFn(420, 0, 400, 1.9), time: L => g(9, 1.8, L), hp: L => g(640, 1.3, L),
    atk: { kind: 'shell', dmg: L => g(42, 1.3, L), rate: 0.25, range: 8.5, min: 2.5, air: false, ground: true, splash: 1.5 },
    special: 'Huge range but a blind spot up close. Level 5+: cluster shells.',
    desc: 'Lobs explosive shells across the map. Ground only.' },
  teslaTower: { name: 'Tesla Coil', cat: 'defense', size: 2, unlock: 5, counts: [0, 0, 0, 0, 1, 2, 2, 3], maxLevel: 8,
    cost: costFn(500, 0, 380, 1.9), time: L => g(10, 1.8, L), hp: L => g(600, 1.3, L),
    atk: { kind: 'zap', dmg: L => g(38, 1.3, L), rate: 0.9, range: 4.0, air: true, ground: true, chain: 2, magic: true },
    special: 'Lightning chains to 2 more enemies (3 at level 4+).',
    desc: 'Instant chain lightning. Great against swarms.' },
  ballista: { name: 'Ballista', cat: 'defense', size: 2, unlock: 6, counts: [0, 0, 0, 0, 0, 1, 1, 2], maxLevel: 8,
    cost: costFn(650, 400, 400, 1.9), time: L => g(12, 1.8, L), hp: L => g(800, 1.3, L),
    atk: { kind: 'bolt', dmg: L => g(150, 1.3, L), rate: 0.35, range: 6.5, air: true, ground: true, vsLarge: 2 },
    special: 'Double damage to large units and bosses. Level 4+: bolts pierce.',
    desc: 'Giant crossbow built to fell giants, trolls and dragons.' },

  wall: { name: 'Wall', cat: 'wall', size: 1, unlock: 1, counts: [12, 25, 40, 55, 70, 85, 100, 120], maxLevel: 8, instant: true,
    cost: costFn(0, 0, 25, 1.9), time: () => 0, hp: L => g(420, 1.45, L), desc: 'Blocks ground enemies, who must break through or walk around.' },
  gate: { name: 'Gate', cat: 'wall', size: 1, unlock: 2, counts: [0, 1, 2, 2, 3, 3, 4, 4], maxLevel: 8, instant: true,
    cost: costFn(0, 90, 120, 1.9), time: () => 0, hp: L => g(1300, 1.45, L), desc: 'A reinforced wall section with three times the health.' },
  spikeTrap: { name: 'Spike Trap', cat: 'trap', size: 1, unlock: 2, counts: [0, 2, 3, 4, 5, 6, 7, 8], maxLevel: 5, instant: true,
    cost: costFn(90, 40, 0, 1.9), time: () => 0, hp: () => 1, trap: { dmg: L => g(110, 1.4, L), radius: 0.6 },
    desc: 'Hidden spikes that hit the first ground enemy to step on them.' },
  bombTrap: { name: 'Bomb Trap', cat: 'trap', size: 1, unlock: 3, counts: [0, 0, 2, 3, 4, 4, 5, 6], maxLevel: 5, instant: true,
    cost: costFn(160, 0, 60, 1.9), time: () => 0, hp: () => 1, trap: { dmg: L => g(140, 1.4, L), radius: 1.6 },
    desc: 'A hidden explosive that damages every ground enemy nearby.' },
  fireTrap: { name: 'Fire Trap', cat: 'trap', size: 1, unlock: 5, counts: [0, 0, 0, 0, 1, 2, 2, 3], maxLevel: 5, instant: true,
    cost: costFn(260, 120, 0, 1.9), time: () => 0, hp: () => 1, trap: { dps: L => g(45, 1.4, L), radius: 1.6, dur: 5 },
    desc: 'Erupts into a burning field that scorches enemies for 5 seconds.' },

  tree: { name: 'Old Tree', cat: 'obstacle', size: 2, unlock: 99, counts: [0], maxLevel: 1, hp: () => 1, desc: 'Clear it to free space. Sometimes hides gems.' },
  rock: { name: 'Boulder', cat: 'obstacle', size: 1, unlock: 99, counts: [0], maxLevel: 1, hp: () => 1, desc: 'Clear it to free space. Sometimes hides gems.' },
  outpost: { name: 'Outpost', cat: 'objective', size: 2, unlock: 99, counts: [0], maxLevel: 8, hp: L => g(1800, 1.3, L),
    atk: { kind: 'arrow', dmg: L => g(18, 1.3, L), rate: 1.0, range: 4.5, air: true, ground: true }, desc: 'A frontier fort with a small archer garrison. You must protect it.' },
};
// Clearing obstacles: small cost, a resource yield and a chance of gems (a free gem source).
CH.OBSTACLE_CLEAR = { tree: { cost: { gold: 60, wood: 0, stone: 0 }, yield: { wood: 120 }, time: 5 }, rock: { cost: { gold: 0, wood: 60, stone: 0 }, yield: { stone: 90 }, time: 5 } };

CH.BUILD_MENU = [
  { id: 'econ', name: 'Economy', types: ['goldMine', 'lumberMill', 'stoneQuarry', 'goldStorage', 'woodStorage', 'stoneStorage', 'builderHut'] },
  { id: 'army', name: 'Army', types: ['barracks', 'heroHall', 'lab'] },
  { id: 'defense', name: 'Defense', types: ['archerTower', 'cannon', 'mageTower', 'frostTower', 'mortar', 'teslaTower', 'ballista'] },
  { id: 'walls', name: 'Walls & traps', types: ['wall', 'gate', 'spikeTrap', 'bombTrap', 'fireTrap'] },
];

/* ---------------------------------------------------------------------
 * UNITS — shared by player troops, summons and enemies
 *  target: any | defense | resource | walls      (building preference)
 *  proj: projectile kind for ranged attackers (omit = melee)
 *  size: body radius in px · large: counts as large for ballista/spearman
 * ------------------------------------------------------------------- */
CH.TROOPS = {
  swordsman: { name: 'Swordsman', cls: 'Basic', housing: 1, cost: 25, time: 3, unlock: 1, hp: 110, dmg: 15, rate: 1.0, range: 0.6, speed: 1.5, target: 'any', size: 9, sprite: 'swordsman', desc: 'Cheap, sturdy frontline fighter.' },
  archer: { name: 'Archer', cls: 'Basic', housing: 1, cost: 30, time: 3, unlock: 1, hp: 50, dmg: 12, rate: 1.0, range: 3.5, speed: 1.5, target: 'any', proj: 'arrow', size: 8, sprite: 'archer', desc: 'Shoots over walls from range. Fragile.' },
  spearman: { name: 'Spearman', cls: 'Basic', housing: 2, cost: 55, time: 5, unlock: 2, hp: 150, dmg: 20, rate: 0.9, range: 1.2, speed: 1.4, target: 'any', vsLarge: 2.5, size: 9, sprite: 'spearman', desc: 'Long reach. Deals 2.5× damage to large units and bosses.' },
  knight: { name: 'Knight', cls: 'Advanced', housing: 4, cost: 130, time: 8, unlock: 3, hp: 560, dmg: 30, rate: 0.9, range: 0.7, speed: 1.15, target: 'defense', armor: 0.3, size: 11, sprite: 'knight', desc: 'Armored. Goes straight for defenses.' },
  mage: { name: 'Battle Mage', cls: 'Advanced', housing: 4, cost: 150, time: 8, unlock: 4, hp: 95, dmg: 36, rate: 0.7, range: 3.2, speed: 1.3, target: 'any', proj: 'orb', splash: 1.0, magic: true, size: 9, sprite: 'mage', desc: 'Area-damage spells from range.' },
  berserker: { name: 'Berserker', cls: 'Advanced', housing: 3, cost: 115, time: 6, unlock: 4, hp: 250, dmg: 26, rate: 1.6, range: 0.6, speed: 1.9, target: 'any', rage: true, size: 10, sprite: 'berserker', desc: 'Fast and frenzied. Below half health it attacks and moves 50% faster.' },
  paladin: { name: 'Paladin', cls: 'Advanced', housing: 5, cost: 190, time: 10, unlock: 5, hp: 480, dmg: 18, rate: 0.9, range: 0.8, speed: 1.15, target: 'any', armor: 0.2, heal: 14, size: 11, sprite: 'paladin', desc: 'Heals nearby allies while fighting.' },
  necromancer: { name: 'Necromancer', cls: 'Advanced', housing: 6, cost: 230, time: 12, unlock: 5, hp: 170, dmg: 18, rate: 0.8, range: 3.0, speed: 1.2, target: 'any', proj: 'shadow', magic: true, summon: { unit: 'skeleton', every: 6, max: 4 }, size: 10, sprite: 'necromancer', desc: 'Raises skeleton warriors as it advances.' },
  giant: { name: 'Giant', cls: 'Special', housing: 8, cost: 310, time: 14, unlock: 6, hp: 1700, dmg: 42, rate: 0.5, range: 0.8, speed: 0.85, target: 'defense', large: true, size: 16, sprite: 'giant', desc: 'Huge health. Ignores everything but defenses.' },
  golem: { name: 'Golem', cls: 'Special', housing: 12, cost: 460, time: 18, unlock: 7, hp: 3400, dmg: 30, rate: 0.6, range: 0.8, speed: 0.65, target: 'defense', large: true, armor: 0.25, split: { unit: 'golemite', count: 2 }, size: 18, sprite: 'golem', desc: 'A walking fortress. Splits into two golemites when destroyed.' },
  dragonRider: { name: 'Dragon Rider', cls: 'Special', housing: 14, cost: 620, time: 20, unlock: 8, hp: 1150, dmg: 60, rate: 0.6, range: 2.5, speed: 1.3, target: 'any', flying: true, proj: 'fire', splash: 1.2, large: true, size: 17, sprite: 'dragonRider', desc: 'Flies over walls and burns everything below.' },
};
CH.TROOP_ORDER = Object.keys(CH.TROOPS);

CH.SUMMONS = {
  skeleton: { name: 'Skeleton', hp: 80, dmg: 12, rate: 1.0, range: 0.6, speed: 1.6, target: 'any', size: 8, sprite: 'skeleton' },
  golemite: { name: 'Golemite', hp: 700, dmg: 18, rate: 0.7, range: 0.7, speed: 0.9, target: 'defense', armor: 0.2, size: 11, sprite: 'golem' },
};

CH.HEROES = {
  king: { name: 'King Aldric', title: 'The Lion of Crownhold', role: 'Tank and leader', unlock: 1, cost: { gold: 1200, wood: 600, stone: 0 },
    hp: 1700, dmg: 70, rate: 1.0, range: 0.8, speed: 1.4, armor: 0.3, size: 13, sprite: 'king', aura: 0.2,
    ability: { id: 'royalCharge', name: 'Royal Charge', desc: 'Slams the ground: damage and a 2 second stun to everything nearby.', cd: 22 },
    desc: 'Boosts the damage of nearby allies by 20% and soaks up punishment.' },
  queen: { name: 'Queen Lyra', title: 'Queen of the Longbow', role: 'Ranged damage', unlock: 2, cost: { gold: 2000, wood: 1500, stone: 0 },
    hp: 750, dmg: 62, rate: 1.2, range: 4.5, speed: 1.5, size: 11, sprite: 'queen', proj: 'arrow',
    ability: { id: 'arrowStorm', name: 'Arrow Storm', desc: 'Looses a volley of 10 arrows at enemies in range.', cd: 18 },
    desc: 'Picks off targets from far away, over walls.' },
  archmage: { name: 'Archmage Velis', title: 'Keeper of the Ninth Star', role: 'Area damage', unlock: 3, cost: { gold: 3200, wood: 0, stone: 2000 },
    hp: 640, dmg: 80, rate: 0.7, range: 4.0, speed: 1.3, size: 11, sprite: 'archmage', proj: 'orb', splash: 1.3, magic: true,
    ability: { id: 'meteor', name: 'Meteor', desc: 'Calls down a meteor that devastates a wide area.', cd: 24 },
    desc: 'Arcane blasts melt groups and buildings alike.' },
  darkKnight: { name: 'Sir Morvane', title: 'The Dark Knight', role: 'Bruiser and sustain', unlock: 4, cost: { gold: 4500, wood: 2500, stone: 2500 },
    hp: 1500, dmg: 95, rate: 0.9, range: 0.8, speed: 1.5, armor: 0.25, lifesteal: 0.3, size: 13, sprite: 'darkKnight',
    ability: { id: 'shadowCleave', name: 'Shadow Cleave', desc: 'A spinning strike that hits everything around him and heals him.', cd: 16 },
    desc: 'Heals himself for 30% of the damage he deals.' },
  necro: { name: 'Mortis', title: 'The Bone Whisperer', role: 'Summoner', unlock: 5, cost: { gold: 6000, wood: 0, stone: 4000 },
    hp: 800, dmg: 50, rate: 0.9, range: 3.5, speed: 1.3, size: 11, sprite: 'necroHero', proj: 'shadow', magic: true,
    summon: { unit: 'skeleton', every: 8, max: 3 },
    ability: { id: 'raiseLegion', name: 'Raise Legion', desc: 'Raises 6 skeleton warriors at once.', cd: 25 },
    desc: 'Keeps a few skeletons at his side and can raise a legion.' },
};
CH.HERO_ORDER = Object.keys(CH.HEROES);
CH.heroUpgradeCost = L => ({ gold: g(900, 1.5, L), wood: 0, stone: g(500, 1.5, L), runes: L >= 4 ? L - 3 : 0 });

CH.SPELLS = {
  fireball: { name: 'Fireball', unlock: 1, charges: 2, radius: 2.0, dmg: L => g(260, 1.35, L), desc: 'Explodes in an area, hurting enemy units and buildings.' },
  heal: { name: 'Healing Rain', unlock: 2, charges: 1, radius: 2.5, heal: L => g(70, 1.3, L), dur: 5, desc: 'Heals your units in an area every second for 5 seconds.' },
  rage: { name: 'Battle Rage', unlock: 3, charges: 1, radius: 2.5, boost: L => 0.35 + 0.05 * L, dur: 7, desc: 'Your units in the area deal more damage and move faster.' },
};
CH.SPELL_ORDER = Object.keys(CH.SPELLS);

/* Research: troop level L multiplies hp and damage by (1 + 0.14·(L-1)). Max troop level = lab level + 1 (max 6). */
CH.RESEARCH = {
  troopMult: L => 1 + 0.14 * (L - 1),
  troopCost: (t, L) => ({ gold: g(150 + CH.TROOPS[t].cost * 4, 1.85, L - 1), wood: 0, stone: g(80 + CH.TROOPS[t].cost * 3, 1.85, L - 1) }),
  spellCost: L => ({ gold: g(500, 1.9, L - 1), wood: 0, stone: g(400, 1.9, L - 1) }),
  time: L => g(10, 1.9, L - 1),
  maxLevel: labL => Math.min(6, labL + 1),
};

/* ---------------------------------------------------------------------
 * ENEMIES (AI attackers in Campaign and Endless Defense)
 * gold = battle gold in campaign · threat = wave budget cost
 * ------------------------------------------------------------------- */
CH.ENEMIES = {
  goblin: { name: 'Goblin', hp: 60, dmg: 10, rate: 1.1, range: 0.6, speed: 1.9, target: 'resource', vsRes: 2, size: 8, sprite: 'goblin', threat: 1, gold: 5, desc: 'Fast looters that go for resource buildings.' },
  wolf: { name: 'Dire Wolf', hp: 85, dmg: 12, rate: 1.2, range: 0.6, speed: 2.5, target: 'any', size: 9, sprite: 'wolf', threat: 1.5, gold: 6, desc: 'Very fast pack hunters.' },
  orc: { name: 'Orc Brute', hp: 280, dmg: 24, rate: 0.8, range: 0.7, speed: 1.1, target: 'any', armor: 0.35, size: 11, sprite: 'orc', threat: 4, gold: 12, desc: 'Armored and tough.' },
  sapper: { name: 'Goblin Sapper', hp: 70, dmg: 260, rate: 1, range: 0.7, speed: 1.8, target: 'walls', suicide: 1.5, size: 8, sprite: 'sapper', threat: 2.5, gold: 8, desc: 'Runs at your walls and blows them up.' },
  bat: { name: 'Cave Bat', hp: 55, dmg: 9, rate: 1.2, range: 0.6, speed: 2.0, target: 'defense', flying: true, size: 8, sprite: 'bat', threat: 1.6, gold: 5, desc: 'Flies over walls.' },
  skeleton: { name: 'Skeleton', hp: 140, dmg: 15, rate: 1.0, range: 0.6, speed: 1.4, target: 'any', armor: 0.2, size: 9, sprite: 'skeleton', threat: 2.5, gold: 8, desc: 'The undead rank and file.' },
  skeletonMage: { name: 'Skeleton Mage', hp: 110, dmg: 24, rate: 0.7, range: 3.0, speed: 1.2, target: 'any', proj: 'shadow', magic: true, splash: 0.8, size: 9, sprite: 'skeletonMage', threat: 4, gold: 10, desc: 'Ranged magic that hits groups.' },
  spider: { name: 'Giant Spider', hp: 170, dmg: 16, rate: 1.2, range: 0.6, speed: 2.0, target: 'any', split: { unit: 'spiderling', count: 3 }, size: 11, sprite: 'spider', threat: 4, gold: 9, desc: 'Bursts into spiderlings when killed.' },
  spiderling: { name: 'Spiderling', hp: 35, dmg: 6, rate: 1.4, range: 0.5, speed: 2.4, target: 'any', size: 6, sprite: 'spider', threat: 0.5, gold: 1 },
  troll: { name: 'Troll', hp: 1200, dmg: 45, rate: 0.6, range: 0.8, speed: 0.8, target: 'defense', regen: 0.015, large: true, size: 16, sprite: 'troll', threat: 22, gold: 45, desc: 'Regenerates and smashes defenses.' },
  ogre: { name: 'Ogre', hp: 1600, dmg: 55, rate: 0.5, range: 0.9, speed: 0.8, target: 'defense', armor: 0.25, large: true, stomp: { every: 6, radius: 1.8, dmg: 60 }, size: 17, sprite: 'ogre', threat: 30, gold: 60, desc: 'Stomps the ground, damaging everything around it.' },
  darkKnight: { name: 'Dark Knight', hp: 520, dmg: 34, rate: 0.9, range: 0.7, speed: 1.15, target: 'any', armor: 0.45, size: 11, sprite: 'darkKnightEnemy', threat: 8, gold: 18, desc: 'Heavy armor shrugs off arrows and cannonballs. Use magic.' },
  imp: { name: 'Imp', hp: 90, dmg: 14, rate: 1.2, range: 2.4, speed: 1.9, target: 'any', proj: 'fire', magic: true, size: 8, sprite: 'imp', threat: 2.5, gold: 6, desc: 'Fast fire-flinging demons.' },
  whelp: { name: 'Dragon Whelp', hp: 380, dmg: 26, rate: 0.8, range: 2.2, speed: 1.6, target: 'any', flying: true, proj: 'fire', splash: 0.9, size: 12, sprite: 'whelp', threat: 8, gold: 18, desc: 'Young dragons that fly over walls.' },
  // Bosses
  trollChief: { name: 'Grumak the Troll Chief', hp: 5200, dmg: 80, rate: 0.6, range: 1.0, speed: 0.8, target: 'any', regen: 0.008, large: true, boss: true, stomp: { every: 7, radius: 2.2, dmg: 90 }, size: 22, sprite: 'trollChief', gold: 250, desc: 'Regenerates and stomps.' },
  orcWarlord: { name: 'Warlord Gorthak', hp: 6500, dmg: 90, rate: 0.7, range: 1.0, speed: 0.9, target: 'any', armor: 0.2, large: true, boss: true, warcry: { every: 8, radius: 4, boost: 0.5, dur: 4 }, summonE: { unit: 'orc', every: 14, count: 2 }, size: 21, sprite: 'orcWarlord', gold: 300, desc: 'War cries send nearby enemies into a frenzy.' },
  broodmother: { name: 'The Broodmother', hp: 7000, dmg: 70, rate: 0.9, range: 1.0, speed: 1.0, target: 'any', large: true, boss: true, summonE: { unit: 'spider', every: 6, count: 2 }, split: { unit: 'spiderling', count: 10 }, size: 22, sprite: 'broodmother', gold: 320, desc: 'Endlessly births spiders.' },
  frostGiant: { name: 'Ymrik the Frost Giant', hp: 9000, dmg: 110, rate: 0.5, range: 1.1, speed: 0.7, target: 'defense', armor: 0.3, large: true, boss: true, freeze: { every: 9, radius: 4, dur: 2.5 }, size: 23, sprite: 'frostGiant', gold: 380, desc: 'Freezes nearby towers solid.' },
  demonLord: { name: 'Azgaroth the Demon Lord', hp: 12000, dmg: 120, rate: 0.7, range: 1.2, speed: 0.9, target: 'any', armor: 0.3, large: true, boss: true, summonE: { unit: 'imp', every: 7, count: 3 }, aura: { radius: 2.5, dps: 40 }, size: 24, sprite: 'demonLord', gold: 450, desc: 'Burns everything near him and summons imps.' },
  dragon: { name: 'Vyrathax the Ashen Dragon', hp: 14000, dmg: 90, rate: 0.6, range: 3.0, speed: 0.9, target: 'any', flying: true, proj: 'fire', splash: 1.6, large: true, boss: true, inferno: { every: 9, radius: 3, dmg: 260 }, enrage: 0.5, size: 26, sprite: 'dragon', gold: 600, desc: 'Flies, breathes fire, and enrages when wounded.' },
};
