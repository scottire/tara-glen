"""v10 player: hand-pixelled by code in the house palette (scripts/gen/tgstyle/style.py ramps, STYLE.md rules).
Irish kid, messy brown hair, green GAA jersey with a cream hoop, navy shorts, white runners, swinging a golf iron.
24x24 frames, feet on row 22. Shading is per material: light step on the top-left edge, dark step bottom-right,
selective outline = darkest step of each material's own ramp. Left is the mirror of right.
Writes public/assets/v10/player.png + player.json (anim -> dir -> frame indices) and fx.png (swoosh / spin / glow)."""
import json, math, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from tgstyle.style import RAMPS, rgb

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
F = 24
# material -> (outline, dark, mid, light) from the locked ramps
M = {
    'hair':  [RAMPS['wood'][0], RAMPS['wood'][1], RAMPS['wood'][2], RAMPS['wood'][3]],
    'skin':  [RAMPS['skin'][0], RAMPS['skin'][1], RAMPS['skin'][2], RAMPS['skin'][3]],
    'shirt': [RAMPS['leaf'][0], RAMPS['leaf'][2], RAMPS['leaf'][3], RAMPS['leaf'][4]],
    'hoop':  [RAMPS['leaf'][0], RAMPS['cream'][2], RAMPS['cream'][3], RAMPS['cream'][4]],
    'short': [RAMPS['blue'][0], RAMPS['blue'][0], RAMPS['blue'][1], RAMPS['blue'][2]],
    'shoe':  [RAMPS['stone'][1], RAMPS['white'][0], RAMPS['white'][1], RAMPS['white'][1]],
    'shaft': [RAMPS['tarmac'][1], RAMPS['stone'][2], RAMPS['stone'][4], RAMPS['stone'][5]],
    'head':  [RAMPS['tarmac'][1], RAMPS['stone'][3], RAMPS['stone'][4], RAMPS['stone'][5]],
    'grip':  [RAMPS['tarmac'][0], RAMPS['tarmac'][1], RAMPS['tarmac'][2], RAMPS['tarmac'][3]],
    'eye':   [RAMPS['wood'][0]] * 4,
}
NOSHADE = {'eye', 'shaft', 'grip'}

class C:
    def __init__(s): s.m = {}
    def px(s, x, y, mat):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < F and 0 <= y < F: s.m[(x, y)] = mat
    def rect(s, x, y, w, h, mat):
        for i in range(w):
            for j in range(h): s.px(x + i, y + j, mat)
    def line(s, x0, y0, x1, y1, mat):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1): t = i / max(1, n); s.px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, mat)

def club(c, hx, hy, ang, L=9):
    """golf iron from the hands at angle ang (radians, 0 = right, y down): grip, steel shaft, angled iron head"""
    ca, sa = math.cos(ang), math.sin(ang)
    c.line(hx, hy, hx + ca * 2, hy + sa * 2, 'grip')
    c.line(hx + ca * 2, hy + sa * 2, hx + ca * L, hy + sa * L, 'shaft')
    ex, ey = hx + ca * L, hy + sa * L
    # iron head: a 3x2 blade set perpendicular-ish to the shaft, toe pointing "forward"
    px, py = -sa, ca
    for k in range(3):
        c.px(ex + px * (k - 0.5), ey + py * (k - 0.5), 'head'); c.px(ex + px * (k - 0.5) + ca, ey + py * (k - 0.5) + sa, 'head')

