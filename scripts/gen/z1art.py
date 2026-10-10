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
sheet.save(f'{OUT}/parksign.png')
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
