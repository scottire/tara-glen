# Tara Glen

A tiny SNES-style top-down walking demo (Phaser 4 + TypeScript + Vite), hosted on GitHub Pages.

- Move: arrow keys / WASD, or touch-and-drag anywhere on mobile (floating joystick).
- Map: `public/assets/map.json` is a Tiled-format map (layers `ground` and `objects`; anything on `objects` and water tiles collide).
  Regenerate the placeholder with `python3 scripts/make-assets.py <kenney tilemap_packed.png>`, or replace it with a real Tiled map.
- Dev: `npm install && npm run dev`. Build: `npm run build`.

## Art credits (all CC0)
- Tiles: [Kenney Tiny Town](https://kenney.nl/assets/tiny-town) – see `licenses/kenney-tiny-town-License.txt`. Two water tiles were added by script.
- Player: "ninja_blue" from [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by Pixel-boy – see `licenses/ninja-adventure-CC0.txt`.
