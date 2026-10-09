"""Room generator: stacks ASCII chambers into a screen-filling interior (walls, doorways, exit mat, slots)."""
FLOOR_CH = {'.': 'wood', ',': 'stone', ';': 'lino', ':': 'forest', 'c': 'carpet'}
FLOOR_T = {'wood': (0, 1), 'stone': (16, 17), 'lino': (25, 25), 'forest': (32, 33), 'carpet': (43, 44)}
# v11 Glen (forest interior): ^ slope (one-way down), | root steps, n path back up, ~ stream, Y tree, J rope-swing tree
MARKS = {'^': 'slope', '|': 'steps', 'n': 'top', 'J': 'swing'}
FURN = {'Y': 37, 'J': 39, 'B': 6, 'b': 7, 'T': 8, 'S': 9, 's': 10, 'K': 11, 'V': 12, 'C': 13, 'P': 15, 'H': 18, 'X': 19, 'O': 20, 'q': 23, 'R': 24, 't': 26, 'u': 27, 'U': 30, 'F': 31}
FLOOR_DECO = {'y': 28, '^': 34, '|': 38, 'n': 40, 'c': 43, 'm': 46, 'z': 47, 'g': 50, 'k': 51}
# v11 interiors: furniture is drawn from the stylised interior-props sheet (public/assets/v6/ip/*.png), one sprite per run of the
# same letter; its footprint tiles get an invisible collision tile so the bodies match the drawing. Rugs are floor-level.
PROPS = {'S': 'sofa', 'V': 'tv', 'K': 'kitchen', 'U': 'bunk', 'C': 'wardrobe', 'T': 'table', 'L': 'lamp', 'H': 'shelf', 'r': 'rug', 'P': 'plant'}
SOLID_PROP = 63
WALL_DECO = {'Z': 48, 'Q': 52}   # poster / picture on the panelled wall row
WALL = {'#': 3, 'w': 2, 'o': 14, '~': 36, 'Z': 48, 'Q': 52}
FOREST_WALL = 41
MIN_ROWS = 28  # tall enough that a portrait phone at zoom base+2 is covered edge to edge
COMPACT_ROWS = 18  # v11 caravans: a 1-2 room mobile pads less (the camera covers the screen at zoom 3 from ~18 rows)


def floor_kind(rows):
    cnt = {}
    for r in rows:
        for ch in r:
            if ch in FLOOR_CH: cnt[ch] = cnt.get(ch, 0) + 1
    return FLOOR_CH[max(cnt, key=cnt.get)] if cnt else 'wood'


def walkable(ch): return ch not in WALL and ch not in FURN and (ch not in PROPS or ch == 'r') and ch != 'G'


