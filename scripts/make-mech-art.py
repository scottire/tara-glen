# Placeholder art for the indoor/metroidvania mechanics (procedural, CC0 like the rest).
# Outputs public/assets/: interior.png (16px tileset), baddie.png, npc.png (recoloured Ninja Adventure player),
# note.png, chest.png (closed/open), balloon.png, trainers.png, shell.png.   Usage: python3 scripts/make-mech-art.py
from PIL import Image, ImageDraw
import colorsys
A = "public/assets/"; OL = (40, 30, 30, 255)
def new(w, h): im = Image.new("RGBA", (w, h)); return im, ImageDraw.Draw(im)
# ---------- interior tileset: 8 cols x 2 rows ----------
# 0 floor  1 floor alt  2 wall face  3 wall top  4 rug  5 exit mat  6 bed head  7 bed foot
# 8 table  9 sofa L  10 sofa R  11 counter  12 telly  13 cupboard  14 wall window  15 plant
ts = Image.new("RGBA", (128, 32))
def T(k, fn): im, d = new(16, 16); fn(d); ts.paste(im, ((k % 8) * 16, (k // 8) * 16))
def floor(c):
    def f(d):
        d.rectangle([0, 0, 15, 15], fill=c)
        for y in (3, 7, 11, 15): d.line([0, y, 15, y], fill=tuple(int(v * .85) for v in c[:3]) + (255,))
        d.point((5, 1), fill=(120, 80, 50, 255)); d.point((12, 9), fill=(120, 80, 50, 255))
    return f
T(0, floor((196, 150, 104, 255))); T(1, floor((186, 140, 96, 255)))
def wallface(d): d.rectangle([0, 0, 15, 15], fill=(214, 200, 168, 255)); d.rectangle([0, 12, 15, 15], fill=(150, 110, 80, 255)); [d.line([x, 0, x, 11], fill=(200, 184, 150, 255)) for x in (3, 8, 13)]
T(2, wallface); T(3, lambda d: (d.rectangle([0, 0, 15, 15], fill=(70, 56, 52, 255)), d.line([0, 15, 15, 15], fill=(40, 30, 30, 255))))
T(4, lambda d: (d.rectangle([0, 0, 15, 15], fill=(150, 60, 60, 255)), d.rectangle([2, 2, 13, 13], outline=(220, 180, 90, 255))))
T(5, lambda d: (floor((196, 150, 104, 255))(d), d.rectangle([1, 4, 14, 15], fill=(90, 120, 80, 255), outline=OL), d.text((4, 4), "^", fill=(240, 240, 200, 255))))
T(6, lambda d: (d.rectangle([1, 0, 14, 15], fill=(120, 80, 60, 255), outline=OL), d.rectangle([3, 3, 12, 8], fill=(250, 250, 250, 255)), d.rectangle([2, 10, 13, 15], fill=(80, 120, 190, 255))))
T(7, lambda d: (d.rectangle([1, 0, 14, 14], fill=(80, 120, 190, 255), outline=OL), d.line([2, 4, 13, 4], fill=(110, 150, 220, 255))))
T(8, lambda d: (d.rectangle([1, 3, 14, 12], fill=(140, 96, 60, 255), outline=OL), d.rectangle([5, 5, 9, 8], fill=(240, 240, 230, 255))))
T(9, lambda d: (d.rectangle([2, 2, 15, 14], fill=(90, 130, 90, 255), outline=OL), d.rectangle([2, 2, 5, 14], fill=(70, 110, 70, 255))))
T(10, lambda d: (d.rectangle([0, 2, 13, 14], fill=(90, 130, 90, 255), outline=OL), d.rectangle([10, 2, 13, 14], fill=(70, 110, 70, 255))))
T(11, lambda d: (d.rectangle([0, 1, 15, 15], fill=(230, 230, 236, 255), outline=OL), d.rectangle([3, 4, 8, 8], fill=(160, 170, 180, 255)), d.ellipse([10, 4, 13, 7], fill=(60, 60, 60, 255))))
T(12, lambda d: (d.rectangle([1, 2, 14, 13], fill=(30, 30, 36, 255), outline=OL), d.rectangle([3, 4, 12, 10], fill=(90, 160, 200, 255)), d.line([5, 14, 10, 14], fill=OL)))
T(13, lambda d: (d.rectangle([1, 0, 14, 15], fill=(160, 112, 72, 255), outline=OL), d.line([8, 1, 8, 14], fill=OL), d.point((6, 8), fill=OL), d.point((10, 8), fill=OL)))
T(14, lambda d: (wallface(d), d.rectangle([3, 2, 12, 9], fill=(250, 250, 248, 255), outline=OL), d.rectangle([4, 3, 11, 8], fill=(120, 180, 220, 255))))
T(15, lambda d: (d.rectangle([5, 10, 10, 15], fill=(170, 90, 50, 255), outline=OL), d.ellipse([2, 1, 13, 11], fill=(60, 140, 70, 255), outline=(30, 80, 40, 255))))
ts.save(A + "interior.png")
# ---------- baddie: wobbly blob, 2 frames ----------
im = Image.new("RGBA", (32, 16))
for f in range(2):
    fr, d = new(16, 16); t = f
    d.ellipse([2, 4 + t, 13, 15], fill=(120, 60, 160, 255), outline=(50, 20, 70, 255))
    d.ellipse([4, 7 + t, 6, 9 + t], fill=(255, 255, 255, 255)); d.ellipse([9, 7 + t, 11, 9 + t], fill=(255, 255, 255, 255))
    d.point((5, 8 + t), fill=OL); d.point((10, 8 + t), fill=OL); d.line([6, 12, 9, 12 - t], fill=(50, 20, 70, 255))
    im.paste(fr, (f * 16, 0))
im.save(A + "baddie.png")
# ---------- npc: hue-shifted player sheet ----------
pl = Image.open(A + "player.png").convert("RGBA"); px = pl.load()
for y in range(pl.height):
    for x in range(pl.width):
        r, g, b, a = px[x, y]
        if a == 0: continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s > .25: h = (h + .45) % 1
        r, g, b = colorsys.hsv_to_rgb(h, s, v); px[x, y] = (int(r * 255), int(g * 255), int(b * 255), a)
pl.save(A + "npc.png")
# ---------- pickups ----------
im, d = new(12, 12); d.rectangle([1, 0, 10, 11], fill=(250, 246, 220, 255), outline=OL); [d.line([3, y, 8, y], fill=(120, 120, 140, 255)) for y in (3, 5, 7, 9)]; im.save(A + "note.png")
im = Image.new("RGBA", (32, 16))
for f in range(2):
    fr, d = new(16, 16)
    d.rectangle([1, 5, 14, 15], fill=(150, 96, 50, 255), outline=OL)
    if f == 0: d.rectangle([1, 2, 14, 7], fill=(176, 116, 64, 255), outline=OL); d.rectangle([6, 6, 9, 9], fill=(230, 200, 80, 255), outline=OL)
    else: d.rectangle([1, 0, 14, 4], fill=(110, 70, 36, 255), outline=OL); d.rectangle([3, 6, 12, 8], fill=(30, 20, 20, 255))
    im.paste(fr, (f * 16, 0))
im.save(A + "chest.png")
im, d = new(8, 8); d.ellipse([0, 1, 7, 7], fill=(80, 170, 240, 255), outline=(30, 80, 140, 255)); d.point((2, 3), fill=(220, 240, 255, 255)); d.point((4, 0), fill=OL); im.save(A + "balloon.png")
im, d = new(12, 12); d.polygon([(1, 5), (6, 5), (7, 8), (11, 8), (11, 11), (1, 11)], fill=(230, 80, 60, 255), outline=OL); d.line([1, 10, 11, 10], fill=(255, 255, 255, 255)); im.save(A + "trainers.png")
im, d = new(12, 12); d.pieslice([0, 1, 11, 12], 180, 360, fill=(250, 200, 180, 255), outline=OL); [d.line([6, 6, x, 1], fill=(220, 150, 130, 255)) for x in (2, 6, 10)]; d.rectangle([4, 6, 7, 8], fill=(250, 200, 180, 255), outline=OL); im.save(A + "shell.png")
print("ok")
