# Builds the world from the aerial-photo segmentation (tara-glen-objects.json):
#  - public/assets/ground/g_<cx>_<cy>.png : pre-baked ground image (grass, roads, fields, courts, beach, sea, shadows) in 1024px chunks
#  - public/assets/map.json : Tiled map (collision tile layer, tree tile layers, object layers with segId properties)
# 1 photo px = S world px; 16px tiles. Extra columns on the right add beach + sea.
# Usage: /path/to/python (numpy, scipy, scikit-image, pillow) scripts/make-world.py tara-glen-objects.json
import json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage.morphology import skeletonize, remove_small_objects, disk
random.seed(3); rng = np.random.default_rng(3)
objs = json.load(open(sys.argv[1]))["objects"]; by = {o["id"]: o for o in objs}
cls = lambda c: [o for o in objs if o["cls"] == c]
PW, PH, S = 1206, 1251, 2.5
K = 16 / S; W0, H = math.ceil(PW / K), math.ceil(PH / K); EXT = 14; W = W0 + EXT
WX, HY = W * 16, H * 16                                                       # world px
R = 18                                                                        # road half width (world px)
yy, xx = np.mgrid[0:HY, 0:WX]

def poly_mask(polys, scale=S, size=(WX, HY)):
    im = Image.new("L", size, 0); d = ImageDraw.Draw(im)
    for p in polys: d.polygon([(q[0] * scale, q[1] * scale) for q in p], fill=255)
    return np.array(im) > 0
def smooth(m, sigma): return ndi.gaussian_filter(m.astype(np.float32), sigma) > 0.5

# ---------- roads: skeleton of the segmented stretches -> constant-width smooth roads, perfect rings ----------
rings = []
for o in cls("roundabout/cul-de-sac"):
    ro = math.sqrt(o["area_px"] / math.pi) * S; cx, cy = o["centroid"][0] * S, o["centroid"][1] * S
    rings.append((o["id"], cx, cy, max(ro, 2.6 * R)))
pm = poly_mask([o["polygon"] for o in cls("road")], 1, (PW, PH))
pm = ndi.binary_closing(pm, disk(3)); pm = remove_small_objects(pm, max_size=120)
for _, cx, cy, ro in rings:                                                   # drop road pixels inside rings
    pyy, pxx = np.mgrid[0:PH, 0:PW]; pm &= (pxx - cx / S) ** 2 + (pyy - cy / S) ** 2 > (ro / S - 2) ** 2
sk = skeletonize(pm)
for _ in range(5):                                                            # prune short spurs
    nb = ndi.convolve(sk.astype(np.uint8), np.ones((3, 3), np.uint8), mode="constant") - sk
    sk &= ~((nb == 1) & sk)
ys, xs = np.nonzero(sk)
seed = np.zeros((HY, WX), bool); seed[np.clip((ys * S).astype(int), 0, HY - 1), np.clip((xs * S).astype(int), 0, WX - 1)] = True
dist = ndi.distance_transform_edt(~seed)
road = dist <= R
for _, cx, cy, ro in rings:                                                   # ring road (centre line radius ro-R)
    dd = np.hypot(xx - cx, yy - cy); road |= np.abs(dd - (ro - R)) <= R
# clubhouse + car park (in front of it), connected to the nearest road
cb = by[34]["bbox_xywh"]; CBW, CBH = 192, 136
cbx, cby = int((cb[0] + cb[2] / 2) * S - CBW / 2), int((cb[1] + cb[3] / 2) * S - CBH / 2)
park = (cbx - 8, cby + CBH + 10, cbx + CBW + 8, cby + CBH + 74)
pcx, pcy = (park[0] + park[2]) // 2, (park[1] + park[3]) // 2
ry, rx = np.nonzero(road[::4, ::4]); k = np.argmin((rx * 4 - pcx) ** 2 + (ry * 4 - pcy) ** 2); tx, ty = rx[k] * 4, ry[k] * 4
conn = Image.new("L", (WX, HY), 0); cd = ImageDraw.Draw(conn); cd.line([(pcx, park[1] + 8), (tx, ty)], fill=255, width=2 * R)
cd.rectangle(park, fill=255); road |= np.array(conn) > 0
road = smooth(road, 3.5)
road[:, W0 * 16 - 8:] = False
dist_edge = ndi.distance_transform_edt(road)                                   # inside distance to edge (for kerb)

