"""Game sprites in the house style. Every sprite ends as an index map over the locked palette, outlined per STYLE.md."""
import os, numpy as np
from PIL import Image, ImageEnhance
from . import stylise as S, style
from .keying import key, hstraighten
HERE = os.path.dirname(os.path.abspath(__file__))
def src(n): return key(os.path.join(HERE, 'src', n + '.png'))
def C(r, i): return style.rgb(style.RAMPS[r][i]) + (255,)
def I(r, i): return S.RAMP_IDX[r][i]

def enh(img, sat=1.0, con=1.0, bri=1.0):
    al = img.convert('RGBA').split()[-1]
    x = ImageEnhance.Brightness(ImageEnhance.Contrast(ImageEnhance.Color(img.convert('RGB')).enhance(sat)).enhance(con)).enhance(bri).convert('RGBA'); x.putalpha(al); return x

def to_idx(im):
    a = np.array(im.convert('RGBA')); lut = {tuple(c): i for i, c in enumerate(S.PAL.tolist())}; idx = np.full(a.shape[:2], -1, int)
    op = a[..., 3] > 127
    for y, x in zip(*np.where(op)): idx[y, x] = lut.get(tuple(a[y, x, :3]), -1)
    return idx

def swap_steps(idx, pairs, mask=None):
    """explicit palette swap [(from_ramp, step, to_ramp, step), ...] limited to `mask` (ramps share some colours, so
    swaps are always regional: roof rows, wall rows)"""
    out = idx.copy(); m = np.ones(idx.shape, bool) if mask is None else mask
    for a, i, b, j in pairs: out[m & (idx == I(a, i))] = I(b, j)
    return out

# ---------------- caravans ----------------
def caravan_h(w=80):
    """v4 caravan (side-on, door right of centre) snapped to the palette at game scale"""
    a = S.snap_grid(enh(src('caravan-v4'), 1.1, 1.05), w, denoise=False)
    idx = S.to_palette(a, 16, ['roof', 'wood', 'cream', 'glass', 'white', 'stone']); idx = S.limit_ramp_steps(idx, 4); idx = S.cleanup(idx, 1)
    return S.outline(idx)

WALLS = [None, [('cream', 2, 'stone', 4), ('cream', 3, 'stone', 5), ('cream', 4, 'white', 1)],
         [('cream', 2, 'sand', 1), ('cream', 3, 'sand', 2), ('cream', 4, 'sand', 3)]]
def _roof(t): return [('roof', 1, t, 1), ('roof', 2, t, 2), ('roof', 3, t, 3), ('roof', 4, t, 4),
                     ('wood', 1, t, 1), ('wood', 2, t, 2), ('wood', 3, t, 3), ('wood', 4, t, 4), ('wood', 5, t, 4)]
ROOFS = [None, _roof('tarmac'), _roof('leaf')]
def variant(base, k, roof_rows):
    H, W = base.shape; rm = np.zeros((H, W), bool); rm[:roof_rows] = True; out = base
    if ROOFS[k]: out = swap_steps(out, ROOFS[k], rm)
    if WALLS[k]: out = swap_steps(out, WALLS[k], ~rm)
    return out

