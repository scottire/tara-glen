"""House-style art pass for the outdoor game (rules: scripts/gen/tgstyle/STYLE.md). Local only (numpy, scipy,
scikit-image, pillow); outputs are committed. CI never runs it.

  caravans  caravan-v4 -> caravan-h.png / caravan-v.png, 3 palette variants each (+ art.json frame/door metadata)
  trees     tree-v4 -> trees.png (3 leaf variants); the old 2x2 tree tiles in tiles.png become transparent
            (trunk tiles keep their collision, world.ts draws the sprite)
  pieces    playground-sheet / props-sheet / clubhouse AI sources cut up and stylised at prop size (after repal)
  repal     props, decor, characters, monsters, items, gates, bike, chest, clubhouse, sea overlays, tiles:
            nearest locked-palette colour + selective outline, read from the pre-restyle originals at ORIG
            so the pass is repeatable. Interiors (assets/v6/interior.png, interior.png) are left as they are.

Usage: python3 scripts/gen/restyle.py [caravans|trees|repal|all]   then python3 scripts/gen/ground.py + build.py
"""
import os, sys, io, json, subprocess
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tgstyle import sprites as P
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
A = os.path.join(ROOT, 'public/assets')
ORIG = '21dc9f8'          # last commit before the house-style restyle (source of the repal inputs)
TREE_TILES = [280, 281, 308, 309, 288, 289, 316, 317, 286, 287, 314, 315]   # 0-based indices in tiles.png (28 cols)

def orig(rel):
    return Image.open(io.BytesIO(subprocess.check_output(['git', 'show', f'{ORIG}:public/assets/{rel}'], cwd=ROOT))).convert('RGBA')

def meta(**kw):
    f = os.path.join(A, 'art.json'); m = json.load(open(f)) if os.path.exists(f) else {}; m.update(kw)
    json.dump(m, open(f, 'w'), indent=1)

def caravans(): meta(**P.caravan_sheets(A))
def trees(): meta(tree=P.tree_sheet(A))

REPAL = {  # rel path: kwargs
    **{f'props/{n}': {} for n in ['bench', 'bin', 'car-blue', 'car-red', 'car-silver', 'climbing-frame', 'deckchair', 'fence', 'flowerbed', 'goal',
                                  'golf-flag', 'hedge', 'lamp', 'minigolf-hut', 'picnic-table', 'roundabout', 'signpost', 'slide', 'swings', 'tennis-net', 'windbreak']},
    'v6/chars.png': {'sat': 1.05}, 'player.png': {'sat': 1.05}, 'npc.png': {}, 'v6/dog.png': {}, 'v6/monsters.png': {}, 'v6/items.png': {'sat': 1.05},
    'gate-h.png': {}, 'gate-v.png': {}, 'bike.png': {}, 'chest.png': {}, 'clubhouse.png': {'ramps': [r for r in P.S.RAMP_IDX if r != 'blue']}, 'balloon.png': {}, 'shell.png': {}, 'gem.png': {}, 'token.png': {},
    'trainers.png': {}, 'note.png': {}, 'baddie.png': {},
}
def repal():
    for rel, kw in REPAL.items():
        rel = rel if rel.endswith('.png') else rel + '.png'
        P.repal(orig(rel), **kw).save(os.path.join(A, rel))
    for n in subprocess.check_output(['git', 'ls-tree', '--name-only', f'{ORIG}:public/assets/v6/decor'], cwd=ROOT, text=True).split():
        P.repal(orig(f'v6/decor/{n}')).save(os.path.join(A, 'v6/decor', n))
    for n, im in P.house_decor().items(): im.save(os.path.join(A, 'v6/decor', n + '.png'))
    for n in ('waves.png', 'foam.png'):   # translucent overlays: palette only, keep alpha
        o = orig(n); r = P.repal(o, do_outline=False); a = np.array(r); a[..., 3] = np.array(o)[..., 3]; a[np.array(o)[..., 3] <= 127, :3] = np.array(r)[..., :3].max(); Image.fromarray(a).save(os.path.join(A, n))
    t = P.repal(orig('tiles.png'), do_outline=False); a = np.array(t)
    for i in TREE_TILES: a[(i // 28) * 16:(i // 28 + 1) * 16, (i % 28) * 16:(i % 28 + 1) * 16] = 0
    Image.fromarray(a).save(os.path.join(A, 'tiles.png'))
    b = Image.new('RGBA', (14, 18)); b.paste(Image.open(os.path.join(P.HERE, 'src/bin-green.png')), (0, 1)); b.save(os.path.join(A, 'props/bin.png'))

def pieces():
    """AI sheets (playground-sheet, props-sheet, clubhouse) cut into objects and stylised at prop size (bodies follow the image size)"""
    pg, pr, cb = P.pieces('playground-sheet'), P.pieces('props-sheet'), P.pieces('clubhouse')[0]
    fl = pr[3]; w, h = fl.size; flag = fl.crop((int(.38 * w), 0, int(.85 * w), int(.66 * h)))
    out = {'props/swings': P.fit(pg[0], 56, 44), 'props/slide': P.fit(pg[1], 40, 34), 'props/climbing-frame': P.fit(pg[2], 44, 40),
           'props/roundabout': P.fit(pg[3], 40, 30), 'props/goal': P.fit(pr[0], 48, 24, ramps=['white', 'stone', 'grass']),
           'props/car-red': P.fit(pr[1], 26, 40), 'props/car-blue': P.fit(pr[2], 26, 40), 'props/car-silver': P.fit(pr[4], 26, 40),
           'props/golf-flag': P.fit(flag, 14, 30), 'clubhouse': P.fit(cb, 192, 136, k=16)}
    for k, im in out.items(): im.save(os.path.join(A, k + '.png'))

STEPS = {'caravans': caravans, 'trees': trees, 'repal': repal, 'pieces': pieces}
if __name__ == '__main__':
    what = sys.argv[1:] or ['all']
    for k, f in STEPS.items():
        if 'all' in what or k in what: f(); print('restyled', k)
