/* Crownhold logic tests (Node, no dependencies):  node tests/run_tests.js */
const { loadGame, run } = require('./harness');
const { CH, sb } = loadGame();
const S = CH.State, T = CH.CONFIG.T;
let pass = 0, fail = 0;
function test(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e).split('\n').slice(0, 2).join('\n      ')); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const fresh = () => S.defaults(1e12);
const findFree = (s, size) => { const a = S.area(s); for (let y = a.y; y <= a.y + a.h - size; y++) for (let x = a.x; x <= a.x + a.w - size; x++) if (S.tilesFree(s, x, y, size)) return { x, y }; };

console.log('\nEconomy & building');
test('new kingdom has a castle, starting resources and a free builder', () => {
  const s = fresh(); ok(S.castle(s) && s.res.gold === 750 && S.builders(s) === 1 && S.freeBuilders(s) === 1);
});
test('placement is blocked outside the kingdom, on buildings, and when unaffordable', () => {
  const s = fresh(), a = S.area(s);
  ok(!S.build(s, 'stoneQuarry', 0, 0).ok, 'outside');
  ok(!S.build(s, 'stoneQuarry', S.castle(s).tx, S.castle(s).ty).ok, 'overlap');
  s.res.gold = 0; ok(S.build(s, 'stoneQuarry', a.x + 1, a.y + 1).reason === 'Not enough resources', 'cost');
});
test('building takes a builder and a timer; second job waits for a free builder', () => {
  const s = fresh(), p = findFree(s, 2);
  const r = S.build(s, 'stoneQuarry', p.x, p.y, 1e12); ok(r.ok && r.building.level === 0 && r.building.job);
  const p2 = findFree(s, 2); ok(S.build(s, 'goldStorage', p2.x, p2.y, 1e12).reason === 'All builders are busy');
  S.tick(s, 1e12 + 60000); ok(r.building.level === 1 && !r.building.job, 'finished');
});
test('locked types and count limits are enforced', () => {
  const s = fresh(); ok(S.buildBlocker(s, 'mortar').startsWith('Needs castle'));
  ok(S.buildBlocker(s, 'goldMine').startsWith('Limit reached'));
});
test('upgrade costs and times grow every level; levels capped by the castle', () => {
  const d = CH.BUILDINGS.archerTower;
  for (let L = 2; L <= 8; L++) ok(d.cost(L).gold > d.cost(L - 1).gold && d.time(L) >= d.time(L - 1), 'L' + L);
  const s = fresh(); s.res = { gold: 1e6, wood: 1e6, stone: 1e6, gems: 0, runes: 0 };
  const t = s.buildings.find(b => b.type === 'archerTower');
  ok(S.upgrade(s, t.id, 1e12).ok); S.tick(s, 1e12 + 1e7);
  ok(t.level === 2 && S.upgradeBlocker(s, t) === 'Upgrade the castle first', S.upgradeBlocker(s, t));
});
test('castle upgrade expands the buildable area and unlocks buildings', () => {
  const s = fresh(); s.res = { gold: 1e6, wood: 1e6, stone: 1e6, gems: 0, runes: 0 };
  const a1 = S.area(s); S.upgrade(s, S.castle(s).id, 1e12); S.tick(s, 1e12 + 1e8);
  const a2 = S.area(s); ok(S.castleLevel(s) === 2 && a2.w > a1.w && S.maxCount(s, 'cannon') === 1);
});
test('production accumulates offline but is capped; collecting respects storage', () => {
  const s = fresh(), m = s.buildings.find(b => b.type === 'goldMine');
  s.lastSeen = 1e12; S.tick(s, 1e12 + 10 * 60000);
  ok(Math.abs(m.buf - CH.BUILDINGS.goldMine.prod(1) * 10) < 1, 'ten minutes = ' + m.buf);
  S.tick(s, 1e12 + 7 * 24 * 3600e3); ok(m.buf === CH.BUILDINGS.goldMine.buf(1), 'capped');
  s.res.gold = S.capacity(s, 'gold') - 10; const got = S.collect(s, m.id);
  ok(got === 10 && s.res.gold === S.capacity(s, 'gold') && m.buf > 0, 'storage cap');
});
test('rewards are clamped to storage capacity (gems/runes are not)', () => {
  const s = fresh(); S.give(s, { gold: 1e9, gems: 5, runes: 2 });
  ok(s.res.gold === S.capacity(s, 'gold') && s.res.gems === 35 && s.res.runes === 2);
});
test('training: costs gold, respects army space, completes over (offline) time', () => {
  const s = fresh(); s.army = {}; s.lastSeen = 1e12;
  ok(S.train(s, 'swordsman').ok && s.train.length === 1);
  ok(S.trainBlocker(s, 'knight').startsWith('Needs barracks'));
  for (let i = 0; i < 40; i++) S.train(s, 'swordsman');
  ok(S.housingUsed(s) <= S.housingCap(s), 'housing');
  S.tick(s, 1e12 + 3600e3); ok(s.army.swordsman === S.housingCap(s) && !s.train.length, 'trained ' + s.army.swordsman);
});
test('research and heroes are gated by lab / hero hall and need runes later', () => {
  const s = fresh(); s.res = { gold: 1e6, wood: 1e6, stone: 1e6, gems: 0, runes: 0 };
  ok(S.researchBlocker(s, 'troop', 'swordsman') === 'Build a laboratory first');
  ok(S.heroBlocker(s, 'king').startsWith('Needs Hero Hall'));
  s.buildings.push({ id: 99, type: 'heroHall', level: 3, tx: 0, ty: 0, buf: 0, job: null });
  ok(S.heroAction(s, 'king').ok && s.heroes.king.unlocked);
  ok(S.heroAction(s, 'king').ok && S.heroAction(s, 'king').ok && s.heroes.king.level === 3);
  ok(S.heroBlocker(s, 'king') === 'Not enough resources', 'needs runes: ' + S.heroBlocker(s, 'king'));
  s.res.runes = 5; ok(S.heroAction(s, 'king').ok);
});
test('player XP levels up and pays gems', () => {
  const s = fresh(), g0 = s.res.gems; const ups = S.addXp(s, 1000); ok(ups.length >= 2 && s.res.gems > g0);
});
test('obstacles can be cleared for resources', () => {
  const s = fresh(); s.lastSeen = 1e12; const r = s.buildings.find(b => b.type === 'rock');
  ok(S.clearObstacle(s, r.id, 1e12).ok); S.tick(s, 1e12 + 10000); ok(!s.buildings.includes(r) && s.stats.obstaclesCleared === 1);
});
test('save round-trip and hostile data validation', () => {
  const s = fresh(); s.campaign['0-0'] = 3; s.res.gems = 77; S.save(s);
  const l = S.load(); ok(l.campaign['0-0'] === 3 && l.res.gems === 77 && l.buildings.length === s.buildings.length);
  sb.localStorage.setItem(CH.CONFIG.SAVE_KEY, '{nope'); ok(S.load().res.gold === 750);
  const v = S.validate({ version: 1, res: { gold: -1 }, buildings: [{ type: 'castle', tx: 13, ty: 9, level: 99 }, { type: 'wall', tx: 13, ty: 9 }], campaign: { '9-9': 3, '0-1': 7 } });
  ok(v.res.gold === 0 && v.buildings.length === 1 && v.buildings[0].level === 8 && !v.campaign['9-9'] && v.campaign['0-1'] === 3);
});

