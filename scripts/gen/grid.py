"""Walk grid from the Tiled map: which 16px tiles a player can stand on (mirrors the runtime colliders)."""
import json, os
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEA, ROAD, SAND, GRASS = 245, 470, 299, 331
HEDGE, BLOCK_H, BLOCK_V = 1121, 1124, 1125
LEGACY_BARRIERS = {1121, 1122, 1123, 1124, 1125}   # make-world.py hedge/fence/roadblock lines baked into map.json (v11 draws its own borders)
WALL_GID = 282                                      # a transparent tile in tiles.png: collision only (v11 borders are painted into the ground)
SOLID_PROPS = {'bench', 'picnic-table', 'bin', 'lamp', 'signpost', 'fence', 'hedge', 'car-red', 'car-blue', 'car-silver', 'windbreak', 'minigolf-hut',
               'swings', 'slide', 'roundabout', 'climbing-frame'}


def props_of(o): return {p['name']: p['value'] for p in o.get('properties', [])}


class Grid:
    def __init__(self):
        m = json.load(open(os.path.join(ROOT, 'public/assets/map.json')))
        self.m, self.W, self.H = m, m['width'], m['height']
        L = {l['name']: l for l in m['layers']}
        self.L = L
        self.ground = L['ground']['data']; self.objects = [0 if g in LEGACY_BARRIERS else g for g in L['objects']['data']]  # v11: old hedge lines are gone
        self.caravans = [dict(o, p=props_of(o)) for o in L['caravans']['objects']]
        self.buildings = [dict(o, p=props_of(o)) for o in L['buildings']['objects']]
        self.landmarks = {props_of(o)['segId']: (int(o['x'] // 16), int(o['y'] // 16)) for o in L['landmarks']['objects']}
        self.gates = {o['name']: o for o in L['gates']['objects']}
        self.props = [dict(o, p=props_of(o)) for o in L['props']['objects']]
        self.rects = []  # static solid px rects (x, y, w, h)
        for o in self.buildings:
            ins = o['p'].get('inset', 0); self.rects.append((o['x'] + 4, o['y'] + ins, o['width'] - 8, o['height'] - ins - 3))
        for o in self.caravans:
            ins = 20 if o['p'].get('orient') == 'v' else 14
            self.rects.append((o['x'] + 2, o['y'] + ins, o['width'] - 4, o['height'] - ins - 2))
        for o in self.props:
            if o['name'] not in SOLID_PROPS: continue
            im = Image.open(os.path.join(ROOT, f"public/assets/props/{o['name']}.png")); w, h = im.size
            dw = o['p'].get('w', w); bh = min(10, h * 0.6)
            self.rects.append((o['x'] - dw / 2 + 1, o['y'] + h / 2 - bh, dw - 2, bh))
        self.block = bytearray(self.W * self.H)
        for i in range(self.W * self.H):
            if self.ground[i] == SEA or self.objects[i]: self.block[i] = 1
        for r in self.rects: self.block_rect(r)

    def block_rect(self, r, val=1):
        x, y, w, h = r
        for ty in range(max(0, int(y // 16) - 1), min(self.H, int((y + h) // 16) + 2)):
            for tx in range(max(0, int(x // 16) - 1), min(self.W, int((x + w) // 16) + 2)):
                # tile blocked if the rect overlaps the tile's inner foot area
                if x < tx * 16 + 13 and x + w > tx * 16 + 3 and y < ty * 16 + 14 and y + h > ty * 16 + 5: self.block[ty * self.W + tx] = val

    def idx(self, x, y): return y * self.W + x
    def inb(self, x, y): return 0 <= x < self.W and 0 <= y < self.H
    def g(self, x, y): return self.ground[y * self.W + x]
    def free(self, x, y): return self.inb(x, y) and not self.block[y * self.W + x]

    def flood(self, start, passable):
        """BFS over tiles; passable(x, y) -> bool. Returns set of tile indices."""
        seen = {self.idx(*start)}; q = deque([start]); W = self.W
        while q:
            x, y = q.popleft()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < self.H:
                    i = ny * W + nx
                    if i not in seen and passable(nx, ny): seen.add(i); q.append((nx, ny))
        return seen

    def caravan(self, seg):
        return next(c for c in self.caravans if c['p'].get('segId') == seg)

    ART = None
    def art(self, c):
        """caravan art: (variant, flip). Variant comes from map.json; h caravans flip on odd segIds for variety."""
        return (c['p'].get('variant', 0), c['p'].get('orient') == 'h' and c['p'].get('segId', 0) % 2 == 1)

    def door_px(self, c):  # outside the front door, under the door drawn on the sprite (public/assets/art.json)
        if Grid.ART is None:
            f = os.path.join(ROOT, 'public/assets/art.json'); Grid.ART = json.load(open(f)) if os.path.exists(f) else {}
        m = Grid.ART.get(c['p'].get('orient', 'h'))
        if not m: return (c['x'] + c['width'] / 2, c['y'] + c['height'])
        fx = 1 - m['doorFx'] if self.art(c)[1] else m['doorFx']
        return (round(c['x'] - m['ox'] + fx * m['fw']), c['y'] + c['height'])