def build(rid, chamber_rows, locks=None, rng=None):
    """chamber_rows: list (top->bottom) of row lists. locks: {sep_index: lock}. Returns room dict."""
    w = len(chamber_rows[0][0])
    chs = [list(map(list, rows)) for rows in chamber_rows]
    kinds = [floor_kind(rows) for rows in chamber_rows]
    # pad: insert plain floor rows (before each chamber's last row) until the room is tall enough
    def total(): return sum(len(c) for c in chs) + (len(chs) - 1) + 2
    min_rows = MIN_ROWS if 'forest' in kinds or len(chs) > 2 or w > 14 else COMPACT_ROWS
    i = 0
    while total() < min_rows:
        c = chs[i % len(chs)]; f = {'wood': '.', 'stone': ',', 'lino': ';', 'carpet': 'c', 'forest': ':'}[kinds[i % len(chs)]]
        c.insert(len(c) - 1 if len(c) > 2 else len(c), [f] * w); i += 1
    grid, kind_of_row, chamber_of_row = [['#'] * (w + 2)], [None], [None]
    seps = []
    for ci, c in enumerate(chs):
        if ci: seps.append(len(grid)); grid.append(['#'] * (w + 2)); kind_of_row.append(None); chamber_of_row.append(None)
        for r in c: grid.append(['#'] + r + ['#']); kind_of_row.append(kinds[ci]); chamber_of_row.append(ci)
    grid.append(['#'] * (w + 2)); kind_of_row.append(None); chamber_of_row.append(None)
    H, Wd = len(grid), w + 2
    centre = Wd // 2
    def best_col(above, below):  # doorway column pair (c, c+1) walkable in both neighbour rows
        cand = [c for c in range(1, Wd - 2) if all(walkable(grid[above][k]) and grid[above][k] not in '123456789x' for k in (c, c + 1))
                and all(walkable(grid[below][k]) for k in (c, c + 1))]
        if not cand:  # clear furniture to force a path
            c = centre - 1
            for k in (c, c + 1):
                for rr in (above, below):
                    if not walkable(grid[rr][k]): grid[rr][k] = '.'
            return c
        return min(cand, key=lambda c: abs(c + 0.5 - centre + 0.5))
    inner = []
    for si, s in enumerate(seps):
        # separator row s; the row below is the next chamber's wall face; need walkable rows at s-1 and s+2
        c = best_col(s - 1, s + 2)
        for k in (c, c + 1): grid[s][k] = 'D'; grid[s + 1][k] = 'D'
        lk = (locks or {}).get(si)
        if lk: inner.append(dict(lk, tiles=[[c, s], [c + 1, s]]))
    # exit mat in the bottom wall under the last chamber
    last = H - 2; c = best_col(last, last)
    grid[H - 1][c] = 'E'
    props, seen = [], set()
    for y in range(H):
        for x in range(Wd):
            ch = grid[y][x]
            if ch not in PROPS or (x, y) in seen: continue
            comp, st = [], [(x, y)]; seen.add((x, y))
            while st:
                cx, cy = st.pop(); comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < Wd and 0 <= ny < H and (nx, ny) not in seen and grid[ny][nx] == ch: seen.add((nx, ny)); st.append((nx, ny))
            xs, ys = [c[0] for c in comp], [c[1] for c in comp]
            props.append({'k': PROPS[ch], 'x': min(xs), 'y': min(ys), 'w': max(xs) - min(xs) + 1, 'h': max(ys) - min(ys) + 1})
    floor, walls, furn = [], [], []
    slots, eslots, marks = {}, [], {}
    forest = 'forest' in kinds
    for y in range(H):
        k = kind_of_row[y] or next((kind_of_row[yy] for yy in range(y + 1, H) if kind_of_row[yy]), 'wood')
        for x in range(Wd):
            ch = grid[y][x]; ft = FLOOR_T[k][(x + y) % 2]
            if ch in MARKS: marks.setdefault(MARKS[ch], []).append([x, y])
            if ch in WALL:
                wt = FOREST_WALL if forest and ch == '#' else WALL[ch]
                floor.append(32 + (x + y) % 2 if ch == '~' else -1); walls.append(wt); furn.append(-1); continue
            walls.append(-1)
            if ch == 'E': floor.append(40 if forest else 5); furn.append(-1); continue
            if ch == '^': floor.append(34 + (y % 2)); furn.append(-1); continue
            if ch in FURN: floor.append(ft); furn.append(FURN[ch]); continue
            if ch in PROPS: floor.append(ft); furn.append(-1 if ch == 'r' else SOLID_PROP); continue
            if ch == 'G': floor.append(ft); furn.append(49); continue
            if ch in FLOOR_CH: ft = FLOOR_T[FLOOR_CH[ch]][(x + y) % 2]  # v11: floor zones follow the letter (lino kitchen end, carpet)
            floor.append(FLOOR_DECO.get(ch, ft)); furn.append(-1)
            if ch.isdigit(): slots[ch] = [x, y]
            if ch == 'x': eslots.append([x, y])
    chamber_idx = lambda y: chamber_of_row[y] if 0 <= y < H else None
    return {'id': rid, 'w': Wd, 'h': H, 'floor': floor, 'walls': walls, 'furn': furn, 'exit': [c, H - 1], 'spawn': [c, H - 2],
            'slots': slots, 'eslots': eslots, 'locks': inner, 'marks': marks, 'props': props, 'chamberOf': [chamber_idx(y) for y in range(H)], 'seps': seps}