console.log('\nRedeem codes');
test('valid code grants resources, gems and troops exactly once (case-insensitive)', () => {
  const s = fresh(), g0 = s.res.gold, gem0 = s.res.gems, sw0 = s.army.swordsman || 0;
  const r = S.redeem(s, ' welcome2026 ', 1e12); ok(r.ok && s.res.gold === g0 + 1500 && s.res.gems === gem0 + 25, 'welcome');
  ok(S.redeem(s, 'WELCOME2026', 1e12).reason === 'You already redeemed this code', 'twice');
  ok(S.redeem(s, 'crownhold', 1e12).ok && s.army.swordsman === sw0 + 10, 'troops');
});
test('invalid, expired, not-yet-active and castle-gated codes are refused', () => {
  const s = fresh();
  ok(S.redeem(s, 'NOPE', 1e12).reason === 'That code isn\'t valid');
  ok(S.redeem(s, 'CROWNHOLD', Date.parse('2030-01-01')).reason === 'This code has expired');
  ok(S.redeem(s, 'ROYALARMY', 1e12).reason === 'Needs castle level 3');
  CH.REDEEM_CODES.push({ hash: CH.hashCode('FUTURE'), reward: { gold: 1 }, start: '2099-01-01' });
  ok(S.redeem(s, 'future', 1e12).reason === 'This code isn\'t active yet');
  CH.REDEEM_CODES.pop();
});
test('redeemed codes persist through save and load', () => {
  const s = fresh(); S.redeem(s, 'WELCOME2026', 1e12); S.save(s);
  const l = S.load(); ok(l.redeemed.length === 1 && S.redeem(l, 'WELCOME2026', 1e12).ok === false);
});

