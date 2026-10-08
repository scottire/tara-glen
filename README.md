# Tara Glen

A tiny SNES-style top-down walking demo of Tara Glen / Kiltennel near Courtown, Co. Wexford (Phaser 4 + TypeScript + Vite), hosted on GitHub Pages.

- Move: arrow keys / WASD, or touch-and-drag anywhere on mobile (floating joystick).
- Map: `public/assets/map.json` is a Tiled-format map (tile layers `ground`, `objects`, `roofs`, object layer `markers` for spawn + signs).
  Anything on `objects` and water tiles collide; `roofs` is drawn above the player.
  It's generated from OpenStreetMap data (`scripts/osm/raw.json`, fetched via Overpass) with
  `python3 scripts/make-map.py <kenney tilemap_packed.png> [preview.png]` (~12 m per tile, 118x93 tiles). It can be opened and hand-edited in Tiled.
- `?overview` in the URL shows the whole map zoomed out.

## Map data
Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL): https://www.openstreetmap.org/copyright
- Dev: `npm install && npm run dev`. Build: `npm run build`.

## Art credits (all CC0)
- Tiles: [Kenney Tiny Town](https://kenney.nl/assets/tiny-town) – see `licenses/kenney-tiny-town-License.txt`. Two water tiles were added by script.
- Player: "ninja_blue" from [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by Pixel-boy – see `licenses/ninja-adventure-CC0.txt`.
