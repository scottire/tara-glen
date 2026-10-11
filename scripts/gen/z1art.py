#!/usr/bin/env python3
"""v13 zone-one placeholder art (kept out of art.py so a full `npm run gen` never overwrites it): park signs, bonfire wood,
bin bag, cat treats. Writes public/assets/v13/*.png. Run by hand: python3 scripts/gen/z1art.py"""
import os
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(__file__), '../../public/assets/v13'); os.makedirs(OUT, exist_ok=True)
OL = (42, 30, 24, 255)
def new(w, h): im = Image.new('RGBA', (w, h)); return im, ImageDraw.Draw(im)
# park sign: green board on a brown post, white arrow (frame 0 = right, frame 1 = left, frame 2 = up)
sheet = Image.new('RGBA', (16 * 3, 20))
for f in range(3):
    im, d = new(16, 20)
    d.rectangle([7, 9, 8, 19], fill=(110, 72, 44, 255)); d.line([7, 9, 7, 19], fill=(150, 104, 64, 255))
    d.rectangle([1, 1, 14, 10], fill=(46, 120, 70, 255), outline=OL); d.rectangle([2, 2, 13, 9], outline=(230, 236, 220, 255))
    W = (245, 245, 235, 255)
    if f == 0: d.line([4, 5, 10, 5], fill=W); d.polygon([(10, 3), (12, 5), (10, 7)], fill=W)
    elif f == 1: d.line([5, 5, 11, 5], fill=W); d.polygon([(5, 3), (3, 5), (5, 7)], fill=W)
    else: d.line([7, 4, 7, 8], fill=W); d.line([8, 4, 8, 8], fill=W); d.polygon([(5, 5), (7, 3), (8, 3), (10, 5)], fill=W)
    sheet.paste(im, (f * 16, 0))
sheet.save(f'{OUT}/parksign.png'); sheet.save(os.path.join(os.path.dirname(__file__), '../../public/assets/v6/decor/parksign.png'))
# bonfire wood: two crossed logs
im, d = new(16, 16)
for (a, b) in (((2, 10), (13, 6)), ((3, 6), (13, 11))):
    d.line([a, b], fill=OL, width=5); d.line([a, b], fill=(150, 98, 54, 255), width=3)
d.ellipse([11, 4, 15, 8], fill=(214, 176, 120, 255), outline=OL); d.ellipse([11, 9, 15, 13], fill=(214, 176, 120, 255), outline=OL)
im.save(f'{OUT}/wood.png')
# bin bag: black sack with a yellow tie
im, d = new(16, 16)
d.ellipse([2, 4, 13, 15], fill=(36, 36, 44, 255), outline=OL); d.polygon([(6, 5), (8, 1), (10, 5)], fill=(36, 36, 44, 255), outline=OL)
d.line([6, 5, 10, 5], fill=(240, 200, 60, 255)); d.point((5, 8), fill=(110, 110, 130, 255)); d.point((6, 7), fill=(110, 110, 130, 255))
im.save(f'{OUT}/binbag.png')
# cat treats: a little purple pouch with a fish
im, d = new(16, 16)
d.rectangle([3, 3, 12, 14], fill=(150, 80, 190, 255), outline=OL); d.line([3, 5, 12, 5], fill=(200, 150, 230, 255))
d.ellipse([5, 8, 10, 11], fill=(250, 170, 80, 255)); d.polygon([(10, 9), (12, 8), (12, 11)], fill=(250, 170, 80, 255))
im.save(f'{OUT}/treats.png')
# thrown junk for the boss: paint tin, traffic cone, roll of bin bags (8x8 each, one sheet)
sh = Image.new('RGBA', (24, 8)); d = ImageDraw.Draw(sh)
d.rectangle([1, 2, 6, 7], fill=(200, 200, 210, 255), outline=OL); d.rectangle([1, 2, 6, 3], fill=(230, 90, 60, 255))
d.polygon([(11, 7), (13, 0), (14, 0), (16, 7)], fill=(250, 120, 30, 255), outline=OL); d.line([12, 4, 15, 4], fill=(255, 255, 255, 255))
d.ellipse([17, 1, 23, 7], fill=(40, 40, 50, 255), outline=OL); d.ellipse([19, 3, 21, 5], fill=(90, 90, 100, 255))
sh.save(f'{OUT}/junk.png')
print('ok')