console.log('\nBattle engine');
const mini = layout => ({ id: 'x', name: 'Test', cl: 1, layout, loot: { gold: 1000, wood: 1000, stone: 600, gems: 0 }, trophyWin: 10, trophyLoss: 10 });
function walledBase(gap) {
  const L = [{ type: 'castle', level: 1, tx: 14, ty: 10 }];
  for (let x = 12; x <= 18; x++) for (const y of [8, 14]) L.push({ type: 'wall', level: 3, tx: x, ty: y });
  for (let y = 9; y <= 13; y++) for (const x of [12, 18]) if (!(gap && x === 12 && y === 11)) L.push({ type: 'wall', level: 3, tx: x, ty: y });
  return L;
}
test('ground troops walk around walls when there is a gap', () => {
  const s = fresh(); s.army = { swordsman: 1 };
  const b = new CH.Battle({ mode: 'raid', save: s, opponent: mini(walledBase(true)), seed: 1 });
  b.deployTroop('swordsman', 4 * T, 11.5 * T); run(b, 25);
  ok(b.buildings.filter(x => x.type === 'wall').every(w => w.hp === w.maxHp), 'a wall was attacked');
  ok(b.buildings[0].hp < b.buildings[0].maxHp, 'castle not reached');
});
test('fully enclosed: ground troops break through a wall', () => {
  const s = fresh(); s.army = { swordsman: 3 };
  const b = new CH.Battle({ mode: 'raid', save: s, opponent: mini(walledBase(false)), seed: 1 });
  for (let i = 0; i < 3; i++) b.deployTroop('swordsman', 4 * T, (11 + i * 0.3) * T);
  run(b, 60);
  ok(b.buildings.some(x => x.type === 'wall' && x.hp < x.maxHp), 'no wall hit');
});
test('flying units ignore walls', () => {
  const s = fresh(); s.army = { dragonRider: 1 };
  const b = new CH.Battle({ mode: 'raid', save: s, opponent: mini(walledBase(false)), seed: 1 });
  b.deployTroop('dragonRider', 4 * T, 11.5 * T); run(b, 20);
  ok(b.buildings.filter(x => x.type === 'wall').every(w => w.hp === w.maxHp) && b.buildings[0].hp < b.buildings[0].maxHp);
});
test('raid: no deploying near buildings; stars and loot follow destruction', () => {
  const s = fresh(); s.army = { swordsman: 30 };
  const b = new CH.Battle({ mode: 'raid', save: s, opponent: mini([{ type: 'castle', level: 1, tx: 14, ty: 10 }, { type: 'goldStorage', level: 1, tx: 10, ty: 10 }]), seed: 1 });
  ok(!b.deployTroop('swordsman', 15 * T, 9.5 * T).ok, 'deployed in red zone');
  for (let i = 0; i < 30; i++) b.deployTroop('swordsman', 3 * T, (5 + i * 0.4) * T);
  run(b, 120);
  ok(b.stars === 3 && b.result === 'win' && Math.round(b.lootGot.gold) === 1000, 'stars ' + b.stars + ' loot ' + b.lootGot.gold);
});
test('cannons cannot hit flyers; archer towers can', () => {
  const s = fresh();
  for (const [type, should] of [['cannon', false], ['archerTower', true]]) {
    const b = new CH.Battle({ mode: 'raid', save: s, opponent: mini([{ type: 'castle', level: 1, tx: 2, ty: 2 }, { type, level: 1, tx: 14, ty: 10 }]), seed: 1 });
    b.buildings[0].atk = null;
    const u = b.spawnUnit(CH.TROOPS.dragonRider, 'atk', 15 * T, 8 * T, {}); u.speed = 0; u.dmg = 0;
    run(b, 5); ok((u.hp < u.maxHp) === should, type);
  }
});
test('hidden traps trigger on attackers', () => {
  const s = fresh();
  const b = new CH.Battle({ mode: 'raid', save: s, opponent: mini([{ type: 'castle', level: 1, tx: 20, ty: 10 }, { type: 'bombTrap', level: 1, tx: 12, ty: 11 }]), seed: 1 });
  ok(b.buildings[1].hidden);
  const u = b.spawnUnit(CH.TROOPS.knight, 'atk', 6 * T, 11.5 * T, {}); run(b, 6);
  ok(!b.buildings[1].armed && u.hp < u.maxHp);
});
test('defense: real layout, edge spawns, wave rewards banked, castle loss ends it', () => {
  const s = fresh();
  const b = new CH.Battle({ mode: 'defense', save: s, layout: s.buildings, seed: 3 });
  ok(b.startDefenseWave() && !b.startDefenseWave(), 'duplicate wave');
  run(b, 0.05);
  ok(b.units.every(u => u.x < 2 * T || u.y < 2 * T || u.x > 28 * T || u.y > 20 * T), 'spawned at edges');
  run(b, 120); ok(b.bank.gold > 0 || b.result, 'banked');
  b.damageBuilding(b.buildings.find(x => x.type === 'castle'), 1e9); ok(b.result === 'lose');
});
test('defense waves: mini-boss at 10, boss at 20, modifiers after 20', () => {
  const w10 = CH.Defense.wave(10), w20 = CH.Defense.wave(20), w25 = CH.Defense.wave(25);
  ok(w10.isMini && w20.isBoss && w20.groups.some(g => CH.ENEMIES[g.type].boss) && w25.mod && w25.mult > w10.mult);
});
test('campaign: towers only off-road, enemies follow the road, boss stage has its boss', () => {
  const s = fresh(), st = CH.Campaign.stage(0, 0);
  const b = new CH.Battle({ mode: 'campaign', save: s, stage: st, seed: 1 });
  const p = st.tpl.paths[0].pts[1]; ok(!b.placeTower('archerTower', p[0], p[1]).ok);
  b.callWave(); run(b, 2); ok(b.units.some(u => u.mode === 'path'));
  ok(CH.Campaign.stage(2, 5).waves.some(w => w.groups.some(g => g.type === 'broodmother')));
});
test('campaign unlocks need the previous stage and castle level', () => {
  const s = fresh();
  ok(CH.Campaign.stageUnlocked(s, 0, 0) && !CH.Campaign.stageUnlocked(s, 0, 1) && !CH.Campaign.regionUnlocked(s, 1));
  for (let k = 0; k < 6; k++) s.campaign['0-' + k] = 1;
  ok(!CH.Campaign.regionUnlocked(s, 1), 'castle 1');
  S.castle(s).level = 2; ok(CH.Campaign.regionUnlocked(s, 1));
});
test('raid opponents scale with castle level and each refresh is new', () => {
  const s = fresh(); CH.Raid.refresh(s); const a = s.raid.opponents.map(o => o.id); CH.Raid.refresh(s);
  ok(!s.raid.opponents.some(o => a.includes(o.id)), 'repeat');
  const lo = CH.Raid.generate(5, 1, 0), hi = CH.Raid.generate(5, 6, 600);
  ok(hi.loot.gold > lo.loot.gold && hi.layout.length > lo.layout.length);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
