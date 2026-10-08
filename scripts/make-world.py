# Builds public/assets/map.json (Tiled format) from the aerial-photo segmentation (tara-glen-objects.json).
# 1 photo px = S world px (S=2.5 => 6.4 photo px per 16px tile). Extra columns on the right add beach + sea.
# Usage: python3 scripts/make-world.py path/to/tara-glen-objects.json [preview.png]
import json, random, sys
from PIL import Image, ImageDraw, ImageFilter
random.seed(3)
objs = json.load(open(sys.argv[1]))["objects"]
PW, PH, S = 1206, 1251, 2.5                                       # photo size, world px per photo px
K = 16 / S; W0, H = int(-(-PW // K)), int(-(-PH // K)); EXT = 14; W = W0 + EXT; SEA_X = W0 + 4
by = {o["id"]: o for o in objs}
cls = lambda c: [o for o in objs if o["cls"] == c]

def pmask(polys, erode=0):                                        # photo-res mask -> PIL image
    im = Image.new("L", (PW, PH), 0); d = ImageDraw.Draw(im)
    for p in polys: d.polygon([tuple(q) for q in p], fill=255)
    return im.filter(ImageFilter.MinFilter(erode)) if erode else im
def cells(im, thr=0.35):                                          # downsample to tile set
    sm = im.resize((W0, H), Image.BOX); px = sm.load()
    return {(x, y) for y in range(H) for x in range(W0) if px[x, y] >= 255 * thr}

GRASS, FLOWERS, SAND, WATER_C, WATER_L, SANDY_GRASS = 330, [225, 226], 298, 244, 242, 332
TAR = list(range(1120, 1133)); DIRT = [440, 441, 442, 468, 469, 470, 496, 497, 498, 438, 439, 466, 467]
PITCH, FAIR = [1133, 1134], [1135, 1136]
TREES = [((280, 281), (308, 309)), ((286, 287), (314, 315))]   # (canopy row, trunk row)
ground = [[GRASS] * W for _ in range(H)]; decor = [[-1] * W for _ in range(H)]
obj = [[-1] * W for _ in range(H)]; roof = [[-1] * W for _ in range(H)]
blocked = set()                                                  # cells where nothing else may go

for o in cls("field/grass"):
    for x, y in cells(pmask([o["polygon"]])):
        if o["id"] == 31: ground[y][x] = FAIR[(y // 2) % 2]
        elif random.random() < 0.03: decor[y][x] = random.choice(FLOWERS)
pitch = cells(pmask([by[25]["polygon"]]))
for x, y in pitch: ground[y][x] = PITCH[(x // 2) % 2]
mini = cells(pmask([by[38]["polygon"]]))
for x, y in mini: ground[y][x] = FAIR[y % 2]
beach = cells(pmask([o["polygon"] for o in cls("beach/coast")]), 0.2)
for y in range(H):
    for x in range(W0, W): beach.add((x, y)) if x < SEA_X else None
for x, y in beach: ground[y][x] = SAND
for y in range(H):
    for x in range(SEA_X, W): ground[y][x] = WATER_L if x == SEA_X else WATER_C; blocked.add((x, y))

def autotile(mask, T):                                           # 9-slice + inner corners, out-of-map counts as inside
    inside = lambda x, y: (x, y) in mask or not (0 <= x < W and 0 <= y < H)
    res = {}
    for x, y in mask:
        n, s, w, e = inside(x, y - 1), inside(x, y + 1), inside(x - 1, y), inside(x + 1, y)
        if not n and not w: t = T[0]
        elif not n and not e: t = T[2]
        elif not s and not w: t = T[6]
        elif not s and not e: t = T[8]
        elif not n: t = T[1]
        elif not s: t = T[7]
        elif not w: t = T[3]
        elif not e: t = T[5]
        elif not inside(x + 1, y + 1): t = T[9]
        elif not inside(x - 1, y + 1): t = T[10]
        elif not inside(x + 1, y - 1): t = T[11]
        elif not inside(x - 1, y - 1): t = T[12]
        else: t = T[4]
        res[(x, y)] = t
    return res
def thicken(m):                                                  # no 1-tile-thin strips (autotile has no tile for them)
    for _ in range(3):
        for x, y in list(m):
            if (x, y - 1) not in m and (x, y + 1) not in m: m.add((x, y + 1))
            if (x - 1, y) not in m and (x + 1, y) not in m: m.add((x + 1, y))
        for y in range(H):                                       # fill pinholes
            for x in range(W0):
                if (x, y) not in m and sum(q in m for q in [(x+1, y), (x-1, y), (x, y+1), (x, y-1)]) >= 3: m.add((x, y))
    return m

# "other" areas (except crazy golf) -> dirt
dirt = thicken(cells(pmask([o["polygon"] for o in cls("other") if o["id"] != 38])))
for (x, y), t in autotile(dirt, DIRT).items(): ground[y][x] = t

# roads: road polygons + roundabout rings (disc minus eroded disc), centre stays grass
rings = cls("roundabout/cul-de-sac")
road_im = pmask([o["polygon"] for o in cls("road")])
for o in rings:
    disc = pmask([o["polygon"]]); inner = disc.filter(ImageFilter.MinFilter(29))
    road_im.paste(255, mask=disc); road_im.paste(0, mask=inner)
road = thicken(cells(road_im.filter(ImageFilter.MaxFilter(5)), 0.3))  # widen ~2px each side -> 2-3 tile roads
road = {(x, y) for x, y in road if 0 <= x < W0 and 0 <= y < H}
for (x, y), t in autotile(road, TAR).items(): ground[y][x] = t; decor[y][x] = -1
blocked |= road

# clubhouse (#34): big Ninja house, roof rows above the player, wall row collides
cb = by[34]["bbox_xywh"]; cw, ch = 11, 6
cx0 = int((cb[0] + cb[2] / 2) / K) - cw // 2; cy0 = int((cb[1] + cb[3] / 2) / K) - ch // 2
for dy in range(ch):
    for dx in range(cw):
        X, Y = cx0 + dx, cy0 + dy
        col = 0 if dx == 0 else 3 if dx == cw - 1 else 1 + dx % 2
        if dy == ch - 1: obj[Y][X] = [68, 70, 70, 71][col] if dx != cw // 2 else 69
        else: roof[Y][X] = (12 if dy == 0 else 40) + col
        ground[Y][X] = GRASS; blocked.add((X, Y))
for dy in range(-1, ch + 2):
    for dx in range(-1, cw + 1): blocked.add((cx0 + dx, cy0 + dy))
door = (cx0 + cw // 2, cy0 + ch)

# courts (drawn as images by the game, stored as objects); block their area
courts = []
for sid, kind in [(13, "tennis"), (10, "hardcourt")]:
    x, y, w, h = by[sid]["bbox_xywh"]
    courts.append({"name": kind, "type": "court", "x": x * S, "y": y * S, "width": w * S, "height": h * S, "segId": sid})
    for ty in range(int(y / K), int((y + h) / K) + 1):
        for tx in range(int(x / K), int((x + w) / K) + 1): blocked.add((tx, ty))

# ---------- caravans: one per detection, snapped to H/V, nudged to keep a 1-tile gap ----------
def inside_poly(pt, poly):
    x, y, c = pt[0], pt[1], False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-9) + x1: c = not c
    return c
NOGO = [o["polygon"] for o in objs if o["cls"] in ("pitch/court", "beach/coast", "clubhouse")] + \
       [list(pmask([o["polygon"]], 29).getbbox() or []) and o["polygon"] for o in rings]
ring_inner = [pmask([o["polygon"]], 29) for o in rings]
SIZE = {"h": (72, 48, 14), "v": (48, 80, 20)}                    # sprite w, h, roof inset (walk-behind strip)
placed, rects, dropped = [], [], {"false-hit": 0, "no-room": 0}
def orient(p):
    n = len(p); mx = sum(q[0] for q in p) / n; my = sum(q[1] for q in p) / n
    sxx = sum((q[0] - mx) ** 2 for q in p); syy = sum((q[1] - my) ** 2 for q in p)
    return "h" if sxx >= syy else "v"
def ok(x, y, w, h, ins):
    bx0, by0, bx1, by1 = x + 2, y + ins, x + w - 2, y + h - 2  # body
    for (a0, b0, a1, b1) in rects:                               # >= 16px between bodies
        if bx0 < a1 + 16 and a0 < bx1 + 16 and by0 < b1 + 16 and b0 < by1 + 16: return False
    for ty in range(y // 16, (y + h - 1) // 16 + 1):             # whole sprite off roads / blocked / map edge
        for tx in range(x // 16, (x + w - 1) // 16 + 1):
            if not (0 <= tx < W0 and 0 <= ty < H) or (tx, ty) in blocked: return False
    return True
cars = sorted([o for o in objs if o["id"] >= 88], key=lambda o: -o["area_px"])
offs = sorted({(dx, dy) for dx in range(-40, 41, 4) for dy in range(-40, 41, 4)}, key=lambda d: d[0] ** 2 + d[1] ** 2)
for o in cars:
    c = o["centroid"]
    if any(inside_poly(c, o2["polygon"]) for o2 in objs if o2["cls"] in ("pitch/court", "beach/coast", "clubhouse")) \
            or any(m.getpixel((int(c[0]), int(c[1]))) for m in ring_inner):
        dropped["false-hit"] += 1; continue
    ori0 = orient(o["polygon"]); cx, cy = c[0] * S, c[1] * S
    for ori, dx, dy in [(ori0, dx, dy) for dx, dy in offs] + [("v" if ori0 == "h" else "h", dx, dy) for dx, dy in offs[:60]]:
        w, h, ins = SIZE[ori]; x, y = int(cx - w / 2 + dx), int(cy - h / 2 + dy)
        if ok(x, y, w, h, ins):
            rects.append((x + 2, y + ins, x + w - 2, y + h - 2))
            placed.append({"name": f"caravan {o['id']}", "type": "caravan", "x": x, "y": y, "width": w, "height": h,
                           "segId": o["id"], "orient": ori, "variant": random.randrange(3)})
            for ty in range(y // 16, (y + h - 1) // 16 + 1):
                for tx in range(x // 16, (x + w - 1) // 16 + 1): blocked.add((tx, ty))
            break
    else: dropped["no-room"] += 1

# ---------- props ----------
props = []
def prop(kind, x, y, **kw):                                      # x, y = world px of the prop's centre
    props.append({"name": kind, "type": "prop", "x": int(x), "y": int(y), "width": 0, "height": 0, **kw})
    blocked.add((int(x) // 16, int(y) // 16))
pc = by[25]["centroid"]; pb = by[25]["bbox_xywh"]
prop("goal", pc[0] * S, (pb[1] + 30) * S); prop("goal", pc[0] * S, (pb[1] + pb[3] - 30) * S, flipY=True)
t = by[13]["bbox_xywh"]; prop("tennis-net", (t[0] + t[2] / 2) * S, (t[1] + t[3] / 2) * S)
rc = by[14]["centroid"]
for dx, dy, k in [(0, 0, "flowerbed"), (-36, 22, "bench"), (36, 22, "bench"), (0, -30, "bench"), (52, 22, "bin")]:
    prop(k, rc[0] * S + dx, rc[1] * S + dy)
for o in rings[1:]: prop("flowerbed", o["centroid"][0] * S, o["centroid"][1] * S)
for x, y in [(330, 1150), (520, 1210), (600, 1080)]:                         # golf flags on the lower field (#31), photo px
    prop("golf-flag", x * S, y * S)
mb = by[38]["bbox_xywh"]
prop("golf-flag", (mb[0] + 25) * S, (mb[1] + 30) * S); prop("golf-flag", (mb[0] + 70) * S, (mb[1] + 60) * S); prop("minigolf-hut", (mb[0] + 45) * S, (mb[1] + 40) * S)
prop("sign", door[0] * 16 + 40, door[1] * 16 + 8, label="Tara Glen Golf & Country Club")
for k, name in enumerate(["car-red", "car-silver", "car-blue"]):               # parked in front of the clubhouse
    prop(name, (cx0 - 2) * 16 - k * 46, (cy0 + ch + 2) * 16)
for x, y, k in [(1, 300, "deckchair"), (2, 306, "deckchair"), (1, 330, "windbreak"), (2, 880, "deckchair"), (1, 905, "windbreak")]:  # y in photo px
    prop(k, (W0 + x) * 16 + 8, y * S)
f8 = by[8]["centroid"]; prop("picnic-table", f8[0] * S, f8[1] * S); prop("picnic-table", f8[0] * S + 48, f8[1] * S + 20); prop("bin", f8[0] * S + 30, f8[1] * S - 24)

# ---------- woodland: dense 2x2 trees on a jittered grid, never on roads/caravans/props ----------
wood = cells(pmask([o["polygon"] for o in cls("trees/woodland")]), 0.5)
for y in range(0, H - 1, 2):
    for x in range(y % 4 // 2, W - 1, 2):
        if (x, y) in wood and random.random() < 0.9:
            cellset = [(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)]
            if any(q in blocked or q not in wood for q in cellset): continue
            top, trunk = random.choice(TREES)
            roof[y][x], roof[y][x + 1] = top; obj[y + 1][x], obj[y + 1][x + 1] = trunk
            for q in cellset: blocked.add(q)
# soften grass next to sand
for y in range(H):
    for x in range(W):
        if ground[y][x] == GRASS and any(0 <= x + dx < W and 0 <= y + dy < H and ground[y + dy][x + dx] == SAND for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]):
            ground[y][x] = SANDY_GRASS

# spawn: road cell nearest the clubhouse door
sx, sy = min(road, key=lambda p: (p[0] - door[0]) ** 2 + (p[1] - door[1] + 2) ** 2)
landmarks = [{"name": f"#{o['id']} {o['cls']}", "type": "landmark", "x": o["label_xy"][0] * S, "y": o["label_xy"][1] * S,
              "width": 0, "height": 0, "segId": o["id"], "cls": o["cls"]} for o in objs if o["id"] <= 38]

def tobj(i, o):                                                   # Tiled object with custom properties
    props_ = [{"name": k, "type": "int" if isinstance(v, int) and not isinstance(v, bool) else "bool" if isinstance(v, bool) else "string", "value": v}
              for k, v in o.items() if k not in ("name", "type", "x", "y", "width", "height")]
    return {"id": i, "name": o["name"], "type": o["type"], "x": o["x"], "y": o["y"], "width": o["width"], "height": o["height"],
            "rotation": 0, "visible": True, **({"point": True} if not o["width"] else {}), "properties": props_}
nid = [1]
def group(i, name, items):
    out = []
    for o in items: out.append(tobj(nid[0], o)); nid[0] += 1
    return {"id": i, "name": name, "type": "objectgroup", "x": 0, "y": 0, "opacity": 1, "visible": True, "draworder": "topdown", "objects": out}
flat = lambda g: [t + 1 for row in g for t in row]
layer = lambda i, n, g: {"id": i, "name": n, "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0, "opacity": 1, "visible": True, "data": flat(g)}
spawn = [{"name": "spawn", "type": "spawn", "x": sx * 16 + 8, "y": sy * 16 + 8, "width": 0, "height": 0}]
m = {"type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal", "renderorder": "right-down",
     "width": W, "height": H, "tilewidth": 16, "tileheight": 16, "infinite": False, "nextlayerid": 10,
     "layers": [layer(1, "ground", ground), layer(2, "decor", decor), layer(3, "objects", obj), layer(4, "roofs", roof),
                group(5, "courts", courts), group(6, "caravans", placed), group(7, "props", props),
                group(8, "landmarks", landmarks), group(9, "markers", spawn)],
     "tilesets": [{"firstgid": 1, "name": "tiles", "image": "tiles.png", "imagewidth": 448, "imageheight": 656,
                   "tilewidth": 16, "tileheight": 16, "columns": 28, "tilecount": 1148, "margin": 0, "spacing": 0}]}
m["nextobjectid"] = nid[0]
json.dump(m, open("public/assets/map.json", "w"), separators=(",", ":"))
print(f"{W}x{H} tiles; caravans placed {len(placed)} of {len(cars)} (dropped {dropped}); props {len(props)}; spawn {sx},{sy}")
