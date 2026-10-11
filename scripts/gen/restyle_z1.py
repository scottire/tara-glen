#!/usr/bin/env python3
"""v13 zone-one art: AI sources in scripts/gen/tgstyle/src/z1/ (prompts: tg-artgen assets/PROMPTS-z1.md) through the house-style
steps (magenta key -> parts in reading order / sheet cells -> stylise to the locked palette + selective outline at game size).
Run after restyle.py (it appends characters to chars.png and overwrites a few art.py decor sprites):
  python3 scripts/gen/restyle_z1.py      then build.py + ground.py
Outputs: public/assets/v13/*, public/assets/v6/decor/{skip,cat,ball,sign,parksign,mower,workbench,toolwall,wheelbarrow,paints}.png,
         public/assets/v6/chars.png (characters 26-32), public/assets/v10/player.png + player-noclub.png (player.json layout kept)."""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tgstyle import sprites as P
from tgstyle import stylise as S
from tgstyle.keying import key_parts
from tgstyle.cells import cells
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
A = os.path.join(ROOT, 'public/assets'); SRC = os.path.join(P.HERE, 'src/z1')
os.makedirs(f'{A}/v13', exist_ok=True)
def src(n): return os.path.join(SRC, n + '.png')
def parts(n): return key_parts(src(n))
def styl(im, w, h, k=10): return S.stylise(P.enh(im, 1.1, 1.05), max(1, w), max(1, h), k, None, denoise=False, cleanup_passes=1)
def strip(ims, w, h): out = Image.new('RGBA', (w * len(ims), h)); [out.paste(im, (i * w, 0)) for i, im in enumerate(ims)]; return out

# ---------- props ----------
sk, bag, wood, treats, ball, club = parts('z1-props-small')
P.fit(sk, 32, 20).save(f'{A}/v6/decor/skip.png')
P.fit(bag, 16, 16).save(f'{A}/v13/binbag.png'); P.fit(wood, 16, 16).save(f'{A}/v13/wood.png'); P.fit(treats, 16, 16).save(f'{A}/v13/treats.png')
P.fit(ball, 10, 10).save(f'{A}/v13/football.png')
b16 = Image.new('RGBA', (16, 16)); b16.paste(P.fit(ball, 10, 10), (3, 6)); b16.save(f'{A}/v6/decor/ball.png')
P.fit(club, 16, 16, align='centre').save(f'{A}/v13/club.png')
signs = [c['im'] for c in sorted((c for r in cells(src('z1-park-signs')) for c in r), key=lambda c: c['x'])]  # left to right: right, left, up
strip([P.fit(s, 16, 20) for s in signs], 16, 20).save(f'{A}/v6/decor/parksign.png')
note, board = parts('z1-note-board')
P.fit(note, 10, 8, align='centre').save(f'{A}/v13/note.png')  # Mam's note on the table in 127
P.fit(board, 16, 16).save(f'{A}/v6/decor/sign.png')  # generic sign (other zones' notice boards)
P.fit(parts('z1-shed-exterior')[0], 50, 96, k=14).save(f'{A}/v13/bigshed.png')
mower, bench, wall, barrow, paints, bucket = parts('z1-shed-props')
for n, im, w, h in (('mower', mower, 24, 20), ('workbench', bench, 32, 20), ('toolwall', wall, 32, 24), ('wheelbarrow', barrow, 20, 16), ('paints', paints, 16, 16)):
    P.fit(im, w, h).save(f'{A}/v6/decor/{n}.png')
brush, blower, tin, cone, roll = parts('z1-boss-items')
strip([P.fit(tin, 8, 8), P.fit(cone, 8, 8), P.fit(roll, 8, 8)], 8, 8).save(f'{A}/v13/junk.png')
cat, peek = parts('z1-cat')
c16 = P.fit(cat, 16, 16); strip([c16, c16], 16, 16).save(f'{A}/v6/decor/cat.png'); P.fit(peek, 16, 10).save(f'{A}/v13/catpeek.png')