# ---------- v13b: big shed (177), shed clutter, playground (swings + slide on sand) ----------
D6 = os.path.join(os.path.dirname(__file__), '../../public/assets/v6/decor')
import random
rnd = random.Random(177)
MET = [(120, 132, 128, 255), (140, 152, 146, 255), (104, 114, 110, 255)]
TIM = [(150, 104, 62, 255), (132, 90, 54, 255), (168, 120, 74, 255)]
# exterior: same frame as caravan-v art (50x96), corrugated green roof seen from above, timber front wall with double doors
im, d = new(50, 96)
d.rectangle([1, 6, 48, 64], fill=(78, 112, 84, 255), outline=OL)  # roof
for x in range(3, 48, 3): d.line([x, 7, x, 63], fill=(96, 136, 100, 255) if (x // 3) % 2 else (64, 96, 70, 255))
d.line([1, 35, 48, 35], fill=(58, 84, 62, 255)); d.rectangle([20, 10, 30, 16], fill=(170, 60, 40, 255), outline=OL)  # rusty patch
d.rectangle([2, 64, 47, 93], fill=TIM[0], outline=OL)  # front wall (timber boards)
for x in range(4, 47, 4): d.line([x, 65, x, 92], fill=TIM[1])
d.rectangle([9, 72, 26, 93], fill=(90, 60, 38, 255), outline=OL); d.line([17, 72, 17, 93], fill=OL)  # double doors (door x ~17 = doorFx .34)
d.rectangle([15, 81, 16, 83], fill=(220, 200, 80, 255)); d.rectangle([18, 81, 19, 83], fill=(220, 200, 80, 255))
d.rectangle([30, 70, 44, 77], fill=(240, 236, 220, 255), outline=OL); d.line([32, 73, 42, 73], fill=(160, 40, 40, 255)); d.line([32, 75, 39, 75], fill=(80, 80, 80, 255))  # 'MAINTENANCE' sign
d.rectangle([33, 80, 43, 88], fill=(170, 200, 220, 255), outline=OL); d.line([38, 80, 38, 88], fill=OL)  # window
d.rectangle([44, 84, 48, 93], fill=(60, 60, 64, 255), outline=OL)  # gas bottle
im.save(f'{OUT}/bigshed.png')
def save(k, im): im.save(f'{D6}/{k}.png')
# ride-on mower
im, d = new(24, 20)
d.rectangle([3, 6, 20, 15], fill=(200, 50, 40, 255), outline=OL); d.rectangle([7, 2, 14, 8], fill=(40, 40, 40, 255), outline=OL)
for x in (5, 18): d.ellipse([x - 3, 12, x + 3, 19], fill=(30, 30, 30, 255), outline=OL)
d.rectangle([15, 7, 19, 10], fill=(230, 200, 60, 255)); save('mower', im)
# workbench with vice and tools
im, d = new(32, 20)
d.rectangle([1, 6, 30, 12], fill=TIM[2], outline=OL); d.line([1, 9, 30, 9], fill=TIM[1])
for x in (3, 27): d.rectangle([x, 12, x + 2, 19], fill=TIM[1], outline=OL)
d.rectangle([4, 2, 9, 6], fill=(90, 100, 110, 255), outline=OL); d.line([14, 5, 22, 3], fill=(200, 60, 40, 255), width=2); d.rectangle([24, 3, 28, 6], fill=(200, 200, 210, 255), outline=OL)
save('workbench', im)
# tool wall: pegboard with spade, rake, saw, hammer
im, d = new(32, 24)
d.rectangle([0, 0, 31, 21], fill=(196, 160, 110, 255), outline=OL)
for x in range(3, 31, 4):
    for y in range(3, 21, 4): d.point((x, y), fill=(120, 90, 60, 255))
d.line([5, 2, 5, 18], fill=TIM[1], width=2); d.rectangle([3, 16, 7, 20], fill=(150, 160, 170, 255), outline=OL)  # spade
d.line([12, 2, 12, 18], fill=TIM[1], width=1); d.line([9, 18, 15, 18], fill=(150, 160, 170, 255), width=2)  # rake
d.polygon([(18, 4), (27, 4), (27, 9), (18, 12)], fill=(190, 196, 204, 255), outline=OL)  # saw
d.line([21, 14, 21, 20], fill=TIM[1], width=2); d.rectangle([19, 13, 24, 15], fill=(80, 80, 90, 255))  # hammer
save('toolwall', im)
# wheelbarrow
im, d = new(20, 16)
d.polygon([(2, 4), (16, 4), (13, 11), (5, 11)], fill=(60, 120, 60, 255), outline=OL); d.ellipse([13, 9, 19, 15], fill=(30, 30, 30, 255), outline=OL)
d.line([1, 3, 0, 13], fill=OL); save('wheelbarrow', im)
# stack of paint tins and a bucket
im, d = new(16, 16)
for (x, y, c) in ((2, 8, (230, 90, 60)), (8, 9, (80, 140, 220)), (5, 2, (240, 220, 90))):
    d.rectangle([x, y, x + 6, y + 6], fill=(200, 200, 210, 255), outline=OL); d.rectangle([x, y, x + 6, y + 2], fill=c + (255,))
save('paints', im)
# swing set (A-frame, two swings)
im, d = new(48, 32)
for x in (3, 44):
    d.line([x - 2, 31, x, 4], fill=OL, width=3); d.line([x + 2, 31, x, 4], fill=OL, width=3)
    d.line([x - 2, 31, x, 4], fill=(70, 120, 200, 255)); d.line([x + 2, 31, x, 4], fill=(70, 120, 200, 255))
d.line([2, 4, 45, 4], fill=OL, width=3); d.line([2, 4, 45, 4], fill=(220, 60, 50, 255))
for x in (16, 31):
    d.line([x - 3, 5, x - 3, 22], fill=(90, 90, 90, 255)); d.line([x + 3, 5, x + 3, 22], fill=(90, 90, 90, 255)); d.rectangle([x - 4, 22, x + 4, 24], fill=(40, 40, 40, 255), outline=OL)
save('swingset', im)
# slide (ladder left, chute down to the right)
im, d = new(32, 32)
d.line([4, 31, 6, 6], fill=OL, width=3); d.line([10, 31, 12, 6], fill=OL, width=3)
for y in range(10, 31, 4): d.line([5, y, 11, y], fill=(90, 90, 90, 255))
d.rectangle([4, 4, 14, 8], fill=(220, 60, 50, 255), outline=OL)  # platform
d.polygon([(13, 4), (17, 4), (31, 26), (31, 30), (27, 30)], fill=(250, 200, 50, 255), outline=OL)
save('slide', im)
# sand patch (drawn flat under the play set)
im, d = new(96, 48)
d.rounded_rectangle([0, 0, 95, 47], radius=10, fill=(228, 206, 150, 255), outline=(190, 160, 110, 255))
for _ in range(90): x, y = rnd.randrange(4, 92), rnd.randrange(4, 44); d.point((x, y), fill=(206, 182, 128, 255))
save('sandpit', im)
print('ok v13b')
