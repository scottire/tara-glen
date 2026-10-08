# Tara Glen

A tiny SNES-style top-down walking game set in the caravan park next to Tara Glen Golf & Country Club, Co. Wexford
(Phaser 4 + TypeScript + Vite, hosted on GitHub Pages). A private joke game for friends.

- Move: arrow keys / WASD, or touch-and-drag anywhere on mobile (floating joystick).
- Bike: tap the 🚲 button (or press B / Shift) to hop on/off; about 2x walking speed. You can't ride on the beach sand (auto-dismount).
- URL params: `?overview` (whole map with landmark numbers), `?overview&ids` (also caravan ids), `?at=x,y` (start at tile), `?debug` (physics bodies).

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
