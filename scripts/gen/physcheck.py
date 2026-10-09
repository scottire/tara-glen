"""v11.1 runtime-equivalent seal check.

The tile solver works on whole 16px tiles with 4-way moves. The game does not: Arcade physics moves a 10x8 px body against
16px collision tiles, static zone bodies (buildings, caravans, props, decor) and the world bounds, so a tile the solver calls
'blocked' can still leave a walkable strip of a few pixels. This check rebuilds the runtime collision at 1px from the same
data the game loads (map.json layers, world.json barrierTiles / locks / decor) and floods the player's configuration space:
every top-left position where the body fits, 4-connected at 1px (continuous motion, so diagonal corner slips are covered).

For each k = 2..7 the gates into zones >= k are closed (gates into lower zones open). The body centre must never reach a tile
of zone >= k from the start. Writes the first leak per k (with a pixel path) and exits 1 on any leak.
Fast moves (walk 60-70 px/s, bike 165, dodge 210, skateboard dash 230) stay far under the ~16 px/frame needed to tunnel a
16px tile at the fixed 60 Hz physics step; that bound is asserted too (MAX_STEP)."""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
m = json.load(open(os.path.join(ROOT, 'public/assets/map.json')))
w = json.load(open(os.path.join(ROOT, 'public/world.json')))
L = {l['name']: l for l in m['layers']}
TW, TH = m['width'], m['height']; PW, PH = TW * 16, TH * 16
BODY_W, BODY_H, BODY_DX, BODY_DY = 10, 8, -5, 0  # world.ts/core.ts: setSize(10, 8).setOffset(7, 14), origin (0.5, 14/24) of a 24px frame
SPEEDS = {'walk': w['start']['walk'] * 1.15, 'bike': 165, 'dodge': w['player']['dodgeSpeed'], 'dash': w['player']['dashSpeed']}
MAX_STEP = max(SPEEDS.values()) / 60  # px per physics step
SOLID_PROPS = {'bench', 'picnic-table', 'bin', 'lamp', 'signpost', 'fence', 'hedge', 'car-red', 'car-blue', 'car-silver', 'windbreak', 'minigolf-hut'}
src = open(os.path.join(ROOT, 'src/v6/world.ts')).read()
import re
mm = re.search(r"const SOLID = new Set\(\[(.*?)\]\)", src, re.S)
if mm: SOLID_PROPS = set(re.findall(r"'([^']+)'", mm.group(1)))

solid = np.zeros((PH, PW), bool)
def rect(x, y, ww, hh):
    x0, y0 = max(0, int(np.floor(x))), max(0, int(np.floor(y))); x1, y1 = min(PW, int(np.ceil(x + ww))), min(PH, int(np.ceil(y + hh)))
    if x1 > x0 and y1 > y0: solid[y0:y1, x0:x1] = True
