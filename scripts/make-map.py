# Builds public/assets/tiles.png (Kenney Tiny Town + a few generated tiles) and a Tiled-format map.json
# of Tara Glen / Kiltennel, Co. Wexford, rasterised from OpenStreetMap data (scripts/osm/raw.json, © OpenStreetMap contributors).
# Usage: python3 scripts/make-map.py path/to/kenney/tilemap_packed.png [preview.png]
import json, math, random, sys
from PIL import Image, ImageDraw

# ---------- tileset: Kenney 12x11 grid + generated row (indexes 132..) ----------
src = Image.open(sys.argv[1]).convert("RGBA")
tiles = Image.new("RGBA", (192, 192), (0, 0, 0, 0)); tiles.paste(src, (0, 0))
d = ImageDraw.Draw(tiles)
def gen(i): x0 = (i - 132) * 16; return x0, 176
def fill(i, c): x0, y0 = gen(i); d.rectangle([x0, y0, x0 + 15, y0 + 15], fill=c); return x0, y0
fill(132, (76, 150, 216, 255))                                     # water
x0, y0 = fill(133, (76, 150, 216, 255))                            # water + waves
for x, y in [(2, 4), (9, 10)]: d.line([x0 + x, y0 + y, x0 + x + 4, y0 + y], fill=(170, 215, 245, 255))
x0, y0 = gen(134)                                                  # static caravan
d.rounded_rectangle([x0 + 1, y0 + 3, x0 + 14, y0 + 13], 2, fill=(240, 236, 222, 255), outline=(62, 39, 49, 255))
d.rectangle([x0 + 3, y0 + 6, x0 + 6, y0 + 8], fill=(110, 170, 220, 255)); d.rectangle([x0 + 9, y0 + 6, x0 + 11, y0 + 12], fill=(150, 90, 60, 255))
x0, y0 = fill(135, (150, 212, 100, 255))                            # fairway (light stripes)
for y in range(0, 16, 4): d.line([x0, y0 + y, x0 + 15, y0 + y], fill=(164, 222, 116, 255))
x0, y0 = fill(136, (98, 186, 84, 255))                             # golf green / pitch
x0, y0 = fill(137, (238, 214, 156, 255))                           # sand
for x, y in [(3, 3), (11, 6), (6, 11), (13, 13)]: d.point((x0 + x, y0 + y), fill=(214, 186, 128, 255))
x0, y0 = gen(138)                                                  # rock
d.ellipse([x0 + 1, y0 + 3, x0 + 14, y0 + 14], fill=(150, 150, 160, 255), outline=(62, 39, 49, 255)); d.point((x0 + 5, y0 + 6), fill=(200, 200, 210, 255))
tiles.save("public/assets/tiles.png")

# ---------- grid ----------
S, N, W_, E = 52.6635, 52.6735, -6.2255, -6.2045                  # ~1.42 km x 1.11 km
M = 12.0                                                          # metres per tile
W = round((E - W_) * 111320 * math.cos(math.radians((S + N) / 2)) / M); H = round((N - S) * 111320 / M)
def xy(p): return ((p["lon"] - W_) / (E - W_) * W, (N - p["lat"]) / (N - S) * H)
els = json.load(open("scripts/osm/raw.json"))["elements"]
random.seed(42)

GRASS, FLOWERS, ROAD, PATH, WATER, WAVE, CARAVAN, FAIRWAY, GREEN, SAND, ROCK = 0, [1, 2], 25, 43, 132, 133, 134, 135, 136, 137, 138
TREES, BUSH, SIGN = [4, 16, 28, 16, 4, 3, 27], 5, 83
ground = [[random.choice([GRASS] * 10 + FLOWERS) for _ in range(W)] for _ in range(H)]
obj = [[-1] * W for _ in range(H)]; roof = [[-1] * W for _ in range(H)]

def mask(draw_fn):                                                # rasterise with PIL at 1 px = 1 tile
    im = Image.new("L", (W, H), 0); draw_fn(ImageDraw.Draw(im)); px = im.load()
    return [(x, y) for y in range(H) for x in range(W) if px[x, y]]
def poly(e): return mask(lambda dr: dr.polygon([xy(p) for p in e["geometry"]], fill=1)) if len(e.get("geometry", [])) > 2 else []
def line(e, w): return mask(lambda dr: dr.line([xy(p) for p in e["geometry"]], fill=1, width=w)) if len(e.get("geometry", [])) > 1 else []
ways = [e for e in els if e["type"] == "way"]
T = lambda e: e.get("tags", {})

# areas, painted in order (later wins)
def area(cond, fn):
    for e in ways:
        if cond(T(e)):
            for x, y in poly(e): fn(x, y)
