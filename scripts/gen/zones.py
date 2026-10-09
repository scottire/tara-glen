"""v11 zones: Scott's hand-drawn zone outlines (content/world.json zones[].poly, tile coords) -> a zone per tile, the borders
between zones (every walkable tile touching a later zone becomes a diegetic blocker), and the gates on those borders.
The borders are generated from the outlines, so there is no gap to sneak through by construction; build.py still proves it
with a flood fill per zone (validate_seal)."""
from collections import deque


def inside(x, y, poly):
    c = False; n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c


def raster(poly, W, H, scale=1.0):
    """tiles whose centre lies inside the polygon (polygon in tile units * scale)"""
    from PIL import Image, ImageDraw
    im = Image.new('L', (W, H), 0); ImageDraw.Draw(im).polygon([(p[0] * scale - 0.5, p[1] * scale - 0.5) for p in poly], fill=1)
    return im.tobytes()


def zone_map(zones, W, H):
    """zone index (1-based) per tile: inside an outline (first match wins), else the nearest outlined zone (BFS)"""
    Z = bytearray(W * H); q = deque()
    for i, z in enumerate(zones):
        m = raster(z['poly'], W, H) if 'poly' in z else bytes(1 if x >= z['xmin'] else 0 for y in range(H) for x in range(W))
        for j in range(W * H):
            if m[j] and not Z[j]: Z[j] = i + 1; q.append((j % W, j // W))
    while q:
        x, y = q.popleft(); k = Z[y * W + x]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not Z[ny * W + nx]: Z[ny * W + nx] = k; q.append((nx, ny))
    return Z


def border_tiles(Z, free, W, H):
    """walkable tiles with a walkable 4-neighbour in a LATER zone -> {tile: (zone, other zone)}; blocking these seals every pair"""
    out = {}
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if not free(x, y): continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < H and free(nx, ny) and Z[ny * W + nx] > Z[i]:
                    out[(x, y)] = (Z[i], Z[ny * W + nx]); break
    return out


def gate_tiles(border, a, b, near, width):
    """border tiles of the a|b border closest to `near`, grown along the border to `width` tiles"""
    cand = [t for t, p in border.items() if set(p) == {a, b}]
    if not cand: return []
    seed = min(cand, key=lambda t: (t[0] - near[0]) ** 2 + (t[1] - near[1]) ** 2)
    pick, frontier = [seed], [seed]
    cs = set(cand)
    while len(pick) < width and frontier:
        nxt = []
        for (x, y) in frontier:
            for d in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                t = (x + d[0], y + d[1])
                if t in cs and t not in pick and len(pick) < width: pick.append(t); nxt.append(t)
        frontier = nxt
    return pick
