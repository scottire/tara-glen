# Builds the art: public/assets/tiles.png (Ninja Adventure tileset + generated row), caravan sheets, props/*.png
# Usage: python3 scripts/make-art.py path/to/ninja-adventure/background-elements/tileset.png [props-sheet.png]
import sys
from PIL import Image, ImageDraw
src = Image.open(sys.argv[1]).convert("RGBA")                   # 448x640 = 28 cols x 40 rows, 16px
C = 28
def tile(i): return src.crop(((i % C) * 16, (i // C) * 16, (i % C) * 16 + 16, (i // C) * 16 + 16))
out = Image.new("RGBA", (448, 656), (0, 0, 0, 0)); out.paste(src, (0, 0))
EXTRA = 1120                                                    # generated row starts here
def put(k, im): out.paste(im, ((k % C) * 16, (k // C) * 16))
# 1120..1132: dirt-in-grass autotile recoloured to tarmac grey (TL,T,TR,L,C,R,BL,B,BR, inner SE,SW,NE,NW)
DIRT = [440, 441, 442, 468, 469, 470, 496, 497, 498, 438, 439, 466, 467]
for k, i in enumerate(DIRT):
    t = tile(i); px = t.load()
    for y in range(16):
        for x in range(16):
            r, g, b, a = px[x, y]
            if a and r - b > 45 and r > g + 15:                  # brown -> warm grey tarmac
                v = int(0.35 * r + 0.5 * g + 0.15 * b) + 22; px[x, y] = (v - 4, v - 2, v + 6, a)
    put(EXTRA + k, t)
def shade(i, f, tint=(0, 0, 0)):
    t = tile(i); px = t.load()
    for y in range(16):
        for x in range(16):
            r, g, b, a = px[x, y]; px[x, y] = (min(255, int(r * f) + tint[0]), min(255, int(g * f) + tint[1]), min(255, int(b * f) + tint[2]), a)
    return t
put(1133, shade(330, 1.08)); put(1134, shade(330, 0.94))         # pitch stripes
put(1135, shade(330, 1.12, (10, 8, 0))); put(1136, shade(330, 1.2, (16, 12, 0)))  # golf fairway stripes
out.save("public/assets/tiles.png")

# ---------- caravans: 3 colour variants, horizontal 72x48 and vertical 48x80 ----------
OL = (52, 36, 46, 255)
VAR = [((240, 232, 210), (196, 120, 80)), ((244, 244, 240), (90, 160, 110)), ((214, 228, 238), (70, 90, 150))]
def caravan(w, h, wall_h, body, stripe, vertical):
    im = Image.new("RGBA", (w, h)); d = ImageDraw.Draw(im)
    d.rectangle([3, h - 4, w - 4, h - 1], fill=(30, 40, 30, 110))                     # ground shadow
    rt = h - wall_h - 3                                                               # roof bottom y
    d.rounded_rectangle([1, 1, w - 2, rt + 2], 4, fill=(206, 210, 214, 255), outline=OL)
    for y in range(6, rt, 5): d.line([4, y, w - 5, y], fill=(186, 190, 196, 255))      # roof ribs
    d.line([3, 3, w - 4, 3], fill=(236, 238, 240, 255))
    d.rectangle([1, rt + 2, w - 2, h - 4], fill=body + (255,), outline=OL)           # wall
    d.line([2, rt + 7, w - 3, rt + 7], fill=stripe + (255,), width=2)                 # stripe
    if vertical:
        d.rectangle([w // 2 - 7, rt + 4, w // 2 + 6, rt + 9], fill=(120, 175, 215, 255), outline=OL)
    else:
        for wx in (6, w - 22): d.rectangle([wx, rt + 4, wx + 14, rt + 9], fill=(120, 175, 215, 255), outline=OL)
        dx = w // 2 - 4; d.rectangle([dx, rt + 4, dx + 8, h - 4], fill=(150, 96, 64, 255), outline=OL)
        d.rectangle([dx - 3, h - 4, dx + 11, h - 2], fill=(140, 140, 140, 255), outline=OL)  # step
    return im
for name, (w, h, v) in {"caravan-h": (72, 48, False), "caravan-v": (48, 80, True)}.items():
    sheet = Image.new("RGBA", (w * 3, h))
    for k, (body, stripe) in enumerate(VAR): sheet.paste(caravan(w, h, 16, body, stripe, v), (k * w, 0))
    sheet.save(f"public/assets/{name}.png")

# ---------- props ----------
P = {}
def new(w, h): im = Image.new("RGBA", (w, h)); return im, ImageDraw.Draw(im)
im, d = new(48, 24)                                                                   # football goal (top-down)
for x in range(4, 44, 4): d.line([x, 4, x, 18], fill=(255, 255, 255, 120))
for y in range(4, 19, 4): d.line([4, y, 44, y], fill=(255, 255, 255, 120))
d.rectangle([2, 2, 45, 4], fill=(250, 250, 250, 255), outline=OL); d.rectangle([2, 2, 5, 21], fill=(250, 250, 250, 255), outline=OL)
d.rectangle([42, 2, 45, 21], fill=(250, 250, 250, 255), outline=OL); P["goal"] = im
im, d = new(96, 16)                                                                   # tennis net
d.rectangle([2, 4, 93, 11], fill=(30, 30, 30, 140)); [d.line([x, 4, x, 11], fill=(220, 220, 220, 160)) for x in range(4, 92, 3)]
d.rectangle([2, 3, 93, 5], fill=(250, 250, 250, 255)); d.rectangle([0, 1, 3, 14], fill=(90, 90, 90, 255), outline=OL); d.rectangle([92, 1, 95, 14], fill=(90, 90, 90, 255), outline=OL); P["tennis-net"] = im
WOOD, WOODD = (176, 112, 64, 255), (124, 74, 44, 255)
im, d = new(32, 20)                                                                   # bench
d.rectangle([1, 2, 30, 7], fill=WOOD, outline=OL); d.rectangle([1, 8, 30, 13], fill=WOOD, outline=OL)
d.rectangle([3, 14, 6, 18], fill=WOODD, outline=OL); d.rectangle([25, 14, 28, 18], fill=WOODD, outline=OL); P["bench"] = im
im, d = new(32, 30)                                                                   # picnic table
d.rectangle([0, 2, 31, 6], fill=WOOD, outline=OL); d.rectangle([3, 9, 28, 20], fill=WOOD, outline=OL)
d.line([4, 14, 27, 14], fill=WOODD); d.rectangle([0, 22, 31, 26], fill=WOOD, outline=OL)
d.rectangle([5, 26, 8, 29], fill=WOODD); d.rectangle([23, 26, 26, 29], fill=WOODD); P["picnic-table"] = im
im, d = new(14, 18)                                                                   # bin
d.rectangle([1, 4, 12, 16], fill=(60, 120, 80, 255), outline=OL); d.rectangle([0, 1, 13, 5], fill=(80, 150, 100, 255), outline=OL)
d.line([4, 7, 4, 14], fill=(40, 90, 60, 255)); d.line([9, 7, 9, 14], fill=(40, 90, 60, 255)); P["bin"] = im
im, d = new(14, 44)                                                                   # lamp post
d.rectangle([5, 8, 8, 41], fill=(70, 74, 84, 255), outline=OL); d.rectangle([1, 0, 12, 8], fill=(70, 74, 84, 255), outline=OL)
d.rectangle([3, 4, 10, 8], fill=(255, 236, 150, 255)); d.rectangle([3, 40, 10, 43], fill=(60, 60, 70, 255), outline=OL); P["lamp"] = im
P["sign"] = tile(239)
im, d = new(32, 18)                                                                   # fence
for x in (1, 14, 27): d.rectangle([x, 2, x + 3, 17], fill=WOOD, outline=OL)
d.rectangle([0, 5, 31, 8], fill=WOOD, outline=OL); d.rectangle([0, 11, 31, 14], fill=WOOD, outline=OL); P["fence"] = im
im, d = new(32, 20)                                                                   # hedge
d.rounded_rectangle([0, 1, 31, 18], 6, fill=(62, 130, 62, 255), outline=OL)
for x, y in [(5, 5), (13, 4), (21, 6), (9, 10), (24, 11)]: d.ellipse([x, y, x + 5, y + 4], fill=(96, 168, 80, 255))
P["hedge"] = im
im, d = new(32, 20)                                                                   # flower bed
d.rounded_rectangle([0, 3, 31, 19], 4, fill=(118, 78, 52, 255), outline=OL)
for k, (x, y) in enumerate([(3, 4), (11, 2), (19, 4), (7, 9), (15, 9), (23, 8)]): im.alpha_composite(tile(225 if k % 2 else 226).crop((2, 2, 14, 14)).resize((10, 10)), (x, y))
P["flowerbed"] = im
def car(body):
    im, d = new(40, 28)
    d.rectangle([3, 24, 37, 27], fill=(30, 40, 30, 110))
    d.rounded_rectangle([1, 4, 38, 24], 5, fill=body + (255,), outline=OL)
    d.rounded_rectangle([9, 1, 30, 15], 3, fill=tuple(int(c * 0.8) for c in body) + (255,), outline=OL)
    d.rectangle([11, 9, 28, 14], fill=(150, 200, 230, 255), outline=OL)
    for x in (4, 30): d.rectangle([x, 22, x + 6, 26], fill=(30, 30, 34, 255))
    d.rectangle([2, 16, 5, 18], fill=(255, 240, 170, 255)); d.rectangle([34, 16, 37, 18], fill=(255, 240, 170, 255))
    return im
P["car-red"] = car((200, 60, 60)); P["car-blue"] = car((60, 100, 190)); P["car-silver"] = car((190, 194, 200))
im, d = new(18, 22)                                                                   # deckchair
d.polygon([(2, 2), (15, 2), (16, 13), (1, 13)], fill=(230, 80, 80, 255), outline=OL)
for x in (5, 10): d.line([x, 3, x, 12], fill=(250, 250, 250, 255), width=2)
d.rectangle([1, 13, 16, 17], fill=WOOD, outline=OL); d.line([2, 18, 2, 21], fill=OL); d.line([15, 18, 15, 21], fill=OL); P["deckchair"] = im
im, d = new(44, 22)                                                                   # windbreak
for k in range(5): d.rectangle([2 + k * 8, 3, 9 + k * 8, 16], fill=[(230, 70, 70, 255), (250, 250, 250, 255)][k % 2])
d.rectangle([2, 3, 41, 16], outline=OL)
for x in (1, 41): d.rectangle([x, 1, x + 2, 21], fill=WOODD, outline=OL)
P["windbreak"] = im
im, d = new(14, 30)                                                                   # golf flag
d.line([3, 2, 3, 26], fill=(240, 240, 240, 255), width=2); d.polygon([(4, 2), (13, 6), (4, 10)], fill=(230, 50, 50, 255), outline=OL)
d.ellipse([0, 25, 7, 29], fill=(40, 60, 40, 255)); P["golf-flag"] = im
im, d = new(32, 24)                                                                   # crazy-golf obstacle (little windmill hut)
d.rectangle([6, 10, 25, 22], fill=(240, 200, 120, 255), outline=OL); d.polygon([(3, 11), (16, 2), (28, 11)], fill=(200, 70, 60, 255), outline=OL)
d.rectangle([13, 16, 18, 22], fill=(40, 40, 40, 255)); P["minigolf-hut"] = im
def court(w, h, surf, tennis):                                                       # court surfaces, stretched to the court bbox
    im, d = new(w, h); line = (250, 250, 250, 255); m = 14
    d.rectangle([0, 0, w - 1, h - 1], fill=(70, 110, 70, 255)); d.rectangle([6, 6, w - 7, h - 7], fill=surf); d.rectangle([m, m, w - m - 1, h - m - 1], outline=line, width=2)
    if tennis:
        d.rectangle([m + 12, m, w - m - 13, h - m - 1], outline=line, width=1); d.line([w // 2, h // 2 - 40, w // 2, h // 2 + 40], fill=line)
        for yy in (h // 2 - 40, h // 2 + 40): d.line([m + 12, yy, w - m - 13, yy], fill=line)
    else:
        d.line([m, h // 2, w - m - 1, h // 2], fill=line, width=2); d.ellipse([w // 2 - 18, h // 2 - 18, w // 2 + 18, h // 2 + 18], outline=line, width=2)
    return im
COURTS = {"tennis": court(180, 240, (70, 130, 170, 255), True), "hardcourt": court(160, 144, (176, 96, 80, 255), False)}
for k, v in {**P, **COURTS}.items(): v.save(f"public/assets/props/{k}.png")
print("props:", list(P))
if len(sys.argv) > 2:                                                                 # contact sheet, 3x scale
    cell = 104; cols = 6; rows = (len(P) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * (cell + 10)), (120, 176, 88, 255)); d = ImageDraw.Draw(sheet)
    for k, (n, v) in enumerate(P.items()):
        x, y = (k % cols) * cell, (k // cols) * (cell + 10)
        sheet.alpha_composite(v, (x + (cell - v.width) // 2, y + max(0, (cell - v.height) // 2))); d.text((x + 2, y + cell - 2), n, fill=(0, 0, 0, 255))
    cv = Image.open("public/assets/caravan-h.png"); vv = Image.open("public/assets/caravan-v.png")
    full = Image.new("RGBA", (max(sheet.width, cv.width + vv.width + 8), sheet.height + 90), (120, 176, 88, 255))
    full.alpha_composite(sheet, (0, 0)); full.alpha_composite(cv, (0, sheet.height + 4)); full.alpha_composite(vv, (cv.width + 8, sheet.height + 4))
    pl = Image.open("public/assets/player.png").crop((0, 0, 16, 16)); full.alpha_composite(pl, (cv.width + vv.width + 16, sheet.height + 40))
    full.resize((full.width * 3, full.height * 3), Image.NEAREST).save(sys.argv[2])