area(lambda t: t.get("landuse") in ("farmland", "meadow") , lambda x, y: ground[y].__setitem__(x, random.choice([GRASS, GRASS, 1, 2])))
area(lambda t: t.get("golf") in ("fairway", "tee", "driving_range", "practice"), lambda x, y: ground[y].__setitem__(x, FAIRWAY))
area(lambda t: t.get("golf") == "green" or t.get("leisure") in ("pitch", "miniature_golf"), lambda x, y: ground[y].__setitem__(x, GREEN))
area(lambda t: t.get("golf") == "bunker" or t.get("natural") == "beach", lambda x, y: ground[y].__setitem__(x, SAND))
area(lambda t: t.get("amenity") == "parking" or t.get("leisure") == "playground", lambda x, y: ground[y].__setitem__(x, ROAD))
area(lambda t: t.get("natural") == "water" or "water_hazard" in t.get("golf", ""), lambda x, y: ground[y].__setitem__(x, WATER))
area(lambda t: t.get("natural") in ("wood", "scrub") or t.get("landuse") == "forest",
     lambda x, y: obj[y].__setitem__(x, random.choice(TREES) if random.random() < 0.85 else -1))
area(lambda t: t.get("natural") == "bare_rock", lambda x, y: obj[y].__setitem__(x, ROCK if random.random() < 0.5 else -1))

# sea: flood fill from the east edge, bounded by the coastline
coast = set()
for e in ways:
    if T(e).get("natural") == "coastline": coast |= set(line(e, 2))
stack, sea = [(W - 1, y) for y in range(H)], set()
while stack:
    x, y = stack.pop()
    if 0 <= x < W and 0 <= y < H and (x, y) not in sea and (x, y) not in coast:
        sea.add((x, y)); stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
for x, y in sea: ground[y][x] = random.choice([WATER] * 4 + [WAVE]); obj[y][x] = -1
for x, y in coast:                                                # shore = sand, plus 1 tile landward
    for dx in (-1, 0):
        if 0 <= x + dx < W and (x + dx, y) not in sea: ground[y][x + dx] = SAND; obj[y][x + dx] = -1 if obj[y][x + dx] != ROCK else ROCK

# lines: hedges, streams, then roads/paths on top (they clear obstacles, acting as gaps/bridges)
for e in ways:
    t = T(e)
    if t.get("barrier") == "hedge":
        for x, y in line(e, 1): obj[y][x] = BUSH if ground[y][x] not in (WATER, WAVE) else -1
    if t.get("waterway") in ("stream", "drain"):
        for x, y in line(e, 1): ground[y][x] = WATER; obj[y][x] = -1
ROADW = {"tertiary": 2, "unclassified": 2, "residential": 2, "track": 1}
PATHS = {"service", "path", "footway", "steps", "cycleway", "bridleway"}
for e in ways:
    t = T(e); h = t.get("highway")
    if h in ROADW or h in PATHS or t.get("golf") in ("cartpath", "path"):
        tile = ROAD if h in ROADW else PATH
        for x, y in line(e, ROADW.get(h, 1)):
            if ground[y][x] not in (WATER, WAVE) or (x, y) not in sea:
                ground[y][x] = tile if not (tile == PATH and ground[y][x] == ROAD) else ROAD; obj[y][x] = -1

# buildings: stamp tidy houses (roof rows on the 'roofs' layer above the player, wall row collides)
used = set()
def free(x0, y0, w, h):
    return all(0 <= x < W and 0 <= y < H and (x, y) not in used and ground[y][x] not in (ROAD, WATER, WAVE)
               for x in range(x0 - 1, x0 + w + 1) for y in range(y0 - 1, y0 + h + 1))
