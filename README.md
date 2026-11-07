# Crownhold — Kingdom Siege

A single-player fantasy strategy game for the browser that combines **base building** (Clash of Clans style), **tower defense**, **raiding** and a **campaign**. Build your kingdom on a grid, earn and spend resources, train an army, recruit heroes, then:

- **Campaign:** defend your castle along fixed roads across 6 regions × 6 stages, with objectives and boss battles.
- **Endless Raid:** attack AI-generated enemy kingdoms and steal their resources.
- **Endless Defense:** endless AI waves attack *your actual base layout*.

Plain HTML5 + JavaScript + Canvas 2D. No engine, no server, no accounts, no paid services. All art, sound and music are generated in code, so there are no asset files to license. Raid opponents are computer-generated; **there is no online multiplayer.**

---

## Run it

| Goal | How |
|---|---|
| Play | Double-click `dist/crownhold.html` (one file, works offline). |
| Play the source version | Double-click `index.html`. |
| Edit | Change files in `js/` or `css/`, save, refresh the browser. Nothing to install. |
| Rebuild the single file | `python3 tools/build.py` (needs Python 3). |

Progress saves automatically in the browser (localStorage) and survives closing it. **Settings → Reset progress** starts over. Fonts come from Google Fonts when online; offline, system fonts are used.

## Controls

| Where | Input | Action |
|---|---|---|
| Kingdom | Drag the ground · scroll / pinch | Pan · zoom |
| Kingdom | Tap a building | Select it: stats, upgrade, collect, move, train… |
| Kingdom | Drag a selected building | Move it |
| Placing | Mouse: click · Touch: tap a spot, then tap it again or press ✓ | Place (walls and traps keep placing until ✗) |
| Battle | Pick a card, then tap the map | Deploy troop / hero, cast spell, build tower (campaign) |
| Raid | Drag with a troop selected | Deploy a line of troops |
| Battle | Tap a deployed hero's card | Use the hero's ability |
| Anywhere | `Esc` / right-click | Cancel / close |

---

## Game systems

**Resources:** Gold, Wood, Stone (produced by mines, mills and quarries; capped by storage buildings and the castle), plus rare **Gems** and **Runes**.
- **Gems:** player level-ups, 3-star campaign clears, boss stages, defense records, high-fortress raids, obstacle clearing. Spent to finish timers.
- **Runes:** campaign stages 5–6 and every 5 Endless Defense waves. Needed for hero levels above 3.

**Producers** hold about 40 minutes of output until collected, so generation is never unlimited. Timers use wall-clock time and keep running offline.

**Castle level (1–8)** caps every building's level, sets how many of each building you may own, enlarges the buildable kingdom, and unlocks regions and Endless Battle (castle 2).

**Builders:** each Builder Hut is one construction slot. Walls, traps and huts are instant.

| Category | Buildings |
|---|---|
| Core & economy | Castle (has an archer garrison), Builder Hut, Gold Mine, Lumber Mill, Stone Quarry, Gold Vault, Timber Yard, Stone Depot |
| Army | Barracks (troops and army space), Hero Hall (heroes), Arcane Laboratory (research) |
| Defense | Archer Tower, Cannon (ground only), Mage Tower (area, ignores armor), Frost Spire (slow / freeze), Mortar (long-range splash with a blind spot), Tesla Coil (chain lightning), Ballista (anti-large) |
| Walls & traps | Walls and Gates (ground units break through or walk around), Spike, Bomb and Fire traps (hidden from raiders) |

Most defenses gain a special at higher levels (double arrows, knockback, cluster shells, piercing bolts…), and buildings change look at levels 3 and 6.

**Troops (11):** Swordsman, Archer, Spearman (bonus vs large), Knight (targets defenses), Battle Mage (area), Berserker (frenzy at low health), Paladin (heals allies), Necromancer (raises skeletons), Giant, Golem (splits on death), Dragon Rider (flying). Troops are used up when deployed; training continues offline. Research adds 14% health and damage per level.

**Heroes (5):** King Aldric (damage aura, Royal Charge stun), Queen Lyra (Arrow Storm), Archmage Velis (Meteor), Sir Morvane (lifesteal, Shadow Cleave), Mortis (skeleton escort, Raise Legion). Heroes are never used up.

**Spells:** Fireball, Healing Rain, Battle Rage, unlocked and improved through the lab.