# ---------- terrain masks ----------
sand = smooth(poly_mask([o["polygon"] for o in cls("beach/coast")]), 6)
def shore(y): return (W0 + 5) * 16 + 6 * np.sin(2 * np.pi * y / 256) + 3 * np.sin(2 * np.pi * y / 128)   # matches foam.png
sandline = W0 * 16 - 10 + 10 * np.sin(yy / 71.0)
sand |= xx >= sandline
sea = xx > shore(yy)
sand &= ~sea; sand &= ~road
wood = smooth(poly_mask([o["polygon"] for o in cls("trees/woodland")]), 4)
golf = smooth(poly_mask([by[31]["polygon"]]), 5)
pitch = smooth(poly_mask([by[25]["polygon"]]), 3)
mini = smooth(poly_mask([by[38]["polygon"]]), 3)
dirt = smooth(poly_mask([o["polygon"] for o in cls("other") if o["id"] != 38]), 5)
fields = poly_mask([o["polygon"] for o in cls("field/grass")])

# ---------- tile-level occupancy ----------
def tile_frac(m): return m[:H * 16, :W * 16].reshape(H, 16, W, 16).mean(axis=(1, 3))
road_t, sea_t, sand_t = tile_frac(road), tile_frac(sea), tile_frac(sand)
blocked = {(x, y) for y in range(H) for x in range(W) if road_t[y, x] > 0.08 or sea_t[y, x] > 0 or (x >= W0 - 1)}
def block_rect(x0, y0, x1, y1, pad=0):
    for ty in range(int(y0) // 16 - pad, int(y1) // 16 + 1 + pad):
        for tx in range(int(x0) // 16 - pad, int(x1) // 16 + 1 + pad): blocked.add((tx, ty))
block_rect(cbx, cby, cbx + CBW, cby + CBH, 1); block_rect(*park)
courts = []
for sid, kind in [(13, "tennis"), (10, "hardcourt")]:
    x, y, w, h = by[sid]["bbox_xywh"]; r = (int(x * S), int(y * S), int((x + w) * S), int((y + h) * S))
    courts.append({"name": kind, "type": "court", "x": r[0], "y": r[1], "width": r[2] - r[0], "height": r[3] - r[1], "segId": sid}); block_rect(*r, 1)
ring_islands = [(cx, cy, ro - 2 * R) for _, cx, cy, ro in rings]
for cx, cy, ri in ring_islands: block_rect(cx - ri, cy - ri, cx + ri, cy + ri)

# ---------- caravans: one per detection, snapped H/V, nudged for a 1-tile walkable gap ----------
def inside_poly(pt, poly):
    x, y, c = pt[0], pt[1], False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-9) + x1: c = not c
    return c
SIZE = {"h": (72, 48, 14), "v": (48, 80, 20)}
placed, rects, dropped = [], [], {"false-hit": 0, "no-room": 0}
def orient(p):
    n = len(p); mx = sum(q[0] for q in p) / n; my = sum(q[1] for q in p) / n
    return "h" if sum((q[0] - mx) ** 2 for q in p) >= sum((q[1] - my) ** 2 for q in p) else "v"
def ok(x, y, w, h, ins):
    bx0, by0, bx1, by1 = x + 2, y + ins, x + w - 2, y + h - 2
    for (a0, b0, a1, b1) in rects:
        if bx0 < a1 + 16 and a0 < bx1 + 16 and by0 < b1 + 16 and b0 < by1 + 16: return False
    for ty in range(y // 16, (y + h - 1) // 16 + 1):
        for tx in range(x // 16, (x + w - 1) // 16 + 1):
            if not (0 <= tx < W0 and 0 <= ty < H) or (tx, ty) in blocked: return False
    return True
cars = sorted([o for o in objs if o["id"] >= 88], key=lambda o: -o["area_px"])
offs = sorted({(dx, dy) for dx in range(-40, 41, 4) for dy in range(-40, 41, 4)}, key=lambda d: d[0] ** 2 + d[1] ** 2)
for o in cars:
    c = o["centroid"]
    if any(inside_poly(c, o2["polygon"]) for o2 in objs if o2["cls"] in ("pitch/court", "beach/coast", "clubhouse")) \
            or any(math.hypot(c[0] * S - cx, c[1] * S - cy) < ro for _, cx, cy, ro in rings):
        dropped["false-hit"] += 1; continue
    ori0 = orient(o["polygon"]); cx, cy = c[0] * S, c[1] * S
    for ori, dx, dy in [(ori0, dx, dy) for dx, dy in offs] + [("v" if ori0 == "h" else "h", dx, dy) for dx, dy in offs[:60]]:
        w, h, ins = SIZE[ori]; x, y = int(cx - w / 2 + dx), int(cy - h / 2 + dy)
        if ok(x, y, w, h, ins):
            rects.append((x + 2, y + ins, x + w - 2, y + h - 2))
            placed.append({"name": f"caravan {o['id']}", "type": "caravan", "x": x, "y": y, "width": w, "height": h,
                           "segId": o["id"], "orient": ori, "variant": random.randrange(3)})
            block_rect(x, y, x + w - 1, y + h - 1); break
    else: dropped["no-room"] += 1

# ---------- props ----------
props = []; PSIZE = {n: Image.open(f"public/assets/props/{n}.png").size for n in os.listdir("public/assets/props") for n in [n[:-4]]}
def prop(kind, x, y, force=False, **kw):
    w, h = kw.get("w", PSIZE[kind][0]), PSIZE[kind][1]
    t = (int(x - w / 2) // 16, int(y - h / 2) // 16, int(x + w / 2) // 16, int(y + h / 2) // 16)
    cellset = [(a, b) for a in range(t[0], t[2] + 1) for b in range(t[1], t[3] + 1)]
    if not force and any(c in blocked for c in cellset): return False
    props.append({"name": kind, "type": "prop", "x": int(x), "y": int(y), "width": 0, "height": 0, **kw})
    blocked.update(cellset); return True
pc, pb = by[25]["centroid"], by[25]["bbox_xywh"]
prop("goal", pc[0] * S, (pb[1] + 26) * S, True); prop("goal", pc[0] * S, (pb[1] + pb[3] - 26) * S, True, flipY=True)
t = courts[0]; prop("tennis-net", t["x"] + t["width"] / 2, t["y"] + t["height"] / 2, True, w=t["width"] - 36)
for cx, cy, ri in ring_islands[:1]:
    for dx, dy, k in [(0, 0, "flowerbed"), (-40, 28, "bench"), (40, 28, "bench"), (0, -34, "bench"), (58, 28, "bin")]: prop(k, cx + dx, cy + dy, True)
for cx, cy, ri in ring_islands[1:]: prop("flowerbed", cx, cy, True)
for x, y in [(330, 1150), (520, 1210), (600, 1080), (250, 1000)]: prop("golf-flag", x * S, y * S)
mb = by[38]["bbox_xywh"]; mx0, my0, mx1, my1 = mb[0] * S, mb[1] * S, (mb[0] + mb[2]) * S, (mb[1] + mb[3]) * S
prop("golf-flag", mx0 + 60, my0 + 70); prop("golf-flag", mx1 - 60, my1 - 60); prop("minigolf-hut", (mx0 + mx1) / 2, (my0 + my1) / 2)
for x in range(int(mx0) + 30, int(mx1) - 20, 32): prop("fence", x, my0 + 12)
prop("signpost", cbx - 18, cby + CBH - 10, True, label="Tara Glen Golf & Country Club")
bays = [(park[0] + 30 + k * 40, (park[1] + park[3]) // 2) for k in range(5)]
for (x, y), name in zip(bays, ["car-red", "car-silver", None, "car-blue", "car-silver"]):
    if name: prop(name, x, y, True)
for x in range(park[0] + 16, park[2] - 8, 32): prop("hedge", x, park[3] + 12)
for x, y, k in [(2, 300, "deckchair"), (3, 306, "deckchair"), (1, 330, "windbreak"), (2, 880, "deckchair"), (1, 905, "windbreak"), (3, 640, "deckchair")]:
    prop(k, (W0 + x) * 16 + 8, y * S, True)
f8 = by[8]["centroid"]; prop("picnic-table", f8[0] * S, f8[1] * S); prop("picnic-table", f8[0] * S + 50, f8[1] * S + 22); prop("bin", f8[0] * S + 32, f8[1] * S - 26)
lamp_d = (dist >= R + 7) & (dist <= R + 9) & ~road                           # lamps along the roadside, spaced out
ly, lx = np.nonzero(lamp_d[::2, ::2]); order = rng.permutation(len(lx)); lamps = []
for i in order:
    x, y = lx[i] * 2, ly[i] * 2
    if all((x - a) ** 2 + (y - b) ** 2 > 300 ** 2 for a, b in lamps) and prop("lamp", x, y - 14): lamps.append((x, y))
    if len(lamps) >= 28: break

# ---------- woodland: dense 2x2 trees ----------
TREES = [((280, 281), (308, 309)), ((286, 287), (314, 315)), ((288, 289), (316, 317)), ((280, 281), (308, 309))]
obj = [[-1] * W for _ in range(H)]; roof = [[-1] * W for _ in range(H)]; trees = []
wood_t = tile_frac(wood)
for y in range(0, H - 1, 2):
    for x in range(y % 4 // 2, W - 1, 2):
        cellset = [(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)]
        if random.random() < 0.9 and all(wood_t[b, a] > 0.5 and (a, b) not in blocked for a, b in cellset):
            top, trunk = random.choice(TREES); roof[y][x], roof[y][x + 1] = top; obj[y + 1][x], obj[y + 1][x + 1] = trunk
            blocked.update(cellset); trees.append((x, y))

# ---------- bake the ground ----------
src = Image.open("public/assets/tiles.png").convert("RGB")
def tex(i): return np.array(src.crop(((i % 28) * 16, (i // 28) * 16, (i % 28) * 16 + 16, (i // 28) * 16 + 16)), np.float32)
g = tex(330); variants = [g, g[:, ::-1], g[::-1], np.rot90(g), np.rot90(g, 2), np.rot90(g, 3)]
img = np.zeros((HY, WX, 3), np.float32)
pick = rng.integers(0, len(variants), (H, W))
for ty in range(H):
    for tx in range(W): img[ty * 16:ty * 16 + 16, tx * 16:tx * 16 + 16] = variants[pick[ty, tx]]
def noise(scale, seed):
    r = np.random.default_rng(seed).random((HY // scale + 2, WX // scale + 2)).astype(np.float32)
    return np.array(Image.fromarray(r).resize((WX + 2 * scale, HY + 2 * scale), Image.BICUBIC))[scale:scale + HY, scale:scale + WX]
bayer = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16 - 0.5)[yy % 4, xx % 4] * 0.08
n1 = noise(96, 1) + bayer; n2 = noise(40, 2) + bayer
def shade(m, f, tint=(0, 0, 0)):
    img[m] = np.clip(img[m] * f + np.array(tint, np.float32), 0, 255)
shade(n1 > 0.64, 0.9, (-2, 0, -4)); shade(n1 < 0.3, 1.06, (4, 4, 0)); shade(n2 > 0.72, 0.94)
wf = ndi.gaussian_filter(wood.astype(np.float32), 14) + bayer * 2               # forest floor, soft dithered edge
shade(wf > 0.35, 0.9, (-3, -1, -1)); shade(wf > 0.6, 0.88, (-3, -1, -1))
stripes = ((xx + yy) // 28) % 2 == 0
shade(golf & stripes, 1.12, (8, 8, 0)); shade(golf & ~stripes, 1.05, (4, 4, 0))
shade(pitch & ((xx // 22) % 2 == 0), 1.1); shade(pitch, 1.02)
pe = pitch & ~ndi.binary_erosion(pitch, iterations=10); pl = pe & ndi.binary_erosion(pitch, iterations=8)
img[pl] = (236, 240, 230)
pcx, pcy = pc[0] * S, pc[1] * S; dd = np.hypot(xx - pcx, yy - pcy); img[pitch & (np.abs(dd - 46) < 1.2)] = (236, 240, 230)
img[mini] = (96, 178, 82); img[mini & (((xx // 4) + (yy // 4)) % 2 == 0)] *= 0.96
img[mini & ~ndi.binary_erosion(mini, iterations=3)] = (60, 120, 60)
gn = noise(3, 11)                                                             # gravel yards
img[dirt] = (168, 154, 128); img[dirt & (gn > 0.62)] = (150, 136, 112); img[dirt & (gn < 0.3)] = (184, 172, 146)
img[dirt & ~ndi.binary_erosion(dirt, iterations=2)] = (120, 110, 92)
# beach + sea
sn = noise(6, 5)
img[sand] = (226, 210, 168); img[sand & (sn > 0.62)] = (214, 196, 152); img[sand & (sn < 0.25)] = (236, 224, 188)
spk = sand & (rng.random((HY, WX)) < 0.015); img[spk] = (190, 170, 128)
sx = shore(yy)
img[sand & (xx > sx - 16)] = (196, 178, 136)                                  # wet sand
img[~sand & ~sea & ndi.binary_dilation(sand, iterations=3) & ~road] *= 0.97   # soft grass/sand edge
gs = ~sand & ~sea & ndi.binary_dilation(sand, iterations=2); img[gs & (rng.random((HY, WX)) < 0.5)] = (200, 196, 140)
dsea = xx - sx
img[sea] = (54, 128, 190); img[sea & (dsea < 40)] = (72, 152, 206); img[sea & (dsea < 16)] = (98, 180, 216)
img[sea & (noise(12, 7) > 0.7) & (dsea > 40)] = (62, 138, 198)
# roads: grass shadow edge, kerb, tarmac with grain
edge = ndi.binary_dilation(road, iterations=2) & ~road & ~sea; img[edge] *= 0.78
tg = noise(3, 9)
img[road] = (112, 114, 120); img[road & (tg > 0.65)] = (104, 106, 112); img[road & (tg < 0.3)] = (120, 122, 128)
img[road & (dist_edge <= 2.2)] = (190, 190, 182); img[road & (dist_edge > 2.2) & (dist_edge <= 3.2)] = (92, 94, 100)
for k in range(6):                                                            # parking bay lines
    x = park[0] + 10 + k * 40; img[park[1] + 8:park[3] - 8, x:x + 2] = (236, 236, 230)
# tufts + flowers on plain grass
plain = ~(road | edge | sand | sea | pitch | golf | mini | dirt | wood)
for c in courts: plain[c["y"] - 2:c["y"] + c["height"] + 2, c["x"] - 2:c["x"] + c["width"] + 2] = False
for _ in range(9000):
    x, y = rng.integers(2, WX - 6), rng.integers(2, HY - 6)
    if not plain[y, x]: continue
    if rng.random() < 0.7:
        c = img[y, x] * 0.7; img[y, x] = c; img[y - 1, x - 1] = c; img[y - 1, x + 1] = c; img[y - 2, x - 1] = img[y + 0, x + 2] * 1.0
        img[y - 2, x] = np.clip(img[y - 2, x] * 1.25, 0, 255)
    else:
        col = [(250, 250, 250), (250, 220, 90), (240, 140, 170)][rng.integers(0, 3)]
        for dx, dy in [(0, -1), (-1, 0), (1, 0), (0, 1)]: img[y + dy, x + dx] = col
        img[y, x] = (250, 200, 60) if col != (250, 220, 90) else (230, 120, 40)
# courts baked at exact size
for c in courts:
    x0, y0, x1, y1 = c["x"], c["y"], c["x"] + c["width"], c["y"] + c["height"]
    img[y0:y1, x0:x1] = (70, 110, 70); surf = (70, 130, 172) if c["name"] == "tennis" else (176, 98, 82)
    img[y0 + 6:y1 - 6, x0 + 6:x1 - 6] = surf
    m = 16; L = (240, 240, 236)
    img[y0 + m:y0 + m + 2, x0 + m:x1 - m] = L; img[y1 - m - 2:y1 - m, x0 + m:x1 - m] = L
    img[y0 + m:y1 - m, x0 + m:x0 + m + 2] = L; img[y0 + m:y1 - m, x1 - m - 2:x1 - m] = L
    cxm, cym = (x0 + x1) // 2, (y0 + y1) // 2
    if c["name"] == "tennis":
        img[y0 + m:y1 - m, x0 + m + 16:x0 + m + 17] = L; img[y0 + m:y1 - m, x1 - m - 17:x1 - m - 16] = L
        for yl in (cym - 60, cym + 60): img[yl:yl + 2, x0 + m + 16:x1 - m - 16] = L
        img[cym - 60:cym + 60, cxm:cxm + 2] = L
    else:
        img[cym:cym + 2, x0 + m:x1 - m] = L; img[(np.abs(np.hypot(xx - cxm, yy - cym) - 22) < 1.2) & (yy >= y0) & (yy < y1) & (xx >= x0) & (xx < x1)] = L
# shadows (baked; light from top-left)
sh = Image.new("L", (WX, HY), 0); sd = ImageDraw.Draw(sh)
for c in placed: sd.rectangle([c["x"] + 6, c["y"] + 16, c["x"] + c["width"] + 5, c["y"] + c["height"] + 4], fill=255)
for x, y in trees: sd.ellipse([x * 16 + 2, (y + 2) * 16 - 8, x * 16 + 32, (y + 2) * 16 + 2], fill=255)
sd.rectangle([cbx + 6, cby + 30, cbx + CBW + 6, cby + CBH + 4], fill=255)
for p in props:
    w, h = p.get("w", PSIZE[p["name"]][0]), PSIZE[p["name"]][1]
    if p["name"] not in ("tennis-net", "goal"): sd.ellipse([p["x"] - w / 2, p["y"] + h / 2 - 5, p["x"] + w / 2 + 2, p["y"] + h / 2 + 3], fill=255)
sm = np.array(sh) > 0; img[sm & ~sea] *= 0.72
out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
os.makedirs("public/assets/ground", exist_ok=True)
for f in os.listdir("public/assets/ground"): os.remove(f"public/assets/ground/{f}")
CH_ = 1024; ncx, ncy = math.ceil(WX / CH_), math.ceil(HY / CH_)
for cy_ in range(ncy):
    for cx_ in range(ncx):
        out.crop((cx_ * CH_, cy_ * CH_, min(WX, (cx_ + 1) * CH_), min(HY, (cy_ + 1) * CH_))).quantize(256, Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) \
            .save(f"public/assets/ground/g_{cx_}_{cy_}.png", optimize=True)
if len(sys.argv) > 2: out.save(sys.argv[2])

# ---------- collision/ground tile layer (hidden in game; for Tiled + water/sand checks) ----------
ground = [[330] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        if sea_t[y, x] > 0.5: ground[y][x] = 244
        elif sand_t[y, x] > 0.5: ground[y][x] = 298
        elif road_t[y, x] > 0.5: ground[y][x] = 469
door = (cbx + CBW // 2, cby + CBH + 10)
ry, rx = np.nonzero(road[::8, ::8] & (dist_edge[::8, ::8] > 8)); k = np.argmin((rx * 8 - door[0] + 120) ** 2 + (ry * 8 - door[1]) ** 2)
spawn = (int(rx[k] * 8), int(ry[k] * 8))
landmarks = [{"name": f"#{o['id']} {o['cls']}", "type": "landmark", "x": o["label_xy"][0] * S, "y": o["label_xy"][1] * S,
              "width": 0, "height": 0, "segId": o["id"], "cls": o["cls"]} for o in objs if o["id"] <= 38]
buildings = [{"name": "clubhouse", "type": "building", "x": cbx, "y": cby, "width": CBW, "height": CBH, "segId": 34, "inset": 64}]
def tobj(i, o):
    pr = [{"name": k, "type": "int" if isinstance(v, int) and not isinstance(v, bool) else "bool" if isinstance(v, bool) else "float" if isinstance(v, float) else "string", "value": v}
          for k, v in o.items() if k not in ("name", "type", "x", "y", "width", "height")]
    return {"id": i, "name": o["name"], "type": o["type"], "x": o["x"], "y": o["y"], "width": o["width"], "height": o["height"],
            "rotation": 0, "visible": True, **({"point": True} if not o["width"] else {}), "properties": pr}
nid = [1]
def group(i, name, items):
    out_ = []
    for o in items: out_.append(tobj(nid[0], o)); nid[0] += 1
    return {"id": i, "name": name, "type": "objectgroup", "x": 0, "y": 0, "opacity": 1, "visible": True, "draworder": "topdown", "objects": out_}
flat = lambda gr: [t + 1 for row in gr for t in row]
layer = lambda i, n, gr, vis=True: {"id": i, "name": n, "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0, "opacity": 1, "visible": vis, "data": flat(gr)}
m = {"type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal", "renderorder": "right-down",
     "width": W, "height": H, "tilewidth": 16, "tileheight": 16, "infinite": False, "nextlayerid": 11,
     "properties": [{"name": "groundChunk", "type": "int", "value": CH_}, {"name": "groundCols", "type": "int", "value": ncx},
                    {"name": "groundRows", "type": "int", "value": ncy}, {"name": "shoreX", "type": "int", "value": (W0 + 5) * 16 - 16}],
     "layers": [layer(1, "ground", ground, False), layer(2, "objects", obj), layer(3, "roofs", roof),
                group(4, "courts", courts), group(5, "buildings", buildings), group(6, "caravans", placed), group(7, "props", props),
                group(8, "landmarks", landmarks), group(9, "markers", [{"name": "spawn", "type": "spawn", "x": spawn[0], "y": spawn[1], "width": 0, "height": 0}])],
     "tilesets": [{"firstgid": 1, "name": "tiles", "image": "tiles.png", "imagewidth": 448, "imageheight": 640,
                   "tilewidth": 16, "tileheight": 16, "columns": 28, "tilecount": 1120, "margin": 0, "spacing": 0}]}
m["nextobjectid"] = nid[0]
json.dump(m, open("public/assets/map.json", "w"), separators=(",", ":"))
print(f"{W}x{H} tiles ({WX}x{HY}px), {ncx}x{ncy} ground chunks; caravans {len(placed)}/{len(cars)} {dropped}; props {len(props)} (lamps {len(lamps)}); trees {len(trees)}; spawn {spawn}")
