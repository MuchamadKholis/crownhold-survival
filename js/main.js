/* =====================================================================
 * Crownhold — main.js
 * Boots the game and owns the top-level flow:
 *   title → kingdom (home) ⇄ battles (campaign / raid / defense) → results
 * Rewards from battles are applied here, in one place.
 * ===================================================================== */
CH.App = (function () {
  const UI = CH.UI, S = CH.State, U = CH.util, $ = UI.$;
  const app = { save: null, view: null, mode: 'title', battle: null, saveTimer: 0, tickTimer: 0 };

  app.persist = () => S.save(app.save);

  app.handleEvents = evs => {
    for (const e of evs || []) {
      if (e.kind === 'built') { UI.toast(CH.BUILDINGS[e.type].name + (e.level > 1 ? ' upgraded to level ' + e.level : ' finished'), 'good'); CH.Audio.play('upgrade'); }
      else if (e.kind === 'research') UI.toast((e.rkind === 'troop' ? CH.TROOPS[e.id].name : CH.SPELLS[e.id].name) + ' research reached level ' + e.level, 'good');
      else if (e.kind === 'cleared') UI.toast('Cleared! ' + Object.entries(e.got).filter(([k]) => k !== 'levels').map(([k, v]) => '+' + v + ' ' + k).join(', ') + (e.gems ? ' and found ' + e.gems + ' gems!' : ''), 'good');
      if (e.levels) for (const l of e.levels) levelUp(l);
    }
    if (evs && evs.length) { app.persist(); CH.Home.refreshHud(true); if (UI.sheetOpen()) UI.refreshSheet(); }
  };
  function levelUp(l) { UI.toast('Player level ' + l.level + '! +' + l.gems + ' gems', 'good'); CH.Audio.play('star'); }

  /* ---------------- Home ---------------- */
  app.goHome = function (reframe) {
    app.mode = 'home'; app.battle = null;
    CH.BattleUI.close();
    document.body.classList.remove('in-battle');
    app.view.handler = CH.Home.handler;
    if (reframe !== false) app.view.frame(S.area(app.save), 1);
    CH.Home.cancelPlacement(); CH.Home.deselect();
    CH.Home.refreshHud(true);
    CH.Audio.startMusic('menu');
  };

  /* ---------------- Battles ---------------- */
  app.startBattle = function (cfg) {
    const s = app.save;
    UI.closeSheets(); UI.closeModal(); CH.Home.cancelPlacement(); CH.Home.deselect();
    const b = new CH.Battle({ ...cfg, save: s, layout: cfg.mode === 'defense' ? s.buildings : undefined });
    b.onEvent = CH.BattleUI.onEvent;
    app.battle = b; app.mode = 'battle';
    document.body.classList.add('in-battle');
    app.view.handler = CH.BattleUI.handler;
    if (cfg.mode === 'defense') app.view.frame(S.area(s), 2);
    else if (cfg.mode === 'raid') { const [w, h] = CH.CONFIG.AREA[cfg.opponent.cl - 1]; app.view.frame({ x: (CH.CONFIG.COLS - w) / 2, y: (CH.CONFIG.ROWS - h) / 2, w, h }, 2); }
    else app.view.frame({ x: 0, y: 0, w: CH.CONFIG.COLS, h: CH.CONFIG.ROWS }, 0);
    CH.BattleUI.open(b);
    CH.Audio.startMusic('battle', cfg.mode === 'campaign' ? 45 + cfg.stage.r : 48);
  };

  /** Apply the outcome of a battle to the save and show the results screen. */
  app.endBattle = function (b) {
    if (!b || b !== app.battle || b.applied) return;
    b.applied = true;
    const s = app.save, win = b.result === 'win';
    for (const t in b.used) s.army[t] = Math.max(0, (s.army[t] || 0) - b.used[t]);
    let html = '', got = {}, actions = '';
    const cl = S.castleLevel(s);
    if (b.mode === 'raid') {
      const op = b.opponent, lg = b.lootGot, stars = b.stars;
      const bonus = win ? Math.round((60 + 60 * cl) * stars) : 0;
      got = S.give(s, { gold: Math.floor(lg.gold) + bonus, wood: Math.floor(lg.wood) + bonus, stone: Math.floor(lg.stone + bonus * 0.6), gems: Math.floor(lg.gems), xp: 12 + Math.round(b.destruction / 3) });
      const tro = win ? Math.max(5, Math.round(op.trophyWin * (0.6 + stars * 0.15))) : -op.trophyLoss;
      s.raid.trophies = Math.max(0, s.raid.trophies + tro);
      s.raid.attacks++; if (win) s.raid.wins++;
      s.stats.buildingsRaided += b.stats.destroyed;
      s.raid.opponents = s.raid.opponents.filter(o => o.id !== op.id);
      html = resultHead(win ? 'Victory!' : 'Defeat', b.reason, stars, 3) + '<p class="big-num">' + b.destruction + '% destroyed</p>' +
        '<div class="res-lines">' + line('Loot taken', UI.reward({ gold: Math.floor(lg.gold), wood: Math.floor(lg.wood), stone: Math.floor(lg.stone), gems: Math.floor(lg.gems) })) + (bonus ? line('Star bonus', UI.reward({ gold: bonus, wood: bonus, stone: Math.floor(bonus * 0.6) })) : '') +
        line('Trophies', '<span class="chip">' + UI.icon('trophy') + (tro >= 0 ? '+' : '') + tro + '</span>') + '</div>' + capNote(s, got);
      actions = '<button class="btn btn-gold btn-lg" data-r="raid">Raid another kingdom</button>';
    } else if (b.mode === 'defense') {
      const reached = b.wave - (b.waveCleared ? 0 : 1);
      const bank = b.bank;
      const record = reached > s.defense.best;
      if (record) s.defense.best = reached;
      s.defense.runs++; s.stats.enemiesSlain += b.stats.kills;
      const ms = CH.Defense.MILESTONES.filter(m => reached >= m.wave && !s.defense.claimed.includes(m.wave));
      let mGems = 0, mRunes = 0;
      for (const m of ms) { s.defense.claimed.push(m.wave); mGems += m.gems; mRunes += m.runes; }
      got = S.give(s, { gold: bank.gold, wood: bank.wood, stone: bank.stone, gems: bank.gems + mGems, runes: bank.runes + mRunes, xp: bank.xp });
      html = resultHead(record ? 'New record!' : 'The defense ends', b.reason, 0, 0) + '<p class="big-num">Survived ' + reached + ' wave' + (reached === 1 ? '' : 's') + '</p>' +
        '<div class="res-lines">' + line('Rewards banked', UI.reward({ gold: bank.gold, wood: bank.wood, stone: bank.stone, gems: bank.gems, runes: bank.runes, xp: bank.xp })) +
        (ms.length ? line('Record milestones', UI.reward({ gems: mGems, runes: mRunes })) : '') + line('Enemies slain', '<b>' + b.stats.kills + '</b>') + '</div>' + capNote(s, got) +
        '<p class="muted">Your real buildings are never damaged by Endless Defense.</p>';
      actions = '<button class="btn btn-gold btn-lg" data-r="defense">Defend again</button>';
    } else {
      const st = b.stage, prev = s.campaign[st.id] || 0;
      s.stats.enemiesSlain += b.stats.kills;
      if (win) {
        const stars = b.campaignStars();
        const rw = prev ? { gold: Math.round(st.reward.gold * 0.25), wood: Math.round(st.reward.wood * 0.25), stone: Math.round(st.reward.stone * 0.25), xp: Math.round(st.reward.xp * 0.3) } : { ...st.reward };
        if (stars === 3 && prev < 3) rw.gems = (rw.gems || 0) + 2;
        s.campaign[st.id] = Math.max(prev, stars);
        s.stats.battlesWon++;
        got = S.give(s, rw);
        const next = st.s < 5 ? st.r + '-' + (st.s + 1) : st.r < 5 ? (st.r + 1) + '-0' : null;
        html = resultHead('Victory!', b.reason, stars, 3) + '<div class="res-lines">' + line(prev ? 'Replay reward' : 'First clear reward', UI.reward(rw)) + '</div>' + capNote(s, got) +
          (st.s === 5 && st.r < 5 ? '<p class="good">' + (S.castleLevel(s) >= CH.REGIONS[st.r + 1].castle ? 'New region unlocked: ' + CH.REGIONS[st.r + 1].name + '!' : 'Upgrade your castle to level ' + CH.REGIONS[st.r + 1].castle + ' to enter ' + CH.REGIONS[st.r + 1].name + '.') + '</p>' : '');
        if (next) { const [nr, ns] = next.split('-').map(Number); if (CH.Campaign.stageUnlocked(s, nr, ns)) actions = '<button class="btn btn-gold btn-lg" data-r="next" data-id="' + next + '">Next stage</button>'; }
      } else {
        html = resultHead('Defeat', b.reason, 0, 3) + '<p>' + campaignTip(b) + '</p>';
        actions = '<button class="btn btn-gold btn-lg" data-r="retry">Try again</button>';
      }
    }
    if (got.levels) got.levels.forEach(levelUp);
    app.persist();
    UI.modal('<div class="results ' + (win ? 'win' : 'lose') + '">' + html + '<div class="row center">' + actions + '<button class="btn" data-r="home">Return to kingdom</button></div></div>', {
      noClose: true, cls: 'results-card',
      onClick: e => {
        const r = e.target.closest('[data-r]'); if (!r) return;
        CH.Audio.play('click'); UI.closeModal();
        const k = r.dataset.r;
        app.goHome(true);
        if (k === 'raid') UI.sheet('raidTargets');
        else if (k === 'defense') app.startBattle({ mode: 'defense' });
        else if (k === 'retry') app.startBattle({ mode: 'campaign', stage: b.stage });
        else if (k === 'next') { const [nr, ns] = r.dataset.id.split('-').map(Number); app.startBattle({ mode: 'campaign', stage: CH.Campaign.stage(nr, ns) }); }
      },
    });
    CH.Audio.startMusic('menu');
  };
  function resultHead(title, reason, stars, max) {
    return '<h2>' + title + '</h2><p class="muted">' + UI.esc(reason || '') + '</p>' + (max ? '<div class="big-stars">' + Array.from({ length: max }, (_, i) => '<span class="bstar' + (i < stars ? ' on' : '') + '" style="--i:' + i + '">' + UI.ICONS.star + '</span>').join('') + '</div>' : '');
  }
  const line = (k, v) => '<div class="res-line"><span>' + k + '</span><span>' + v + '</span></div>';
  function capNote(s, got) {
    const full = ['gold', 'wood', 'stone'].filter(r => s.res[r] >= S.capacity(s, r));
    return full.length ? '<p class="warn">Your ' + full.join(' and ') + ' storage is full; some rewards were lost. Upgrade storage buildings.</p>' : '';
  }
  function campaignTip(b) {
    if (b.stage.obj === 'timed') return 'Time ran out. Build more towers early and call waves sooner.';
    if (b.boss) return 'The boss broke through. Place towers near the end of its road and save spells for it.';
    return 'Build towers at the bends of the road so they hit enemies twice, deploy troops to block, and upgrade your home defenses to make campaign towers stronger.';
  }

  /* ---------------- Title & intro ---------------- */
  function titleScreen() {
    const t = $('title');
    t.innerHTML = '<div class="title-inner"><h1><span>Crown</span><span>hold</span></h1><p class="tag">Build your kingdom. Raid your rivals. Hold the walls.</p>' +
      '<button class="btn btn-gold btn-lg" id="t-play">' + (app.save.introSeen ? 'Enter your kingdom' : 'Found your kingdom') + '</button>' +
      '<div class="row center"><button class="btn btn-quiet" id="t-how">How to play</button><button class="btn btn-quiet" id="t-set">Settings</button></div>' +
      '<p class="t-foot">v' + CH.CONFIG.VERSION + ' · single-player · progress saves in this browser</p></div>';
    t.classList.remove('hidden');
    $('t-play').onclick = () => { CH.Audio.ensure(); CH.Audio.play('heroDeploy'); t.classList.add('hidden'); app.goHome(true); if (!app.save.introSeen) intro(); };
    $('t-how').onclick = () => { CH.Audio.ensure(); t.classList.add('hidden'); app.goHome(true); UI.sheet('howto'); };
    $('t-set').onclick = () => { CH.Audio.ensure(); t.classList.add('hidden'); app.goHome(true); UI.sheet('settings'); };
  }
  function intro() {
    UI.modal('<h3>Welcome, ruler of Crownhold</h3><p>Your kingdom is small, but it is yours. A few steps to get started:</p><ol class="bullets"><li>Tap the glowing coin over your <b>Gold Mine</b> to collect gold.</li><li>Press <b>Build</b> and place a <b>Stone Quarry</b> and a second <b>Builder Hut</b>.</li><li>Press <b>Campaign</b> and win your first battle for big rewards.</li><li>Upgrade the <b>Castle</b> to level 2 to unlock Endless Raid and Endless Defense.</li></ol><p class="muted">The "Next goals" list on the left always shows a good next step.</p><button class="btn btn-gold btn-block" data-close>Let\'s build</button>',
      { onClose: () => { app.save.introSeen = true; app.persist(); } });
  }

  /* ---------------- Loop ---------------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    const time = now / 1000;
    try {
      if (app.mode === 'battle' && app.battle) {
        CH.BattleUI.tick(dt);
        CH.View.drawBattle(app.view, app.battle, CH.BattleUI.drawUi(), app.battle.time);
      } else if (app.view.w) {
        app.tickTimer -= dt;
        if (app.tickTimer <= 0) { app.tickTimer = 0.5; app.handleEvents(S.tick(app.save)); CH.Home.refreshHud(); }
        CH.Home.update(dt);
        CH.View.drawHome(app.view, app.save, { selected: CH.Home.state.selected, ghost: CH.Home.state.ghost, moving: CH.Home.state.moving, floaters: CH.Home.state.floaters }, time);
      }
      app.saveTimer -= dt;
      if (app.saveTimer <= 0) { app.saveTimer = 10; if (app.mode !== 'battle') app.persist(); }
    } catch (err) { console.error('[Crownhold] frame error', err); }
    requestAnimationFrame(frame);
  }

  app.boot = function () {
    app.save = S.load();
    app.handleEvents(S.tick(app.save));
    CH.Audio.apply(app.save.settings);
    app.view = new CH.View.View($('cv'));
    app.view.resize();
    new ResizeObserver(() => app.view.resize()).observe($('world'));
    CH.Home.buildHud();
    app.view.handler = CH.Home.handler;
    app.view.frame(S.area(app.save), 1);
    CH.Home.refreshHud(true);
    window.addEventListener('pointerdown', () => CH.Audio.ensure(), { capture: true });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (UI.modalOpen()) UI.closeModal(); else if (UI.sheetOpen()) UI.back(); else if (app.mode === 'battle') CH.BattleUI.handler.cancel(); else CH.Home.handler.cancel(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && app.mode !== 'battle') app.persist(); });
    window.addEventListener('beforeunload', () => { if (app.mode !== 'battle') app.persist(); });
    titleScreen();
    requestAnimationFrame(frame);
  };
  return app;
})();
CH.App.boot();
