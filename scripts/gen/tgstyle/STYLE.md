# Tara Glen house style (target: Scott's mock, `ref/scott-native.png`)

**Native grid.** Scott's image is 1448x1086. FFT and phase fitting on edge energy give a pixel period of about 4.14 px horizontally and 4.26 px vertically, so the native size is about 350x255. We use **352x256** (22x16 tiles of 16px), downsampled with `refscale.py` (centre-weighted per-cell median). One art pixel is one game pixel: no sub-pixel detail, no smoothing, no scaled-down photo texture.

**Palette.** The palette is locked (`style.py`, 61 colours) and built as ramps, ordered dark to light, from k-means on Scott's native image plus a few top-end steps:
| ramp | use | steps |
|---|---|---|
| grass | ground | 153a2a 255b31 377535 4c9338 **5ca03a** 72af3e 9ccc4a |
| leaf | trees, hedges, bushes, green bins | 112a25 1b4b2d 2e6532 458636 6aa83c 9ccc4a |
| wood | decks, fence, bench, trunks, hair | 312028 4a2b29 6f3f30 8d5537 b47845 e2a55e |
| roof | shingles | 312028 5e352d 7d4833 a1643d cb8e52 |
| cream | caravan walls | a1643d cb8e52 f1c57f fae1a2 fff4d6 |
| stone | slabs, kerb, wall | 48464f 736f70 8e857c a4998d c9b8a1 e6dccb |
| tarmac | road | 16111d 383843 48464f 5c5a65 736f70 |
| blue / red / pink / skin / sand / sea / yellow / white | car, glass, laundry, people, beach, flowers | see style.py |

**Ramp rules.** Each object uses no more than 4 steps per material (`stylise.limit_ramp_steps`). There are no gradients and no dithering, except 1px grass speckle and tarmac aggregate.

**Outline.** Outlines are selective: every silhouette pixel is the darkest step of its own material's ramp, so wood is outlined 312028, foliage 112a25, stone 48464f and the car 1f2a4a. Never use pure black or one global outline colour. Internal lines are one or two steps darker than the material, never the outline colour.

**Light.** Light comes from the top-left. Each form (leaf puff, slab, plank, rail) gets its lightest step on the top-left edge and a darker step on the bottom-right. Shadows fall down and slightly right.

**Shadows.** Shadows are palette-locked: the ground under an object drops 1–2 steps along its own ramp (grass becomes a darker grass, slabs a darker stone). Never multiply into new colours. Big objects (caravans, trees) drop 2 steps; small props drop 1.

**Detail budget.** The smallest readable feature is 2px; single pixels are only for highlights, eyes and flower dots.
| object size | budget |
|---|---|
| ≤16px (bins, people) | 3–4 materials, 1 highlight, no texture |
| 16–48px (car, bench, washing line) | 4–5 materials, planks or panels as 2–3px bands |
| 48–128px (caravans, trees) | shingle courses every 3px, planks every 3px, leaf puffs about 6px |

**Ground.** Mid green with 1px speckle, soft light and dark patches, and plenty of dark V tufts with a lit tip. Flowers are single pixels with a darker stem pixel. Paths are 9px square slabs; the pavement uses 16x11 slabs with a kerb line. The road is dark grey-purple with aggregate speckle and cream 12x2 dashes.

**Do:** use chunky readable silhouettes, round leaf puffs, 1px light rims, consistent 3px plank and shingle rhythm, and warm materials against vivid greens.
**Don't:** use photo texture, JPEG mush, pure black, antialiased edges, colours outside the palette, 1px noise inside forms, cartoon flat fills without a ramp, or mixed pixel sizes.

**Pipeline.**
- AI or painted sources go through `stylise.stylise()`: snap to the native grid (with mean-shift flattening), k-means in Lab, snap to the allowed ramps, cap steps per ramp, remove orphan pixels, then apply the selective outline.
- Code-drawn sprites use the same ramps directly (`props4.py`).
- The ground uses only palette colours (`ground4.py`).
