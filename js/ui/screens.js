/* =====================================================================
 * Crownhold — ui/screens.js
 * Full-screen sheets. Each returns { title, html, on: {act: fn}, after }.
 * Buttons use data-act="name" and are dispatched by CH.UI.sheet().
 * ===================================================================== */
CH.Screens = (function () {
  const UI = CH.UI, S = CH.State, B = CH.BUILDINGS, U = CH.util, T = CH.CONFIG.T;
  const save = () => CH.App.save;
  const persist = () => CH.App.persist();
  const icon = UI.icon, esc = UI.esc;
  const stars = (n, max = 3) => '<span class="stars">' + Array.from({ length: max }, (_, i) => '<span class="star' + (i < n ? ' on' : '') + '">' + UI.ICONS.star + '</span>').join('') + '</span>';
  const fail = r => { UI.toast(r.reason || 'Not possible', 'warn'); CH.Audio.play('error'); };
  const roadsPx = tpl => tpl.paths.map(p => p.pts.map(([x, y]) => ({ x: (x + 0.5) * T, y: (y + 0.5) * T })));

  /* ---------------- Build shop ---------------- */
  function shop(focus) {
    const s = save();
    const tab = focus ? CH.BUILD_MENU.find(m => m.types.includes(focus)).id : (shop.tab || 'econ');
    shop.tab = tab;
    const cat = CH.BUILD_MENU.find(m => m.id === tab);
    const cards = cat.types.map(t => {
      const d = B[t], why = S.buildBlocker(s, t), cnt = S.countOf(s, t), max = S.maxCount(s, t);
      const locked = d.unlock > S.castleLevel(s);
      return '<button class="shop-card' + (why ? ' blocked' : '') + (focus === t ? ' focus' : '') + '" data-act="place" data-type="' + t + '"' + (locked ? ' disabled' : '') + '>' +
        '<canvas data-building="' + t + '" data-level="1"></canvas><b>' + d.name + '</b>' +
        (locked ? '<span class="req">' + icon('lock') + 'Castle level ' + d.unlock + '</span>' :
          '<span class="count">' + cnt + ' / ' + max + ' built</span><span class="costs">' + UI.cost(S.buildCost(s, t), s) + '</span>' +
          '<span class="meta">' + icon('time') + (d.instant || t === 'builderHut' ? 'Instant' : U.time(d.time(1))) + '</span>' +
          (why && why !== 'Not enough resources' ? '<span class="req">' + why + '</span>' : '')) +
        '<span class="desc">' + d.desc + '</span></button>';
    }).join('');
    return {
      title: 'Build',
      html: '<div class="tabs">' + CH.BUILD_MENU.map(m => '<button class="tab' + (m.id === tab ? ' on' : '') + '" data-act="tab" data-tab="' + m.id + '">' + m.name + '</button>').join('') + '</div><div class="shop-grid">' + cards + '</div>',
      on: { tab: b => { shop.tab = b.dataset.tab; UI.refreshSheet(); }, place: b => CH.Home.startPlacement(b.dataset.type) },
    };
  }

  /* ---------------- Campaign ---------------- */
  function campaign() {
    const s = save();
    const cards = CH.REGIONS.map((r, i) => {
      const open = CH.Campaign.regionUnlocked(s, i);
      let st = 0, cleared = 0; for (let k = 0; k < 6; k++) { st += s.campaign[i + '-' + k] || 0; if (s.campaign[i + '-' + k]) cleared++; }
      UI.painters['region' + i] = cv => paintTerrain(cv, CH.View.terrain('region' + r.id, { pal: r.pal, decor: r.decor, seed: 900 + i, roads: roadsPx(CH.Campaign.stage(i, 0).tpl) }));
      const lockText = i === 0 ? '' : S.castleLevel(s) < r.castle ? 'Castle level ' + r.castle + ' required' : 'Defeat ' + CH.ENEMIES[CH.REGIONS[i - 1].boss].name;
      return '<button class="region-card' + (open ? '' : ' locked') + '" style="--accent:' + r.pal.accent + '" data-act="region" data-r="' + i + '"' + (open ? '' : ' disabled') + '>' +
        '<canvas data-paint="region' + i + '"></canvas><div class="rc-body"><span class="kicker">Region ' + (i + 1) + '</span><h3>' + r.name + '</h3><p>' + r.sub + '</p>' +
        (open ? '<div class="rc-meta">' + stars(1, 1) + st + ' / 18 · ' + cleared + ' of 6 cleared</div>' : '<div class="rc-meta">' + icon('lock') + lockText + '</div>') + '</div></button>';
    }).join('');
    return { title: 'Campaign', html: '<p class="lead">Defend the realm region by region. Build towers along the roads, deploy your troops and heroes, and protect your castle.</p><div class="region-grid">' + cards + '</div>', on: { region: b => UI.sheet('stages', +b.dataset.r) } };
  }
  function paintTerrain(cv, img) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return; cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d'), sc = Math.max(cv.width / img.width, cv.height / img.height);
    c.drawImage(img, (cv.width - img.width * sc) / 2, (cv.height - img.height * sc) / 2, img.width * sc, img.height * sc);
  }

  function stages(r) {
    r = +r; const s = save(), reg = CH.REGIONS[r];
    const list = Array.from({ length: 6 }, (_, k) => {
      const st = CH.Campaign.stage(r, k), open = CH.Campaign.stageUnlocked(s, r, k), got = s.campaign[st.id] || 0;
      const types = [...new Set(st.waves.flatMap(w => w.groups.map(g => g.type)))];
      UI.painters['stage' + st.id] = cv => {
        paintTerrain(cv, CH.View.terrain('prev' + st.id, { pal: reg.pal, roads: roadsPx(st.tpl), decor: reg.decor, seed: 400 + st.gi }));
        const c = cv.getContext('2d'), sc = cv.width / (CH.CONFIG.COLS * T);
        c.save(); c.scale(sc, sc * (cv.height / cv.width) / (CH.CONFIG.ROWS / CH.CONFIG.COLS));
        CH.Art.drawBuilding(c, { type: 'castle', level: 2, tx: st.tpl.core.tx, ty: st.tpl.core.ty }, { time: 1 });
        for (const o of st.tpl.objs) CH.Art.drawBuilding(c, { type: o.type, level: 2, tx: o.tx, ty: o.ty }, { time: 1 });
        c.restore();
      };
      const rw = got ? { gold: Math.round(st.reward.gold * 0.25), wood: Math.round(st.reward.wood * 0.25), stone: Math.round(st.reward.stone * 0.25), xp: Math.round(st.reward.xp * 0.3) } : st.reward;
      return '<article class="stage-card' + (open ? '' : ' locked') + '">' +
        '<canvas data-paint="stage' + st.id + '"></canvas>' +
        '<div class="sc-body"><div class="sc-top"><span class="kicker">Stage ' + (r + 1) + '-' + (k + 1) + '</span>' + (st.obj === 'boss' ? '<span class="tag boss">' + icon('crown') + 'Boss</span>' : '') + (got ? stars(got) : '') + '</div>' +
        '<h3>' + st.name + '</h3><p class="obj">' + icon('flag' in UI.ICONS ? 'flag' : 'map') + CH.OBJECTIVES[st.obj] + '</p>' +
        '<div class="enemy-row">' + types.map(t => '<canvas title="' + esc(CH.ENEMIES[t].name) + '" data-unit="' + CH.ENEMIES[t].sprite + '" data-size="' + Math.min(16, CH.ENEMIES[t].size) + '"></canvas>').join('') + '</div>' +
        '<div class="sc-meta"><span>' + st.waves.length + ' waves</span><span>' + icon('gold') + st.startGold + ' battle gold</span>' + (st.timeLimit ? '<span>' + icon('time') + U.time(st.timeLimit) + '</span>' : '') + '</div>' +
        '<div class="sc-reward"><span class="label">' + (got ? 'Replay reward' : 'First clear') + '</span>' + UI.reward(rw) + (!got && st.reward.gems ? '' : '') + (got < 3 ? '<span class="chip">' + icon('gems') + '+2 for 3 stars</span>' : '') + '</div>' +
        (open ? '<button class="btn btn-gold btn-block" data-act="play" data-id="' + st.id + '">' + (got ? 'Play again' : 'Defend') + '</button>' : '<button class="btn btn-block" disabled>' + icon('lock') + 'Clear the previous stage</button>') +
        '</div></article>';
    }).join('');
    return {
      title: reg.name,
      html: '<p class="lead">' + reg.sub + '. Towers you build here use your kingdom\'s defense levels, so upgrading at home makes you stronger in the campaign.</p><div class="stage-grid">' + list + '</div>',
      on: { play: b => { const [rr, kk] = b.dataset.id.split('-').map(Number); CH.App.startBattle({ mode: 'campaign', stage: CH.Campaign.stage(rr, kk) }); } },
    };
  }

  /* ---------------- Endless ---------------- */
  function endless() {
    const s = save(), cl = S.castleLevel(s), locked = cl < 2;
    const ms = CH.Defense.MILESTONES.find(m => !s.defense.claimed.includes(m.wave));
    return {
      title: 'Endless Battle',
      html: '<p class="lead">Two different wars. In a <b>raid</b> you attack AI-controlled enemy kingdoms. In a <b>defense</b>, endless AI armies attack your own base, exactly as you built it. (Opponents are computer-generated; there is no online multiplayer.)</p>' +
        '<div class="mode-grid">' +
        '<button class="mode-card raid" data-act="raid"' + (locked ? ' disabled' : '') + '>' + icon('swords') + '<h3>Endless Raid</h3><p>Choose an enemy kingdom, scout its defenses and loot, deploy troops and heroes, and steal its resources.</p>' +
        '<div class="mode-stats"><span>' + icon('trophy') + s.raid.trophies + ' trophies · ' + CH.Raid.league(s.raid.trophies) + ' league</span><span>' + s.raid.wins + ' raids won</span></div>' + (locked ? '<span class="req">' + icon('lock') + 'Castle level 2 required</span>' : '') + '</button>' +
        '<button class="mode-card defense" data-act="defense"' + (locked ? ' disabled' : '') + '>' + icon('shield') + '<h3>Endless Defense</h3><p>Wave after wave attacks your kingdom from every side. Pick a blessing every 5 waves. Survive as long as you can.</p>' +
        '<div class="mode-stats"><span>' + icon('flag' in UI.ICONS ? 'flag' : 'crown') + 'Best: wave ' + s.defense.best + '</span>' + (ms ? '<span>Next record reward: wave ' + ms.wave + ' (' + icon('gems') + ms.gems + ')</span>' : '') + '</div>' + (locked ? '<span class="req">' + icon('lock') + 'Castle level 2 required</span>' : '') + '</button></div>',
      on: { raid: () => UI.sheet('raidTargets'), defense: () => defensePrep() },
    };
  }
  function defensePrep() {
    const s = save(), heroes = CH.HERO_ORDER.filter(h => s.heroes[h].unlocked);
    UI.modal('<h3>Endless Defense</h3><p>Your real base layout is the battlefield. Enemies come from every side; walls and traps matter. Your heroes and army can join the defense. Rewards are banked each wave and paid when the run ends.</p>' +
      '<ul class="bullets"><li>Wave 10: mini-boss. Wave 20: boss. After 20, waves gain random modifiers.</li><li>Every 5 waves, choose a blessing: repairs, damage boosts and more.</li><li>Best so far: wave ' + s.defense.best + '</li></ul>' +
      '<p class="muted">' + (heroes.length ? 'Heroes ready: ' + heroes.map(h => CH.HEROES[h].name).join(', ') : 'Recruit heroes in the Hero Hall to bring them along.') + ' · Army: ' + S.armySize(s) + ' troops</p>' +
      '<button class="btn btn-gold btn-lg btn-block" data-go>Defend my kingdom</button>', { onClick: e => { if (e.target.closest('[data-go]')) { UI.closeModal(); CH.App.startBattle({ mode: 'defense' }); } } });
  }

  function raidTargets() {
    const s = save();
    if (!s.raid.opponents.length) { CH.Raid.refresh(s); persist(); }
    const cards = s.raid.opponents.map(op => {
      UI.painters['op' + op.id] = cv => CH.View.layoutPreview(cv, op.layout, { cl: op.cl, area: areaFor(op.cl) });
      const defs = op.layout.filter(b => B[b.type].cat === 'defense').length;
      return '<article class="op-card"><canvas data-paint="op' + op.id + '"></canvas><div class="op-body">' +
        '<div class="op-top"><span class="kicker">' + op.archName + '</span><span class="tag">Castle ' + op.cl + '</span></div>' +
        '<h3>' + esc(op.name) + '</h3><p class="muted">' + esc(op.lord) + ' · ' + op.archDesc + '</p>' +
        '<div class="loot-row"><span class="label">Available loot</span>' + UI.reward({ gold: op.loot.gold, wood: op.loot.wood, stone: op.loot.stone, gems: op.loot.gems }) + '</div>' +
        '<div class="op-meta"><span>' + defs + ' defenses</span><span>' + op.layout.filter(b => b.type === 'wall').length + ' walls</span><span>' + icon('trophy') + '+' + Math.max(5, op.trophyWin) + ' / −' + op.trophyLoss + '</span></div>' +
        '<button class="btn btn-gold btn-block" data-act="scout" data-id="' + op.id + '">Scout and attack</button></div></article>';
    }).join('');
    const cost = CH.Raid.searchCost(S.castleLevel(s));
    return {
      title: 'Choose a target',
      html: '<div class="row-between"><p class="lead">Each kingdom can be raided once. Loot is split across its vaults, mines and castle; you take a share of everything you damage.</p><button class="btn" data-act="search">Find new kingdoms ' + UI.cost({ gold: cost }, s) + '</button></div><div class="op-grid">' + cards + '</div>',
      on: {
        scout: b => UI.sheet('raidPrep', b.dataset.id),
        search: () => { if (s.res.gold < cost) return fail({ reason: 'Not enough gold' }); s.res.gold -= cost; CH.Raid.refresh(s); persist(); UI.refreshSheet(); },
      },
    };
  }
  function areaFor(cl) { const [w, h] = CH.CONFIG.AREA[cl - 1]; return { x: Math.floor((CH.CONFIG.COLS - w) / 2), y: Math.floor((CH.CONFIG.ROWS - h) / 2), w, h }; }
  function raidPrep(id) {
    const s = save(), op = s.raid.opponents.find(o => o.id === id);
    if (!op) return raidTargets();
    UI.painters['big' + op.id] = cv => CH.View.layoutPreview(cv, op.layout, { cl: op.cl, area: areaFor(op.cl) });
    const army = CH.TROOP_ORDER.filter(t => s.army[t] > 0);
    const heroes = CH.HERO_ORDER.filter(h => s.heroes[h].unlocked);
    const spells = CH.SPELL_ORDER.filter(sp => S.spellUnlocked(s, sp));
    return {
      title: esc(op.name),
      html: '<div class="prep"><canvas class="prep-map" data-paint="big' + op.id + '"></canvas><div class="prep-side panel">' +
        '<span class="kicker">' + op.archName + ' · Castle ' + op.cl + '</span><h3>' + esc(op.lord) + '</h3>' +
        '<div class="loot-row"><span class="label">Estimated loot</span>' + UI.reward(op.loot) + '</div>' +
        '<p class="muted">Stars: 50% destroyed, the castle destroyed, 100% destroyed. One star is a victory. Traps are hidden. You have 3 minutes.</p>' +
        '<h4>Your army</h4>' + (army.length ? '<div class="army-row">' + army.map(t => '<span class="unit-chip"><canvas data-unit="' + CH.TROOPS[t].sprite + '" data-size="' + CH.TROOPS[t].size + '"></canvas><b>×' + s.army[t] + '</b></span>').join('') + '</div>' : '<p class="warn">You have no troops. Train some in the Army screen.</p>') +
        (heroes.length ? '<h4>Heroes</h4><div class="army-row">' + heroes.map(h => '<span class="unit-chip hero"><canvas data-unit="' + CH.HEROES[h].sprite + '" data-size="' + CH.HEROES[h].size + '"></canvas><b>' + CH.HEROES[h].name.split(' ').pop() + '</b></span>').join('') + '</div>' : '') +
        (spells.length ? '<h4>Spells</h4><div class="army-row">' + spells.map(sp => '<span class="chip">' + icon(sp) + CH.SPELLS[sp].name + ' ×' + CH.SPELLS[sp].charges + '</span>').join('') + '</div>' : '') +
        '<div class="row"><button class="btn" data-act="army">Train troops</button><button class="btn btn-gold btn-lg" data-act="attack"' + (army.length || heroes.length ? '' : ' disabled') + '>Attack!</button></div></div></div>',
      on: { attack: () => CH.App.startBattle({ mode: 'raid', opponent: op }), army: () => UI.sheet('army') },
    };
  }

  /* ---------------- Army ---------------- */
  function army() {
    const s = save(), cap = S.housingCap(s), used = S.housingUsed(s), bl = S.barracksLevel(s);
    const cards = CH.TROOP_ORDER.map(t => {
      const d = CH.TROOPS[t], lvl = s.research.troops[t], locked = bl < d.unlock, why = S.trainBlocker(s, t), m = CH.RESEARCH.troopMult(lvl);
      return '<div class="troop-card' + (locked ? ' locked' : '') + '"><canvas data-unit="' + d.sprite + '" data-size="' + d.size + '" data-bg="120,170,255"></canvas>' +
        '<div class="tc-body"><div class="tc-top"><b>' + d.name + '</b><span class="tag">' + d.cls + '</span></div>' +
        '<span class="muted">Level ' + lvl + ' · ' + d.housing + ' space · ' + (d.flying ? 'Flying · ' : '') + (d.target === 'defense' ? 'Targets defenses' : d.proj ? 'Ranged' : 'Melee') + '</span>' +
        '<span class="tc-stats">❤ ' + U.fmt(d.hp * m) + ' · ⚔ ' + U.fmt(d.dmg * m) + (d.splash ? ' area' : '') + '</span>' +
        '<span class="desc">' + d.desc + '</span>' +
        (locked ? '<span class="req">' + icon('lock') + 'Barracks level ' + d.unlock + '</span>' :
          '<div class="tc-buy"><span class="have">Owned ' + (s.army[t] || 0) + '</span><button class="btn btn-gold" data-act="train" data-t="' + t + '"' + (why ? ' disabled title="' + why + '"' : '') + '>Train ' + icon('gold') + d.cost + ' · ' + d.time + 's</button></div>') +
        '</div></div>';
    }).join('');
    const queue = s.train.map((q, i) => '<button class="q-item" data-act="cancel" data-i="' + i + '" title="Cancel and refund"><canvas data-unit="' + CH.TROOPS[q.type].sprite + '" data-size="' + CH.TROOPS[q.type].size + '"></canvas>' + (i === 0 ? '<i style="width:' + Math.round((1 - q.left / CH.TROOPS[q.type].time) * 100) + '%"></i>' : '') + '</button>').join('');
    const left = s.train.reduce((a, q) => a + q.left, 0);
    return {
      title: 'Army',
      html: (bl ? '' : '<p class="warn">Build a Barracks to train troops.</p>') +
        '<div class="army-head panel"><div><span class="label">Army space</span><div class="bar big"><i style="width:' + (cap ? Math.min(100, used / cap * 100) : 0) + '%"></i></div><b>' + used + ' / ' + cap + '</b> (including the queue)</div>' +
        '<div class="queue"><span class="label">Training queue ' + (s.train.length ? '· ' + U.time(left) : '(empty)') + '</span><div class="q-row">' + queue + '</div></div>' +
        (s.train.length ? '<button class="btn btn-gem" data-act="finish">Finish now ' + icon('gems') + Math.max(1, Math.ceil(left / 20)) + '</button>' : '') + '</div>' +
        '<p class="muted">Troops you deploy in battle are used up. Training continues while you are away.</p><div class="troop-grid">' + cards + '</div>',
      on: {
        train: b => { const r = S.train(s, b.dataset.t); if (!r.ok) return fail(r); CH.Audio.play('deploy'); persist(); UI.refreshSheet(); },
        cancel: b => { S.cancelTrain(s, +b.dataset.i); persist(); UI.refreshSheet(); },
        finish: () => { if (!S.finishTrainingNow(s)) return fail({ reason: 'Not enough gems' }); persist(); UI.refreshSheet(); },
      },
    };
  }

  /* ---------------- Heroes ---------------- */
  function heroes() {
    const s = save(), hl = S.heroHallLevel(s);
    const cards = CH.HERO_ORDER.map(id => {
      const d = CH.HEROES[id], h = s.heroes[id], why = S.heroBlocker(s, id), m = CH.State.heroMult(h.level);
      const next = h.unlocked ? CH.heroUpgradeCost(h.level + 1) : d.cost;
      return '<article class="hero-card' + (h.unlocked ? '' : ' locked') + '"><canvas data-unit="' + d.sprite + '" data-size="' + d.size + '" data-bg="255,210,120"></canvas>' +
        '<div class="hc-body"><h3>' + d.name + '</h3><p class="kicker">' + d.title + ' · ' + d.role + '</p>' +
        '<p>' + d.desc + '</p><div class="ability"><b>' + d.ability.name + '</b> (' + d.ability.cd + 's cooldown): ' + d.ability.desc + '</div>' +
        '<div class="tc-stats">' + (h.unlocked ? 'Level ' + h.level + ' / ' + S.heroMaxLevel(s) + ' · ' : '') + '❤ ' + U.fmt(d.hp * m) + ' · ⚔ ' + U.fmt(d.dmg * m) + (d.proj ? ' ranged' : '') + '</div>' +
        (hl < d.unlock ? '<span class="req">' + icon('lock') + 'Hero Hall level ' + d.unlock + '</span>' :
          '<button class="btn btn-gold btn-block" data-act="hero" data-id="' + id + '"' + (why ? ' disabled' : '') + '>' + (h.unlocked ? 'Train to level ' + (h.level + 1) : 'Recruit') + ' ' + UI.cost(next, s) + '</button>' + (why && why !== 'Not enough resources' ? '<span class="req">' + why + '</span>' : '')) +
        '</div></article>';
    }).join('');
    return {
      title: 'Heroes',
      html: (hl ? '' : '<p class="warn">Build a Hero Hall (castle level 2) to recruit heroes.</p>') + '<p class="lead">Heroes are never used up. Deploy them in any battle and trigger their ability from the battle bar. Upgrades above level 3 need runes, earned from boss stages and Endless Defense.</p><div class="hero-grid">' + cards + '</div>',
      on: { hero: b => { const r = S.heroAction(s, b.dataset.id); if (!r.ok) return fail(r); CH.Audio.play(r.unlocked ? 'heroDeploy' : 'upgrade'); persist(); UI.refreshSheet(); } },
    };
  }

  /* ---------------- Buildings overview ---------------- */
  function buildings() {
    const s = save(), now = Date.now();
    const groups = CH.BUILD_MENU.concat([{ id: 'core', name: 'Castle', types: ['castle'] }]).reverse();
    const html = groups.map(g => {
      const list = s.buildings.filter(b => g.types.includes(b.type) && b.type !== 'wall');
      if (!list.length) return '';
      return '<h4 class="group">' + g.name + '</h4><div class="b-list">' + list.map(b => {
        const d = B[b.type], why = S.upgradeBlocker(s, b), max = S.maxLevelFor(s, b.type);
        return '<div class="b-row"><canvas data-building="' + b.type + '" data-level="' + Math.max(1, b.level) + '"></canvas><div class="b-info"><b>' + d.name + '</b><span class="muted">Level ' + b.level + ' / ' + max + (b.job ? ' · ' + (b.job.kind === 'clear' ? 'clearing' : 'upgrading') + ' ' + U.time((b.job.ends - now) / 1000) : '') + '</span></div>' +
          (d.maxLevel > 1 && !b.job ? '<button class="btn' + (why ? '' : ' btn-gold') + '" data-act="up" data-id="' + b.id + '"' + (why === 'Maximum level' ? ' disabled' : '') + '>' + (why && why !== 'Not enough resources' ? why : 'Upgrade') + '</button>' : '') +
          '<button class="btn btn-quiet" data-act="show" data-id="' + b.id + '">Show</button></div>';
      }).join('') + '</div>';
    }).join('');
    const walls = s.buildings.filter(b => b.type === 'wall');
    const wallLv = {}; walls.forEach(w => wallLv[w.level] = (wallLv[w.level] || 0) + 1);
    return {
      title: 'Buildings',
      html: '<div class="builders panel">' + icon('hammer') + '<b>' + S.freeBuilders(s) + ' of ' + S.builders(s) + ' builders free.</b> Each Builder Hut is one builder; build more to work faster.</div>' + html +
        '<h4 class="group">Walls</h4><p class="muted">' + walls.length + ' / ' + S.maxCount(s, 'wall') + ' placed · ' + Object.entries(wallLv).map(([l, n]) => n + ' at level ' + l).join(', ') + '</p>',
      on: {
        up: b => { const bb = S.byId(s, +b.dataset.id); if (bb) CH.Home.upgradeDialog(bb); },
        show: b => { const bb = S.byId(s, +b.dataset.id); UI.closeSheets(); if (bb) CH.Home.select(bb); },
      },
    };
  }

  /* ---------------- Research ---------------- */
  function lab() {
    const s = save(), ll = S.labLevel(s), now = Date.now(), j = s.rjob;
    const row = (kind, id, name, sprite, size, lvl, extra) => {
      const why = S.researchBlocker(s, kind, id), c = S.researchCost(kind, id, lvl + 1);
      return '<div class="r-row">' + (sprite ? '<canvas data-unit="' + sprite + '" data-size="' + size + '"></canvas>' : icon(id, 'big-ico')) + '<div class="b-info"><b>' + name + '</b><span class="muted">Level ' + lvl + ' / ' + CH.RESEARCH.maxLevel(Math.max(1, ll)) + (extra ? ' · ' + extra : '') + '</span></div>' +
        (why === 'Maximum level' ? '<span class="maxed">Max</span>' : '<button class="btn' + (why ? '' : ' btn-gold') + '" data-act="research" data-kind="' + kind + '" data-id="' + id + '"' + (why ? ' disabled title="' + why + '"' : '') + '>' + (why && why !== 'Not enough resources' ? why : UI.cost(c, s) + ' · ' + U.time(CH.RESEARCH.time(lvl + 1))) + '</button>') + '</div>';
    };
    return {
      title: 'Research',
      html: (ll ? '' : '<p class="warn">Build an Arcane Laboratory (castle level 3) to start research.</p>') +
        (j ? '<div class="panel r-job">' + icon('flask') + '<div><b>Researching ' + (j.kind === 'troop' ? CH.TROOPS[j.id].name : CH.SPELLS[j.id].name) + ' level ' + j.to + '</b><div class="bar"><i style="width:' + Math.round((1 - (j.ends - now) / 1000 / j.total) * 100) + '%"></i></div><span class="muted">' + U.time((j.ends - now) / 1000) + ' left</span></div><button class="btn btn-gem" data-act="rush">Finish ' + icon('gems') + Math.max(1, Math.ceil((j.ends - now) / 30000)) + '</button></div>' : '') +
        '<p class="lead">Each troop level adds 14% health and damage. Spell levels make spells stronger. The lab level caps research.</p>' +
        '<h4 class="group">Troops</h4>' + CH.TROOP_ORDER.map(t => row('troop', t, CH.TROOPS[t].name, CH.TROOPS[t].sprite, CH.TROOPS[t].size, s.research.troops[t])).join('') +
        '<h4 class="group">Spells</h4>' + CH.SPELL_ORDER.map(sp => row('spell', sp, CH.SPELLS[sp].name, null, 0, s.research.spells[sp], CH.SPELLS[sp].desc)).join(''),
      on: {
        research: b => { const r = S.research(s, b.dataset.kind, b.dataset.id); if (!r.ok) return fail(r); CH.Audio.play('magic'); persist(); UI.refreshSheet(); },
        rush: () => { const c = Math.max(1, Math.ceil((s.rjob.ends - Date.now()) / 30000)); if (s.res.gems < c) return fail({ reason: 'Not enough gems' }); s.res.gems -= c; s.rjob.ends = Date.now(); CH.App.handleEvents(S.tick(s)); persist(); UI.refreshSheet(); },
      },
    };
  }

  /* ---------------- Resources ---------------- */
  function resources() {
    const s = save();
    const rows = ['gold', 'wood', 'stone'].map(r => {
      const cap = S.capacity(s, r), p = S.productionPerMin(s, r);
      return '<div class="res-card panel">' + icon(r, 'big-ico') + '<div><h3>' + r[0].toUpperCase() + r.slice(1) + '</h3><b>' + U.fmt(s.res[r]) + ' / ' + U.fmt(cap) + '</b><div class="bar"><i style="width:' + Math.min(100, s.res[r] / cap * 100) + '%"></i></div>' +
        '<p class="muted">Production ' + U.fmt(p * 60) + ' per hour. Producers hold about 40 minutes of output until you collect it.</p></div></div>';
    }).join('');
    return {
      title: 'Resources',
      html: '<div class="res-grid">' + rows +
        '<div class="res-card panel">' + icon('gems', 'big-ico') + '<div><h3>Gems</h3><b>' + s.res.gems + '</b><p class="muted">Rare. Earned from player levels, 3-star campaign clears, boss stages, defense records, high fortresses and clearing obstacles. Spend them to finish timers instantly.</p></div></div>' +
        '<div class="res-card panel">' + icon('runes', 'big-ico') + '<div><h3>Runes</h3><b>' + s.res.runes + '</b><p class="muted">Rare material from campaign stages 5 and 6 and every 5 Endless Defense waves. Needed for hero levels above 3.</p></div></div></div>' +
        '<h4 class="group">Where resources come from</h4><ul class="bullets"><li><b>Home:</b> mines, mills and quarries produce over time, even while you\'re away.</li><li><b>Campaign:</b> first clears pay the most; replays pay 25%.</li><li><b>Endless Raid:</b> steal loot from AI kingdoms, plus a star bonus.</li><li><b>Endless Defense:</b> every wave banks rewards, with runes every 5 waves.</li></ul>',
    };
  }

  /* ---------------- Profile ---------------- */
  function profile() {
    const s = save(), cl = S.castleLevel(s);
    let camp = 0; for (const k in s.campaign) camp += s.campaign[k];
    const road = [];
    for (let L = cl + 1; L <= Math.min(8, cl + 3); L++) road.push('<div class="road-step"><b>Castle level ' + L + '</b><ul>' + S.unlocksAt(L).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>');
    const ms = CH.Defense.MILESTONES.map(m => '<span class="chip' + (s.defense.claimed.includes(m.wave) ? ' done' : '') + '">Wave ' + m.wave + ': ' + icon('gems') + m.gems + ' ' + icon('runes') + m.runes + (s.defense.claimed.includes(m.wave) ? ' ✓' : '') + '</span>').join('');
    return {
      title: 'Profile',
      html: '<div class="profile panel"><div class="big-lvl">' + s.player.level + '</div><div><label class="label" for="pname">Ruler name</label><input id="pname" maxlength="24" value="' + esc(s.player.name) + '">' +
        '<div class="bar"><i style="width:' + Math.round(s.player.xp / S.xpFor(s.player.level) * 100) + '%"></i></div><span class="muted">' + s.player.xp + ' / ' + S.xpFor(s.player.level) + ' XP to level ' + (s.player.level + 1) + ' (each level gives gems)</span></div></div>' +
        '<div class="stat-grid">' +
        [['Castle level', cl], ['Campaign stars', camp + ' / 108'], ['Trophies', s.raid.trophies + ' · ' + CH.Raid.league(s.raid.trophies)], ['Raids won', s.raid.wins + ' / ' + s.raid.attacks], ['Best defense wave', s.defense.best], ['Defense runs', s.defense.runs], ['Enemies slain', U.fmt(s.stats.enemiesSlain)], ['Buildings raided', U.fmt(s.stats.buildingsRaided)]]
          .map(([k, v]) => '<div class="panel"><span class="label">' + k + '</span><b>' + v + '</b></div>').join('') + '</div>' +
        '<h4 class="group">Endless Defense records</h4><div class="chips">' + ms + '</div>' +
        '<h4 class="group">What\'s next</h4><div class="road">' + (road.join('') || '<p>Your castle is at its maximum level.</p>') + '</div>',
      onInput: e => { if (e.target.id === 'pname') { s.player.name = e.target.value.trim().slice(0, 24) || 'Lord of Crownhold'; persist(); CH.Home.refreshHud(true); } },
    };
  }

  /* ---------------- Redeem codes ---------------- */
  function redeem() {
    const s = save();
    const got = (CH.REDEEM_CODES || []).filter(c => s.redeemed.includes(c.hash));
    const describe = rw => UI.reward(rw) + (rw.troops ? Object.entries(rw.troops).map(([t, n]) => '<span class="chip">' + n + '× ' + (CH.TROOPS[t] ? CH.TROOPS[t].name : t) + '</span>').join('') : '');
    return {
      title: 'Redeem code',
      html: '<div class="redeem panel"><label class="label" for="rcode">Enter a gift code</label>' +
        '<div class="redeem-row"><input id="rcode" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="e.g. WELCOME2026"><button class="btn btn-gold" data-act="go">Redeem</button></div>' +
        '<p class="muted">Codes are not case-sensitive. Each code works once per kingdom. Gifts can go past your storage limits.</p><div id="rmsg" aria-live="polite"></div></div>' +
        '<h4 class="group">Redeemed</h4>' + (got.length ? '<div class="b-list">' + got.map(c => '<div class="b-row"><div class="b-info"><b>' + esc(c.label || 'Gift') + '</b></div><div class="chips">' + describe(c.reward || {}) + '</div></div>').join('') + '</div>' : '<p class="muted">No codes redeemed yet.</p>'),
      on: {
        go: () => {
          const inp = document.getElementById('rcode'), r = S.redeem(s, inp.value);
          if (!r.ok) { document.getElementById('rmsg').innerHTML = '<p class="warn">' + esc(r.reason) + '</p>'; CH.Audio.play('error'); return; }
          persist(); CH.Audio.play('star');
          (r.levels || []).forEach(l => UI.toast('Player level ' + l.level + '! +' + l.gems + ' gems', 'good'));
          UI.refreshSheet(); CH.Home.refreshHud(true);
          UI.modal('<h3>' + esc(r.entry.label || 'Gift received') + '</h3><p>Added to your kingdom:</p><div class="chips">' + describe(r.entry.reward || {}) + '</div><button class="btn btn-gold btn-block" data-close style="margin-top:14px">Wonderful</button>');
        },
      },
      after: el => { const inp = el.querySelector('#rcode'); if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('[data-act=go]').click(); }); },
    };
  }

  /* ---------------- Settings ---------------- */
  function settings() {
    const st = save().settings;
    const slider = (k, l) => '<label class="set-row"><span>' + l + '</span><input type="range" min="0" max="100" value="' + Math.round(st[k] * 100) + '" data-set="' + k + '"><output>' + Math.round(st[k] * 100) + '%</output></label>';
    const tog = (k, l) => '<label class="set-row"><span>' + l + '</span><input type="checkbox" data-set="' + k + '"' + (st[k] ? ' checked' : '') + '></label>';
    return {
      title: 'Settings',
      html: '<div class="settings"><section class="panel"><h4>Sound</h4>' + slider('music', 'Music volume') + slider('sfx', 'Effects volume') + tog('muted', 'Mute everything') + '</section>' +
        '<section class="panel"><h4>Battle</h4>' + tog('damageNumbers', 'Show big damage numbers') + '</section>' +
        '<section class="panel"><h4>Gift codes</h4><button class="btn" data-act="redeem">Redeem a code</button></section>' +
        '<section class="panel"><h4>Progress</h4><p class="muted">Saved automatically in this browser' + (S.persistent() ? '' : ' (storage is blocked here, so progress lasts only this session)') + '.</p>' +
        (settings.confirm ? '<p class="warn">This erases your kingdom, army, heroes and records. It can\'t be undone.</p><div class="row"><button class="btn btn-danger" data-act="reset2">Erase everything</button><button class="btn" data-act="keep">Keep my kingdom</button></div>' : '<button class="btn btn-danger-quiet" data-act="reset">Reset progress…</button>') + '</section>' +
        '<p class="muted">Crownhold v' + CH.CONFIG.VERSION + '. All art, sound and music are generated in code. Raid opponents are AI-generated; there is no online multiplayer.</p></div>',
      on: {
        redeem: () => UI.sheet('redeem'),
        reset: () => { settings.confirm = true; UI.refreshSheet(); },
        keep: () => { settings.confirm = false; UI.refreshSheet(); },
        reset2: () => { settings.confirm = false; const keep = save().settings; CH.App.save = S.reset(); CH.App.save.settings = keep; persist(); UI.closeSheets(); CH.App.goHome(true); UI.toast('A new kingdom begins.', 'good'); },
      },
      onInput: e => {
        const el = e.target, k = el.dataset.set; if (!k) return;
        if (el.type === 'range') { st[k] = el.value / 100; el.nextElementSibling.textContent = el.value + '%'; } else st[k] = el.checked;
        CH.Audio.apply(st); persist();
      },
    };
  }

  function howto() {
    return {
      title: 'How to play',
      html: '<div class="howto">' +
        '<section class="panel"><h4>The core loop</h4><ol><li><b>Build</b> mines, mills and quarries, then tap them to collect. Storage buildings raise your limits.</li><li><b>Upgrade the castle</b> to unlock new buildings, a larger kingdom, regions and Endless Battle.</li><li><b>Train troops</b> in the Barracks and <b>recruit heroes</b> in the Hero Hall.</li><li><b>Fight</b> in the Campaign, raid AI kingdoms, or test your base in Endless Defense.</li><li><b>Spend</b> the rewards to grow stronger, and repeat.</li></ol></section>' +
        '<section class="panel"><h4>Kingdom controls</h4><ul class="bullets"><li>Drag the ground to pan; scroll or pinch to zoom.</li><li>Tap a building to see it and its actions. Drag a selected building to move it.</li><li>Placing: tap where you want it, then tap it again or press ✓. With a mouse, just click.</li><li>Walls and traps keep placing until you press ✗.</li></ul></section>' +
        '<section class="panel"><h4>Battles</h4><ul class="bullets"><li><b>Raid:</b> pick a troop, then tap or drag outside the red zone to deploy. Troops pick targets on their own; walls make ground troops break through or walk around.</li><li><b>Defense and Campaign:</b> deploy troops and heroes as defenders where you tap. In the campaign, pick a tower and tap open ground beside the road to build it with battle gold.</li><li>Heroes: tap a deployed hero\'s card to use its ability. Spells: pick one, then tap the battlefield.</li><li>Flyers ignore walls. Cannons and mortars can\'t hit them.</li></ul></section></div>',
    };
  }

  return { shop, campaign, stages, endless, raidTargets, raidPrep, army, heroes, buildings, lab, resources, profile, settings, howto, redeem };
})();
