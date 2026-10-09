"""Bake the outdoor ground in the house style (scripts/gen/tgstyle/STYLE.md) into public/assets/ground/g_<cx>_<cy>.png.
Inputs: content/segmentation.json (aerial segmentation; same masks and maths as scripts/make-world.py, so collisions in
map.json line up), public/assets/map.json (caravans, props, courts, clubhouse, tree tiles), public/world.json (barriers, decor).
Every pixel is a palette colour; shadows and contact trims step down along the material's own ramp.
Usage (local; needs numpy, scipy, scikit-image, pillow): python3 scripts/gen/ground.py"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage.morphology import skeletonize, remove_small_objects, disk
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tgstyle import style
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(ROOT)
objs = json.load(open('content/segmentation.json'))['objects']; by = {o['id']: o for o in objs}
cls = lambda c: [o for o in objs if o['cls'] == c]
MAP = json.load(open('public/assets/map.json')); WJ = json.load(open('public/world.json'))
LY = {l['name']: l for l in MAP['layers']}
PW, PH, S = 1206, 1251, 2.5
K = 16 / S; W0, H = math.ceil(PW / K), math.ceil(PH / K); EXT = 14; W = W0 + EXT
assert (W, H) == (MAP['width'], MAP['height'])
WX, HY = W * 16, H * 16; R = 18
yy, xx = np.mgrid[0:HY, 0:WX]
rng = np.random.default_rng(7)

# ---------------- masks (identical maths to make-world.py) ----------------
def poly_mask(polys, scale=S, size=(WX, HY)):
    im = Image.new('L', size, 0); d = ImageDraw.Draw(im)
    for p in polys: d.polygon([(q[0] * scale, q[1] * scale) for q in p], fill=255)
    return np.array(im) > 0
def smooth(m, sigma): return ndi.gaussian_filter(m.astype(np.float32), sigma) > 0.5
rings = []
for o in cls('roundabout/cul-de-sac'):
    ro = math.sqrt(o['area_px'] / math.pi) * S; cx, cy = o['centroid'][0] * S, o['centroid'][1] * S; rings.append((o['id'], cx, cy, max(ro, 2.6 * R)))
pm = poly_mask([o['polygon'] for o in cls('road')], 1, (PW, PH)); pm = ndi.binary_closing(pm, disk(3)); pm = remove_small_objects(pm, max_size=120)
for _, cx, cy, ro in rings:
    pyy, pxx = np.mgrid[0:PH, 0:PW]; pm &= (pxx - cx / S) ** 2 + (pyy - cy / S) ** 2 > (ro / S - 2) ** 2
sk = skeletonize(pm)
for _ in range(5):
    nb = ndi.convolve(sk.astype(np.uint8), np.ones((3, 3), np.uint8), mode='constant') - sk; sk &= ~((nb == 1) & sk)
ys, xs = np.nonzero(sk)
seed = np.zeros((HY, WX), bool); seed[np.clip((ys * S).astype(int), 0, HY - 1), np.clip((xs * S).astype(int), 0, WX - 1)] = True
dist = ndi.distance_transform_edt(~seed); road = dist <= R
centre = np.zeros((HY, WX), bool)
for _, cx, cy, ro in rings:
    dd = np.hypot(xx - cx, yy - cy); road |= np.abs(dd - (ro - R)) <= R
club = next(o for o in LY['buildings']['objects'] if o['name'] == 'clubhouse'); cbx, cby, CBW, CBH = club['x'], club['y'], club['width'], club['height']
park = (cbx - 8, cby + CBH + 10, cbx + CBW + 8, cby + CBH + 74); pcx, pcy = (park[0] + park[2]) // 2, (park[1] + park[3]) // 2
ry, rx = np.nonzero(road[::4, ::4]); k = np.argmin((rx * 4 - pcx) ** 2 + (ry * 4 - pcy) ** 2); tx, ty = rx[k] * 4, ry[k] * 4
conn = Image.new('L', (WX, HY), 0); cd = ImageDraw.Draw(conn); cd.line([(pcx, park[1] + 8), (tx, ty)], fill=255, width=2 * R); cd.rectangle(park, fill=255)
road |= np.array(conn) > 0; road = smooth(road, 3.5); road[:, W0 * 16 - 8:] = False
dist_edge = ndi.distance_transform_edt(road)
sand = smooth(poly_mask([o['polygon'] for o in cls('beach/coast')]), 6)
band = xx >= W0 * 16 - 160; sand |= np.maximum.accumulate(sand & band, axis=1) & band         # beach runs unbroken to the sea (no grass spits between beach polygons)
def shore(y): return (W0 + 5) * 16 + 6 * np.sin(2 * np.pi * y / 256) + 3 * np.sin(2 * np.pi * y / 128)
sand |= xx >= W0 * 16 - 10 + 10 * np.sin(yy / 71.0); sea = xx > shore(yy); sand &= ~sea; sand &= ~road
wood = smooth(poly_mask([o['polygon'] for o in cls('trees/woodland')]), 4)
golf = smooth(poly_mask([by[31]['polygon']]), 5); pitch = smooth(poly_mask([by[25]['polygon']]), 3); mini = smooth(poly_mask([by[38]['polygon']]), 3)
dirt = smooth(poly_mask([o['polygon'] for o in cls('other') if o['id'] != 38]), 5)
print("masks done", flush=True)

# ---------------- palette helpers ----------------
RAMP = {k: np.array([style.rgb(h) for h in v], np.uint8) for k, v in style.RAMPS.items()}
img = np.zeros((HY, WX, 3), np.uint8)
def paint(mask, ramp, step): img[mask] = RAMP[ramp][step]
def h2(x, y, s):  # vectorised integer hash -> [0,1)
    n = (x.astype(np.uint32) * np.uint32(374761393) + y.astype(np.uint32) * np.uint32(668265263) + np.uint32(s * 1442695041 & 0xFFFFFFFF))
    n = (n ^ (n >> np.uint32(13))) * np.uint32(1274126177); return ((n ^ (n >> np.uint32(16))) & np.uint32(0xFFFF)).astype(np.float32) / 65536
def vnoise(scale, s):
    gx, gy = WX // scale + 2, HY // scale + 2; gyy, gxx = np.mgrid[0:gy, 0:gx]; g = h2(gxx, gyy, s)
    return np.array(Image.fromarray(g).resize((gx * scale, gy * scale), Image.BICUBIC))[:HY, :WX]
def fbm(scale, s): return (vnoise(scale, s) * 0.6 + vnoise(scale // 2, s + 1) * 0.3 + vnoise(max(2, scale // 4), s + 2) * 0.1)
def near(m, d):
    return ndi.binary_dilation(m, iterations=d) & ~m

# ---------------- grass: steps + ramp selector ----------------
n1 = fbm(80, 1); n2 = fbm(56, 3); hsh = rng.random((HY, WX), dtype=np.float32)
gs = np.full((HY, WX), 5, np.int8); gs[n1 > 0.66] = 6; gs[n1 < 0.34] = 4                    # 3 calm value steps (mock: subtle patches)
meadow = (fbm(36, 3) > 0.70) & (gs >= 4)
gs[(hsh < 0.03) & (gs > 1)] -= 1; gs[(hsh > 0.975) & (gs < 6)] += 1
gs[wood] = np.maximum(1, gs[wood] - 1)                                              # forest floor
stripes = ((xx + yy) // 28) % 2 == 0
mv = fbm(64, 41) > 0.5                                                                     # mowing stripes drift in tone
gs[golf] = np.where(stripes[golf], np.where(mv[golf], 5, 4), np.where(mv[golf], 4, 3)); meadow[golf] = False   # mown fairway
pst = ((xx // 22) % 2 == 0); gs[pitch] = np.where(pst[pitch], 5, 4); meadow[pitch] = False
gs[pitch & ~pst & (hsh < 0.05)] = 3; gs[pitch & pst & (hsh < 0.05)] = 6                    # mower grain
TUFTS = [[(0, -1, -2), (0, 0, -2), (0, 1, -2), (-1, -1, -2), (-1, 1, -2), (-1, 0, -1), (-2, -2, -1), (-2, 2, -1), (-3, -2, 1), (-3, 2, 1), (-2, 0, 0), (-3, 0, 2)],
         [(0, -2, -2), (0, -1, -2), (0, 0, -2), (0, 1, -2), (0, 2, -2), (-1, -2, -1), (-1, 0, -2), (-1, 2, -1), (-2, -2, 0), (-2, 0, -1), (-2, 2, 0), (-3, -1, 1), (-3, 0, 0), (-3, 1, 1), (-4, 0, 2)],
         [(0, 0, -2), (0, 1, -2), (-1, 0, -1), (-1, 1, -1), (-2, 0, 1), (-2, 1, 0)],
         [(0, -1, -1), (0, 0, -2), (0, 1, -1), (-1, -1, 0), (-1, 1, 0), (-2, -1, 1), (-2, 1, 2), (-1, 0, -1)]]
mown = golf | pitch | mini
dens = fbm(44, 9)
NT = WX * HY // 30
ty_ = rng.integers(5, HY - 1, NT); tx_ = rng.integers(3, WX - 3, NT)
keep = (rng.random(NT) < 0.35 + dens[ty_, tx_]) & ~mown[ty_, tx_]; ty_, tx_ = ty_[keep], tx_[keep]
kind = rng.choice(4, len(ty_), p=[1 / 3, 1 / 6, 1 / 4, 1 / 4]); base = gs[ty_, tx_].copy()
for k_, t in enumerate(TUFTS):
    sel = kind == k_
    for dy, dx, d in t: gs[ty_[sel] + dy, tx_[sel] + dx] = np.clip(base[sel] + d, 1, 6)
# paint grass / meadow
for s_ in range(7): img[(gs == s_) & ~meadow] = RAMP['grass'][s_]
MM = {0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 3}
for s_, j in MM.items(): img[(gs == s_) & meadow] = RAMP['meadow'][j]
# tall grass: a band around the woodland edges (blades in the leaf ramp, lit tips)
tall = near(wood, 14) & ~near(wood, 3) & (fbm(30, 21) > 0.45) & ~mown
tall = ndi.binary_opening(tall, iterations=2)
paint(tall, 'leaf', 2)
bl = tall & ((xx + (yy // 4) * 2) % 4 == 0) & (yy % 4 != 3); paint(bl, 'leaf', 3)
tip = tall & ((xx + (yy // 4) * 2) % 4 == 0) & (yy % 4 == 0); paint(tip, 'leaf', 4)
paint(tall & ~ndi.binary_erosion(tall) & np.roll(~tall, -1, 0), 'leaf', 1)
paint(tall & ~ndi.binary_erosion(tall) & np.roll(~tall, 1, 0), 'leaf', 4)
print('grass done', flush=True)

# ---------------- minigolf, yards ----------------
paint(mini, 'meadow', 2); paint(mini & (((xx // 4) + (yy // 4)) % 2 == 0), 'meadow', 3)
paint(mini & ~ndi.binary_erosion(mini, iterations=3), 'wood', 3); paint(mini & ~ndi.binary_erosion(mini, iterations=1), 'wood', 0)
gn = hsh
paint(dirt, 'stone', 3); paint(dirt & (gn > 0.8), 'stone', 2); paint(dirt & (gn < 0.12), 'stone', 4); paint(dirt & (gn < 0.02), 'stone', 5)
paint(dirt & ~ndi.binary_erosion(dirt, iterations=1), 'stone', 1)
# ---------------- pitch lines ----------------
pe = pitch & ~ndi.binary_erosion(pitch, iterations=10); pl = pe & ndi.binary_erosion(pitch, iterations=8); paint(pl, 'white', 1)
pc = by[25]['centroid']; pcx_, pcy_ = pc[0] * S, pc[1] * S; paint(pitch & (np.abs(np.hypot(xx - pcx_, yy - pcy_) - 46) < 1.2), 'white', 1)
# ---------------- beach, dune bank, sea ----------------
sx = shore(yy); dsea = xx - sx
paint(sand, 'sand', 2); paint(sand & (hsh < 0.10), 'sand', 1); paint(sand & (hsh > 0.93), 'sand', 3)
paint(sand & (dsea > -18), 'sand', 1); paint(sand & (dsea > -6), 'sea', 1)                 # wet sand + waterline
grass_any = ~sand & ~sea & ~road
bank = sand & ndi.binary_dilation(grass_any, iterations=4)                                    # earth bank face on the sand side
bd = ndi.distance_transform_edt(~grass_any)
paint(bank & (bd <= 1.5), 'wood', 4); paint(bank & (bd > 1.5) & (bd <= 3), 'wood', 3); paint(bank & (bd > 3), 'wood', 2)
paint(grass_any & near(sand, 1) & ~road, 'leaf', 1)                                          # dark grass lip
paint(sea, 'sea', 1); paint(sea & (dsea < 40), 'sea', 2); paint(sea & (dsea < 14), 'sea', 3)
paint(sea & (dsea >= 40) & (fbm(24, 7) > 0.66), 'sea', 2)
# pebbles + sprigs on the sand
NP = int(sand.sum() / 260); py_ = rng.integers(3, HY - 3, NP); px_ = rng.integers(3, WX - 4, NP); ok = sand[py_, px_] & ~bank[py_, px_] & (dsea[py_, px_] < -20)
py_, px_ = py_[ok], px_[ok]; half = len(py_) // 2
img[py_[:half], px_[:half]] = RAMP['stone'][4]; img[py_[:half], px_[:half] + 1] = RAMP['stone'][3]; img[py_[:half] + 1, px_[:half]] = RAMP['stone'][1]; img[py_[:half] + 1, px_[:half] + 1] = RAMP['stone'][1]
q, w_ = py_[half:], px_[half:]
for dy, dx, c in ((0, -1, 2), (0, 0, 2), (0, 1, 2), (-1, -1, 4), (-1, 1, 4), (-2, 0, 5)): img[q + dy, w_ + dx] = RAMP['grass'][c]
# ---------------- roads ----------------
tg = hsh
paint(road, 'tarmac', 2); paint(road & (tg < 0.22), 'tarmac', 3); paint(road & (tg > 0.95), 'tarmac', 4); paint(road & (tg > 0.86) & (tg < 0.9), 'tarmac', 1)
paint(road & (dist_edge <= 3.2), 'stone', 4); paint(road & (dist_edge <= 1.2), 'stone', 2)
paint(road & (dist_edge > 3.2) & (dist_edge <= 4.2), 'tarmac', 1)
kj = road & (dist_edge <= 3.2) & (((xx + yy) % 16) == 0); paint(kj, 'stone', 2)            # kerb stone joints
inpark = (xx >= park[0] - 8) & (xx <= park[2] + 8) & (yy >= park[1] - 8) & (yy <= park[3] + 8)
wide = ndi.maximum_filter(dist_edge, size=25) >= 15
pave = road & wide & (dist_edge <= 8) & ~inpark                                              # slab pavement both sides (mock)
paint(pave, 'stone', 4); paint(pave & ((xx % 8 == 0) | (yy % 8 == 0)), 'stone', 3); paint(pave & ((xx % 8 == 1) & (yy % 8 == 1)), 'stone', 5)
paint(pave & (dist_edge <= 1.2), 'stone', 2)
paint(road & wide & ~inpark & (dist_edge > 8) & (dist_edge <= 9.5), 'stone', 2)                 # kerb face
paint(road & wide & ~inpark & (dist_edge > 9.5) & (dist_edge <= 10.5), 'tarmac', 1)            # gutter shadow
rsk = skeletonize(road & (dist_edge > 12))                                                   # one clean centre line on the full-res road
for _ in range(30):                                                                           # prune spurs
    nb = ndi.convolve(rsk.astype(np.uint8), np.ones((3, 3), np.uint8), mode='constant') - rsk; rsk &= ~((nb <= 1) & rsk)
nb = ndi.convolve(rsk.astype(np.uint8), np.ones((3, 3), np.uint8), mode='constant') - rsk
junc = ndi.binary_dilation(rsk & (nb >= 3), iterations=26)
cl = rsk & ~junc & ((((xx // 9) + (yy // 9)) % 2) == 0)                                       # dashed centre line
for _, cx, cy, ro in rings: cl &= np.abs(np.hypot(xx - cx, yy - cy) - (ro - R)) > R + 2
cl &= ~((xx >= park[0]) & (xx <= park[2]) & (yy >= park[1]) & (yy <= park[3]))
cl = remove_small_objects(cl, max_size=3); paint(ndi.binary_dilation(cl, iterations=1) & road & (dist_edge > 8), 'stone', 5)
for k_ in range(6):
    x = park[0] + 10 + k_ * 40; img[park[1] + 8:park[3] - 8, x:x + 2] = RAMP['white'][1]
# ---------------- courts ----------------
for c in LY['courts']['objects']:
    x0, y0, x1, y1 = int(c['x']), int(c['y']), int(c['x'] + c['width']), int(c['y'] + c['height'])
    if c['name'] == 'playground':
        img[y0:y1, x0:x1] = RAMP['stone'][3]; img[y0 + 1:y1 - 1, x0 + 1:x1 - 1] = RAMP['stone'][4]
        sub = img[y0 + 4:y1 - 4, x0 + 4:x1 - 4]; hh = hsh[y0 + 4:y1 - 4, x0 + 4:x1 - 4]
        sub[:] = RAMP['red'][2]; sub[hh < 0.06] = RAMP['red'][1]
        img[y0, x0:x1] = RAMP['stone'][0]; img[y1 - 1, x0:x1] = RAMP['stone'][0]; img[y0:y1, x0] = RAMP['stone'][0]; img[y0:y1, x1 - 1] = RAMP['stone'][0]
        continue
    img[y0:y1, x0:x1] = RAMP['leaf'][2]; surf = 'blue' if c['name'] == 'tennis' else 'red'
    img[y0 + 6:y1 - 6, x0 + 6:x1 - 6] = RAMP[surf][2]; Lc = RAMP['white'][1]; m = 16
    img[y0 + m:y0 + m + 2, x0 + m:x1 - m] = Lc; img[y1 - m - 2:y1 - m, x0 + m:x1 - m] = Lc
    img[y0 + m:y1 - m, x0 + m:x0 + m + 2] = Lc; img[y0 + m:y1 - m, x1 - m - 2:x1 - m] = Lc
    cxm, cym = (x0 + x1) // 2, (y0 + y1) // 2
    if c['name'] == 'tennis':
        img[y0 + m:y1 - m, x0 + m + 16:x0 + m + 17] = Lc; img[y0 + m:y1 - m, x1 - m - 17:x1 - m - 16] = Lc
        for yl in (cym - 60, cym + 60): img[yl:yl + 2, x0 + m + 16:x1 - m - 16] = Lc
        img[cym - 60:cym + 60, cxm:cxm + 2] = Lc
# ---------------- caravan aprons (slabs at each front door) ----------------
apr = np.zeros((HY, WX), bool)
for d in WJ['doors'] if 'doors' in WJ else []: pass
CAR = json.load(open('public/assets/art.json'))
sys.path.insert(0, os.path.join(ROOT, 'scripts/gen')); from grid import Grid
GR = Grid()
for c in GR.caravans:
    dx, dy = GR.door_px(c); x0, y0 = int(dx - 9), int(dy)
    apr[y0:y0 + 9, x0:x0 + 18] = True
foot = np.zeros((HY, WX), bool)
for (rx_, ry_, rw_, rh_) in GR.rects: foot[int(ry_):int(ry_ + rh_), int(rx_):int(rx_ + rw_)] = True
paths = []
for c in GR.caravans:                                                                          # slab path from the door down to the pavement
    dx, dy = GR.door_px(c); x0, y0 = int(dx - 5), int(dy) + 9
    col = road[y0:min(HY, y0 + 72), x0:x0 + 10].any(1)
    if col.any():
        y1 = y0 + int(np.argmax(col))
        if not foot[y0:y1, x0:x0 + 10].any(): apr[y0:y1 + 2, x0:x0 + 10] = True; paths.append((x0, y0, y1))
apr &= ~road & ~sand & ~sea
lx, ly = (xx % 9), (yy % 9)
paint(apr, 'stone', 4); paint(apr & ((lx == 8) | (ly == 8)), 'stone', 2); paint(apr & ((lx == 0) | (ly == 0)), 'stone', 5)
paint(apr & ~ndi.binary_erosion(apr), 'stone', 1)
print('surfaces done', flush=True)

# ---------------- flowers + stones on plain lawn ----------------
plain = ~(road | sand | sea | pitch | golf | mini | dirt | tall | apr)
for c in LY['courts']['objects']: plain[int(c['y']) - 2:int(c['y'] + c['height']) + 2, int(c['x']) - 2:int(c['x'] + c['width']) + 2] = False
PET = {'red': (RAMP['red'][2], RAMP['yellow'][2]), 'yellow': (RAMP['yellow'][2], RAMP['yellow'][3]), 'white': (RAMP['white'][1], RAMP['yellow'][2]), 'blue': (RAMP['blue'][3], RAMP['white'][1])}
NC = WX * HY // 1300
cy_ = rng.integers(6, HY - 6, NC); cx_ = rng.integers(6, WX - 6, NC)
fx_ = [int(c['x'] + rng.choice([6, c['width'] - 6])) for c in GR.caravans]; fy_ = [int(c['y'] + c['height'] + 5) for c in GR.caravans]
cy_ = np.concatenate([cy_, fy_]); cx_ = np.concatenate([cx_, fx_]); NC = len(cy_); cols = rng.choice(['red', 'yellow', 'white', 'blue', 'yellow', 'white', 'red'], NC)
for i in range(NC):
    pet, ctr = PET[cols[i]]
    for _ in range(int(rng.integers(3, 7))):
        y, x = cy_[i] + int(rng.integers(-3, 4)), cx_[i] + int(rng.integers(-5, 6))
        if not plain[y - 1:y + 3, x - 1:x + 2].all(): continue
        if rng.random() < 0.6:
            img[y - 1, x] = pet; img[y + 1, x] = pet; img[y, x - 1] = pet; img[y, x + 1] = pet; img[y, x] = ctr; img[y + 2, x] = RAMP['grass'][2]
        else: img[y, x] = pet; img[y + 1, x] = RAMP['grass'][2]
NS = WX * HY // 9000
sy_ = rng.integers(3, HY - 3, NS); sx_ = rng.integers(3, WX - 5, NS)
for y, x in zip(sy_, sx_):
    w = int(rng.choice([2, 3, 3, 4]))
    if not plain[y - 1:y + 3, x - 1:x + w + 1].all(): continue
    img[y, x:x + w] = RAMP['stone'][4]; img[y + 1, x:x + w] = RAMP['stone'][2]; img[y, x] = RAMP['stone'][5]; img[y + 2, x:x + w] = RAMP['grass'][2]

# ---------------- pitch + golf detail ----------------
PROPS_ = LY['props']['objects']
for g in [o for o in PROPS_ if o['name'] == 'goal']:
    gx, gy = int(g['x']), int(g['y']); down = not any(q['name'] == 'flipY' and q['value'] for q in g.get('properties', []))
    ys0 = gy + 10 if down else gy - 10 - 64; box = np.zeros((HY, WX), bool)
    yy0, yy1 = (ys0, ys0 + 64); box[yy0:yy1, gx - 64:gx + 64] = True; inner = ndi.binary_erosion(box, iterations=2)
    paint(box & ~inner & pitch, 'white', 1)                                                   # penalty box
    six = np.zeros((HY, WX), bool); sy0 = gy + 10 if down else gy - 10 - 22; six[sy0:sy0 + 22, gx - 30:gx + 30] = True
    paint(six & ~ndi.binary_erosion(six, iterations=2) & pitch, 'white', 1)
    mouth = (((xx - gx) / 22.0) ** 2 + ((yy - (gy + (16 if down else -16))) / 10.0) ** 2 < 1) & (fbm(6, 51) > 0.42) & pitch
    paint(mouth, 'meadow', 1); paint(mouth & (hsh < 0.25), 'sand', 2)                         # worn goal mouth
    spot = (np.hypot(xx - gx, yy - (gy + (48 if down else -48))) < 1.6); paint(spot, 'white', 1)
for i, f in enumerate([o for o in PROPS_ if o['name'] == 'golf-flag']):
    fx, fy = int(f['x']), int(f['y']) + 14
    if not golf[min(HY - 1, fy), min(WX - 1, fx)] or mini[min(HY - 1, fy), min(WX - 1, fx)]: continue
    d = np.hypot(xx - fx, (yy - fy) * 1.3); okg = golf & ~road
    paint(okg & (d < 30), 'meadow', 2); paint(okg & (d < 26), 'meadow', 3); paint(okg & (d < 26) & ((xx + yy) % 6 == 0), 'meadow', 2)   # green + fringe
    paint(okg & (np.hypot(xx - fx, yy - fy) < 1.8), 'stone', 0)                               # hole
    for k in range(2):                                                                         # two bunkers per hole
        a = (i * 2.1 + k * 2.6); bx_, by2 = fx + int(46 * math.cos(a)), fy + int(30 * math.sin(a))
        e = ((xx - bx_) / (16 - 4 * k)) ** 2 + ((yy - by2) / (9 - 2 * k)) ** 2 + 0.25 * fbm(8, 60 + i)
        bun = okg & (e < 1); paint(bun, 'sand', 2); paint(bun & (hsh < 0.12), 'sand', 3); paint(bun & ~ndi.binary_erosion(bun) & (yy < by2), 'sand', 0); paint(bun & ~ndi.binary_erosion(bun) & (yy >= by2), 'sand', 1)
    tx0, ty0 = fx - int(140 * math.cos(i * 1.3)), fy - int(90 * math.sin(i * 1.3 + 0.5))           # tee box
    tee = okg & (np.abs(xx - tx0) < 9) & (np.abs(yy - ty0) < 6); paint(tee, 'meadow', 3); paint(tee & ~ndi.binary_erosion(tee), 'meadow', 1)

# ---------------- palette-step shading (contact trims + shadows) ----------------
key_ = lambda a: (a[..., 0].astype(np.int32) << 16) | (a[..., 1].astype(np.int32) << 8) | a[..., 2].astype(np.int32)
LUT = {}
for r, hs in style.RAMPS.items():
    for i, hx in enumerate(hs):
        c = style.rgb(hx); kk = (c[0] << 16) | (c[1] << 8) | c[2]
        if kk not in LUT: LUT[kk] = (r, i)
def step_down(mask, k=1):
    ys_, xs_ = np.nonzero(mask)
    if not len(ys_): return
    px = img[ys_, xs_]; kk = key_(px); uniq, inv = np.unique(kk, return_inverse=True); new = np.zeros((len(uniq), 3), np.uint8)
    for j, u in enumerate(uniq):
        if u in LUT:
            r, i = LUT[u]; lo = 1 if r in ('grass', 'leaf', 'meadow') else 0; new[j] = RAMP[r][max(lo, i - k)]
        else: new[j] = [(u >> 16) & 255, (u >> 8) & 255, u & 255]
    img[ys_, xs_] = new[inv]
grassy = ~(road | sand | sea | dirt | apr | mini)
for c in LY['courts']['objects']: grassy[int(c['y']):int(c['y'] + c['height']), int(c['x']):int(c['x'] + c['width'])] = False
step_down(grassy & near(~grassy, 2), 1)                                                         # contact trim
# ---------------- v11 borders: diegetic blockers painted on every sealed border tile (build.py borders[]) ----------------
def C(r, i): return tuple(int(v) for v in RAMP[r][i])
BS = {(b[0], b[1]): b[2] for b in WJ.get('borders', [])}
bov = Image.new('RGBA', (WX, HY), (0, 0, 0, 0)); bd = ImageDraw.Draw(bov)
def hsh(x, y, k=0): return (((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) & 0xffff) / 65535
def nb(x, y, st): return [(dx, dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if BS.get((x + dx, y + dy)) == st]
for (tx, ty), st in sorted(BS.items(), key=lambda kv: kv[0][1]):
    x0, y0 = tx * 16, ty * 16; cx, cy = x0 + 8, y0 + 8; n = nb(tx, ty, st)
    if st == 'fence':  # post and rail, rails run to fence neighbours
        for dx, dy in n:
            if dx: bd.rectangle([min(cx, cx + dx * 8), cy - 3, max(cx, cx + dx * 8), cy - 2], fill=C('wood', 4)); bd.rectangle([min(cx, cx + dx * 8), cy + 2, max(cx, cx + dx * 8), cy + 3], fill=C('wood', 3))
            else: bd.rectangle([cx - 1, min(cy, cy + dy * 8), cx + 1, max(cy, cy + dy * 8)], fill=C('wood', 3))
        for dx, dy in ((1, 1), (1, -1)):  # staircase borders: rails run diagonally so the line reads as one fence
            if BS.get((tx + dx, ty + dy)) == st and not n:
                pass
            if BS.get((tx + dx, ty + dy)) == st and BS.get((tx + dx, ty)) != st and BS.get((tx, ty + dy)) != st:
                bd.line([cx, cy - 2, cx + 16 * dx, cy - 2 + 16 * dy], fill=C('wood', 4), width=2); bd.line([cx, cy + 3, cx + 16 * dx, cy + 3 + 16 * dy], fill=C('wood', 3), width=2)
        bd.rectangle([cx - 2, cy - 7, cx + 1, cy + 5], fill=C('wood', 2), outline=C('wood', 0)); bd.line([cx - 1, cy - 6, cx - 1, cy + 3], fill=C('wood', 5))
    elif st in ('hedge', 'thicket', 'wall', 'bank', 'dune') and False: pass
    elif st in ('hedge', 'thicket'):
        r0 = 'leaf'; base = 1 if st == 'thicket' else 2
        bd.rectangle([x0, y0 + 1, x0 + 15, y0 + 15], fill=C(r0, base))
        for k in range(5 if st == 'thicket' else 3):
            ex, ey = x0 + int(hsh(tx, ty, k) * 12), y0 + int(hsh(tx, ty, k + 9) * 10); rr = 4 + int(hsh(tx, ty, k + 3) * 3)
            bd.ellipse([ex - rr + 2, ey - rr + 3, ex + rr + 2, ey + rr + 3], fill=C(r0, base + 1)); bd.ellipse([ex - rr + 3, ey - rr + 3, ex + rr - 1, ey + rr - 1], fill=C(r0, base + 2))
        if st == 'thicket':  # brambles: thorny strokes and the odd blackberry
            for k in range(3):
                ax, ay = x0 + int(hsh(tx, ty, k + 20) * 14), y0 + int(hsh(tx, ty, k + 30) * 14); bd.line([ax, ay, ax + 4, ay - 3], fill=C('wood', 1))
            if hsh(tx, ty, 40) > 0.6: bd.point((x0 + 5, y0 + 9), fill=C('pink', 0)); bd.point((x0 + 11, y0 + 4), fill=C('pink', 0))
    elif st == 'bank':  # the hill face: grass lip, earth strata, rocks; reads as a drop you can't climb
        bd.rectangle([x0, y0, x0 + 15, y0 + 15], fill=C('wood', 2))
        for k, yy_ in enumerate((3, 8, 13)): bd.line([x0, y0 + yy_ + int(hsh(tx, ty, k) * 2), x0 + 15, y0 + yy_], fill=C('wood', 1))
        bd.rectangle([x0, y0, x0 + 15, y0 + 3], fill=C('grass', 2)); [bd.point((x0 + i, y0 + 4), fill=C('grass', 1)) for i in range(0, 16, 3)]
        if hsh(tx, ty, 7) > 0.5: rx, ry = x0 + 3 + int(hsh(tx, ty, 8) * 8), y0 + 8; bd.ellipse([rx, ry, rx + 5, ry + 4], fill=C('stone', 3), outline=C('stone', 1))
    elif st == 'wall':  # low stone wall
        bd.rectangle([x0, y0 + 3, x0 + 15, y0 + 14], fill=C('stone', 3), outline=C('stone', 1))
        for j, yy_ in enumerate((3, 8)):
            for xx_ in range(-(j * 4), 16, 8): bd.rectangle([x0 + max(0, xx_), y0 + yy_, x0 + min(15, xx_ + 7), y0 + yy_ + 5], outline=C('stone', 1))
        bd.line([x0, y0 + 3, x0 + 15, y0 + 3], fill=C('stone', 5))
    elif st == 'dune':  # a marram-grass dune ridge
        bd.ellipse([x0 - 4, y0 + 1, x0 + 19, y0 + 17], fill=C('sand', 1)); bd.ellipse([x0 - 2, y0, x0 + 17, y0 + 12], fill=C('sand', 2))
        for k in range(4):
            gx = x0 + 2 + int(hsh(tx, ty, k) * 12); bd.line([gx, y0 + 9, gx - 2, y0 + 2], fill=C('meadow', 1)); bd.line([gx, y0 + 9, gx + 2, y0 + 3], fill=C('meadow', 0))
    elif st == 'gap':  # a worn path into the trees: the way into the Glen
        bd.rectangle([x0 + 2, y0, x0 + 13, y0 + 15], fill=C('wood', 3)); bd.rectangle([x0 + 3, y0, x0 + 12, y0 + 8], fill=C('wood', 1)); bd.rectangle([x0 + 4, y0, x0 + 11, y0 + 4], fill=C('leaf', 0))
        for k in range(4): bd.point((x0 + 4 + int(hsh(tx, ty, k) * 8), y0 + 9 + int(hsh(tx, ty, k + 5) * 6)), fill=C('wood', 2))
        bd.ellipse([x0 - 5, y0 - 4, x0 + 5, y0 + 10], fill=C('leaf', 1)); bd.ellipse([x0 + 11, y0 - 4, x0 + 21, y0 + 10], fill=C('leaf', 1))
    elif st in ('road', 'choke'):  # roadworks: red/white plank barrier on legs, a cone; the choke adds the dug trench
        if st == 'choke': bd.rectangle([x0, y0 + 9, x0 + 15, y0 + 15], fill=C('wood', 1)); bd.line([x0, y0 + 9, x0 + 15, y0 + 9], fill=C('wood', 3))
        bd.line([x0 + 2, y0 + 4, x0 + 2, y0 + 10], fill=C('tarmac', 0)); bd.line([x0 + 13, y0 + 4, x0 + 13, y0 + 10], fill=C('tarmac', 0))
        bd.rectangle([x0, y0 + 2, x0 + 15, y0 + 6], fill=C('white', 1), outline=C('tarmac', 0))
        for k in range(0, 16, 6): bd.polygon([(x0 + k, y0 + 3), (x0 + k + 3, y0 + 3), (x0 + k + 1, y0 + 6), (x0 + k - 2, y0 + 6)], fill=C('red', 2))
        if (tx + ty) % 2: bd.polygon([(x0 + 8, y0 + 7), (x0 + 5, y0 + 14), (x0 + 11, y0 + 14)], fill=C('red', 2), outline=C('red', 0)); bd.line([x0 + 6, y0 + 11, x0 + 10, y0 + 11], fill=C('white', 1))
bov_a = np.array(bov); m_ = bov_a[..., 3] > 0; img[m_] = bov_a[m_][:, :3]
print(f'borders painted: {len(BS)} tiles', flush=True)
sh = Image.new('L', (WX, HY), 0); sd = ImageDraw.Draw(sh); sh2 = Image.new('L', (WX, HY), 0); sd2 = ImageDraw.Draw(sh2)
for c in GR.caravans:                                                                             # light from the top-left
    sd2.rectangle([c['x'] + 4, c['y'] + c['height'] - 8, c['x'] + c['width'] + 4, c['y'] + c['height'] + 3], fill=255)
    sd.ellipse([c['x'] - 2, c['y'] + c['height'] - 10, c['x'] + c['width'] + 8, c['y'] + c['height'] + 6], fill=255)
roofs = LY['roofs']['data']
for i, gid in enumerate(roofs):
    if gid and (i == 0 or roofs[i - 1] == 0 or (i % W) == 0):                                     # left tile of each 2-wide canopy
        x, y = (i % W) * 16, (i // W) * 16
        sd2.ellipse([x + 4, y + 22, x + 38, y + 36], fill=255); sd.ellipse([x - 2, y + 18, x + 42, y + 40], fill=255)
sd2.rectangle([cbx + 8, cby + CBH - 6, cbx + CBW + 8, cby + CBH + 6], fill=255)
from PIL import Image as _I
PS = {n[:-4]: _I.open(f'public/assets/props/{n}').size for n in os.listdir('public/assets/props')}
for p in LY['props']['objects']:
    if p['name'] in ('tennis-net', 'goal'): continue
    pw, ph = PS.get(p['name'], (16, 16)); pw = next((q['value'] for q in p.get('properties', []) if q['name'] == 'w'), pw)
    sd2.ellipse([p['x'] - pw / 2 + 1, p['y'] + ph / 2 - 4, p['x'] + pw / 2 + 3, p['y'] + ph / 2 + 3], fill=255)
for d in WJ['decor']:
    dw = WJ['decorSizes'][d['sprite']][0]; x, y = d['x'] * 16 + 8, d['y'] * 16 + 16
    sd2.ellipse([x - dw / 2 + 1, y - 4, x + dw / 2 + 2, y + 2], fill=255)
for bx, by_, gid in WJ['barrierTiles'] + [b[:2] + [0] for b in WJ.get('borders', []) if b[2] == 'thicket']: sd2.rectangle([bx * 16 + 2, by_ * 16 + 14, bx * 16 + 18, by_ * 16 + 19], fill=255)
s1 = (np.array(sh) > 0) & ~sea; s2 = (np.array(sh2) > 0) & ~sea
step_down(s1 & ~s2, 1); step_down(s2, 2)
print('shading done', flush=True)

# ---------------- trees: trunks baked into the ground, canopies into a deduplicated overlay tileset ----------------
# (no per-tree game objects: the canopy layer draws above the player like the old roof tiles; trunk tiles keep collision)
TREE = {309: 0, 317: 1, 315: 2}
tsheet = np.array(Image.open('public/assets/trees.png').convert('RGBA')); TW, TH = tsheet.shape[1] // 3, tsheet.shape[0]
canopy = np.zeros((HY, WX, 4), np.uint8); trees_ = []
for i, gid in enumerate(LY['objects']['data']):
    if gid in TREE:
        tx, ty = i % W, i // W; h = ((tx * 73856093) ^ (ty * 19349663)) & 0xffffffff
        trees_.append((ty * 16 + 16 + ((h >> 3) % 5) - 2, tx * 16 + 16 - TW // 2 + (h % 7) - 3, ty * 16, TREE[gid]))
for by_, x0, split, v in sorted(trees_):
    spr = tsheet[:, v * TW:(v + 1) * TW]; y0 = by_ - TH
    for yy_ in range(TH):
        y = y0 + yy_
        if not (0 <= y < HY): continue
        row = spr[yy_]; m = row[:, 3] > 127; xs_ = np.arange(x0, x0 + TW); ok = m & (xs_ >= 0) & (xs_ < WX)
        if y >= split: img[y, xs_[ok]] = row[ok, :3]                # trunk (and canopy pixels inside the trunk row)
        else: canopy[y, xs_[ok]] = row[ok]
    # canopy pixels that hang into the trunk row stay in the ground, so the player (in front of the trunk) is drawn over them
tiles_, index, data = [], {}, np.zeros((HY // 16, WX // 16), np.int32)
for ty in range(HY // 16):
    for tx in range(WX // 16):
        t = canopy[ty * 16:ty * 16 + 16, tx * 16:tx * 16 + 16]
        if not t[..., 3].any(): continue
        k = t.tobytes(); j = index.get(k)
        if j is None: j = index[k] = len(tiles_); tiles_.append(t)
        data[ty, tx] = j + 1
cols = 64; rows_ = math.ceil(len(tiles_) / cols); sheet = np.zeros((rows_ * 16, cols * 16, 4), np.uint8)
for j, t in enumerate(tiles_): sheet[(j // cols) * 16:(j // cols) * 16 + 16, (j % cols) * 16:(j % cols) * 16 + 16] = t
Image.fromarray(sheet).save('public/assets/canopy.png', optimize=True)
json.dump({'w': WX // 16, 'h': HY // 16, 'cols': cols, 'data': data.ravel().tolist()}, open('public/assets/canopy.json', 'w'), separators=(',', ':'))
print(f'trees {len(trees_)} · canopy tiles {len(tiles_)} ({sheet.shape[1]}x{sheet.shape[0]})', flush=True)

# ---------------- write chunks ----------------
os.makedirs('public/assets/ground', exist_ok=True)
for f in os.listdir('public/assets/ground'): os.remove(f'public/assets/ground/{f}')
out = Image.fromarray(img); CH_ = 1024; ncx, ncy = math.ceil(WX / CH_), math.ceil(HY / CH_)
pal_img = Image.new('P', (1, 1)); flat = [v for hx in style.PALETTE for v in style.rgb(hx)]; pal_img.putpalette(flat + flat[:3] * (256 - len(style.PALETTE)))
for cy_i in range(ncy):
    for cx_i in range(ncx):
        ch = out.crop((cx_i * CH_, cy_i * CH_, min(WX, (cx_i + 1) * CH_), min(HY, (cy_i + 1) * CH_)))
        ch.quantize(palette=pal_img, dither=Image.Dither.NONE).save(f'public/assets/ground/g_{cx_i}_{cy_i}.png', optimize=True)
if len(sys.argv) > 1: out.save(sys.argv[1])
print(f'ground {WX}x{HY}px, {ncx}x{ncy} chunks; colours outside palette: {len(set(map(tuple, img.reshape(-1, 3)[::97].tolist())) - set(style.rgb(h) for h in style.PALETTE))}')