blds = sorted([e for e in ways if "building" in T(e) and e.get("geometry")], key=lambda e: -len(e["geometry"]) - ("name" in T(e)) * 100)
labels = []
for e in blds:
    pts = [xy(p) for p in e["geometry"]]; cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    if not (1 <= cx < W - 1 and 1 <= cy < H - 1): continue
    t = T(e)
    if t["building"] == "static_caravan":
        x, y = int(cx), int(cy)
        if (x, y) not in used and ground[y][x] not in (ROAD, WATER, WAVE): obj[y][x] = CARAVAN; used.add((x, y))
        continue
    bw = (max(p[0] for p in pts) - min(p[0] for p in pts))
    w = 4 if (bw > 2.2 or "name" in t) else 3; h = 3
    x0, y0 = int(cx - w / 2 + 0.5), int(cy - h / 2 + 0.5)
    if not free(x0, y0, w, h):
        if t["building"] in ("shed", "garage", "greenhouse", "hut"): continue
        if free(x0, y0, 3, 2): w, h = 3, 2
        elif free(x0, y0, 2, 2): w, h = 2, 2
        else: continue
    redroof = random.random() < 0.6; r = 52 if redroof else 48
    top = [r] + [r + 1] * (w - 2) + [r + 2]; mid = [r + 12] + [r + 13] * (w - 2) + [r + 14]
    wall = ([72] + [73] * (w - 2) + [75]) if redroof else ([76] + [77] * (w - 2) + [79])
    wall[w // 2] = 74 if redroof else 78
    if w == 2: wall = [74, 75] if redroof else [78, 79]                         # door
    rows = ([top, mid] if h == 3 else [mid]) + [wall]
    for dy, rowt in enumerate(rows):
        for dx, tt in enumerate(rowt):
            X, Y = x0 + dx, y0 + dy; used.add((X, Y)); obj[Y][X] = -1
            if dy == len(rows) - 1: obj[Y][X] = tt
            else: roof[Y][X] = tt
    for dx in range(w): ground[y0 + h - 1][x0 + dx] = GRASS if ground[y0 + h - 1][x0 + dx] in (WATER, WAVE) else ground[y0 + h - 1][x0 + dx]
    if y0 + h < H and ground[y0 + h][x0 + w // 2] not in (ROAD,): ground[y0 + h][x0 + w // 2] = PATH; obj[y0 + h][x0 + w // 2] = -1

# named places -> sign + floating label (Tiled point objects)
WANT = {"The Orphan Girl": "The Orphan Girl (pub)", "The Orphan Girl Chipper and Shop": "Chipper & Shop", "Tara Green": "Tara Green",
        "Tara Cove Mobiles": "Tara Cove", "Kiltennel House": "Kiltennel House", "Duffcarrig House": "Duffcarrig House",
        "Duffcarrig Rocks Beach": "Duffcarrig Beach", "Duffcarrick Rocks": "Duffcarrick Rocks", "Tara Glen Golf and Country Club": "Tara Glen Golf Club",
        "Seafield Golf Course": "Seafield Golf", "Tara Meadows Holiday Home Park": "Tara Meadows", "Astro Turf Football Field": "Astro pitch",
        "Duffcarrig Rocks Road": "Duffcarrig Rocks Rd", "Kiltennel Demesne": "Kiltennel"}
seen = set()
for e in els:
    n = T(e).get("name")
    if n not in WANT or n in seen: continue
    if e["type"] == "node": cx, cy = xy(e)
    else:
        pts = [xy(p) for p in e["geometry"]]; cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    best = None                                                   # nearest walkable non-road cell next to a road, else any free cell
    for r in range(0, 12):
        for y in range(int(cy) - r, int(cy) + r + 1):
            for x in range(int(cx) - r, int(cx) + r + 1):
                if 1 <= x < W - 1 and 2 <= y < H - 1 and obj[y][x] == -1 and roof[y][x] == -1 and (x, y) not in used \
                        and ground[y][x] not in (WATER, WAVE, ROAD, PATH):
                    best = best or (x, y)
        if best: break
    if not best: continue
    seen.add(n); x, y = best; obj[y][x] = SIGN
    labels.append({"id": len(labels) + 2, "name": WANT[n], "type": "label", "x": x * 16 + 8, "y": y * 16, "point": True,
                   "width": 0, "height": 0, "rotation": 0, "visible": True})

# spawn: road cell nearest the map centre
cx, cy = W / 2, H / 2
sx, sy = min(((x, y) for y in range(H) for x in range(W) if ground[y][x] == ROAD and obj[y][x] == -1),
             key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
objects = labels + [{"id": 1, "name": "spawn", "type": "spawn", "x": sx * 16 + 8, "y": sy * 16 + 8, "point": True,
                     "width": 0, "height": 0, "rotation": 0, "visible": True}]

flat = lambda g: [t + 1 for row in g for t in row]               # Tiled GIDs: 0 = empty, firstgid 1
layer = lambda i, n, g: {"id": i, "name": n, "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0, "opacity": 1, "visible": True, "data": flat(g)}
json.dump({"type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal", "renderorder": "right-down",
           "width": W, "height": H, "tilewidth": 16, "tileheight": 16, "infinite": False, "nextlayerid": 5, "nextobjectid": len(objects) + 1,
           "layers": [layer(1, "ground", ground), layer(2, "objects", obj), layer(3, "roofs", roof),
                      {"id": 4, "name": "markers", "type": "objectgroup", "x": 0, "y": 0, "opacity": 1, "visible": True, "draworder": "topdown", "objects": objects}],
           "tilesets": [{"firstgid": 1, "name": "tiles", "image": "tiles.png", "imagewidth": 192, "imageheight": 192,
                         "tilewidth": 16, "tileheight": 16, "columns": 12, "tilecount": 144, "margin": 0, "spacing": 0}]},
          open("public/assets/map.json", "w"), separators=(",", ":"))
print(f"{W}x{H} tiles, spawn {sx},{sy}, labels: {[l['name'] for l in labels]}")
if len(sys.argv) > 2:                                             # quick preview render
    img = Image.new("RGBA", (W * 16, H * 16))
    for g in (ground, obj, roof):
        for y in range(H):
            for x in range(W):
                t = g[y][x]
                if t >= 0: tl = tiles.crop(((t % 12) * 16, (t // 12) * 16, (t % 12) * 16 + 16, (t // 12) * 16 + 16)); img.alpha_composite(tl, (x * 16, y * 16))
    img.save(sys.argv[2])
