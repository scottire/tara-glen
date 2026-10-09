"""v6 art pipeline (all output CC0: procedural, or repacked Ninja Adventure CC0 sprites).
Outputs public/assets/v6/: chars.png (NA characters 1-25, 4x4 frames each, stacked), dog.png, monsters.png (NA monsters + a drawn gull),
items.png (16px icons), decor/*.png, interior.png (32-tile interior set), fx sprites.  Usage: python3 scripts/gen/art.py"""
import os, math
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
NA = '/workspace/assets-src/na'
OUT = os.path.join(ROOT, 'public/assets/v6')
OL = (40, 30, 30, 255)
MONSTERS = {'dust': 7, 'slime': 3, 'wasp': 9, 'eye': 17, 'crab': 14}   # NA monster numbers; gull is drawn
MONSTER_ORDER = ['dust', 'slime', 'wasp', 'eye', 'crab', 'gull']
ITEM_SPRITES = ['coin', 'parcel', 'bucket', 'balloon', 'walkie', 'batteries', 'trainers', 'sausage', 'deck', 'wheels', 'can', 'cone',
                'golfball', 'torch', 'photo', 'key', 'string', 'shell', 'flag', 'note', 'star', 'heart']
# decor sprite sizes (w, h); anchor = bottom centre of a tile. solid footprint = tiles under the bottom 12px
DECOR = {'washing': (32, 24), 'bbq': (16, 16), 'kidbike': (16, 16), 'gas': (16, 16), 'gnome': (16, 16), 'trampoline': (32, 24), 'pool': (32, 16),
         'chairs': (16, 16), 'cat': (16, 16), 'flowers': (16, 16), 'windbreak2': (32, 16), 'castle': (16, 16), 'towel': (16, 16), 'gullsit': (16, 16),
         'shed': (32, 32), 'hut': (32, 32), 'van': (32, 24), 'sign': (16, 16), 'groyne': (16, 16), 'bonfire': (32, 24), 'flipflop': (16, 16),
         'ball': (16, 16), 'crisps': (16, 16), 'pole': (16, 16), 'cattlegrid': (16, 16), 'roadworks': (16, 16), 'bush': (16, 16), 'sparkle': (16, 16),
         'curtain': (16, 16), 'wardrobe': (16, 16), 'sandbar': (16, 16), 'tap': (16, 16), 'whitethorn': (16, 16),
         'bins': (16, 16), 'flowerbush': (16, 16)}  # last two are drawn by restyle.py (house style)
ANIM = {'cat', 'gullsit', 'bonfire', 'bush', 'sparkle'}  # 2 frames side by side


def new(w, h): im = Image.new('RGBA', (w, h)); return im, ImageDraw.Draw(im)


def chars():
    out = Image.new('RGBA', (64, 25 * 64))
    for i in range(1, 26):
        im = Image.open(f'{NA}/characters/{i}.png').convert('RGBA').crop((0, 0, 64, 64)); out.paste(im, (0, (i - 1) * 64))
    out.save(f'{OUT}/chars.png')
    Image.open(f'{NA}/characters/dog.png').convert('RGBA').save(f'{OUT}/dog.png')


def gull_frames():
    sheet = Image.new('RGBA', (64, 64))
    for col in range(4):
        for row in range(4):
            im, d = new(16, 16); up = row % 2
            d.ellipse([4, 6, 11, 12], fill=(245, 245, 245, 255), outline=(90, 90, 100, 255))
            wy = 3 if up else 8
            d.polygon([(5, 8), (0, wy), (2, 9)], fill=(200, 200, 210, 255), outline=(90, 90, 100, 255))
            d.polygon([(10, 8), (15, wy), (13, 9)], fill=(200, 200, 210, 255), outline=(90, 90, 100, 255))
            hx = {0: 7, 1: 7, 2: 4, 3: 10}[col]; hy = {0: 9, 1: 5, 2: 7, 3: 7}[col]
            d.ellipse([hx - 2, hy - 2, hx + 2, hy + 2], fill=(255, 255, 255, 255), outline=(90, 90, 100, 255))
            bx = {0: hx, 1: hx, 2: hx - 3, 3: hx + 3}[col]; by = {0: hy + 3, 1: hy - 3, 2: hy, 3: hy}[col]
            d.line([hx, hy, bx, by], fill=(250, 190, 40, 255), width=1); d.point((hx, hy), fill=OL)
            sheet.paste(im, (col * 16, row * 16))
    return sheet


