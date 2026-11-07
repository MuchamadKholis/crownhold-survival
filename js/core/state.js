/* =====================================================================
 * Crownhold — core/state.js
 * Everything about the persistent kingdom: resources, buildings,
 * construction timers, production, army training, research, heroes,
 * player level and saving. Pure logic (no DOM) so Node tests can use it.
 * Timers are wall-clock timestamps, so they keep running while offline.
 * ===================================================================== */
CH.State = (function () {
  const C = CH.CONFIG, B = CH.BUILDINGS, U = CH.util;
  const RES = ['gold', 'wood', 'stone'];

  function defaults(now = Date.now()) {
    const troops = {}; for (const t of CH.TROOP_ORDER) troops[t] = 1;
    const spells = {}; for (const s of CH.SPELL_ORDER) spells[s] = 1;
    const heroes = {}; for (const h of CH.HERO_ORDER) heroes[h] = { unlocked: false, level: 1 };
    const buildings = CH.START_LAYOUT.map((b, i) => ({ id: i + 1, type: b.type, level: b.level, tx: b.tx, ty: b.ty, buf: 0, job: null }));
    return {
      version: 1, res: { ...C.START_RES }, buildings, nextId: buildings.length + 1,
      army: { swordsman: 10, archer: 8 }, train: [], research: { troops, spells }, rjob: null, heroes,
      campaign: {}, raid: { trophies: 0, seed: 1000 + Math.floor(Math.random() * 1e6), opponents: [], wins: 0, attacks: 0 },
      defense: { best: 0, runs: 0, claimed: [] },
      player: { name: 'Lord of Crownhold', xp: 0, level: 1 },
      stats: { battlesWon: 0, enemiesSlain: 0, buildingsRaided: 0, obstaclesCleared: 0 },
      settings: { music: 0.45, sfx: 0.7, muted: false, damageNumbers: true },
      redeemed: [],
      introSeen: false, lastSeen: now,
    };
  }

  /* ---------- Queries ---------- */
  const castle = s => s.buildings.find(b => b.type === 'castle');
  const castleLevel = s => Math.max(1, (castle(s) || { level: 1 }).level);
  function area(s, cl) {
    const [w, h] = C.AREA[(cl || castleLevel(s)) - 1];
    return { x: Math.floor((C.COLS - w) / 2), y: Math.floor((C.ROWS - h) / 2), w, h };
  }
  const byId = (s, id) => s.buildings.find(b => b.id === id);
  const countOf = (s, type) => s.buildings.filter(b => b.type === type).length;
  const maxCount = (s, type) => (B[type].unlock > castleLevel(s) ? 0 : B[type].counts[castleLevel(s) - 1] || 0);
  const maxLevelFor = (s, type) => (type === 'castle' ? B.castle.maxLevel : Math.min(B[type].maxLevel, castleLevel(s) + 1));
  const highestLevel = (s, type) => s.buildings.filter(b => b.type === type).reduce((m, b) => Math.max(m, b.level), 0);
  const buildingLevel = (s, type) => highestLevel(s, type);

  function capacity(s, r) {
    if (r === 'gems' || r === 'runes') return Infinity;
    let cap = B.castle.cap(castleLevel(s));
    for (const b of s.buildings) if (B[b.type].cat === 'storage' && B[b.type].res === r && b.level > 0) cap += B[b.type].cap(b.level);
    return cap;
  }
  function productionPerMin(s, r) {
    let p = 0;
    for (const b of s.buildings) if (B[b.type].cat === 'econ' && B[b.type].res === r && b.level > 0) p += B[b.type].prod(b.level);
    return p;
  }
  const builders = s => s.buildings.filter(b => b.type === 'builderHut' && b.level > 0).length;
  const busy = s => s.buildings.filter(b => b.job).length;
  const freeBuilders = s => builders(s) - busy(s);

  function canAfford(s, cost) { return RES.every(r => (cost[r] || 0) <= s.res[r]) && (cost.gems || 0) <= s.res.gems && (cost.runes || 0) <= s.res.runes; }
  function pay(s, cost) { for (const r of [...RES, 'gems', 'runes']) s.res[r] -= cost[r] || 0; }
  /** Adds resources, respecting storage caps. Returns what was actually added. */
  function give(s, rw) {
    const got = {};
    for (const r of [...RES, 'gems', 'runes']) {
      if (!rw[r]) continue;
      const cap = capacity(s, r);
      const add = Math.max(0, Math.min(rw[r], cap - s.res[r]));
      s.res[r] += add; got[r] = Math.floor(add);
    }
    if (rw.xp) got.levels = addXp(s, rw.xp);
    return got;
  }
  function missing(s, cost) {
    const m = {};
    for (const r of [...RES, 'gems', 'runes']) if ((cost[r] || 0) > s.res[r]) m[r] = cost[r] - s.res[r];
    return m;
  }

  /* ---------- Player level ---------- */
  const xpFor = L => Math.round(80 * Math.pow(L, 1.55));
  function addXp(s, n) {
    s.player.xp += Math.round(n);
    const ups = [];
    while (s.player.xp >= xpFor(s.player.level)) {
      s.player.xp -= xpFor(s.player.level);
      s.player.level++;
      const gems = 3 + Math.floor(s.player.level / 2);
      s.res.gems += gems;
      ups.push({ level: s.player.level, gems });
    }
    return ups;
  }

  /* ---------- Placement ---------- */
  function tilesFree(s, tx, ty, size, ignoreId) {
    const a = area(s);
    if (tx < a.x || ty < a.y || tx + size > a.x + a.w || ty + size > a.y + a.h) return false;
    for (const b of s.buildings) {
      if (b.id === ignoreId) continue;
      const bs = B[b.type].size;
      if (tx < b.tx + bs && tx + size > b.tx && ty < b.ty + bs && ty + size > b.ty) return false;
    }
    return true;
  }

  function buildCost(s, type) {
    if (type === 'builderHut') return B.builderHut.countCost(countOf(s, 'builderHut'));
    return B[type].cost(1);
  }

  /** Why a type can't be built right now (or null if it can). */
  function buildBlocker(s, type) {
    const d = B[type];
    if (d.unlock > castleLevel(s)) return 'Needs castle level ' + d.unlock;
    if (countOf(s, type) >= maxCount(s, type)) return maxCount(s, type) === 0 ? 'Needs a higher castle level' : 'Limit reached (' + maxCount(s, type) + ')';
    if (!d.instant && type !== 'builderHut' && freeBuilders(s) <= 0) return 'All builders are busy';
    if (!canAfford(s, buildCost(s, type))) return 'Not enough resources';
    return null;
  }

  function build(s, type, tx, ty, now = Date.now()) {
    const d = B[type];
    const why = buildBlocker(s, type);
    if (why) return { ok: false, reason: why };
    if (!tilesFree(s, tx, ty, d.size)) return { ok: false, reason: 'That spot is blocked' };
    pay(s, buildCost(s, type));
    const b = { id: s.nextId++, type, level: 0, tx, ty, buf: 0, job: null };
    // Walls, traps and builder huts appear instantly; everything else takes a builder.
    if (d.instant || type === 'builderHut') b.level = 1;
    else b.job = { kind: 'build', to: 1, ends: now + d.time(1) * 1000, total: d.time(1) };
    s.buildings.push(b);
    if (b.level) addXp(s, 5);
    return { ok: true, building: b };
  }

  function upgradeBlocker(s, b) {
    const d = B[b.type];
    if (d.cat === 'obstacle' || d.cat === 'objective') return 'Can\'t be upgraded';
    if (b.job) return 'Already under construction';
    if (b.level >= d.maxLevel) return 'Maximum level';
    if (b.level >= maxLevelFor(s, b.type)) return 'Upgrade the castle first';
    if (b.type === 'castle' && b.level >= C.MAX_CASTLE) return 'Maximum level';
    if (!d.instant && freeBuilders(s) <= 0) return 'All builders are busy';
    if (!canAfford(s, d.cost(b.level + 1))) return 'Not enough resources';
    return null;
  }

  function upgrade(s, id, now = Date.now()) {
    const b = byId(s, id);
    if (!b) return { ok: false, reason: 'No building' };
    const why = upgradeBlocker(s, b);
    if (why) return { ok: false, reason: why };
    const d = B[b.type], L = b.level + 1;
    pay(s, d.cost(L));
    if (d.instant) { b.level = L; addXp(s, 2 + L); return { ok: true, instant: true }; }
    b.job = { kind: 'upgrade', to: L, ends: now + d.time(L) * 1000, total: d.time(L) };
    return { ok: true };
  }

  function move(s, id, tx, ty) {
    const b = byId(s, id);
    if (!b) return false;
    if (!tilesFree(s, tx, ty, B[b.type].size, id)) return false;
    b.tx = tx; b.ty = ty;
    return true;
  }

  function clearObstacle(s, id, now = Date.now()) {
    const b = byId(s, id);
    if (!b || B[b.type].cat !== 'obstacle') return { ok: false, reason: 'Not an obstacle' };
    if (b.job) return { ok: false, reason: 'Already being cleared' };
    const cl = CH.OBSTACLE_CLEAR[b.type];
    if (freeBuilders(s) <= 0) return { ok: false, reason: 'All builders are busy' };
    if (!canAfford(s, cl.cost)) return { ok: false, reason: 'Not enough resources' };
    pay(s, cl.cost);
    b.job = { kind: 'clear', to: 0, ends: now + cl.time * 1000, total: cl.time };
    return { ok: true };
  }

  function speedUpCost(b, now = Date.now()) { return b.job ? Math.max(1, Math.ceil((b.job.ends - now) / 1000 / 30)) : 0; }
  function speedUp(s, id, now = Date.now()) {
    const b = byId(s, id);
    if (!b || !b.job) return false;
    const c = speedUpCost(b, now);
    if (s.res.gems < c) return false;
    s.res.gems -= c;
    b.job.ends = now;
    tick(s, now);
    return true;
  }

  /* ---------- Producers ---------- */
  function collect(s, id) {
    const b = byId(s, id);
    if (!b || B[b.type].cat !== 'econ') return 0;
    const r = B[b.type].res;
    const room = capacity(s, r) - s.res[r];
    const amt = Math.floor(Math.min(b.buf, room));
    s.res[r] += amt; b.buf -= amt;
    return amt;
  }
  function collectAll(s) {
    const got = { gold: 0, wood: 0, stone: 0 };
    for (const b of s.buildings) if (B[b.type].cat === 'econ') got[B[b.type].res] += collect(s, b.id);
    return got;
  }

  /* ---------- Army ---------- */
  const barracksLevel = s => highestLevel(s, 'barracks');
  const housingCap = s => (barracksLevel(s) ? B.barracks.housing(barracksLevel(s)) : 0);
  function housingUsed(s, includeQueue = true) {
    let h = 0;
    for (const t in s.army) h += (s.army[t] || 0) * CH.TROOPS[t].housing;
    if (includeQueue) for (const q of s.train) h += CH.TROOPS[q.type].housing;
    return h;
  }
  function trainBlocker(s, type) {
    const d = CH.TROOPS[type];
    if (barracksLevel(s) < d.unlock) return 'Needs barracks level ' + d.unlock;
    if (housingUsed(s) + d.housing > housingCap(s)) return 'Army is full';
    if (s.res.gold < d.cost) return 'Not enough gold';
    return null;
  }
  function train(s, type) {
    const why = trainBlocker(s, type);
    if (why) return { ok: false, reason: why };
    s.res.gold -= CH.TROOPS[type].cost;
    s.train.push({ type, left: CH.TROOPS[type].time });
    return { ok: true };
  }
  function cancelTrain(s, idx) {
    const q = s.train[idx];
    if (!q) return false;
    s.train.splice(idx, 1);
    s.res.gold = Math.min(capacity(s, 'gold'), s.res.gold + CH.TROOPS[q.type].cost);
    return true;
  }
  function finishTrainingNow(s) {
    const left = s.train.reduce((a, q) => a + q.left, 0);
    const c = Math.max(1, Math.ceil(left / 20));
    if (!s.train.length || s.res.gems < c) return false;
    s.res.gems -= c;
    for (const q of s.train) s.army[q.type] = (s.army[q.type] || 0) + 1;
    s.train = [];
    return true;
  }
  const armySize = s => Object.values(s.army).reduce((a, n) => a + n, 0);

  /* ---------- Research ---------- */
  const labLevel = s => highestLevel(s, 'lab');
  function researchCost(kind, id, L) { return kind === 'troop' ? CH.RESEARCH.troopCost(id, L) : CH.RESEARCH.spellCost(L); }
  function researchBlocker(s, kind, id) {
    if (!labLevel(s)) return 'Build a laboratory first';
    if (s.rjob) return 'The lab is busy';
    const cur = kind === 'troop' ? s.research.troops[id] : s.research.spells[id];
    if (cur >= CH.RESEARCH.maxLevel(labLevel(s))) return cur >= 6 ? 'Maximum level' : 'Upgrade the lab first';
    if (kind === 'troop' && barracksLevel(s) < CH.TROOPS[id].unlock) return 'Unlock this troop first';
    if (kind === 'spell' && CH.SPELLS[id].unlock > labLevel(s)) return 'Needs lab level ' + CH.SPELLS[id].unlock;
    if (!canAfford(s, researchCost(kind, id, cur + 1))) return 'Not enough resources';
    return null;
  }
  function research(s, kind, id, now = Date.now()) {
    const why = researchBlocker(s, kind, id);
    if (why) return { ok: false, reason: why };
    const L = (kind === 'troop' ? s.research.troops[id] : s.research.spells[id]) + 1;
    pay(s, researchCost(kind, id, L));
    s.rjob = { kind, id, to: L, ends: now + CH.RESEARCH.time(L) * 1000, total: CH.RESEARCH.time(L) };
    return { ok: true };
  }
  const spellUnlocked = (s, id) => labLevel(s) >= CH.SPELLS[id].unlock || (id === 'fireball');

  /* ---------- Heroes ---------- */
  const heroHallLevel = s => highestLevel(s, 'heroHall');
  const heroMaxLevel = s => heroHallLevel(s) * 2;
  function heroBlocker(s, id) {
    const h = s.heroes[id], d = CH.HEROES[id];
    if (!h.unlocked) {
      if (heroHallLevel(s) < d.unlock) return 'Needs Hero Hall level ' + d.unlock;
      if (!canAfford(s, d.cost)) return 'Not enough resources';
      return null;
    }
    if (h.level >= heroMaxLevel(s)) return h.level >= 10 ? 'Maximum level' : 'Upgrade the Hero Hall first';
    if (!canAfford(s, CH.heroUpgradeCost(h.level + 1))) return 'Not enough resources';
    return null;
  }
  function heroAction(s, id) {
    const why = heroBlocker(s, id);
    if (why) return { ok: false, reason: why };
    const h = s.heroes[id];
    if (!h.unlocked) { pay(s, CH.HEROES[id].cost); h.unlocked = true; addXp(s, 40); return { ok: true, unlocked: true }; }
    pay(s, CH.heroUpgradeCost(h.level + 1));
    h.level++; addXp(s, 15 * h.level);
    return { ok: true };
  }
  const heroMult = L => 1 + 0.1 * (L - 1);

  /* ---------- Time ---------- */
  /** Advances every timer to `now`. Returns a list of finished events for toasts. */
  function tick(s, now = Date.now()) {
    const events = [];
    const dt = U.clamp((now - (s.lastSeen || now)) / 1000, 0, 7 * 24 * 3600);
    s.lastSeen = now;
    const cleared = [];
    for (const b of s.buildings) {
      const d = B[b.type];
      if (d.cat === 'econ' && b.level > 0) b.buf = Math.min(d.buf(b.level), (b.buf || 0) + d.prod(b.level) / 60 * dt);
      if (b.job && b.job.ends <= now) {
        if (b.job.kind === 'clear') {
          const cl = CH.OBSTACLE_CLEAR[b.type];
          const got = give(s, cl.yield);
          const gems = (b.id * 7919) % 3 === 0 ? 2 + (b.id % 3) : 0;
          s.res.gems += gems;
          s.stats.obstaclesCleared++;
          cleared.push(b);
          events.push({ kind: 'cleared', type: b.type, got, gems });
          continue;
        }
        b.level = b.job.to; b.job = null;
        const lv = addXp(s, 10 + 8 * b.level * (b.type === 'castle' ? 3 : 1));
        events.push({ kind: 'built', type: b.type, level: b.level, levels: lv });
      }
    }
    for (const b of cleared) s.buildings.splice(s.buildings.indexOf(b), 1);
    // Training runs one unit at a time.
    let t = dt;
    while (t > 0 && s.train.length) {
      const q = s.train[0];
      const use = Math.min(t, q.left);
      q.left -= use; t -= use;
      if (q.left <= 1e-6) { s.train.shift(); s.army[q.type] = (s.army[q.type] || 0) + 1; events.push({ kind: 'trained', type: q.type }); }
    }
    if (s.rjob && s.rjob.ends <= now) {
      const j = s.rjob; s.rjob = null;
      if (j.kind === 'troop') s.research.troops[j.id] = j.to; else s.research.spells[j.id] = j.to;
      addXp(s, 20 * j.to);
      events.push({ kind: 'research', id: j.id, rkind: j.kind, level: j.to });
    }
    return events;
  }

  /* ---------- Guidance: what to do next ---------- */
  function goals(s) {
    const out = [];
    const cl = castleLevel(s);
    const has = t => s.buildings.some(b => b.type === t && b.level > 0);
    const canBuildMore = t => countOf(s, t) < maxCount(s, t);
    if (!has('stoneQuarry') && canBuildMore('stoneQuarry')) out.push({ text: 'Build a Stone Quarry', act: 'build', type: 'stoneQuarry' });
    if (countOf(s, 'builderHut') < 2) out.push({ text: 'Build a second Builder Hut to work twice as fast', act: 'build', type: 'builderHut' });
    if (!s.campaign['0-0']) out.push({ text: 'Win your first Campaign battle', act: 'campaign' });
    if (!has('goldStorage') && canBuildMore('goldStorage')) out.push({ text: 'Build a Gold Vault to store more gold', act: 'build', type: 'goldStorage' });
    if (cl >= 2 && !has('heroHall') && canBuildMore('heroHall')) out.push({ text: 'Build the Hero Hall and recruit King Aldric', act: 'build', type: 'heroHall' });
    if (cl >= 3 && !has('lab') && canBuildMore('lab')) out.push({ text: 'Build an Arcane Laboratory', act: 'build', type: 'lab' });
    if (cl >= 2 && s.raid.attacks === 0) out.push({ text: 'Raid an enemy kingdom in Endless Battle', act: 'endless' });
    if (cl >= 2 && s.defense.runs === 0) out.push({ text: 'Try Endless Defense with your own base', act: 'endless' });
    for (const t of CH.BUILD_MENU[2].types) if (B[t].unlock <= cl && canBuildMore(t)) { out.push({ text: 'Build a ' + B[t].name, act: 'build', type: t }); break; }
    if (countOf(s, 'wall') < maxCount(s, 'wall')) out.push({ text: 'Place walls around your castle (' + countOf(s, 'wall') + '/' + maxCount(s, 'wall') + ')', act: 'build', type: 'wall' });
    if (cl < C.MAX_CASTLE) out.push({ text: 'Upgrade the Castle to level ' + (cl + 1) + ' to unlock ' + unlocksAt(cl + 1).slice(0, 3).join(', '), act: 'castle' });
    return out;
  }
  /** Human-readable list of things a castle level unlocks. */
  function unlocksAt(L) {
    const out = [];
    for (const t in B) {
      const d = B[t];
      if (d.cat === 'obstacle' || d.cat === 'objective') continue;
      if (d.unlock === L) out.push(d.name);
      else if (d.unlock < L && d.counts[L - 1] > d.counts[L - 2]) out.push('+' + (d.counts[L - 1] - d.counts[L - 2]) + ' ' + d.name + (d.counts[L - 1] - d.counts[L - 2] > 1 ? 's' : ''));
    }
    for (const r of CH.REGIONS) if (r.castle === L && L > 1) out.unshift('Region: ' + r.name);
    if (L === 2) out.unshift('Endless Raid and Endless Defense');
    out.push('Larger kingdom area');
    return out;
  }

  /* ---------- Redeem codes ---------- */
  /** Redeems a code once per save. Rewards may exceed storage (they are a gift). */
  function redeem(s, input, now = Date.now()) {
    const code = String(input || '').trim();
    if (!code) return { ok: false, reason: 'Enter a code' };
    const h = CH.hashCode(code);
    const entry = (CH.REDEEM_CODES || []).find(c => c.hash === h);
    if (!entry) return { ok: false, reason: 'That code isn\'t valid' };
    if (s.redeemed.includes(h)) return { ok: false, reason: 'You already redeemed this code' };
    const day = new Date(now).toISOString().slice(0, 10);
    if (entry.start && day < entry.start) return { ok: false, reason: 'This code isn\'t active yet' };
    if (entry.expires && day > entry.expires) return { ok: false, reason: 'This code has expired' };
    if (entry.minCastle && castleLevel(s) < entry.minCastle) return { ok: false, reason: 'Needs castle level ' + entry.minCastle };
    const rw = entry.reward || {};
    for (const r of [...RES, 'gems', 'runes']) if (rw[r]) s.res[r] += Math.max(0, Math.floor(rw[r]));
    if (rw.troops) for (const t in rw.troops) if (CH.TROOPS[t]) s.army[t] = (s.army[t] || 0) + Math.max(0, Math.floor(rw.troops[t]));
    const levels = rw.xp ? addXp(s, rw.xp) : [];
    s.redeemed.push(h);
    return { ok: true, entry, levels };
  }

  /* ---------- Save / load ---------- */
  function validate(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return d;
    const num = (v, lo, hi, df) => (typeof v === 'number' && isFinite(v) ? U.clamp(v, lo, hi) : df);
    for (const r of [...RES, 'gems', 'runes']) d.res[r] = Math.floor(num(raw.res && raw.res[r], 0, 1e9, d.res[r]));
    // Buildings: keep valid ones that don't overlap; always keep a castle.
    if (Array.isArray(raw.buildings)) {
      const out = [];
      const occ = new Set();
      const sorted = raw.buildings.slice().sort((a, b) => (a && a.type === 'castle' ? -1 : 0) - (b && b.type === 'castle' ? -1 : 0));
      for (const b of sorted) {
        if (!b || !B[b.type] || B[b.type].cat === 'objective') continue;
        const size = B[b.type].size;
        const tx = num(b.tx, 0, C.COLS - size, -1), ty = num(b.ty, 0, C.ROWS - size, -1);
        if (tx < 0 || ty < 0) continue;
        const tiles = [];
        let clash = false;
        for (let y = ty; y < ty + size; y++) for (let x = tx; x < tx + size; x++) { const k = y * 100 + x; if (occ.has(k)) clash = true; tiles.push(k); }
        if (clash) continue;
        tiles.forEach(k => occ.add(k));
        const job = b.job && typeof b.job.ends === 'number' && ['build', 'upgrade', 'clear'].includes(b.job.kind) ? { kind: b.job.kind, to: num(b.job.to, 0, 8, 1), ends: b.job.ends, total: num(b.job.total, 0, 1e7, 1) } : null;
        out.push({ id: Math.floor(num(b.id, 1, 1e9, 0)) || 0, type: b.type, level: Math.floor(num(b.level, 0, B[b.type].maxLevel, 1)), tx: Math.floor(tx), ty: Math.floor(ty), buf: num(b.buf, 0, 1e9, 0), job });
      }
      if (out.some(b => b.type === 'castle')) {
        let id = 1; const seen = new Set();
        for (const b of out) { if (!b.id || seen.has(b.id)) b.id = 0; seen.add(b.id); }
        for (const b of out) if (!b.id) { while (seen.has(id)) id++; b.id = id; seen.add(id); }
        d.buildings = out;
        d.nextId = Math.max(...out.map(b => b.id)) + 1;
      }
    }
    if (raw.army && typeof raw.army === 'object') { d.army = {}; for (const t of CH.TROOP_ORDER) if (raw.army[t]) d.army[t] = Math.floor(num(raw.army[t], 0, 999, 0)); }
    if (Array.isArray(raw.train)) d.train = raw.train.filter(q => q && CH.TROOPS[q.type]).slice(0, 200).map(q => ({ type: q.type, left: num(q.left, 0, 3600, 1) }));
    if (raw.research) {
      for (const t of CH.TROOP_ORDER) d.research.troops[t] = Math.floor(num(raw.research.troops && raw.research.troops[t], 1, 6, 1));
      for (const sp of CH.SPELL_ORDER) d.research.spells[sp] = Math.floor(num(raw.research.spells && raw.research.spells[sp], 1, 6, 1));
    }
    if (raw.rjob && typeof raw.rjob.ends === 'number' && ((raw.rjob.kind === 'troop' && CH.TROOPS[raw.rjob.id]) || (raw.rjob.kind === 'spell' && CH.SPELLS[raw.rjob.id]))) d.rjob = { kind: raw.rjob.kind, id: raw.rjob.id, to: Math.floor(num(raw.rjob.to, 2, 6, 2)), ends: raw.rjob.ends, total: num(raw.rjob.total, 0, 1e7, 1) };
    if (raw.heroes) for (const h of CH.HERO_ORDER) { const r = raw.heroes[h]; if (r) d.heroes[h] = { unlocked: !!r.unlocked, level: Math.floor(num(r.level, 1, 10, 1)) }; }
    if (raw.campaign) for (const k in raw.campaign) if (/^[0-5]-[0-5]$/.test(k)) d.campaign[k] = Math.floor(num(raw.campaign[k], 1, 3, 1));
    if (raw.raid) {
      d.raid.trophies = Math.floor(num(raw.raid.trophies, 0, 1e6, 0));
      d.raid.seed = Math.floor(num(raw.raid.seed, 0, 1e12, d.raid.seed));
      d.raid.wins = Math.floor(num(raw.raid.wins, 0, 1e9, 0));
      d.raid.attacks = Math.floor(num(raw.raid.attacks, 0, 1e9, 0));
      if (Array.isArray(raw.raid.opponents)) d.raid.opponents = raw.raid.opponents.filter(o => o && Array.isArray(o.layout) && o.loot).slice(0, 6);
    }
    if (raw.defense) {
      d.defense.best = Math.floor(num(raw.defense.best, 0, 1e6, 0));
      d.defense.runs = Math.floor(num(raw.defense.runs, 0, 1e9, 0));
      d.defense.claimed = Array.isArray(raw.defense.claimed) ? raw.defense.claimed.filter(n => typeof n === 'number') : [];
    }
    if (raw.player) { d.player.level = Math.floor(num(raw.player.level, 1, 999, 1)); d.player.xp = Math.floor(num(raw.player.xp, 0, 1e9, 0)); if (typeof raw.player.name === 'string') d.player.name = raw.player.name.slice(0, 24) || d.player.name; }
    if (raw.stats) for (const k in d.stats) d.stats[k] = Math.floor(num(raw.stats[k], 0, 1e12, 0));
    if (raw.settings) {
      d.settings.music = num(raw.settings.music, 0, 1, d.settings.music);
      d.settings.sfx = num(raw.settings.sfx, 0, 1, d.settings.sfx);
      d.settings.muted = !!raw.settings.muted;
      d.settings.damageNumbers = raw.settings.damageNumbers !== false;
    }
    if (Array.isArray(raw.redeemed)) d.redeemed = raw.redeemed.filter(h => typeof h === 'string').slice(0, 500);
    d.introSeen = !!raw.introSeen;
    d.lastSeen = num(raw.lastSeen, 0, Date.now(), Date.now());
    return d;
  }
  function storage() { try { const ls = window.localStorage; ls.setItem('__ch', '1'); ls.removeItem('__ch'); return ls; } catch (e) { return null; } }
  let memory = null;
  function load() {
    try {
      const ls = storage();
      const raw = ls ? ls.getItem(C.SAVE_KEY) : memory;
      return raw ? validate(JSON.parse(raw)) : defaults();
    } catch (e) { console.warn('[Crownhold] save unreadable, starting fresh', e); return defaults(); }
  }
  function save(s) { const j = JSON.stringify(s); try { const ls = storage(); if (ls) ls.setItem(C.SAVE_KEY, j); else memory = j; return true; } catch (e) { memory = j; return false; } }
  function reset() { try { const ls = storage(); if (ls) ls.removeItem(C.SAVE_KEY); } catch (e) { /* */ } memory = null; return defaults(); }

  return {
    RES, defaults, validate, load, save, reset, persistent: () => !!storage(),
    castle, castleLevel, area, byId, countOf, maxCount, maxLevelFor, highestLevel, buildingLevel, capacity, productionPerMin,
    builders, busy, freeBuilders, canAfford, pay, give, missing, xpFor, addXp,
    tilesFree, buildCost, buildBlocker, build, upgradeBlocker, upgrade, move, clearObstacle, speedUpCost, speedUp,
    collect, collectAll, barracksLevel, housingCap, housingUsed, trainBlocker, train, cancelTrain, finishTrainingNow, armySize,
    labLevel, researchCost, researchBlocker, research, spellUnlocked, heroHallLevel, heroMaxLevel, heroBlocker, heroAction, heroMult,
    tick, goals, unlocksAt, redeem,
  };
})();