def body(c, d, step=0, bob=0, lean=0, arms='side', hand=None, crouch=0, eyes='open'):
    """d in down/up/right. step -1..1 leg phase. Returns hand position (for the club)."""
    y0 = 4 + bob + crouch  # top of head
    if d in ('down', 'up'):
        # legs + runners
        lf, rf = (-1 if step > 0 else 0), (-1 if step < 0 else 0)
        c.rect(9, 18 + crouch, 2, 3, 'skin'); c.rect(13, 18 + crouch, 2, 3, 'skin')
        c.rect(9, 20 + crouch + lf, 2, 2, 'shoe'); c.rect(13, 20 + crouch + rf, 2, 2, 'shoe')
        c.rect(8 + lean, 16 + bob + crouch, 8, 2, 'short')
        c.rect(8 + lean, 11 + bob + crouch, 8, 6, 'shirt'); c.rect(8 + lean, 13 + bob + crouch, 8, 1, 'hoop')
        # arms
        if arms == 'side':
            c.rect(6 + lean, 11 + bob + crouch, 2, 3, 'shirt'); c.rect(16 + lean, 11 + bob + crouch, 2, 3, 'shirt')
            c.rect(6 + lean, 14 + bob + crouch - (1 if step > 0 else 0), 2, 2, 'skin'); c.rect(16 + lean, 14 + bob + crouch - (1 if step < 0 else 0), 2, 2, 'skin')
        # head
        c.rect(8 + lean, y0 + 1, 8, 6, 'skin')
        c.rect(7 + lean, y0, 10, 3, 'hair'); c.rect(7 + lean, y0 + 3, 1, 2, 'hair'); c.rect(16 + lean, y0 + 3, 1, 2, 'hair')
        for x in (8, 11, 14): c.px(x + lean, y0 - 1, 'hair')  # messy tufts
        for x in (7, 16): c.m.pop((x + lean, y0), None)  # round the skull
        if d == 'up': c.rect(8 + lean, y0 + 1, 8, 5, 'hair')
        else:
            c.rect(8 + lean, y0 + 3, 3, 1, 'hair')  # fringe
            if eyes == 'open': c.px(10 + lean, y0 + 4, 'eye'); c.px(13 + lean, y0 + 4, 'eye')
            else: c.px(10 + lean, y0 + 4, 'eye'); c.px(13 + lean, y0 + 4, 'eye'); c.px(11 + lean, y0 + 5, 'skin')
    else:  # right-facing profile
        a, b = (1, -1) if step > 0 else (-1, 1) if step < 0 else (0, 0)
        c.rect(10 + a, 18 + crouch, 2, 2, 'skin'); c.rect(12 + b, 18 + crouch, 2, 2, 'skin')
        c.rect(10 + a, 20 + crouch, 3, 2, 'shoe'); c.rect(12 + b, 20 + crouch, 3, 2, 'shoe')
        c.rect(9 + lean, 16 + bob + crouch, 6, 3, 'short')
        c.rect(9 + lean, 11 + bob + crouch, 6, 6, 'shirt'); c.rect(9 + lean, 13 + bob + crouch, 6, 1, 'hoop')
        if arms == 'side': c.rect(11 + lean - step, 12 + bob + crouch, 2, 3, 'shirt'); c.rect(11 + lean - step, 15 + bob + crouch, 2, 2, 'skin')
        c.rect(9 + lean, y0 + 1, 7, 6, 'skin'); c.rect(8 + lean, y0, 7, 3, 'hair'); c.rect(8 + lean, y0 + 3, 3, 3, 'hair')
        for x in (9, 12): c.px(x + lean, y0 - 1, 'hair')
        c.px(16 + lean, y0 + 4, 'skin')  # nose
        if eyes == 'open': c.px(14 + lean, y0 + 3, 'eye')
        else: c.px(14 + lean, y0 + 4, 'eye')
    return None

def arms_to(c, d, hx, hy, lean=0, bob=0):
    """both arms reaching to the hands at (hx, hy) (two-handed golf grip)"""
    sh = [(7 + lean, 12 + bob), (16 + lean, 12 + bob)] if d in ('down', 'up') else [(11 + lean, 12 + bob)]
    for sx, sy in sh:
        c.line(sx, sy, (sx + hx) / 2, (sy + hy) / 2, 'shirt'); c.line((sx + hx) / 2, (sy + hy) / 2, hx, hy, 'skin')
    c.rect(int(hx) - 1, int(hy) - 1, 2, 2, 'skin')

BASE = {'down': math.pi / 2, 'up': -math.pi / 2, 'right': 0.0}
def hands_at(d, ang, r=6):
    cx, cy = 12, 14
    return cx + math.cos(ang) * r, cy + math.sin(ang) * r * 0.8

