# Tara Glen

A tiny SNES-style top-down adventure set in the caravan park next to Tara Glen Golf & Country Club, Co. Wexford
(Phaser 4 + TypeScript + Vite, hosted on GitHub Pages). A private joke game for friends.

You wake up in mobile 127. Mam's at the clubhouse quiz, manhunt has been going since lunch, there's moving dust in 131,
and by sundown the gulls have the Tara Glen flag out on the Rock.

## Controls (touch first)
- Move: touch-and-drag anywhere (floating joystick), or arrows / WASD.
- **A** (red, bottom centre): talk / look / open / play, whichever is nearest (Space / Enter).
- 💦 throw a water balloon (X / F) · 🛹 dash (Z / C) · 🚲 hop on/off the bike (B / Shift; not on sand).
- 🎒 bag: tap an item to read it, tap two to combine them · 📻 walkie hints (once fixed; ask again for bigger hints) · ☰ reset.
- Saved in localStorage (`tara-glen-save-v6`).

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
- `python scripts/make-world.py <tara-glen-objects.json>` (needs numpy, scipy, scikit-image, pillow) writes `public/assets/map.json`
  and bakes the ground (grass, smooth roads from the road skeleton, fields, courts, beach, sea, shadows) into 1024px chunks in
  `public/assets/ground/` (1 photo px = 2.5 world px, 16px tiles; 14 extra columns on the right for beach and sea).

`map.json` layers: tile layers `ground` (hidden; sea collision + sand lookup), `objects` (tree trunks, collide), `roofs` (canopies, drawn above
the player); object layers `courts`, `buildings` (clubhouse), `caravans`, `props`, `landmarks`, `markers` (spawn). Every caravan and landmark has a `segId` property = the
segmentation id, so places can be named by number later. Caravans use the placeholder sheets `caravan-h.png` / `caravan-v.png`
(3 colour variants each): swap those images to change every caravan.

## Credits (all CC0)
- Tiles + player: [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by Pixel-boy, via the
  [Superpowers asset packs](https://github.com/sparklinlabs/superpowers-asset-packs) (CC0, `licenses/superpowers-asset-packs-CC0-LICENSE.txt`,
  `licenses/ninja-adventure-CC0.txt`). Trees and grass texture come from it; the baked ground, caravans, clubhouse, bike, props and sea overlays are drawn by script.

- Code patterns (state machine, components, hurt/invulnerability, chests/inventory, door transitions) adapted from
  [Legend of the Wispguard](https://github.com/devshareacademy/phaser-zelda-like-tutorial) by Dev Share Academy (MIT, `licenses/wispguard-MIT.txt`).
- Libraries: [phaser4-rex-plugins](https://github.com/rexrainbow/phaser3-rex-notes) (MIT), [EasyStar.js](https://github.com/prettymuchbryce/easystarjs) (MIT).
- v6 characters (NPCs 1-25, dog) and monsters (dust bunny, slime, wasp, eye, crab) are Ninja Adventure sprites (CC0) repacked by `scripts/gen/art.py`;
  the gull, items, decor, interior tiles and fx are drawn by that script (CC0, like everything else here). Older indoor art: `scripts/make-mech-art.py`.

Layout traced from aerial imagery for a private, non-commercial joke game.
