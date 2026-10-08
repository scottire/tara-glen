# Builds sprite art: public/assets/tiles.png (Ninja Adventure tileset, used for trees + collision layer), caravan sheets,
# clubhouse, bike, sea overlays and props/*.png.  Usage: python3 scripts/make-art.py <ninja tileset.png> [props-sheet.png]
import math, random, sys
from PIL import Image, ImageDraw
random.seed(1)
src = Image.open(sys.argv[1]).convert("RGBA"); C = 28
def tile(i): return src.crop(((i % C) * 16, (i // C) * 16, (i % C) * 16 + 16, (i // C) * 16 + 16))
src.save("public/assets/tiles.png")
OL = (52, 36, 46, 255)
def new(w, h): im = Image.new("RGBA", (w, h)); return im, ImageDraw.Draw(im)
def mix(c, f): return tuple(max(0, min(255, int(v * f))) for v in c[:3]) + (255,)

# ---------- caravans (placeholders; 3 variants per sheet; swap these two PNGs for real models) ----------
VAR = [  # roof, wall, stripe, skirt
    ((214, 218, 222), (242, 234, 212), (190, 112, 74), (120, 110, 100)),
    ((226, 220, 204), (246, 246, 242), (84, 150, 104), (104, 112, 104)),
    ((206, 214, 210), (214, 228, 238), (66, 88, 150), (96, 104, 118))]
def window(d, x, y, w, h):
    d.rectangle([x, y, x + w, y + h], fill=(250, 250, 248, 255), outline=OL)
    d.rectangle([x + 1, y + 1, x + w - 1, y + h - 1], fill=(104, 160, 206, 255))
    d.line([x + 1, y + 1, x + w - 1, y + 1], fill=(170, 210, 236, 255))
    d.rectangle([x + 1, y + 1, x + 2, y + h - 1], fill=(236, 226, 196, 255)); d.rectangle([x + w - 2, y + 1, x + w - 1, y + h - 1], fill=(236, 226, 196, 255))
def caravan(w, h, v, vertical):
    roof, wall, stripe, skirt = v
    im, d = new(w, h); wall_h = 15; rt = h - wall_h - 2                       # roof bottom
    d.rectangle([1, rt, w - 2, h - 2], fill=wall + (255,), outline=OL)          # wall
    d.rectangle([2, h - 6, w - 3, h - 3], fill=skirt + (255,))                  # skirt
    for x in range(4, w - 3, 4): d.line([x, h - 6, x, h - 3], fill=mix(skirt, 0.8))
    d.line([2, rt + 4, w - 3, rt + 4], fill=stripe + (255,), width=2)
    d.rectangle([w - 5, rt + 1, w - 3, h - 7], fill=mix(wall, 0.88))           # end shading
    d.rounded_rectangle([0, 0, w - 1, rt + 1], 3, fill=roof + (255,), outline=OL)  # roof with overhang
    for y in range(2, rt):                                                     # vertical shading: light top, darker eave
        f = 1.1 - 0.18 * y / rt; d.line([2, y, w - 3, y], fill=mix(roof, f))
    for y in range(5, rt - 1, 4): d.line([3, y, w - 4, y], fill=mix(roof, 0.9 - 0.1 * y / rt))
    d.line([2, rt, w - 3, rt], fill=mix(roof, 0.6))                            # gutter
    d.line([3, 2, 3, rt - 1], fill=mix(roof, 1.15)); d.line([w - 4, 2, w - 4, rt - 1], fill=mix(roof, 0.8))
    if vertical:
        for sy in (12, rt - 22): d.rectangle([w // 2 - 6, sy, w // 2 + 5, sy + 7], fill=(150, 190, 214, 255), outline=mix(roof, 0.55))
        d.rectangle([8, rt // 2 - 2, 13, rt // 2 + 3], fill=(150, 150, 150, 255), outline=mix(roof, 0.5))
        window(d, w // 2 - 8, rt + 3, 16, 7)
    else:
        d.rectangle([w // 2 - 6, 6, w // 2 + 5, 13], fill=(150, 190, 214, 255), outline=mix(roof, 0.55))
        d.rectangle([10, 9, 15, 14], fill=(150, 150, 150, 255), outline=mix(roof, 0.5))
        window(d, 5, rt + 2, 14, 7); window(d, w - 22, rt + 2, 14, 7)
        dx = w // 2 - 2; d.rectangle([dx, rt + 2, dx + 8, h - 4], fill=(160, 104, 70, 255), outline=OL)
        d.point((dx + 6, rt + 8), fill=(250, 220, 120, 255))
        d.rectangle([dx - 3, h - 4, dx + 11, h - 1], fill=(150, 150, 146, 255), outline=OL)  # step
    return im
for name, (w, h, vert) in {"caravan-h": (72, 48, False), "caravan-v": (48, 80, True)}.items():
    sheet = Image.new("RGBA", (w * 3, h))
    for k, v in enumerate(VAR): sheet.paste(caravan(w, h, v, vert), (k * w, 0))
    sheet.save(f"public/assets/{name}.png")

# ---------- clubhouse: hipped slate roof, cream walls, porch ----------
CW, CH, RH = 192, 136, 84
im, d = new(CW, CH)
d.rectangle([4, RH - 4, CW - 5, CH - 3], fill=(238, 228, 204, 255), outline=OL)              # walls
d.rectangle([5, CH - 9, CW - 6, CH - 4], fill=(150, 140, 128, 255))                          # plinth
for x in (14, 44, 132, 162): window(d, x, RH + 10, 18, 16)
d.rectangle([CW // 2 - 22, RH - 2, CW // 2 + 21, RH + 4], fill=(70, 80, 70, 255), outline=OL)   # porch canopy
d.rectangle([CW // 2 - 12, RH + 12, CW // 2 + 11, CH - 4], fill=(120, 76, 50, 255), outline=OL)  # double door
d.line([CW // 2, RH + 12, CW // 2, CH - 4], fill=OL)
d.rectangle([CW // 2 - 26, RH + 4, CW // 2 - 23, CH - 4], fill=(240, 240, 236, 255), outline=OL); d.rectangle([CW // 2 + 22, RH + 4, CW // 2 + 25, CH - 4], fill=(240, 240, 236, 255), outline=OL)
roof = (92, 104, 124)
d.polygon([(0, RH), (CW - 1, RH), (CW - 26, 8), (25, 8)], fill=roof + (255,), outline=OL)   # front face
d.polygon([(0, RH), (25, 8), (6, 16)], fill=mix(roof, 0.75), outline=OL)                    # hip ends
d.polygon([(CW - 1, RH), (CW - 26, 8), (CW - 7, 16)], fill=mix(roof, 0.75), outline=OL)
for y in range(14, RH - 1, 6):                                                               # slate courses
    t = (y - 8) / (RH - 8); x0 = 25 - 25 * t + 1; x1 = CW - 26 + 25 * t - 1
    d.line([x0, y, x1, y], fill=mix(roof, 0.82))
    for x in range(int(x0) + (y // 6 % 2) * 4, int(x1), 8): d.line([x, y - 5, x, y], fill=mix(roof, 0.88))
d.line([25, 8, CW - 26, 8], fill=mix(roof, 1.35), width=2)                                   # ridge
d.rectangle([40, 0, 49, 22], fill=(170, 100, 80, 255), outline=OL); d.rectangle([CW - 50, 0, CW - 41, 22], fill=(170, 100, 80, 255), outline=OL)  # chimneys
d.rectangle([CW // 2 - 34, RH - 18, CW // 2 + 33, RH - 7], fill=(40, 70, 50, 255), outline=OL)  # sign
d.text((CW // 2 - 28, RH - 18), "CLUBHOUSE", fill=(240, 220, 150, 255))
im.save("public/assets/clubhouse.png")

# ---------- bike: 4 directions (down, up, left, right) x 2 wheel frames, 24x24, drawn under the player ----------
FR, TY = (200, 50, 50, 255), (30, 30, 34, 255)
bike = Image.new("RGBA", (24 * 4, 24 * 2))
for f in range(2):
    for di in range(4):
        im, d = new(24, 24)
        if di < 2:                                                       # facing down/up: bike seen end-on
            near, far = (17, 23), (6, 11)
            d.rectangle([10, far[0], 13, far[1]], fill=TY); d.line([11, 9, 11, 18], fill=FR, width=2)
            d.rectangle([10, near[0], 13, near[1]], fill=TY); d.point((11 + f, near[0] + 2 + f), fill=(150, 150, 150, 255))
            hy = 16 if di == 0 else 8; d.line([5, hy, 18, hy], fill=(90, 90, 96, 255)); d.point((5, hy), fill=TY); d.point((18, hy), fill=TY)
        else:
            for cx in (5, 18):
                d.ellipse([cx - 4, 15, cx + 4, 23], outline=TY, width=2)
                a = f * math.pi / 4; d.line([cx - 3 * math.cos(a), 19 - 3 * math.sin(a), cx + 3 * math.cos(a), 19 + 3 * math.sin(a)], fill=(150, 150, 150, 255))
            d.line([5, 19, 11, 19], fill=FR, width=2); d.line([11, 19, 16, 13], fill=FR, width=2); d.line([5, 19, 9, 13], fill=FR, width=2); d.line([9, 13, 16, 13], fill=FR, width=2)
            d.line([16, 13, 18, 19], fill=FR); d.line([16, 13, 17, 10], fill=(90, 90, 96, 255), width=2); d.rectangle([7, 11, 11, 12], fill=TY)
            if di == 2: im = im.transpose(Image.FLIP_LEFT_RIGHT)
        bike.paste(im, (di * 24, f * 24))
bike.save("public/assets/bike.png")

# ---------- sea overlays: wave highlights (tiled) and shoreline foam (period 256px, matches make-world shore) ----------
im, d = new(96, 96)
for x, y in [(8, 10), (52, 30), (20, 60), (70, 78), (80, 8)]: d.arc([x, y, x + 14, y + 6], 200, 340, fill=(200, 232, 250, 200))
im.save("public/assets/waves.png")
def shore(y): return 6 * math.sin(2 * math.pi * y / 256) + 3 * math.sin(2 * math.pi * y / 128)
im, d = new(32, 256); px = im.load()
for y in range(256):
    x0 = 16 + shore(y)
    for x in range(32):
        dx = x - x0
        if -3 <= dx <= 1 or (dx < -3 and dx > -7 and (x * 7 + y * 3) % 5 == 0): px[x, y] = (255, 255, 255, 230 if dx >= -3 else 140)
im.save("public/assets/foam.png")

# ---------- props ----------
P = {}
im, d = new(48, 24)                                                                   # football goal (top-down)
for x in range(4, 44, 4): d.line([x, 4, x, 18], fill=(255, 255, 255, 120))
for y in range(4, 19, 4): d.line([4, y, 44, y], fill=(255, 255, 255, 120))
for r in ([2, 2, 45, 4], [2, 2, 5, 21], [42, 2, 45, 21]): d.rectangle(r, fill=(250, 250, 250, 255), outline=OL)
P["goal"] = im
im, d = new(96, 16)                                                                   # tennis net (stretched to the court width)
d.rectangle([2, 4, 93, 11], fill=(30, 30, 30, 150)); [d.line([x, 4, x, 11], fill=(220, 220, 220, 170)) for x in range(4, 92, 3)]
d.rectangle([2, 3, 93, 5], fill=(250, 250, 250, 255)); d.rectangle([0, 1, 3, 14], fill=(90, 90, 90, 255), outline=OL); d.rectangle([92, 1, 95, 14], fill=(90, 90, 90, 255), outline=OL)
P["tennis-net"] = im
WOOD, WOODD, WOODL = (176, 112, 64, 255), (124, 74, 44, 255), (206, 146, 90, 255)
im, d = new(32, 20)                                                                   # bench
d.rectangle([1, 2, 30, 7], fill=WOOD, outline=OL); d.line([2, 3, 29, 3], fill=WOODL); d.rectangle([1, 8, 30, 13], fill=WOOD, outline=OL); d.line([2, 9, 29, 9], fill=WOODL)
d.rectangle([3, 14, 6, 18], fill=WOODD, outline=OL); d.rectangle([25, 14, 28, 18], fill=WOODD, outline=OL); P["bench"] = im
im, d = new(32, 30)                                                                   # picnic table
d.rectangle([0, 2, 31, 6], fill=WOOD, outline=OL); d.rectangle([3, 9, 28, 20], fill=WOOD, outline=OL); d.line([4, 10, 27, 10], fill=WOODL)
d.line([4, 14, 27, 14], fill=WOODD); d.rectangle([0, 22, 31, 26], fill=WOOD, outline=OL)
d.rectangle([5, 26, 8, 29], fill=WOODD); d.rectangle([23, 26, 26, 29], fill=WOODD); P["picnic-table"] = im
im, d = new(14, 18)                                                                   # bin
d.rectangle([1, 4, 12, 16], fill=(60, 120, 80, 255), outline=OL); d.rectangle([0, 1, 13, 5], fill=(80, 150, 100, 255), outline=OL)
d.line([4, 7, 4, 14], fill=(40, 90, 60, 255)); d.line([9, 7, 9, 14], fill=(40, 90, 60, 255)); P["bin"] = im
im, d = new(14, 44)                                                                   # lamp post
d.rectangle([5, 8, 8, 41], fill=(70, 74, 84, 255), outline=OL); d.line([6, 9, 6, 40], fill=(110, 116, 128, 255))
d.rectangle([1, 0, 12, 8], fill=(70, 74, 84, 255), outline=OL); d.rectangle([3, 4, 10, 8], fill=(255, 236, 150, 255)); d.rectangle([3, 40, 10, 43], fill=(60, 60, 70, 255), outline=OL); P["lamp"] = im
im, d = new(28, 32)                                                                   # signpost
d.rectangle([12, 10, 15, 31], fill=WOODD, outline=OL)
d.polygon([(1, 2), (21, 2), (27, 7), (21, 12), (1, 12)], fill=WOODL, outline=OL); d.line([4, 6, 18, 6], fill=WOODD); d.line([4, 9, 14, 9], fill=WOODD); P["signpost"] = im
im, d = new(32, 18)                                                                   # fence
for x in (1, 14, 27): d.rectangle([x, 2, x + 3, 17], fill=WOOD, outline=OL)
d.rectangle([0, 5, 31, 8], fill=WOOD, outline=OL); d.rectangle([0, 11, 31, 14], fill=WOOD, outline=OL); P["fence"] = im
im, d = new(32, 22)                                                                   # hedge
d.rounded_rectangle([0, 1, 31, 20], 6, fill=(56, 118, 58, 255), outline=OL)
for x, y in [(4, 4), (12, 3), (20, 5), (8, 9), (17, 10), (24, 9)]: d.ellipse([x, y, x + 6, y + 5], fill=(92, 162, 78, 255)); d.point((x + 2, y + 1), fill=(150, 210, 110, 255))
d.line([2, 18, 29, 18], fill=(40, 90, 46, 255)); P["hedge"] = im
im, d = new(32, 20)                                                                   # flower bed
d.rounded_rectangle([0, 3, 31, 19], 4, fill=(118, 78, 52, 255), outline=OL)
for k, (x, y) in enumerate([(3, 4), (11, 2), (19, 4), (7, 9), (15, 9), (23, 8)]): im.alpha_composite(tile(225 if k % 2 else 226).crop((2, 2, 14, 14)).resize((10, 10)), (x, y))
P["flowerbed"] = im
def car(body):  # facing up/down (parked in bays), 26 wide x 40 long
    im, d = new(26, 40); dk = mix(body, 0.75)
    d.rounded_rectangle([1, 1, 24, 38], 6, fill=body + (255,), outline=OL)
    d.rounded_rectangle([4, 9, 21, 30], 3, fill=dk, outline=OL)
    d.rectangle([5, 10, 20, 14], fill=(150, 200, 230, 255)); d.rectangle([5, 26, 20, 29], fill=(120, 170, 205, 255))
    d.line([3, 3, 22, 3], fill=mix(body, 1.25)); d.rectangle([3, 1, 6, 2], fill=(255, 240, 170, 255)); d.rectangle([19, 1, 22, 2], fill=(255, 240, 170, 255))
    d.rectangle([3, 37, 6, 38], fill=(220, 60, 60, 255)); d.rectangle([19, 37, 22, 38], fill=(220, 60, 60, 255))
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
im, d = new(32, 24)                                                                   # crazy-golf hut
d.rectangle([6, 10, 25, 22], fill=(240, 200, 120, 255), outline=OL); d.polygon([(3, 11), (16, 2), (28, 11)], fill=(200, 70, 60, 255), outline=OL)
d.rectangle([13, 16, 18, 22], fill=(40, 40, 40, 255)); P["minigolf-hut"] = im
for k, v in P.items(): v.save(f"public/assets/props/{k}.png")
print("props:", list(P))
if len(sys.argv) > 2:                                                                 # contact sheet, 3x
    cell, cols = 64, 6; rows = (len(P) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * (cell + 10)), (112, 168, 80, 255)); d = ImageDraw.Draw(sheet)
    for k, (n, v) in enumerate(P.items()):
        x, y = (k % cols) * cell, (k // cols) * (cell + 10)
        sheet.alpha_composite(v.crop((0, 0, min(v.width, cell), v.height)), (x + max(0, (cell - v.width) // 2), y + max(0, (cell - v.height) // 2))); d.text((x + 2, y + cell - 2), n, fill=(0, 0, 0, 255))
    cv, vv, cb, bk = (Image.open(f"public/assets/{n}.png") for n in ("caravan-h", "caravan-v", "clubhouse", "bike"))
    full = Image.new("RGBA", (max(sheet.width, cv.width + vv.width + cb.width + 24), sheet.height + 150), (112, 168, 80, 255))
    full.alpha_composite(sheet, (0, 0)); y0 = sheet.height + 6
    full.alpha_composite(cv, (0, y0)); full.alpha_composite(vv, (cv.width + 8, y0)); full.alpha_composite(cb, (cv.width + vv.width + 16, y0))
    pl = Image.open("public/assets/player.png")
    for di in range(4):
        full.alpha_composite(bk.crop((di * 24, 0, di * 24 + 24, 24)), (di * 30, y0 + 60)); full.alpha_composite(pl.crop((di * 16, 0, di * 16 + 16, 16)), (di * 30 + 4, y0 + 60 + 1))
    full.resize((full.width * 3, full.height * 3), Image.NEAREST).save(sys.argv[2])