# ---------- characters (chars.png: 16 frames per character, frame = walkframe*4 + dir, dir 0 down 1 up 2 left 3 right) ----------
CHAR_IDS = [('z1-char-kid1', 26, 12), ('z1-char-kid2', 27, 12), ('z1-char-kid3', 28, 13), ('z1-char-maint', 29, 16),
            ('z1-char-ciara', 30, 15), ('z1-char-oisin', 31, 12), ('z1-char-mrsfurlong', 32, 15)]
def place(cell, scale, W, Hh, feet):
    w, h = max(1, round(cell.width * scale)), max(1, round(cell.height * scale))
    sp = styl(cell, w, h); out = Image.new('RGBA', (W, Hh)); out.paste(sp, ((W - sp.width) // 2, feet + 1 - sp.height), sp); return out
def facing(cell):  # +1 = faces right: more of the head's mass on the right of the body centre (rough), else -1
    a = np.array(cell)[..., 3] > 0; h = a.shape[0]; top = a[: h // 3]; cols = np.where(top.any(0))[0]; body = np.where(a.any(0))[0]
    return 1 if (cols.mean() if len(cols) else 0) >= body.mean() else -1
ch = Image.open(f'{A}/v6/chars.png').convert('RGBA'); base = ch.crop((0, 0, 64, 25 * 64))
sheets = Image.new('RGBA', (64, 64 * (25 + len(CHAR_IDS)))); sheets.paste(base, (0, 0))
for name, num, H in CHAR_IDS:
    rows = cells(src(name)); assert [len(r) for r in rows] == [4, 4, 4, 4], (name, [len(r) for r in rows])
    sc = H / np.median([c['h'] for c in rows[0]])
    side = [rows[2], rows[3]]
    # rows 3/4 should be left/right: check and swap/mirror as needed
    f2, f3 = np.mean([facing(c['im']) for c in rows[2]]), np.mean([facing(c['im']) for c in rows[3]])
    left = rows[2] if f2 <= f3 else rows[3]; right = rows[3] if f2 <= f3 else rows[2]
    for wf in range(4):
        for d, cell in enumerate((rows[0][wf]['im'], rows[1][wf]['im'], left[wf]['im'], right[wf]['im'])):
            sheets.paste(place(cell, sc, 16, 16, 15), (d * 16, (num - 1) * 64 + wf * 16))
sheets.save(f'{A}/v6/chars.png')
poses = parts('z1-char-maint-poses')  # sweep, blow, winded, sitting on bucket (facing right)
psc = 18 / np.median([p.height for p in poses[2:]])
strip([place(p, psc, 32, 24, 23) for p in poses], 32, 24).save(f'{A}/v13/maint-poses.png')

# ---------- player (layout from public/assets/v10/player.json; left = mirrored right) ----------
META = json.load(open(f'{A}/v10/player.json'))
PICK = {  # anim -> per-direction list of (row, col) cells in each source sheet (generator ignored exact layouts; picked by eye)
 'club-down':  dict(idle=[(0, 0), (0, 1)], walk=[(0, 4), (0, 5), (0, 6), (0, 7)], swing1=[(1, 0), (1, 4), (1, 5)], swing2=[(1, 3), (1, 7), (1, 8)], swing3=[(1, 6), (2, 4), (2, 5)],
                    charge=[(2, 0), (2, 1)], spin=[(2, 2), (2, 3), (2, 4), (2, 5)], roll=[(3, 0), (3, 1), (3, 2), (3, 1)], hurt=[(3, 4)], faint=[(3, 5), (3, 6)], interact=[(3, 7)]),
 'club-right': dict(idle=[(0, 1), (0, 2)], walk=[(0, 4), (0, 5), (0, 6), (0, 7)], swing1=[(1, 0), (1, 1), (1, 2)], swing2=[(1, 3), (1, 4), (1, 5)], swing3=[(1, 6), (1, 7), (1, 8)],
                    charge=[(2, 0), (2, 1)], spin=[(1, 1), (1, 4), (1, 8), (1, 6)], roll=[(3, 0), (3, 1), (3, 2), (3, 1)], hurt=[(3, 4)], faint=[(3, 5), (3, 6)], interact=[(3, 7)]),  # row 2 cols 2-5 have swoosh arcs: skipped
 'club-up':    dict(idle=[(0, 0), (0, 1)], walk=[(0, 2), (0, 3), (0, 4), (0, 5)], swing1=[(1, 0), (1, 1), (1, 8)], swing2=[(1, 3), (1, 4), (2, 2)], swing3=[(1, 6), (1, 7), (2, 3)],
                    charge=[(2, 0), (2, 1)], spin=[(2, 4), (2, 5), (2, 4), (2, 5)], roll=[(3, 0), (3, 1), (3, 4), (3, 1)], hurt=[(3, 3)], faint=[(3, 4), (3, 5)], interact=[(3, 2)]),
 'noclub-down':  dict(idle=[(0, 0), (0, 1)], walk=[(0, 3), (0, 4), (0, 5), (0, 6)], swing1=[(1, 2), (1, 0), (1, 6)], swing2=[(1, 2), (1, 3), (1, 6)], swing3=[(1, 1), (1, 4), (1, 6)],
                    charge=[(0, 0), (0, 1)], spin=[(0, 0), (0, 1), (0, 0), (0, 1)], roll=[(2, 0), (2, 1), (2, 2), (2, 1)], hurt=[(2, 4)], faint=[(2, 5), (2, 6)], interact=[(2, 7)]),
 'noclub-right': dict(idle=[(0, 0), (0, 1)], walk=[(0, 3), (0, 4), (0, 5), (0, 4)], swing1=[(1, 2), (1, 0), (1, 6)], swing2=[(1, 7), (1, 3), (1, 8)], swing3=[(1, 2), (1, 5), (1, 6)],
                    charge=[(0, 0), (0, 1)], spin=[(0, 0), (0, 1), (0, 0), (0, 1)], roll=[(2, 0), (2, 1), (2, 2), (2, 3)], hurt=[(2, 4)], faint=[(2, 5), (2, 6)], interact=[(2, 7)]),
 'noclub-up':    dict(idle=[(0, 0), (0, 1)], walk=[(0, 2), (0, 3), (0, 4), (0, 5)], swing1=[(1, 6), (1, 0), (1, 6)], swing2=[(1, 6), (1, 2), (1, 6)], swing3=[(1, 6), (1, 4), (1, 6)],
                    charge=[(0, 0), (0, 1)], spin=[(0, 0), (0, 1), (0, 0), (0, 1)], roll=[(2, 0), (2, 1), (2, 4), (2, 1)], hurt=[(2, 3)], faint=[(2, 4), (2, 5)], interact=[(2, 6)]),
}
F = META['frameWidth']; nfr = 1 + max(i for a in META['anims'].values() for l in a.values() for i in l); cols = 16
for kind in ('club', 'noclub'):
    frames = [None] * nfr
    for d in ('down', 'up', 'right'):
        rows = cells(src(f'z1-player-{kind}-{d}'))
        sc = 21 / np.median([rows[0][i]['h'] for i in range(min(2, len(rows[0])))])
        cache = {}
        for anim, dirs in META['anims'].items():
            for i, idx in enumerate(dirs[d]):
                r, c = PICK[f'{kind}-{d}'][anim][i % len(PICK[f'{kind}-{d}'][anim])]
                if (r, c) not in cache: cache[(r, c)] = place(rows[r][c]['im'], sc, F, F, META['feetY'])
                frames[idx] = cache[(r, c)]
                if d == 'right': frames[dirs['left'][i]] = cache[(r, c)].transpose(Image.FLIP_LEFT_RIGHT)
    sheet = Image.new('RGBA', (cols * F, ((nfr + cols - 1) // cols) * F))
    for k, f in enumerate(frames):
        if f is not None: sheet.paste(f, ((k % cols) * F, (k // cols) * F))
    sheet.save(f'{A}/v10/' + ('player.png' if kind == 'club' else 'player-noclub.png'))
print('restyle_z1: ok')