gdata, odata = L['ground']['data'], [0 if 1121 <= g <= 1125 else g for g in L['objects']['data']]
for i, g in enumerate(gdata):
    if g == 245: rect((i % TW) * 16, (i // TW) * 16, 16, 16)
for i, g in enumerate(odata):
    if g: rect((i % TW) * 16, (i // TW) * 16, 16, 16)
for x, y, _ in w['barrierTiles']: rect(x * 16, y * 16, 16, 16)
props = lambda o: {p['name']: p['value'] for p in o.get('properties', [])}
for o in L['buildings']['objects']:
    ins = props(o).get('inset', 0); rect(o['x'] + 4, o['y'] + ins, o['width'] - 8, o['height'] - ins - 3)
for o in L['caravans']['objects']:
    ins = 20 if props(o).get('orient') == 'v' else 14; rect(o['x'] + 2, o['y'] + ins, o['width'] - 4, o['height'] - ins - 2)
for o in L['props']['objects']:
    if o['name'] not in SOLID_PROPS: continue
    im = Image.open(os.path.join(ROOT, f"public/assets/props/{o['name']}.png")); iw, ih = im.size; dw = props(o).get('w', iw)
    bh = min(10, ih * 0.6); rect(o['x'] - dw / 2 + 1, o['y'] + ih / 2 - bh, dw - 2, bh)
for d in w['decor']:
    if d.get('solid'):
        dw = w['decorSizes'].get(d['sprite'], [16, 16])[0]; rect(d['x'] * 16 + 8 - dw / 2 + 2, d['y'] * 16 + 4, dw - 4, 11)
ZI = {z['id']: i + 1 for i, z in enumerate(w['zones'])}
Z = np.array([int(c) for c in w['zoneGrid']], np.int8).reshape(TH, TW)

# configuration space: body top-left (bx, by) is free iff the BODY_W x BODY_H window has no solid pixel (and is in bounds)
def free_space(sol):
    ii = np.pad(sol.astype(np.int32).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    s = ii[BODY_H:, BODY_W:] - ii[:-BODY_H, BODY_W:] - ii[BODY_H:, :-BODY_W] + ii[:-BODY_H, :-BODY_W]
    return s == 0  # shape (PH-BODY_H+1, PW-BODY_W+1): world bounds are implicit
# body-centre zone for every configuration
cy = (np.arange(PH - BODY_H + 1) + BODY_H // 2) // 16; cx = (np.arange(PW - BODY_W + 1) + BODY_W // 2) // 16
ZC = Z[np.minimum(cy, TH - 1)][:, np.minimum(cx, TW - 1)]
sx, sy = w['start']['out']; start = (int(sy + BODY_DY), int(sx + BODY_DX))
errs = []
if MAX_STEP >= 8: errs.append(f'speed {max(SPEEDS.values())} px/s moves {MAX_STEP:.1f} px per step: could tunnel thin walls')
locks = [l for l in w['locks'] if l.get('rect')]
for k in range(2, len(w['zones']) + 1):
    sol = solid.copy()
    for l in locks:
        to = ZI.get(l.get('to', ''), 2 if l['id'] == 'glen_brambles' else 99)
        if to >= k: rect(*l['rect'])
    fs = free_space(sol)
    lab, _ = ndimage.label(fs)
    c = lab[start]
    if not c: errs.append(f'k={k}: start {w["start"]["out"]} is inside a solid'); continue
    comp = lab == c
    bad = comp & (ZC >= k)
    if bad.any():
        ys, xs = np.nonzero(bad)
        # report the leak point nearest the start component's lower-zone side: the first bad config by distance from start
        d = (ys - start[0]) ** 2 + (xs - start[1]) ** 2; j = int(np.argmin(d))
        px, py = int(xs[j] - BODY_DX), int(ys[j] - BODY_DY)
        errs.append(f'k={k}: LEAK into zone {int(ZC[ys[j], xs[j]])} at px ({px},{py}) tile ({px // 16},{(py + 4) // 16}); {int(bad.sum())} body positions')
        # where the component crosses from a zone < k into zone >= k (body-centre tiles on both sides)
        lo = comp & (ZC < k)
        cr = (lo[:, :-1] & bad[:, 1:]) | (bad[:, :-1] & lo[:, 1:])
        cr2 = (lo[:-1, :] & bad[1:, :]) | (bad[:-1, :] & lo[1:, :])
        pts = set()
        for yy, xx in zip(*np.nonzero(cr)): pts.add((int(xx + BODY_W // 2) // 16, int(yy + BODY_H // 2) // 16))
        for yy, xx in zip(*np.nonzero(cr2)): pts.add((int(xx + BODY_W // 2) // 16, int(yy + BODY_H // 2) // 16))
        errs.append(f'    crossings at tiles {sorted(pts)[:40]}')
print('physcheck:', 'OK' if not errs else '\n  '.join(['FAIL'] + errs), f'(max {MAX_STEP:.1f} px/step)')
sys.exit(1 if errs else 0)
