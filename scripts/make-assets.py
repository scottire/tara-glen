# Builds public/assets/tiles.png (Kenney Tiny Town + 2 generated water tiles) and a Tiled-format map.json (40x40).
# Usage: python3 scripts/make-assets.py path/to/kenney/tilemap_packed.png
import json, random, sys
from PIL import Image, ImageDraw
src = Image.open(sys.argv[1]).convert("RGBA")          # 192x176 = 12 cols x 11 rows of 16px
tiles = Image.new("RGBA", (192, 192), (0, 0, 0, 0)); tiles.paste(src, (0, 0))
for i, wave in enumerate([False, True]):               # tiles 132, 133 = water
    x0, y0 = i * 16, 176; d = ImageDraw.Draw(tiles)
    d.rectangle([x0, y0, x0 + 15, y0 + 15], fill=(76, 150, 216, 255))
    if wave:
        for (x, y) in [(2, 4), (9, 10)]: d.line([x0 + x, y0 + y, x0 + x + 4, y0 + y], fill=(170, 215, 245, 255))
tiles.save("public/assets/tiles.png")

W = H = 40; random.seed(7)
GRASS, FLOWERS, PATH, SAND, WATER, WAVE = 0, [1, 2], 43, 25, 132, 133
TREES = [4, 16, 28, 3, 27]
ground = [[random.choice([GRASS] * 8 + FLOWERS) for _ in range(W)] for _ in range(H)]
obj = [[-1] * W for _ in range(H)]
for y in range(H):                                      # sea along the bottom-right, wavy shoreline
    shore = 31 + int(2 * __import__("math").sin(y / 4)) - max(0, y - 28) // 2
    for x in range(W):
        if x + (y // 3) >= shore + 12: ground[y][x] = random.choice([WATER] * 5 + [WAVE])
        elif x + (y // 3) >= shore + 9: ground[y][x] = SAND
for x in range(3, 30): ground[20][x] = PATH             # paths
for y in range(4, 34): ground[y][14] = PATH
def house(x, y, roof):                                  # 3x3 house, door at bottom middle
    rows = [[roof, roof + 1, roof + 2], [roof + 12, roof + 13, roof + 14], [72, 74, 75]]
    for dy, r in enumerate(rows):
        for dx, t in enumerate(r): obj[y + dy][x + dx] = t
house(9, 15, 52); house(16, 9, 48); house(17, 22, 52)
ground[18][10] = ground[19][10] = PATH; ground[12][17] = ground[13][17] = PATH
for _ in range(140):                                    # scatter trees on free grass, keep spawn area clear
    x, y = random.randrange(W), random.randrange(H)
    if ground[y][x] in [GRASS] + FLOWERS and obj[y][x] == -1 and not (11 <= x <= 17 and 17 <= y <= 23):
        obj[y][x] = random.choice(TREES)
for x in range(0, 12): obj[0][x] = obj[H - 1][x] = 16  # forest edge
for y in range(H):
    if ground[y][0] != PATH: obj[y][0] = 16
flat = lambda g: [t + 1 for row in g for t in row]      # Tiled GIDs: 0 = empty, firstgid 1
layer = lambda i, n, g: {"id": i, "name": n, "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0,
                         "opacity": 1, "visible": True, "data": flat(g)}
json.dump({"type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal",
           "renderorder": "right-down", "width": W, "height": H, "tilewidth": 16, "tileheight": 16,
           "infinite": False, "nextlayerid": 3, "nextobjectid": 1,
           "layers": [layer(1, "ground", ground), layer(2, "objects", obj)],
           "tilesets": [{"firstgid": 1, "name": "tiles", "image": "tiles.png", "imagewidth": 192, "imageheight": 192,
                         "tilewidth": 16, "tileheight": 16, "columns": 12, "tilecount": 144, "margin": 0, "spacing": 0}]},
          open("public/assets/map.json", "w"))
print("ok")