def monsters():
    out = Image.new('RGBA', (64, 64 * len(MONSTER_ORDER)))
    for i, k in enumerate(MONSTER_ORDER):
        im = gull_frames() if k == 'gull' else Image.open(f'{NA}/monsters/{MONSTERS[k]}.png').convert('RGBA')
        out.paste(im, (0, i * 64))
    out.save(f'{OUT}/monsters.png')


def items():
    out = Image.new('RGBA', (16 * 8, 16 * math.ceil(len(ITEM_SPRITES) / 8)))
    for i, k in enumerate(ITEM_SPRITES):
        im, d = new(16, 16)
        if k == 'coin': d.ellipse([3, 3, 12, 12], fill=(250, 200, 50, 255), outline=(150, 100, 20, 255)); d.line([7, 5, 7, 10], fill=(200, 140, 30, 255)); d.point((5, 5), fill=(255, 250, 200, 255))
        if k == 'parcel': d.rectangle([2, 5, 13, 13], fill=(200, 150, 90, 255), outline=OL); d.line([2, 8, 13, 8], fill=OL); d.ellipse([5, 1, 10, 6], outline=(220, 60, 60, 255))
        if k == 'bucket': d.polygon([(3, 5), (12, 5), (11, 14), (4, 14)], fill=(70, 130, 220, 255), outline=OL); d.arc([3, 1, 12, 9], 180, 360, fill=OL); d.line([4, 6, 11, 6], fill=(150, 210, 255, 255))
        if k == 'balloon': d.ellipse([4, 2, 11, 11], fill=(80, 170, 240, 255), outline=(30, 80, 140, 255)); d.point((6, 4), fill=(230, 245, 255, 255)); d.line([7, 12, 8, 15], fill=OL)
        if k == 'walkie': d.rectangle([5, 4, 11, 14], fill=(60, 60, 70, 255), outline=OL); d.line([6, 0, 6, 4], fill=OL, width=1); d.rectangle([6, 6, 10, 8], fill=(120, 200, 120, 255)); [d.point((x, 11), fill=(200, 200, 200, 255)) for x in (7, 9)]
        if k == 'batteries': [d.rectangle([3 + j * 5, 4, 6 + j * 5, 13], fill=(60, 60, 60, 255), outline=OL) or d.rectangle([3 + j * 5, 4, 6 + j * 5, 7], fill=(220, 160, 40, 255)) for j in (0, 1)]
        if k == 'trainers': d.polygon([(1, 7), (7, 7), (8, 10), (14, 10), (14, 13), (1, 13)], fill=(230, 80, 60, 255), outline=OL); d.line([1, 12, 14, 12], fill=(255, 255, 255, 255))
        if k == 'sausage': d.rounded_rectangle([1, 6, 14, 10], 2, fill=(180, 90, 60, 255), outline=OL); d.line([4, 7, 11, 7], fill=(220, 140, 100, 255))
        if k == 'deck': d.rounded_rectangle([1, 6, 14, 10], 3, fill=(150, 100, 60, 255), outline=OL); d.line([3, 8, 12, 8], fill=(230, 80, 80, 255))
        if k == 'wheels': [d.ellipse([1 + j * 7, 5, 6 + j * 7, 10], fill=(40, 40, 40, 255), outline=(150, 150, 150, 255)) for j in (0, 1)]; d.line([3, 8, 11, 8], fill=(150, 150, 150, 255))
        if k == 'can': d.rectangle([4, 2, 11, 14], fill=(250, 130, 30, 255), outline=OL); d.rectangle([4, 6, 11, 9], fill=(255, 220, 120, 255)); d.line([5, 2, 10, 2], fill=(200, 200, 200, 255))
        if k == 'cone': d.polygon([(4, 7), (11, 7), (8, 15)], fill=(220, 170, 90, 255), outline=OL); d.ellipse([3, 1, 12, 8], fill=(255, 250, 240, 255), outline=OL); d.line([9, 1, 11, -2], fill=(120, 70, 40, 255), width=2)
        if k == 'golfball': d.ellipse([3, 3, 12, 12], fill=(250, 250, 250, 255), outline=(120, 120, 120, 255)); [d.point(p, fill=(190, 190, 190, 255)) for p in ((6, 6), (9, 6), (7, 9), (10, 9), (5, 9))]
        if k == 'torch': d.rectangle([2, 6, 10, 10], fill=(200, 40, 40, 255), outline=OL); d.polygon([(10, 5), (14, 3), (14, 13), (10, 11)], fill=(230, 230, 230, 255), outline=OL)
        if k == 'photo': d.rectangle([2, 2, 13, 13], fill=(120, 70, 50, 255), outline=OL); d.rectangle([4, 4, 11, 10], fill=(240, 220, 170, 255)); d.ellipse([6, 5, 9, 8], fill=(150, 110, 80, 255))
        if k == 'key': d.ellipse([1, 4, 7, 10], outline=(240, 200, 60, 255), width=2); d.line([7, 7, 14, 7], fill=(240, 200, 60, 255), width=2); d.line([12, 7, 12, 10], fill=(240, 200, 60, 255), width=2)
        if k == 'string': d.arc([2, 3, 13, 12], 0, 300, fill=(240, 240, 220, 255), width=2); d.line([12, 7, 14, 13], fill=(240, 240, 220, 255))
        if k == 'shell': d.pieslice([1, 3, 14, 16], 180, 360, fill=(250, 200, 180, 255), outline=OL); [d.line([8, 9, x, 4], fill=(220, 150, 130, 255)) for x in (3, 8, 13)]; d.rectangle([6, 9, 9, 11], fill=(250, 200, 180, 255), outline=OL)
        if k == 'flag': d.line([3, 1, 3, 15], fill=(120, 80, 50, 255), width=2); d.rectangle([4, 2, 14, 9], fill=(40, 140, 60, 255), outline=OL); d.rectangle([4, 5, 14, 6], fill=(250, 250, 250, 255))
        if k == 'note': d.rectangle([3, 2, 12, 13], fill=(250, 246, 220, 255), outline=OL); [d.line([5, y, 10, y], fill=(120, 120, 140, 255)) for y in (5, 7, 9, 11)]
        if k == 'star': d.polygon([(8, 1), (10, 6), (15, 6), (11, 9), (13, 15), (8, 11), (3, 15), (5, 9), (1, 6), (6, 6)], fill=(250, 140, 90, 255), outline=(160, 70, 40, 255))
        if k == 'heart': d.polygon([(8, 14), (1, 6), (3, 2), (8, 4), (13, 2), (15, 6)], fill=(230, 50, 70, 255), outline=OL)
        out.paste(im, ((i % 8) * 16, (i // 8) * 16))
    out.save(f'{OUT}/items.png')


def decor():
    os.makedirs(f'{OUT}/decor', exist_ok=True)
    for k, (w, h) in DECOR.items():
        frames = 2 if k in ANIM else 1
        sheet = Image.new('RGBA', (w * frames, h))
        for f in range(frames):
            im, d = new(w, h)
            draw_decor(k, d, w, h, f)
            sheet.paste(im, (f * w, 0))
        sheet.save(f'{OUT}/decor/{k}.png')


def draw_decor(k, d, w, h, f):
    B = h - 1
    if k == 'washing':
        d.line([2, 4, 2, B], fill=(150, 150, 160, 255), width=2); d.line([29, 4, 29, B], fill=(150, 150, 160, 255), width=2); d.line([2, 5, 29, 6], fill=(220, 220, 220, 255))
        for x, c in ((5, (60, 120, 200)), (11, (240, 240, 240)), (17, (200, 60, 70)), (23, (90, 170, 90))): d.rectangle([x, 6, x + 4, 13 + (x % 3)], fill=c + (255,), outline=OL)
    if k == 'bbq': d.rectangle([3, 6, 12, 9], fill=(40, 40, 40, 255), outline=OL); d.line([4, 10, 3, B], fill=OL); d.line([11, 10, 12, B], fill=OL); d.line([5, 5, 10, 5], fill=(240, 120, 40, 255)); d.point((7, 3), fill=(200, 200, 200, 180))
    if k == 'kidbike': d.ellipse([1, 9, 6, 14], outline=OL); d.ellipse([9, 9, 14, 14], outline=OL); d.line([4, 11, 8, 7, 11, 11], fill=(220, 60, 160, 255), width=2); d.line([8, 7, 9, 4], fill=OL)
    if k == 'gas': d.rounded_rectangle([4, 3, 11, B], 3, fill=(220, 90, 40, 255), outline=OL); d.rectangle([6, 1, 9, 3], fill=(120, 120, 120, 255))
    if k == 'gnome': d.polygon([(8, 0), (4, 7), (12, 7)], fill=(220, 40, 40, 255), outline=OL); d.ellipse([5, 6, 10, 10], fill=(250, 210, 180, 255)); d.polygon([(5, 9), (10, 9), (8, 13)], fill=(250, 250, 250, 255)); d.rectangle([4, 11, 11, B], fill=(40, 140, 60, 255), outline=OL)
    if k == 'trampoline': d.ellipse([1, 4, 30, 17], fill=(30, 30, 40, 255), outline=(40, 120, 220, 255), width=2); d.line([5, 15, 4, B], fill=OL); d.line([26, 15, 27, B], fill=OL)
    if k == 'pool': d.ellipse([1, 2, 30, 14], fill=(250, 120, 160, 255), outline=OL); d.ellipse([4, 4, 27, 12], fill=(110, 190, 240, 255)); d.point((20, 7), fill=(250, 220, 40, 255))
    if k == 'chairs': d.rectangle([2, 6, 7, 12], fill=(40, 90, 170, 255), outline=OL); d.rectangle([9, 6, 14, 12], fill=(40, 140, 80, 255), outline=OL); d.line([2, 13, 2, B], fill=OL); d.line([14, 13, 14, B], fill=OL)
    if k == 'cat': d.ellipse([3, 8, 12, 14], fill=(240, 150, 60, 255), outline=OL); d.ellipse([9 - f, 5, 14 - f, 10], fill=(240, 150, 60, 255), outline=OL); d.polygon([(10 - f, 6), (10 - f, 3), (12 - f, 5)], fill=(240, 150, 60, 255)); d.line([3, 11, 0, 8 + f * 2], fill=(240, 150, 60, 255), width=2)
    if k == 'flowers':
        for x, y, c in ((3, 9, (250, 80, 120)), (8, 6, (250, 220, 60)), (12, 10, (160, 120, 250)), (6, 12, (250, 250, 250))): d.line([x, y, x, B], fill=(60, 140, 60, 255)); d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=c + (255,))
    if k == 'windbreak2':
        for i in range(5): d.rectangle([2 + i * 6, 3, 7 + i * 6, 12], fill=((220, 60, 60) if i % 2 else (250, 250, 250)) + (255,))
        d.rectangle([2, 3, 31, 12], outline=OL); [d.line([2 + i * 7, 3, 2 + i * 7, B], fill=(120, 80, 50, 255)) for i in range(5)]
    if k == 'castle': d.rectangle([3, 7, 12, B], fill=(230, 200, 130, 255), outline=(170, 140, 80, 255)); [d.rectangle([x, 5, x + 2, 7], fill=(230, 200, 130, 255)) for x in (3, 7, 10)]; d.line([8, 1, 8, 5], fill=OL); d.polygon([(8, 1), (12, 2), (8, 3)], fill=(220, 40, 40, 255))
    if k == 'towel': d.rectangle([2, 4, 13, B], fill=(250, 200, 40, 255), outline=OL); [d.line([2, y, 13, y], fill=(220, 60, 60, 255)) for y in (7, 11)]
    if k == 'gullsit': d.ellipse([4, 7, 12, 13], fill=(245, 245, 245, 255), outline=(90, 90, 100, 255)); d.ellipse([9, 4 + f, 13, 8 + f], fill=(255, 255, 255, 255), outline=(90, 90, 100, 255)); d.line([13, 6 + f, 15, 6 + f], fill=(250, 190, 40, 255)); d.line([7, 13, 7, B], fill=(250, 190, 40, 255))
    if k in ('shed', 'hut'):
        wall = (150, 110, 70, 255) if k == 'shed' else (220, 60, 50, 255); roof = (90, 90, 100, 255) if k == 'shed' else (250, 250, 250, 255)
        d.rectangle([2, 12, 29, B], fill=wall, outline=OL); d.polygon([(0, 13), (16, 2), (31, 13)], fill=roof, outline=OL); d.rectangle([12, 20, 19, B], fill=(70, 50, 40, 255), outline=OL)
        if k == 'hut': d.text((6, 13), '+', fill=(255, 255, 255, 255)); d.rectangle([22, 15, 27, 19], fill=(150, 210, 240, 255), outline=OL)
        else: d.rectangle([4, 15, 9, 19], fill=(150, 210, 240, 255), outline=OL)
    if k == 'van':
        d.rounded_rectangle([1, 4, 30, 19], 3, fill=(250, 250, 255, 255), outline=OL); d.rectangle([3, 7, 18, 13], fill=(130, 200, 240, 255), outline=OL)
        d.rectangle([20, 7, 28, 12], fill=(90, 150, 200, 255), outline=OL); [d.ellipse([x, 17, x + 5, 22], fill=(30, 30, 30, 255)) for x in (4, 22)]
        d.polygon([(10, 0), (14, 4), (6, 4)], fill=(250, 220, 170, 255), outline=OL); d.ellipse([7, -2, 13, 2], fill=(255, 150, 190, 255))
    if k == 'sign': d.line([8, 8, 8, B], fill=(120, 80, 50, 255), width=2); d.rectangle([2, 2, 13, 9], fill=(230, 200, 140, 255), outline=OL); [d.line([4, y, 11, y], fill=(120, 90, 60, 255)) for y in (4, 6)]
    if k == 'groyne': d.ellipse([0, 4, 9, 13], fill=(110, 110, 120, 255), outline=OL); d.ellipse([6, 2, 15, 12], fill=(130, 130, 140, 255), outline=OL); d.ellipse([3, 9, 13, 15], fill=(100, 100, 110, 255), outline=OL)
    if k == 'bonfire':
        [d.line([6 + i * 4, B, 14 + i * 2, 12], fill=(110, 70, 40, 255), width=2) for i in range(4)]
        fl = [(16, 1 + f * 2), (9, 16), (23, 16)]; d.polygon(fl, fill=(250, 120, 30, 255)); d.polygon([(16, 7 - f), (12, 17), (20, 17)], fill=(255, 220, 80, 255))
    if k == 'flipflop': d.ellipse([4, 3, 11, 14], fill=(60, 180, 220, 255), outline=OL); d.line([7, 6, 5, 9], fill=(250, 250, 250, 255)); d.line([7, 6, 10, 9], fill=(250, 250, 250, 255))
    if k == 'ball': d.ellipse([4, 6, 12, 14], fill=(250, 250, 250, 255), outline=OL); d.polygon([(8, 8), (10, 10), (7, 12), (6, 10)], fill=OL)
    if k == 'crisps': d.polygon([(4, 4), (12, 3), (13, 13), (3, 14)], fill=(40, 90, 200, 255), outline=OL); d.ellipse([6, 7, 10, 10], fill=(250, 220, 60, 255))
    if k == 'pole': d.rectangle([0, 5, 15, 8], fill=(250, 250, 250, 255), outline=OL); [d.rectangle([x, 5, x + 3, 8], fill=(220, 40, 40, 255)) for x in (0, 8)]; d.line([2, 9, 2, B], fill=OL); d.line([13, 9, 13, B], fill=OL)
    if k == 'cattlegrid': d.rectangle([0, 0, 15, 15], fill=(30, 30, 30, 255)); [d.line([x, 0, x, 15], fill=(170, 170, 170, 255), width=2) for x in (1, 5, 9, 13)]
    if k == 'roadworks': d.rectangle([0, 6, 15, 10], fill=(250, 140, 30, 255), outline=OL); [d.line([x, 6, x + 4, 10], fill=(250, 250, 250, 255), width=2) for x in (0, 6, 12)]; d.polygon([(2, B), (4, 11), (6, B)], fill=(250, 140, 30, 255))
    if k == 'bush': d.ellipse([0, 3, 15, B], fill=(50, 130, 60, 255), outline=(25, 80, 35, 255)); d.ellipse([3, 5 - f, 7, 9 - f], fill=(250, 250, 250, 255)); d.ellipse([8, 5 - f, 12, 9 - f], fill=(250, 250, 250, 255)); d.point((5, 7 - f), fill=OL); d.point((10, 7 - f), fill=OL)
    if k == 'sparkle': c = (250, 250, 160, 255); s = 5 if f else 3; d.line([8 - s, 8, 8 + s, 8], fill=c); d.line([8, 8 - s, 8, 8 + s], fill=c); d.point((8, 8), fill=(255, 255, 255, 255))
    if k == 'curtain': d.rectangle([0, 0, 15, 15], fill=(10, 10, 16, 255)); [d.line([x, 0, x, 15], fill=(30, 30, 44, 255)) for x in (3, 8, 12)]
    if k == 'wardrobe': d.rectangle([0, 0, 15, 15], fill=(120, 80, 50, 255), outline=OL); d.rectangle([0, 11, 15, 15], fill=(20, 15, 15, 255)); d.line([8, 0, 8, 10], fill=OL)
    if k == 'sandbar': d.rectangle([0, 0, 15, 15], fill=(226, 205, 150, 255)); [d.point((x, y), fill=(200, 180, 130, 255)) for x, y in ((3, 4), (11, 2), (7, 10), (13, 13), (2, 12))]
    if k == 'tap': d.rectangle([7, 4, 9, B], fill=(140, 140, 150, 255), outline=OL); d.rectangle([5, 3, 12, 6], fill=(170, 170, 180, 255), outline=OL); d.point((12, 8), fill=(110, 190, 250, 255))
    if k == 'whitethorn': d.ellipse([1, 1, 15, 13], fill=(70, 120, 60, 255), outline=(30, 70, 30, 255)); [d.point(p, fill=(250, 250, 250, 255)) for p in ((4, 4), (9, 3), (12, 7), (6, 9))]; d.line([11, 9, 12, 13], fill=(240, 200, 60, 255), width=2)


def interior():
    """32 tiles, 8 cols x 4 rows. 0-15 as v5; 16 stone A, 17 stone B, 18 shelf, 19 crate, 20 barrel, 21 ladder, 22 doorway, 23 quiz table,
    24 bar, 25 lino, 26 toilet, 27 bath, 28 cobweb stone, 29 hatch, 30 bunk, 31 trophies"""
    old = Image.open(os.path.join(ROOT, 'public/assets/interior.png')).convert('RGBA')
    ts = Image.new('RGBA', (128, 64)); ts.paste(old.crop((0, 0, 128, 32)), (0, 0))
    def T(k, fn): im, d = new(16, 16); fn(d); ts.paste(im, ((k % 8) * 16, (k // 8) * 16))
    def stone(c):
        def f(d):
            d.rectangle([0, 0, 15, 15], fill=c); dk = tuple(int(v * .8) for v in c[:3]) + (255,)
            d.line([0, 7, 15, 7], fill=dk); d.line([0, 15, 15, 15], fill=dk); d.line([5, 0, 5, 7], fill=dk); d.line([11, 8, 11, 15], fill=dk)
        return f
    T(16, stone((120, 118, 112, 255))); T(17, stone((112, 110, 104, 255)))
    T(18, lambda d: (d.rectangle([0, 2, 15, 15], fill=(140, 96, 60, 255), outline=OL), d.line([0, 8, 15, 8], fill=OL), [d.rectangle([x, 3, x + 2, 7], fill=c) for x, c in ((2, (200, 60, 60, 255)), (6, (60, 120, 200, 255)), (10, (220, 200, 80, 255)))]))
    T(19, lambda d: (d.rectangle([1, 2, 14, 15], fill=(170, 120, 70, 255), outline=OL), d.line([1, 2, 14, 15], fill=(120, 80, 40, 255)), d.line([14, 2, 1, 15], fill=(120, 80, 40, 255))))
    T(20, lambda d: (d.ellipse([2, 1, 13, 15], fill=(140, 90, 50, 255), outline=OL), d.line([2, 5, 13, 5], fill=(80, 80, 90, 255)), d.line([2, 11, 13, 11], fill=(80, 80, 90, 255))))
    T(21, lambda d: (stone((120, 118, 112, 255))(d), d.line([4, 0, 4, 15], fill=(140, 96, 60, 255), width=2), d.line([11, 0, 11, 15], fill=(140, 96, 60, 255), width=2), [d.line([4, y, 11, y], fill=(140, 96, 60, 255)) for y in (2, 7, 12)]))
    T(22, lambda d: d.rectangle([0, 0, 15, 15], fill=(160, 120, 84, 255)))
    T(23, lambda d: (d.rectangle([0, 2, 15, 13], fill=(250, 250, 245, 255), outline=OL), d.line([0, 11, 15, 11], fill=(200, 60, 60, 255)), d.rectangle([5, 4, 8, 7], fill=(250, 140, 30, 255))))
    T(24, lambda d: (d.rectangle([0, 1, 15, 15], fill=(110, 60, 40, 255), outline=OL), d.rectangle([0, 1, 15, 4], fill=(150, 90, 60, 255)), d.rectangle([5, 6, 7, 11], fill=(250, 200, 80, 220))))
    T(25, lambda d: (d.rectangle([0, 0, 15, 15], fill=(220, 220, 210, 255)), d.rectangle([0, 0, 7, 7], fill=(190, 200, 210, 255)), d.rectangle([8, 8, 15, 15], fill=(190, 200, 210, 255))))
    T(26, lambda d: (d.rectangle([0, 0, 15, 15], fill=(220, 220, 210, 255)), d.rectangle([4, 1, 11, 5], fill=(250, 250, 250, 255), outline=OL), d.ellipse([3, 5, 12, 14], fill=(250, 250, 250, 255), outline=OL)))
    T(27, lambda d: (d.rectangle([0, 0, 15, 15], fill=(220, 220, 210, 255)), d.rounded_rectangle([1, 1, 14, 15], 4, fill=(250, 250, 250, 255), outline=OL), d.rectangle([3, 3, 12, 13], fill=(150, 210, 240, 255))))
    T(28, lambda d: (stone((112, 110, 104, 255))(d), [d.line([0, 0, x, 15 - x], fill=(230, 230, 230, 200)) for x in (6, 10, 15)], d.arc([-6, -6, 10, 10], 0, 90, fill=(230, 230, 230, 200))))
    T(29, lambda d: (d.rectangle([0, 0, 15, 15], fill=(80, 60, 40, 255), outline=OL), d.rectangle([3, 3, 12, 12], outline=(160, 160, 160, 255))))
    T(30, lambda d: (d.rectangle([1, 0, 14, 15], fill=(110, 80, 60, 255), outline=OL), d.rectangle([2, 1, 13, 6], fill=(220, 80, 80, 255)), d.rectangle([2, 9, 13, 14], fill=(80, 160, 90, 255)), d.line([1, 7, 14, 7], fill=OL)))
    T(31, lambda d: (d.rectangle([0, 0, 15, 15], fill=(140, 96, 60, 255), outline=OL), [d.polygon([(x, 4), (x + 4, 4), (x + 3, 9), (x + 1, 9)], fill=(250, 210, 60, 255)) for x in (2, 9)], d.line([0, 11, 15, 11], fill=OL)))
    ts.save(f'{OUT}/interior.png')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    chars(); monsters(); items(); decor(); interior()
    print('art ok:', OUT)
