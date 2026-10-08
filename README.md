# Tara Glen

A tiny SNES-style top-down walking game set in the caravan park next to Tara Glen Golf & Country Club, Co. Wexford
(Phaser 4 + TypeScript + Vite, hosted on GitHub Pages). A private joke game for friends.

- Move: arrow keys / WASD, or touch-and-drag anywhere on mobile (floating joystick).
- Bike: tap the 🚲 button (or press B / Shift) to hop on/off; about 2x walking speed. You can't ride on the beach sand (auto-dismount).
- Interact: walk onto a sparkling spot, then tap the **A** button (Enter / Space on desktop).
- URL params: `?overview` (whole map with landmark numbers, area tints, gate labels), `?overview&ids` (also caravan ids), `?at=x,y` (start at tile),
  `?debug` (physics bodies), `?unlock=all` (all gates open + bike), `?stage=N` (start as if N mini games are done).
- Progress is saved in localStorage (`tara-glen-save-v1`). Reset from the ☰ menu or the end screen.

## Progression (all in `public/progression.json`)
Four areas, each sealed by hedges/fences except at its gates (gates sit on roads; a closed gate is a fence across the road):

| Stage | Area | Mini game (spot) | Reward |
|---|---|---|---|
| 0 | 1: home caravan 210 + playground (#10) | Swing timing: tap at the top of the swing, 3 in a row | opens gate g1 |
| 1 | 2: central park, pitch #25 | Keepy-uppies: tap the ball, reach 10 | bike + opens gate g2 |
| 2 | 3: golf #31, crazy golf #38, clubhouse #34 | Putt: drag back from the ball, release, sink it in 3 | opens gate g3 (beach) |
| 3 | 4: beach #11/#19 | Scavenger hunt: 5 items in 60s | end screen |

Mini games are separate Phaser scenes (`src/minigames.ts`) that report win/lose; losing means tap to retry.
The HUD shows the objective, an edge arrow to the next spot, badges and the hidden gem counter (12 gems, 3 per area).
All strings, area rects, barrier lines, gates, spots, rewards and mini-game numbers live in `progression.json`. Edit it, then rerun
`make-world.py`: it re-bakes the barriers/gates and **validates** that each area is sealed at every stage (flood fill) and that every
spot, gem and hunt item is reachable. If `collectibles` or the hunt `items` are empty, it auto-places them.

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

Layout traced from aerial imagery for a private, non-commercial joke game.
