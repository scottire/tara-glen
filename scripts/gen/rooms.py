"""Room generator: stacks ASCII chambers into a screen-filling interior (walls, doorways, exit mat, slots)."""
FLOOR_CH = {'.': 'wood', ',': 'stone', ';': 'lino'}
FLOOR_T = {'wood': (0, 1), 'stone': (16, 17), 'lino': (25, 25)}
FURN = {'B': 6, 'b': 7, 'T': 8, 'S': 9, 's': 10, 'K': 11, 'V': 12, 'C': 13, 'P': 15, 'H': 18, 'X': 19, 'O': 20, 'q': 23, 'R': 24, 't': 26, 'u': 27, 'U': 30, 'F': 31}
FLOOR_DECO = {'r': 4, 'y': 28, 'L': 21}
WALL = {'#': 3, 'w': 2, 'o': 14}
MIN_ROWS = 28  # tall enough that a portrait phone at zoom base+2 is covered edge to edge


def floor_kind(rows):
    cnt = {}
    for r in rows:
        for ch in r:
            if ch in FLOOR_CH: cnt[ch] = cnt.get(ch, 0) + 1
    return FLOOR_CH[max(cnt, key=cnt.get)] if cnt else 'wood'


def walkable(ch): return ch not in WALL and ch not in FURN


def build(rid, chamber_rows, locks=None, rng=None):
    """chamber_rows: list (top->bottom) of row lists. locks: {sep_index: lock}. Returns room dict."""
    w = len(chamber_rows[0][0])
    chs = [list(map(list, rows)) for rows in chamber_rows]
    kinds = [floor_kind(rows) for rows in chamber_rows]
    # pad: insert plain floor rows (before each chamber's last row) until the room is tall enough
    def total(): return sum(len(c) for c in chs) + (len(chs) - 1) + 2
    i = 0
    while total() < MIN_ROWS:
        c = chs[i % len(chs)]; f = {'wood': '.', 'stone': ',', 'lino': ';'}[kinds[i % len(chs)]]
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
    floor, walls, furn = [], [], []
    slots, eslots = {}, []
    for y in range(H):
        k = kind_of_row[y] or next((kind_of_row[yy] for yy in range(y + 1, H) if kind_of_row[yy]), 'wood')
        for x in range(Wd):
            ch = grid[y][x]; ft = FLOOR_T[k][(x + y) % 2]
            if ch in WALL: floor.append(-1); walls.append(WALL[ch]); furn.append(-1); continue
            walls.append(-1)
            if ch == 'E': floor.append(5); furn.append(-1); continue
            if ch in FURN: floor.append(ft); furn.append(FURN[ch]); continue
            floor.append(FLOOR_DECO.get(ch, ft)); furn.append(-1)
            if ch.isdigit(): slots[ch] = [x, y]
            if ch == 'x': eslots.append([x, y])
    chamber_idx = lambda y: chamber_of_row[y] if 0 <= y < H else None
    return {'id': rid, 'w': Wd, 'h': H, 'floor': floor, 'walls': walls, 'furn': furn, 'exit': [c, H - 1], 'spawn': [c, H - 2],
            'slots': slots, 'eslots': eslots, 'locks': inner, 'chamberOf': [chamber_idx(y) for y in range(H)], 'seps': seps}