**Enemies:** Goblins (loot-seekers), Wolves, Orcs, Goblin Sappers (blow up walls), Bats and Dragon Whelps (fly over walls), Skeletons, Skeleton Mages, Giant Spiders (split), Trolls (regenerate), Ogres (stomp), Dark Knights (heavy armor), Imps. **Bosses:** Troll Chief, Orc Warlord (war cry, summons), Broodmother, Frost Giant (freezes towers), Demon Lord (burning aura, summons), Vyrathax the Dragon (flies, inferno, enrages).

### Modes
- **Campaign:** 36 stages with objectives: survive, protect a gold mine, beat a time limit, defend three fronts, defeat a boss. Build towers with battle gold (their level follows your home defenses), deploy troops and heroes, cast spells. 3 stars depend on castle health. First clears pay full rewards; replays pay 25%. Regions need the previous boss and a castle level.
- **Endless Raid:** 4 AI kingdoms at a time in five styles (beginner village, resource hoard, balanced, heavy defenses, high fortress), scaled to your castle level and trophies. Scout the layout and loot, then deploy outside the red zone. Ground troops use A* pathfinding and will break walls when that is the better route. Stars come from 50% destruction, the castle, and 100%. Loot is proportional to damage dealt. Each kingdom can be raided only once; searching for new ones costs gold.
- **Endless Defense:** waves come from every side at your real layout, and your real buildings are never damaged. Mini-bosses from wave 10, bosses every 10 waves from 20, and random modifiers after 20. Every 5 waves you pick a blessing (repairs, damage, speed, rally heroes, tribute). Rewards bank each wave; your best wave and record milestones are saved.

---

## Project structure

```
index.html            entry point (script load order matters)
css/style.css         all UI styles (theme tokens at the top)
js/data/defs.js       config + buildings, troops, heroes, spells, enemies, research
js/data/content.js    campaign regions/stages, raid base generator, defense waves, starting layout
js/data/codes.js      redeem codes (hashed) + hash function
js/core/state.js      kingdom state: economy, timers, building, training, research, heroes, XP, save/validate
js/core/audio.js      synthesized sound effects + generative music (Web Audio)
js/game/battle.js     the battle engine for all three modes (A*, towers, traps, units, bosses, spells)
js/render/art.js      procedural art for every building, unit and boss
js/render/view.js     camera (pan/zoom/pinch), terrain caches, home & battle rendering
js/ui/core.js         icons, cost chips, toasts, modal and sheet managers
js/ui/home.js         kingdom HUD, goals, building panel, upgrade dialog, placing and moving
js/ui/screens.js      all menu screens
js/ui/battleui.js     battle HUD, deploy bar, blessings
js/main.js            app flow: title → kingdom ⇄ battles → results, reward application, game loop
tests/                run_tests.js (27 logic tests), balance.js (campaign sweep), browser_test.py (66 checks)
tools/build.py        bundles everything into dist/crownhold.html
tools/codegen.js      generates redeem-code entries
```

`state.js` and `battle.js` contain no DOM code, which is why the same logic runs in Node for the tests.

## Adding content

- **Building:** add an entry to `CH.BUILDINGS` in `defs.js` with `cat`, `size`, `unlock`, `counts` (per castle level), `maxLevel`, and `cost(L)`, `time(L)`, `hp(L)`. Defenses get an `atk` block. Add it to a `CH.BUILD_MENU` tab, and draw it with a function of the same name in `BLD` in `render/art.js`.
- **Troop:** add to `CH.TROOPS` (stats, `housing`, `cost`, `time`, `unlock` = barracks level, `sprite`) and draw a sprite in `UNIT` in `art.js`. Research and training pick it up automatically.
- **Enemy:** add to `CH.ENEMIES` with `threat` (wave-budget cost) and optional `stomp` / `warcry` / `summonE` / `freeze` / `aura` / `inferno` / `split` / `regen`. Put it in a region's `pool` or in `D_POOL` (Endless Defense).
- **Hero:** add to `CH.HEROES` with an `ability.id`, implement that id in `Battle.useAbility()`, and add a sprite.
- **Region or stage:** append to `CH.REGIONS` (palette, decor, enemy pool, boss, required castle level). Stage layouts come from the `TEMPLATES` in `content.js`: road waypoints on the 30×22 grid, each road ending beside the building it attacks.

After any balance change, run `node tests/balance.js` (add `WEAK=1` for an under-upgraded player).