def render(c):
    """shade (top-left light) + selective outline -> RGBA image"""
    im = Image.new('RGBA', (F, F), (0, 0, 0, 0)); P = im.load(); m = c.m
    for (x, y), mat in m.items():
        r = M[mat]; col = r[2]
        if mat not in NOSHADE:
            if m.get((x - 1, y)) != mat or m.get((x, y - 1)) != mat: col = r[3]
            if m.get((x + 1, y)) != mat and m.get((x, y + 1)) != mat: col = r[1]
            if m.get((x, y + 1)) is None and mat in ('shirt', 'short', 'hair'): col = r[1]
        P[x, y] = rgb(col) + (255,)
    for y in range(F):
        for x in range(F):
            if (x, y) in m: continue
            nb = [m.get((x + dx, y + dy)) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
            nb = [n for n in nb if n]
            if nb:  # outline in the darkest step of the neighbouring material (shoes/club by priority)
                pick = next((n for n in ('shaft', 'head', 'grip', 'shoe', 'skin', 'hair', 'shirt', 'short', 'hoop') if n in nb), nb[0])
                P[x, y] = rgb(M[pick][0]) + (255,)
    return im

def pose(d, kind, i=0):
    c = C(); mirror = d == 'left'; dd = 'right' if mirror else d
    a0 = BASE[dd]
    behind = dd == 'up'  # club drawn first when facing away
    def swing_frame(ang, lean=0, crouch=0, L=9):
        hx, hy = hands_at(dd, ang, 5)
        if behind: club(c, hx, hy, ang, L)
        body(c, dd, arms='none', lean=lean, crouch=crouch)
        arms_to(c, dd, hx, hy, lean, crouch)
        if not behind: club(c, hx, hy, ang, L)
    if kind == 'idle':
        body(c, dd, bob=i % 2); hx, hy = (17, 15 + i % 2) if dd != 'right' else (13, 16 + i % 2)
        club(c, hx, hy, math.pi / 2 + 0.25, 7)
    elif kind == 'walk':
        st = [1, 0, -1, 0][i]; body(c, dd, step=st, bob=0 if st else -1)
        hx, hy = (17, 15) if dd != 'right' else (12, 16 - st)
        club(c, hx, hy, math.pi / 2 + 0.3 + 0.15 * st, 7)
    elif kind.startswith('swing'):
        n = int(kind[-1]); arc = [(-2.0, 0.0, 1.7), (1.9, 0.2, -1.6), (-2.6, 0.0, 2.6)][n - 1]  # windup, strike, follow-through
        ang = a0 + arc[i]; swing_frame(ang, lean=[0, 1, 0][i] if dd == 'right' else 0, crouch=1 if n == 3 and i == 1 else 0, L=10 if i == 1 else 9)
    elif kind == 'charge':  # club raised high behind, knees bent; frame 1 = glow flicker (added in code via tint/fx)
        swing_frame(a0 + math.pi - 0.5 if dd != 'up' else a0 + 2.6, crouch=1)
    elif kind == 'spin':
        swing_frame(a0 + i * math.pi / 2, crouch=1, L=10)
    elif kind == 'roll':  # tucked ball: hair / jersey / shorts rotate round
        ang = i * math.pi / 2 + (0 if dd != 'right' else 0.3); cx, cy = 12, 16
        for y in range(-5, 6):
            for x in range(-5, 6):
                if x * x + y * y <= 26:
                    a = (math.atan2(y, x) - ang) % (2 * math.pi)
                    c.px(cx + x, cy + y, 'hair' if a < 1.6 else 'skin' if a < 2.2 else 'shirt' if a < 4.3 else 'short' if a < 5.4 else 'shoe')
        c.px(cx + math.cos(ang + 1.9) * 3, cy + math.sin(ang + 1.9) * 3, 'eye')
    elif kind == 'hurt':
        body(c, dd, lean=-1 if dd == 'right' else 0, bob=-1, eyes='shut')
        club(c, 16, 14, -0.6, 7)
    elif kind == 'faint':
        body(c, 'down', eyes='shut'); club(c, 18, 19, 0.2, 7)
    elif kind == 'interact':
        body(c, dd, arms='none'); hx, hy = hands_at(dd, a0 - (0.4 if dd != 'up' else 0), 6); arms_to(c, dd, hx, hy - 2)
        club(c, 18 if dd != 'right' else 9, 16, math.pi / 2 + 0.3, 7)
    im = render(c)
    if kind == 'faint': im = im.rotate(-90 if i else -45 if False else -90, expand=False).transpose(Image.Transpose.FLIP_LEFT_RIGHT) if i else im
    if mirror: im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return im

ANIMS = [('idle', 2), ('walk', 4), ('swing1', 3), ('swing2', 3), ('swing3', 3), ('charge', 2), ('spin', 4), ('roll', 4), ('hurt', 1), ('faint', 2), ('interact', 1)]
DIRS = ['down', 'up', 'left', 'right']

def fx_sheet():
    """effects in matched style: swoosh (3 frames, points right, rotated in code), spin ring (2), charge glow (2), ball (1)"""
    S = 32; im = Image.new('RGBA', (S * 8, S), (0, 0, 0, 0)); P = im.load()
    cream, yel, white = [rgb(h) for h in (RAMPS['cream'][3], RAMPS['yellow'][2], RAMPS['white'][1])]
    def arc(ox, r0, r1, a0, a1, cols):
        for y in range(S):
            for x in range(S):
                dx, dy = x - S / 2 + 0.5, y - S / 2 + 0.5; r = math.hypot(dx, dy); a = math.atan2(dy, dx)
                if r0 <= r <= r1 and a0 <= a <= a1:
                    k = (a - a0) / max(1e-6, a1 - a0); col = cols[min(len(cols) - 1, int(k * len(cols)))]
                    P[ox + x, y] = col + (255,)
    arc(0, 9, 12, -1.0, 0.2, [cream, white])
    arc(S, 8, 13, -1.2, 1.2, [cream, yel, white, white, yel])
    arc(2 * S, 10, 12, 0.4, 1.3, [cream])
    arc(3 * S, 11, 14, -math.pi, math.pi, [yel, white, cream, white])
    arc(4 * S, 12, 15, -math.pi, math.pi, [white, cream])
    arc(5 * S, 7, 8, -math.pi, math.pi, [yel]); arc(6 * S, 8, 9, -math.pi, math.pi, [RAMPS['yellow'][3] and rgb(RAMPS['yellow'][3])])
    for x, y in ((14, 14), (15, 14), (14, 15), (15, 15), (16, 15), (15, 16)): P[7 * S + x, y] = white + (255,)
    for x, y in ((13, 15), (14, 16), (15, 17), (16, 16)): P[7 * S + x, y] = rgb(RAMPS['stone'][1]) + (255,)
    for x, y in ((14, 13), (15, 13), (13, 14)): P[7 * S + x, y] = rgb(RAMPS['stone'][1]) + (255,)
    return im

def main():
    frames, meta = [], {'frameWidth': F, 'frameHeight': F, 'feetY': 22, 'anims': {}}
    for name, n in ANIMS:
        meta['anims'][name] = {}
        for d in DIRS:
            idx = []
            for i in range(n): idx.append(len(frames)); frames.append(pose(d, name, i))
            meta['anims'][name][d] = idx
    cols = 16; rows = (len(frames) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * F, rows * F), (0, 0, 0, 0))
    for k, f in enumerate(frames): sheet.paste(f, ((k % cols) * F, (k // cols) * F))
    out = os.path.join(ROOT, 'public/assets/v10'); os.makedirs(out, exist_ok=True)
    sheet.save(os.path.join(out, 'player.png')); json.dump(meta, open(os.path.join(out, 'player.json'), 'w'))
    fx_sheet().save(os.path.join(out, 'fx.png'))
    # x4 preview: one row per anim, all four directions
    pv = Image.new('RGBA', (F * 4 * 16 + 8 * 4, F * 4 * len(ANIMS)), (90, 140, 70, 255))
    for r, (name, n) in enumerate(ANIMS):
        x = 0
        for d in DIRS:
            for i in meta['anims'][name][d]: pv.paste(frames[i].resize((F * 4, F * 4), Image.NEAREST), (x, r * F * 4), frames[i].resize((F * 4, F * 4), Image.NEAREST)); x += F * 4
            x += 8
    pv.save('/workspace/tg-v10-player-sheet-x4.png')
    print(f'player: {len(frames)} frames ({cols}x{rows} of {F}px) -> public/assets/v10/player.png')

if __name__ == '__main__': main()