def caravan_v(fw=52, fh=90):
    """end-on mobile (long axis north-south) drawn to the guide: long shingle roof (ridge down the middle, left plane lit),
    gable end facing the camera with a centred door, two small windows, deck step. Door at the bottom centre."""
    im = Image.new('RGBA', (fw, fh), (0, 0, 0, 0)); p = im.load()
    ox = (fw - 48) // 2; wall_h = 24; roof_top = 6; roof_bot = fh - wall_h - 6
    def put(x, y, c):
        if 0 <= x < fw and 0 <= y < fh: p[x, y] = c
    for y in range(roof_top, roof_bot + 1):                     # roof: two planes, courses run along the ridge (vertical)
        for x in range(ox, ox + 48):
            lit = x < ox + 24; step = 3 if lit else 2
            if (x - ox) % 4 == 3: step -= 1                       # course lines
            if (y + (x - ox) // 4 * 3) % 7 == 0: step -= 1        # staggered shingle joints
            put(x, y, C('roof', max(1, step)))
        put(ox + 23, y, C('roof', 4)); put(ox + 24, y, C('roof', 1))
    for x in range(ox, ox + 48): put(x, roof_top, C('roof', 4)); put(x, roof_bot, C('roof', 1)); put(x, roof_bot + 1, C('roof', 1))
    for y in range(roof_top + 10, roof_top + 20):                # skylight on the lit plane
        for x in range(ox + 8, ox + 17): put(x, y, C('glass', 2) if (x, y) != (ox + 8, roof_top + 10) else C('glass', 3))
    for x in range(ox + 8, ox + 17): put(x, roof_top + 20, C('roof', 1))
    for y in range(roof_top + 10, roof_top + 21): put(ox + 17, y, C('roof', 1))
    for y in range(roof_top + 30, roof_top + 38):                # flue pipe on the shaded plane
        put(ox + 33, y, C('stone', 4)); put(ox + 34, y, C('stone', 2)); put(ox + 32, y, C('stone', 0)); put(ox + 35, y, C('stone', 0))
    for x in range(ox + 32, ox + 36): put(x, roof_top + 29, C('stone', 0)); put(x + 1, roof_top + 38, C('roof', 1))
    gy0 = roof_bot + 2                                           # gable end wall
    for y in range(gy0, fh - 6):
        for x in range(ox + 2, ox + 46):
            put(x, y, C('cream', 3))
    for y in range(gy0, gy0 + 3):                                # gable triangle shading under the eaves
        for x in range(ox + 2, ox + 46): put(x, y, C('cream', 2))
    for x in range(ox + 2, ox + 46): put(x, gy0 + 9, C('cream', 1)); put(x, gy0 + 10, C('wood', 3))   # timber band
    dx0 = ox + 19                                                # door (centred, 10 wide)
    for y in range(gy0 + 5, fh - 6):
        for x in range(dx0, dx0 + 10): put(x, y, C('wood', 2))
        put(dx0, y, C('wood', 1)); put(dx0 + 9, y, C('wood', 1))
    for x in range(dx0, dx0 + 10): put(x, gy0 + 5, C('wood', 1))
    put(dx0 + 7, gy0 + 12, C('yellow', 2))
    for wx in (ox + 6, ox + 33):                                 # windows: cream frame, pale glass, glint
        for y in range(gy0 + 4, gy0 + 13):
            for x in range(wx, wx + 9):
                edge = y in (gy0 + 4, gy0 + 12) or x in (wx, wx + 8)
                put(x, y, C('white', 1) if edge else C('glass', 2 if y < gy0 + 11 else 1))
        put(wx + 2, gy0 + 6, C('glass', 3)); put(wx + 3, gy0 + 7, C('glass', 3))
    for y in range(fh - 6, fh):                                  # deck + step in front of the door
        for x in range(ox + 6, ox + 42):
            st = 4 if y == fh - 6 else (3 if (y - fh) % 2 else 2)
            put(x, y, C('wood', st))
    for x in range(dx0 - 2, dx0 + 12): put(x, fh - 3, C('wood', 5))
    idx = to_idx(im); return S.outline(idx)

def caravan_sheets(out_dir):
    """writes caravan-h.png / caravan-v.png (3 palette variants side by side) and returns frame + door metadata (restyle.py writes it to art.json)"""
    import json
    h = caravan_h(); v = caravan_v()
    meta = {}
    for name, base, foot in (('h', h, (72, 48)), ('v', v, (48, 80))):
        fh, fw = base.shape; sheet = Image.new('RGBA', (fw * 3, fh))
        for k in range(3): sheet.paste(S.render(variant(base, k, ROOF_ROWS[name](fh))), (k * fw, 0))
        sheet.save(os.path.join(out_dir, f'caravan-{name}.png'))
        meta[name] = {'fw': fw, 'fh': fh, 'ox': (fw - foot[0]) // 2, 'oy': fh - foot[1], 'doorFx': DOOR_FX[name]}
    return meta
ROOF_ROWS = {'h': lambda fh: int(fh * 0.4), 'v': lambda fh: fh - 30}
DOOR_FX = {'h': 0.72, 'v': 0.5}   # door centre as a fraction of the sprite width (unflipped); measured on the sheet

# ---------------- generic restyle for existing native-size sprites ----------------
def _lab(rgb):
    from skimage.color import rgb2lab
    return rgb2lab((np.asarray(rgb, np.float32) / 255.0).reshape(-1, 1, 3)).reshape(-1, 3)
_PL = None
def repal(im, sat=1.0, bri=1.0, do_outline=True, ramps=None):
    """nearest locked-palette colour in Lab (optionally restricted to `ramps`), then the selective outline.
    For sprites that are already clean pixel art at game size (props, decor, NA characters, tiles)."""
    global _PL
    if _PL is None: _PL = _lab(S.PAL)
    im = enh(im.convert('RGBA'), sat, 1.0, bri); a = np.array(im); op = a[..., 3] > 127; idx = np.full(a.shape[:2], -1, int)
    allowed = np.arange(len(S.PAL)) if not ramps else np.array(sorted({i for r in ramps for i in S.RAMP_IDX[r]}))
    px = a[op, :3]; uniq, inv = np.unique(px, axis=0, return_inverse=True)
    d = ((_lab(uniq)[:, None, :] - _PL[allowed][None]) ** 2).sum(-1); idx[op] = allowed[d.argmin(1)][inv.ravel()]
    return S.render(S.outline(idx) if do_outline else idx)

# ---------------- trees ----------------
def tree(w=48, squash=0.84):
    """tree-v4 at game scale with the bold top-left light / lower-right shade split (STYLE.md)"""
    s = enh(src('tree-v4'), 1.15, 1.18)
    a = S.snap_grid(s, w, round(w * s.height / s.width * squash), denoise=False); idx = S.to_palette(a, 10, ['leaf', 'wood']); idx = S.limit_ramp_steps(idx, 5); idx = S.cleanup(idx, 1)
    L = S.RAMP_IDX['leaf']; leaf = np.isin(idx, L); ys, xs = np.where(leaf); cy, cx = ys.mean(), xs.mean(); ry, rx = ys.std() * 2, xs.std() * 2
    for y, x in zip(ys, xs):
        d = (x - cx) / rx + (y - cy) / ry; st = L.index(idx[y, x])
        if d > 0.45 and 1 < st < 5: idx[y, x] = L[st - 1]
        elif d < -0.55 and 1 < st < 4: idx[y, x] = L[st + 1]
    return S.outline(idx)

def tree_sheet(out_dir, w=48):
    """3 variants side by side: mid green, deep green, light/yellow-green (palette steps along the leaf ramp)"""
    import json
    base = tree(w); H, W = base.shape; L = S.RAMP_IDX['leaf']; n = len(L); vs = [base]
    for sh in (-1, 1):
        v = base.copy()
        for i in range(1, n): v[base == L[i]] = L[min(n - 1, max(1, i + sh))]
        vs.append(v)
    sheet = np.concatenate(vs, 1); S.render(sheet).save(os.path.join(out_dir, 'trees.png'))
    return {'fw': W, 'fh': H}
