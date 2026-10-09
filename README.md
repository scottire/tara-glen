# Tara Glen

A tiny SNES-style top-down adventure set in the caravan park next to Tara Glen Golf & Country Club, Co. Wexford
(Phaser 4 + TypeScript + Vite, hosted on GitHub Pages). A private joke game for friends.

You wake up in mobile 127. Mam's at the clubhouse quiz, manhunt has been going since lunch, there's moving dust in 131,
and by sundown the gulls have the Tara Glen flag out on the Rock.

## Controls (touch first, v9 action layout)
- Move: floating joystick on the **left** 60% of the screen, or arrows / WASD.
- **⚔️ Attack** (big red, bottom right): you swing a golf iron. Tap for a 3-hit combo (4 with Long Game; taps during a swing are buffered).
  With Power Drive, **hold** to charge: a ring fills round you, then release for a full drive swing. Swings snap to the nearest enemy in a wide cone.
  Mid-roll it becomes Dash Strike; as an enemy shot arrives it becomes Putt Parry (once you've earned them).
  Near someone or something with no enemy close, the same button becomes **Interact** (✋ 💬 🔓 🚪 ▶, turns green). Keys: J / Space (hold to charge), E / Enter = talk.
- **💨 Dodge** (big blue, left of Attack): roll with i-frames, short cooldown. With the skateboard 🛹 it goes further, passes dash locks and hurts enemies. Keys: K / Shift (Z / C still work).
- ⛳ Chip Shot once earned (small secondary button; before that it throws 💦 water balloons; L / X / F) · 🚲 bike (B; not on sand).
- 🎯 objective line top-left (tap to fold) · 🎒 bag (combine items) · 📻 walkie hints · ☰ reset. Saved in localStorage (`tara-glen-save-v6`).

## Fight abilities (v10): the world opens through combat
| Ability | Earned by | What it does | What it opens |
|---|---|---|---|
| 🏌️ Power Drive | beating the Big Dust Bunny (Mobile 131) | hold ⚔️, release for a 360° drive swing; cracks armour | the rotten gate into Playground Row (`gate_g1`, lock kind `crack`) |
| ⛳ Chip Shot | the Back Field arena | ranged golf ball on the small button | the lifeguard's key in the whitethorn (`key_hook`), which leads to the beach gate |
| ⚡ Dash Strike | clearing Mobile 377 | ⚔️ during a dodge = a lunge through enemies | the low wardrobe gaps in secret back rooms (`secretLocks` dash) |
| 🔁 Putt Parry | the Ninth Hole arena | tap ⚔️ as a shot arrives to send it back; returned shots stun | Big Gerry, whose guard turns the club until a returned shot stuns him |
| ➕ Long Game | clearing Mobile 370 | a 4th, heavier combo hit | (combat only) |
| ❤️ Heart | the Dunes arena | +1 max heart | (combat only) |

Rewards live in `content/world.json` (`arenas[].reward`, `encounters[]`) and in boss `drops` (`content/story.json`). build.py turns each room or arena clear into an
`encounter` entity the solver collects once the room or arena is reachable. The validator fails if a fight ability (an item with `how`) is never earned, is earned
outside a fight, or a gate needing it could open first. Unlocks play a club-raise pose and a banner with a one-line how-to (`abilityMoment`).

## Player sprite (v10)
`scripts/gen/player.py` hand-pixels the hero in the house palette: messy brown hair, green GAA jersey with a cream hoop, navy shorts, white runners and a golf iron.
Frames are 24x24 with the feet on row 22. Animations: idle, walk, three swings, charge, spin, roll, hurt, faint and interact, in 4 directions (left mirrors right).
It writes `public/assets/v10/player.png` and `player.json` (anim → dir → frames), plus `fx.png` (swoosh, drive ring, ball). It also writes a x4 preview to `/workspace/tg-v10-player-sheet-x4.png`.

## Tests
`tests/e2e/*.mjs` (playwright-core + system Chrome, iPhone 13 emulation, real touch events):
- `freeze.mjs`: room clear with a boss, the empty-dialogue regression, and recovery from an error inside a frame (`node freeze.mjs webkit` for WebKit).
- `v10.mjs`: Power Drive unlock, breaking the gate and walking through, then Chip Shot, Dash Strike, Putt Parry and Gerry's guard.
- `v9.mjs`: combo, charge, dodge, telegraphs, room lock, checkpoints, arena.

## Combat and structure (v9)
- `src/v9/combat.ts`: combo, charge, dodge, auto-aim, input buffer, hit-stop, flash, knockback, particles, shake, enemy projectiles, and attack tokens (at most 3 enemies close in and 2 wind up at once; the rest circle).
- `src/v6/enemies.ts`: archetypes from `content/enemies.json` (`ai`): **chaser** (dust bunny), **charger** (crab, gull: flash + ground line, then a dash, dizzy after), **spitter** (wasp, cellar eye: keeps distance, glowing orb), **tank** (slime: blue armour soaks normal hits; the combo finisher or spin cracks it). Mini-bosses (`ai: boss`, `phases`): The Big Dust Bunny (chaser → charger → spitter + calls 2 dust bunnies), Big Gerry (charger → spitter → charger). Contact damage only lands mid-attack.
- Enterable mobiles are combat rooms: the door is barred until every enemy is down, and they stay cleared (`clear:<room>` flag). Fainting puts you back outside at the last checkpoint (enterable caravan doors and benches), and an uncleared room resets.
- Outdoor arenas (`content/world.json` → `arenas`): build.py finds an open rectangle in each listed zone with no canopy overhang. Posts close the ring until every wave is cleared (`arena:<id>`).
- Attention cues (`src/v6/entities.ts`, `src/v9/arena.ts`): bobbing glints on things you can use, a "!" over the one in range, bouncing and shining pickups, NPC speech bubbles (yellow means they have something for you), idle breathing, and warm door light plus chimney smoke on enterable caravans only. All of these are culled off-screen.
- Content was trimmed for v9 by `scripts/content/v9_cleanup.py` + `v9_rewrite.json` (one-off; already applied): no knock-door gags, whispers, filler notes or barks; dialogue is short and to the point.

## The content pipeline (data → generator → validated output)
Never edit generated files by hand. Edit `content/`, then run `npm run gen` (needs Python 3 + Pillow).

| edit | what it holds |
|---|---|
| `content/world.json` | seed, zones (rects, tier, enemy types, budgets for rooms/shells/coins/hiders/notes/whispers/walkers, decor density), barriers, tide, strings, minigame settings |
| `content/items.json` | items (kind: quest / ability / ammo / collectible / currency) and combine recipes |
| `content/npcs.json` | named NPCs: sprite, position or schedule (`[{when, at}]`), talk entries (first matching `when` wins; `choices`, `effects`, `moment`) |
| `content/story.json` | curated entities (pickups, chests, notes, vistas, interactables, activities, bosses), locks, world events, hints (3 tiers each), end condition |
| `content/rooms.json` | ASCII interior chambers, curated rooms (127, 131, clubhouse, cellar, shed, hut) and the procedural room pools / secret-chamber locks |
| `content/decor.json` | decoration rules, knock-on-the-door lines, ambient barks, pools of lore notes, walkie whispers, manhunt hiders, density "fill" items |
| `content/enemies.json` | enemy types, AI style, per-tier scaling, mini-bosses |

Conditions: `item` (have one), `item>=3`, `@flag`, `!x`, `a|b`; a list means AND. Effects: `give`/`take` (+`n`), `set`/`clear`, `say`, `maxhp`, `heal`, `hint`, `refill`, `end`.
Position refs: `door:<caravan>`, `caravan:<id>`, `lm:<landmark>`, `decor:<id>`, `[x, y]` (tile), with `zone`, `off`; indoors `{room, slot}`.

`npm run gen` = `scripts/gen/art.py` (atlases from the CC0 Ninja Adventure pack + drawn decor/items/interior tiles → `public/assets/v6/`)
then `scripts/gen/build.py`, which:
1. builds the walk grid from `map.json` (same colliders as the game), lays barriers (hedge line, roadworks, groyne) and locks;
2. resolves every position to a reachable, non-blocking tile; stacks chambers into screen-filling rooms (walls, doorways, exit mat, slots);
3. picks procedural interiors per zone, fills them (coins, shells, notes, hiders, enemies, secret chambers behind torch/dash locks), gives every other mobile a knock line;
4. spreads shells, coins, notes, whispers, hiders, outdoor enemies, decor and ambient walkers, then tops up until ≥95% of walkable tiles are within 12 tiles of something interesting;
5. **solves** the game (sphere search with the same condition DSL) and **fails** on: not completable, unreachable zones/rooms/content, hint gaps, too few hiders, coverage, unplaceable refs;
6. writes `public/world.json`, `public/rooms.json` (+ named snapshots per progression step) and `gen-report.md`.

`npm run validate` (`build.py --check`) regenerates in memory and also fails if committed outputs are stale. CI runs it on `mechanics` (`.github/workflows/validate.yml`).

## Testing / state-bouncing (preview)
- `?debug` adds the 🛠 panel: load a snapshot, teleport to a zone or room, give items, set/clear flags, god mode, hint, physics, fresh start,
  **copy a shareable state link**, plus the solver report and current state.
- URL params: `?snap=<name>` (see `gen-report.md`, e.g. `s05-evening`, `night`, `end-ready`, `everything`), `?state=<base64>`, `?give=coin:5,torch`,
  `?flag=evening,tide_out`, `?tp=z4 | 120,40 | room:cellar`, `?room=131`, `?at=x,y`, `?god`, `?hints` (objective line), `?physics`, `?fresh`, `?overview`, `?overview&ids`.
  URL-driven states use a scratch save, so they never overwrite a real playthrough.
- `window.tgTest` (tp / use / adv / choose / give / state) is what the Playwright critical-path run drives.

## How the world is built
The layout is traced from an aerial photo: a segmentation step produced `tara-glen-objects.json` (roads, fields, woodland,
courts, beach, clubhouse, and one entry per detected caravan, each with an id). Then:

- `python3 scripts/make-art.py <ninja-adventure tileset.png> [props-sheet.png]` builds `tiles.png`, caravan sheets, clubhouse,
  bike, sea overlays and `public/assets/props/*.png`.
- `python scripts/make-world.py <tara-glen-objects.json>` (legacy v5; needs `public/progression.json`, which is gone) wrote `public/assets/map.json`.
  The map layout and every collision footprint are unchanged since then; v7 only restyles the art on top of it.

### v7 house style (scripts/gen/tgstyle, rules in `scripts/gen/tgstyle/STYLE.md`)
Locked palette ramps, selective outline (darkest step of each material's own ramp), light from the top-left, shadows as
palette steps. Local only (numpy, scipy, scikit-image, pillow); outputs are committed and CI never runs these:
- `python3 scripts/gen/restyle.py [caravans|trees|repal|all]`: caravan-v4 source → `caravan-h.png` (80x60) / `caravan-v.png`
  (52x90), 3 palette variants each; tree-v4 → `trees.png` (48x45, 3 leaf variants; the old tree tiles in `tiles.png` are blanked,
  trunk tiles keep the collision and `world.ts` draws the sprites); everything else (props, decor, characters, monsters, items,
  gates, bike, clubhouse, sea overlays, tiles) is snapped to the palette + outline from the pre-restyle originals at commit `ORIG`.
  Frame sizes, overhang offsets and door positions go to `public/assets/art.json` (read by `world.ts` and `grid.py`).
- `python3 scripts/gen/ground.py [full.png]`: bakes the ground into 1024px palette PNG chunks in `public/assets/ground/` from
  `content/segmentation.json` + `map.json` + `public/world.json` (rich grass with tufts/flowers/meadow patches, woodland floor and
  tall-grass fringe, tarmac with kerbs and a dashed centre line, car-park bays, sand with wet edge and bank, sea bands, courts,
  door aprons, palette-step shadows under caravans/trees/props/decor/hedges). Run it after `build.py` (it reads decor positions).
- Caravan scale: the art overhangs the unchanged 72x48 / 48x80 footprints (roof above, a few px each side), bottom-aligned,
  so bodies, doors and the solver are untouched. Horizontal caravans with an odd `segId` are mirrored (same rule in `grid.py`
  `Grid.art` and `world.ts`); the knock door follows the door drawn on the sprite.
- `pieces` step: `playground-sheet.png`, `props-sheet.png`, `clubhouse.png` (AI sources) are cut into objects and stylised at prop size;
  `caravan-end.png` is the end-on caravan. `bins` / `flowerbush` decor are drawn by code (`house_decor`).
- Performance: trees are not game objects. `ground.py` bakes trunks into the ground chunks and canopies into a deduplicated
  tileset (`canopy.png` + `canopy.json`, drawn as one tilemap layer above the player); static scenery is culled to the camera;
  on phones where the world zoom in device px is even (zoom 4 on a 3x phone) the canvas renders at half resolution and CSS
  doubles it pixel-perfectly (`?fullres` turns that off).
- Order: `restyle.py` → `build.py` → `ground.py` (ground reads decor + door positions), then `build.py --check`.
- Interiors (`assets/v6/interior.png`) are not restyled yet.

`map.json` layers: tile layers `ground` (hidden; sea collision + sand lookup), `objects` (tree trunks, collide), `roofs` (canopies, drawn above
the player); object layers `courts`, `buildings` (clubhouse), `caravans`, `props`, `landmarks`, `markers` (spawn). Every caravan and landmark has a `segId` property = the
segmentation id, so places can be named by number later. Caravans use the placeholder sheets `caravan-h.png` / `caravan-v.png`
(3 colour variants each): swap those images to change every caravan.

## Credits (all CC0)
- Tiles + player: [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by Pixel-boy, via the
  [Superpowers asset packs](https://github.com/sparklinlabs/superpowers-asset-packs) (CC0, `licenses/superpowers-asset-packs-CC0-LICENSE.txt`,
  `licenses/ninja-adventure-CC0.txt`). The pack's art is palette-snapped by `restyle.py`; the baked ground is drawn by script.
- `scripts/gen/tgstyle/src/caravan-v4.png`, `tree-v4.png`: AI-generated sources made for this project (Scott's mock-up as the style reference),
  reduced to the house palette at game scale. `bin-*.png`: drawn by script in the art prototype.

- Code patterns (state machine, components, hurt/invulnerability, chests/inventory, door transitions) adapted from
  [Legend of the Wispguard](https://github.com/devshareacademy/phaser-zelda-like-tutorial) by Dev Share Academy (MIT, `licenses/wispguard-MIT.txt`).
- Libraries: [phaser4-rex-plugins](https://github.com/rexrainbow/phaser3-rex-notes) (MIT), [EasyStar.js](https://github.com/prettymuchbryce/easystarjs) (MIT).
- v6 characters (NPCs 1-25, dog) and monsters (dust bunny, slime, wasp, eye, crab) are Ninja Adventure sprites (CC0) repacked by `scripts/gen/art.py`;
  the gull, items, decor, interior tiles and fx are drawn by that script (CC0, like everything else here). Older indoor art: `scripts/make-mech-art.py`.

Layout traced from aerial imagery for a private, non-commercial joke game.