## Testing

```
node tests/run_tests.js                         # 27 logic tests
node tests/balance.js                           # all 36 campaign stages with a bot (WEAK=1 for a weaker kingdom)
python3 tests/browser_test.py                   # 66 browser checks (pip install playwright; playwright install chromium)
python3 tests/browser_test.py dist/crownhold.html
```

| Checklist area | Covered by |
|---|---|
| Building placement | Click placement; blocked over buildings and outside the kingdom; builder busy; locked types and count limits |
| Building upgrades | Upgrade dialog; construction timer; gem finish; castle level cap; area expansion |
| Resource generation | Offline production; producer cap; tap and collect-all; storage limits |
| Resource spending | Costs deducted; refusal when unaffordable; rewards clamped to storage |
| Campaign | Tower placement off-road only; road-following enemies; victory with stars and unlock; defeat without unlock |
| Endless Raid | Opponent list; scouting; drag-deploy; red zone; stars and loot; trophies; opponent removed; troops consumed |
| Endless Defense | Real layout used; edge spawns; hero defender; blessing at wave 5; record saved; buildings unharmed |
| Enemy AI | A* around walls with a gap and through walls when enclosed; flyers ignore walls; traps; cannons can't hit air |
| Saving & loading | Reload persistence; corrupted and hostile data recovery |
| Mobile | Laptop, phone portrait and phone landscape layouts for home and battle |

Manual checks still worth doing on real devices: pinch-zoom feel on a phone, audio on iOS Safari (needs a tap first), and a long session's pacing.

## Redeem codes

Players open **More → Redeem code** (or **Settings → Gift codes**). Codes are case-insensitive and work once per save; rewards can exceed storage limits.

Codes live in `js/data/codes.js` as **hashes**, so valid codes can't be read from the page source. To add one:

```
node tools/codegen.js SUMMER2026 gold=3000 gems=20 knight=2 expires=2026-08-31 label="Summer gift"
```

Paste the printed line into `CH.REDEEM_CODES`, then redeploy (and rebuild if you use the single-file version). Options:

| Option | Meaning |
|---|---|
| `gold` `wood` `stone` `gems` `runes` `xp` | Resource rewards |
| Any troop id (`swordsman`, `knight`, …) | Free troops |
| `start` / `expires` | Active window (`YYYY-MM-DD`, inclusive) |
| `minCastle` | Minimum castle level |
| `label` | Name shown to the player |

Sample codes: `WELCOME2026`, `CROWNHOLD`, `ROYALARMY`.

This is client-side only, so a technical player can still edit their own save. For truly limited codes (global use caps, paid codes) validate on a server, for example a Cloudflare Worker with KV. See `PANDUAN-DEPLOY-DAN-REDEEM.md` (Indonesian) for step-by-step deploy and code instructions.

## Publishing for free

`dist/crownhold.html` is a static file:
- **itch.io:** rename it to `index.html`, zip it, upload as an HTML game, and tick "played in the browser". Supports paid downloads or donations if you monetize later.
- **GitHub Pages:** create a repository, upload the project folder (with `index.html` at the root), then Settings → Pages → Deploy from branch `main`, folder `/`.
- **Cloudflare Pages:** Workers & Pages → Create → Pages → Upload assets (drag the folder), or Connect to Git with no build command and output directory `/`.

Deploying the source folder (not `dist`) means adding a redeem code is just editing `js/data/codes.js` and pushing.

## Known limitations

- **Balance comes from bot simulations, not human playtests.** The campaign sweep wins all 36 stages with defenses upgraded for each castle level, and about 28 with an under-upgraded kingdom; bosses are the difficulty peaks. Economy pacing (production rates, timers measured in seconds to ~10 minutes) is tuned for a quick prototype, not a months-long game.
- **No real multiplayer.** Raid targets are generated from seeds. Other players never attack your base; Endless Defense uses AI waves.
- **Buildings are square,** so there is no rotation. Units use simple separation, not full collision, and occasionally overlap.
- **Damage is not persistent:** after any battle your base is whole again. There is no repair economy.
- **2.5D top-down art, not true isometric.** Animation is procedural (bobbing, swings, wing flaps), not frame-by-frame.
- **On tall phone screens** the map leaves bands above and below in portrait; landscape plays better.
- **Progress is per browser,** with no cloud sync or export. Tested in headless Chromium only (not real phones, Safari or Firefox).
