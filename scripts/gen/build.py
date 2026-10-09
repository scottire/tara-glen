#!/usr/bin/env python3
"""Tara Glen content generator + validator.
  content/*.json + public/assets/map.json  ->  public/world.json, public/rooms.json, gen-report.md
Deterministic (world.seed). Never hand-edit the outputs: edit content/ and run `npm run gen`.
`--check` regenerates in memory and fails if the committed outputs differ (CI)."""
import json, os, sys, random, math
from collections import deque
from grid import Grid, ROOT, ROAD, SAND, SEA, HEDGE, BLOCK_H, BLOCK_V, WALL_GID
import rooms as RG
from logic import ok, apply, mentions
from art import DECOR, ANIM, ITEM_SPRITES, MONSTER_ORDER

CHECK = '--check' in sys.argv
def J(p): return json.load(open(os.path.join(ROOT, p)))
C = {k: J(f'content/{k}.json') for k in ['world', 'items', 'npcs', 'story', 'rooms', 'decor', 'enemies']}
WD, ITEMS = C['world'], C['items']['items']
rng = random.Random(WD['seed'])
G = Grid(); W, H = G.W, G.H
errors, warns = [], []
def err(m): errors.append(m)
def warn(m): warns.append(m)
def T(x, y): return y * W + x
def px(t): return [t[0] * 16 + 8, t[1] * 16 + 8]

ZONES = {z['id']: z for z in WD['zones']}
ZIDX = {z['id']: i + 1 for i, z in enumerate(WD['zones'])}
import zones as ZN
ZMAP = ZN.zone_map(WD['zones'], W, H)  # v11: Scott's outlines, nearest outline for everything else
def zone_at(x, y): k = ZMAP[T(x, y)]; return WD['zones'][k - 1]['id'] if k else None

# ---------------- v11: solid outdoor forest, zone borders, gates ----------------
barrier_tiles, decor, locks, BORDERS = [], [], [], []   # BORDERS: [x, y, style] painted by ground.py
LOCK_OF = {}
SEG = {o['id']: o for o in J('content/segmentation.json')['objects']}
FD = WD['forest']; FOREST = set()
open_poly = bytearray(W * H)
for zid in FD['open']:
    m = ZN.raster(ZONES[zid]['poly'], W, H)
    for j in range(W * H): open_poly[j] |= m[j]
for sid in FD['seg']:
    m = ZN.raster(SEG[sid]['polygon'], W, H, 2.5 / 16)
    for j in range(W * H):
        if m[j] and not open_poly[j] and not G.block[j]: FOREST.add(j); G.block[j] = 1
def forest_edge(zid):  # forest tiles with a walkable 4-neighbour in zone zid -> [(forest tile, free neighbour)]
    out = []
    for j in FOREST:
        x, y = j % W, j // W
        for nx, ny in ((x, y + 1), (x - 1, y), (x + 1, y), (x, y - 1)):
            if G.free(nx, ny) and zone_at(nx, ny) == zid: out.append(((x, y), (nx, ny))); break
    return out
EDGE_Z = {zid: forest_edge(zid) for zid in ('z1', 'z2')}
for zid, es in EDGE_Z.items():
    for (t, _) in es: BORDERS.append([t[0], t[1], 'thicket'])
def pick_edge(zid, near):  # a forest-edge tile whose free neighbour is directly below it (a gap you walk up into)
    cand = [(t, n) for t, n in EDGE_Z[zid] if n == (t[0], t[1] + 1) and G.free(n[0], n[1] + 1)]
    return min(cand, key=lambda c: (c[0][0] - near[0]) ** 2 + (c[0][1] - near[1]) ** 2)
GLEN_GAP, GLEN_OUT = pick_edge('z1', FD['glenDoor'])
GLEN_EXIT_GAP, GLEN_EXIT = pick_edge('z2', FD['glenExit'])
BORDERS[:] = [b for b in BORDERS if (b[0], b[1]) not in (GLEN_GAP, GLEN_EXIT_GAP)]
BORDERS += [[GLEN_GAP[0], GLEN_GAP[1], 'gap'], [GLEN_EXIT_GAP[0], GLEN_EXIT_GAP[1], 'gap']]  # the two paths into the trees

BORDER = ZN.border_tiles(ZMAP, G.free, W, H)
GATE_TILES = {}
for gd in WD['gates']:
    ts = ZN.gate_tiles(BORDER, ZIDX[gd['from']], ZIDX[gd['to']], gd['near'], gd.get('width', 3))
    if not ts: err(f"gate {gd['id']}: no {gd['from']}|{gd['to']} border near {gd['near']}"); continue
    for t in ts: GATE_TILES[t] = gd['id']
BLOCKER_TILES = {}
for bd in WD.get('blockers', []):
    for t in ZN.gate_tiles(BORDER, ZIDX[bd['pair'][0]], ZIDX[bd['pair'][1]], bd['near'], 4): BLOCKER_TILES[t] = bd['id']
def style_of(t, pair):
    a, b = (WD['zones'][k - 1]['id'] for k in pair)
    if G.g(*t) == ROAD and WD['borderStyle'].get(f'{a}|{b}') != 'bank': return 'road'
    if G.g(*t) == SAND: return 'dune'
    return WD['borderStyle'].get(f'{a}|{b}', WD['borderStyle']['default'])
for t, pair in sorted(BORDER.items()):
    if t in GATE_TILES: continue
    G.block[T(*t)] = 1; barrier_tiles.append([t[0], t[1], WALL_GID])
    BORDERS.append([t[0], t[1], 'choke' if t in BLOCKER_TILES else style_of(t, pair)])
for bd in WD.get('blockers', []):  # skip + van parked across the choke road (drawn, the tiles are already solid)
    ts = sorted(t for t, i in BLOCKER_TILES.items() if i == bd['id'])
    for k, spr in enumerate(bd['decor']):
        t = ts[min(len(ts) - 1, k * 2)]; decor.append({'sprite': spr, 'x': t[0], 'y': t[1], 'solid': False, 'lines': [bd['text']] if k == 0 else []})

TIDE = WD.get('tide')
lock_defs = list(C['story']['locks'])
for gd in WD['gates']:
    ts = [t for t, i in GATE_TILES.items() if i == gd['id']]
    if ts: lock_defs.append(dict({k: v for k, v in gd.items() if k not in ('near', 'width')}, tiles_=ts))
lock_defs.append({'id': 'glen_brambles', 'kind': 'crack', 'req': ['drive'], 'art': 'brambles', 'tiles_': [GLEN_OUT],
                  'text': "Brambles choke the gap into the trees behind 127. A charged drive would clear them."})
def rect_tiles(r): return [(x, y) for y in range(r[1], r[3] + 1) for x in range(r[0], r[2] + 1)]
for L in lock_defs:
    tiles = L.pop('tiles_') if 'tiles_' in L else rect_tiles(L['rect'])
    tiles = [t for t in tiles if t not in LOCK_OF]
    for t in tiles: LOCK_OF[T(*t)] = L['id']; G.block[T(*t)] = 0
    xs, ys = [t[0] for t in tiles], [t[1] for t in tiles]
    locks.append(dict({k: v for k, v in L.items() if k not in ('rect', 'tide', 'barrier')}, tiles=[list(t) for t in tiles],
                      rect=[min(xs) * 16, min(ys) * 16, (max(xs) - min(xs) + 1) * 16, (max(ys) - min(ys) + 1) * 16]))
LOCKS = {l['id']: l for l in locks}

def passable_fn(open_locks):
    def p(x, y):
        i = y * W + x; l = LOCK_OF.get(i)
        if l is not None: return l in open_locks
        return not G.block[i]
    return p

# ---------------- doors ----------------
START_ROOM = WD['start']['room']
cur_room_door = {}
DOOR_TILES = set()
def caravan_door(c):
    cx, by = G.door_px(c)
    return {'x': cx, 'y': by, 'out': [cx, by + 10], 'tile': (int(cx // 16), int((by + 10) // 16)), 'seg': c['p'].get('segId')}
hcar = list(G.caravans)  # both orientations have their front door at the bottom centre
ALL_DOORS = {c['p']['segId']: caravan_door(c) for c in hcar}
for d in ALL_DOORS.values():
    DOOR_TILES.add(T(*d['tile'])); DOOR_TILES.add(T(int(d['x'] // 16), int((d['y'] - 2) // 16)))
club = next(b for b in G.buildings if b['name'] == 'clubhouse')
CLUB_DOOR = {'x': club['x'] + club['width'] / 2, 'y': club['y'] + club['height'], 'out': [club['x'] + club['width'] / 2, club['y'] + club['height'] + 10]}
CLUB_DOOR['tile'] = (int(CLUB_DOOR['out'][0] // 16), int(CLUB_DOOR['out'][1] // 16)); DOOR_TILES.add(T(*CLUB_DOOR['tile']))
start_c = G.caravan(int(C['rooms']['rooms'][START_ROOM]['door'].split(':')[1]))
START_T = ALL_DOORS[start_c['p']['segId']]['tile']

ALL_OPEN = set(LOCKS)
def open_all():  # everything walkable with every lock open; the Glen room is the only link from the start area to Playground Row
    return G.flood(START_T, passable_fn(ALL_OPEN)) | G.flood(GLEN_EXIT, passable_fn(ALL_OPEN))
OPEN = open_all()
if len(OPEN) < 1000: err(f'start {START_T} is enclosed ({len(OPEN)} tiles)')

# ---------------- placement ----------------
OCC = set()
OFFS = sorted([(dx, dy) for dx in range(-16, 17) for dy in range(-16, 17)], key=lambda o: (o[0] ** 2 + o[1] ** 2, o))
def acceptable(x, y, zone=None, sep=0, road_ok=True, sand=None, foot=None):
    if not G.inb(x, y): return False
    i = T(x, y)
    if i not in OPEN or i in LOCK_OF or i in DOOR_TILES or G.block[i]: return False
    if zone and zone_at(x, y) != zone: return False
    if not road_ok and G.g(x, y) == ROAD: return False
    if sand is True and G.g(x, y) != SAND: return False
    for dx in range(-sep, sep + 1):
        for dy in range(-sep, sep + 1):
            if T(x + dx, y + dy) in OCC: return False
    for (fx, fy) in foot or []:
        if not G.inb(x + fx, y + fy): return False
        j = T(x + fx, y + fy)
        if j not in OPEN or j in LOCK_OF or j in DOOR_TILES or j in OCC or G.block[j]: return False
    return True
def snap(t, **kw):
    for dx, dy in OFFS:
        if acceptable(t[0] + dx, t[1] + dy, **kw): return (t[0] + dx, t[1] + dy)
    return None
CURATED_DECOR = {}
def ref_tile(ref):
    if isinstance(ref, list): return tuple(ref)
    kind, _, v = ref.partition(':')
    if kind == 'door' and v == 'clubhouse': return CLUB_DOOR['tile']
    if kind in ('door', 'caravan'):
        c = G.caravan(int(v)); cx, by = G.door_px(c); return (int(cx // 16), int((by + 10) // 16))
    if kind == 'lm': return G.landmarks[int(v)]
    if kind == 'decor': d = CURATED_DECOR[v]; return (d['x'], d['y'] + 1)
    if kind == 'gate':  # v11: the middle of a gate (callers give a zone, so snap lands on the right side of it)
        ts = sorted(t for t, i in GATE_TILES.items() if i == v); return ts[len(ts) // 2]
    raise ValueError(ref)
def resolve(at, sep=1, **kw):
    t = ref_tile(at['near']); o = at.get('off', [0, 0]); t = (t[0] + o[0], t[1] + o[1])
    if at.get('exact'): return t
    p = snap(t, zone=at.get('zone'), sep=sep, **kw)
    if not p: err(f'cannot place near {at}'); return t
    return p
def occupy(t, r=0):
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1): OCC.add(T(t[0] + dx, t[1] + dy))
def solid_foot(sprite):
    w = DECOR[sprite][0]; return [(dx, 0) for dx in range(-(w // 32), w // 32 + 1)]

# curated decor (sheds, hut, signs)
for d in C['decor']['curated']:
    if 'at' not in d: continue
    foot = solid_foot(d['sprite']) if d.get('solid') else None
    t = resolve(d['at'], sep=1, foot=(foot or []) + [(0, 1)])
    e = {'id': d['id'], 'sprite': d['sprite'], 'x': t[0], 'y': t[1], 'solid': bool(d.get('solid'))}
    if d.get('lines'): e['lines'] = d['lines']
    decor.append(e); CURATED_DECOR[d['id']] = e
    for f in foot or [(0, 0)]: occupy((t[0] + f[0], t[1] + f[1])); G.block[T(t[0] + f[0], t[1] + f[1])] = 1 if d.get('solid') else 0
    if d.get('solid'): DOOR_TILES.add(T(t[0], t[1] + 1))
OPEN = open_all()

# ---------------- rooms ----------------
RC = C['rooms']; CH = RC['chambers']
ROOMS, ROOM_DATA, DOORS = {}, {}, []
def mkroom(rid, name, chambers, zone, door=None, locks_=None, **extra):
    data = RG.build(rid, [CH[c]['rows'] for c in chambers], locks_)
    ROOM_DATA[rid] = data
    ROOMS[rid] = dict({'name': name, 'w': data['w'], 'h': data['h'], 'zone': zone, 'tier': ZONES[zone]['tier'], 'exit': data['exit'], 'spawn': data['spawn'],
                       'locks': data['locks'], 'slotsUsed': set()}, **extra)
    if door: DOORS.append(dict(door, room=rid))
    return data
for rid, r in RC['rooms'].items():
    door = None
    if 'door' in r:
        ref = r['door']
        if ref == 'clubhouse': door = {k: CLUB_DOOR[k] for k in ('x', 'y', 'out')}
        elif ref == 'glen':  # v11: two gaps in the solid forest; the top one (behind 127) lands you on the ledge, the bottom one in Playground Row
            door = {'x': GLEN_GAP[0] * 16 + 8, 'y': GLEN_GAP[1] * 16 + 16, 'out': px(GLEN_OUT), 'side': 'top'}
        elif ref.startswith('caravan:'): d = ALL_DOORS[int(ref.split(':')[1])]; door = {k: d[k] for k in ('x', 'y', 'out')}; d['used'] = True
        elif ref.startswith('decor:'):
            dd = CURATED_DECOR[ref.split(':')[1]]; door = {'x': dd['x'] * 16 + 8, 'y': dd['y'] * 16 + 16, 'out': [dd['x'] * 16 + 8, dd['y'] * 16 + 26]}
        if r.get('req'): door.update(req=r['req'], locked=r.get('locked', ''))
    extra = {k: r[k] for k in ('dark', 'heal', 'exitTo', 'kind') if k in r}
    if r.get('req'): extra['req'] = r['req']
    mkroom(rid, r['name'], r['chambers'], r['zone'], door, **extra)
    if door: door['tileOut'] = (int(door['out'][0] // 16), int(door['out'][1] // 16)); DOOR_TILES.add(T(*door['tileOut']))
    if ref == 'glen':
        d2 = {'x': GLEN_EXIT_GAP[0] * 16 + 8, 'y': GLEN_EXIT_GAP[1] * 16 + 16, 'out': px(GLEN_EXIT), 'side': 'bottom', 'room': rid, 'tileOut': GLEN_EXIT}
        DOORS.append(d2); DOOR_TILES.add(T(*GLEN_EXIT))

P = RC['procedural']
proc_rooms = {}
for z in WD['zones']:
    cands = [d for d in ALL_DOORS.values() if not d.get('used') and T(*d['tile']) in OPEN and zone_at(*d['tile']) == z['id']]
    cands.sort(key=lambda d: d['seg']); rng.shuffle(cands)
    proc_rooms[z['id']] = []
    for d in cands[:z.get('rooms', 0)]:
        d['used'] = True; rid = f"m{d['seg']}"
        c = G.caravan(d['seg']); label = c['p'].get('label', str(d['seg']))
        chs = [rng.choice(P['pools']['entry'])]
        for _ in range(rng.choice([0, 1, 1, 2])): chs.insert(0, rng.choice(P['pools']['mid']))
        lk = None
        if rng.random() < P['secretChance']:
            chs.insert(0, rng.choice(P['pools']['secret'])); lk = {0: dict(rng.choice(P['secretLocks']))}
        mkroom(rid, f'Mobile {label}', chs, z['id'], {k: d[k] for k in ('x', 'y', 'out')}, lk)
        ROOMS[rid]['secret'] = bool(lk); proc_rooms[z['id']].append(rid)
KNOCK = C['decor']['knock']
for d in sorted(ALL_DOORS.values(), key=lambda d: d['seg']):
    if d.get('used') or T(*d['tile']) not in OPEN: continue
    if KNOCK: DOORS.append({'x': d['x'], 'y': d['y'], 'out': d['out'], 'knock': rng.choice(KNOCK)})  # v9: no knock gags (empty list)

def slot_px(rid, slot):
    s = ROOM_DATA[rid]['slots'].get(str(slot))
    if not s: err(f'room {rid} has no slot {slot}'); return [8, 8]
    ROOMS[rid]['slotsUsed'].add(str(slot)); return [s[0] * 16 + 8, s[1] * 16 + 8]
def chamber_of(rid, p): return ROOM_DATA[rid]['chamberOf'][int(p[1] // 16)]

# ---------------- entities ----------------
ENT = []
def tier_of(zone): return ZONES[zone]['tier']
def estats(t, tier):
    d = C['enemies']['types'][t]; o = {k: v for k, v in d.items() if k not in ('perTier',)}
    for k, v in d.get('perTier', {}).items(): o[k] = d[k] + v * (tier - 1)
    o['type'] = t; o['sheet'] = MONSTER_ORDER.index(d['sheet']); return o
def add_ent(e, at):
    if 'room' in at:
        e['room'] = at['room']; e['x'], e['y'] = slot_px(at['room'], at['slot']); e['zone'] = ROOMS[at['room']]['zone']
    else:
        t = resolve(at); occupy(t); e['x'], e['y'] = px(t); e['zone'] = zone_at(*t)
    ENT.append(e); return e
for s in C['story']['entities']:
    e = {k: v for k, v in s.items() if k != 'at'}
    if e['type'] == 'enemy': e['stats'] = estats(e['etype'], tier_of(s['at'].get('zone') or RC['rooms'][s['at']['room']]['zone']))
    add_ent(e, s['at'])
    if e['type'] == 'activity' and e['minigame'] == 'hunt':  # beach star hunt: 6 stars on the sand nearby
        base = (e['x'] // 16, e['y'] // 16); pts = []
        for k in range(6):
            ang = k * math.pi / 3 + 0.4; t = (int(base[0] + 6 * math.cos(ang)), int(base[1] + 7 * math.sin(ang)))
            p = snap(t, zone=e['zone'], sep=0) or base; occupy(p); pts.append(px(p))
        e['points'] = pts; e['time'] = 30

# NPCs
NPCS = {}
for nid, n in C['npcs']['npcs'].items():
    opts = n['at'] if isinstance(n['at'], list) else [{'at': n['at']}]
    at_out = []
    for o in opts:
        a = o['at']
        if 'room' in a: p = {'room': a['room'], 'x': slot_px(a['room'], a['slot'])[0], 'y': slot_px(a['room'], a['slot'])[1], 'zone': RC['rooms'][a['room']]['zone']}
        else:
            t = resolve(a, sep=1, foot=[(-2, 0), (-1, 0)] if n.get('prop') else None); occupy(t, 1 if n.get('solid') else 0)
            if n.get('prop'): occupy((t[0] - 1, t[1])); occupy((t[0] - 2, t[1]))
            p = {'x': px(t)[0], 'y': px(t)[1], 'zone': zone_at(*t)}
        if o.get('when'): p['when'] = o['when']
        at_out.append(p)
    NPCS[nid] = dict({k: v for k, v in n.items() if k != 'at'}, at=at_out)

# ---------------- procedural fill: rooms ----------------
DC = C['decor']
notes_pool = list(DC['notes']); rng.shuffle(notes_pool)
whisper_pool = list(DC['whispers']); rng.shuffle(whisper_pool)
hider_pool = list(DC['hiders']); rng.shuffle(hider_pool)
kid_sprites = [1, 11, 15, 18, 20, 21, 23, 2, 5, 8, 12, 24, 25]
budget = {z['id']: {k: z.get(k, 0) for k in ('shells', 'coins', 'hiders', 'notes', 'whispers')} for z in WD['zones']}
seq = {'n': 0}
def nid(p): seq['n'] += 1; return f'{p}{seq["n"]}'
def hider_ent(): h = hider_pool.pop() if hider_pool else {'name': 'A kid', 'line': 'Found me!'}; return {'type': 'hider', 'name': h['name'], 'text': [h['line']], 'sprite': rng.choice(kid_sprites), 'effects': [{'give': 'kids'}]}
for zid, rids in proc_rooms.items():
    b = budget[zid]; tier = tier_of(zid)
    for rid in rids:
        data = ROOM_DATA[rid]; free = sorted(k for k in data['slots'] if k not in ROOMS[rid]['slotsUsed']); rng.shuffle(free)
        secret_slots = [k for k in free if data['chamberOf'][data['slots'][k][1]] == 0 and ROOMS[rid].get('secret')]
        for k in secret_slots[:1]:
            free.remove(k)
            if b['shells'] > 0: b['shells'] -= 1; add_ent({'id': nid('shell'), 'type': 'pickup', 'item': 'shell'}, {'room': rid, 'slot': k})
            else: add_ent({'id': nid('coin'), 'type': 'pickup', 'item': 'coin', 'n': 3}, {'room': rid, 'slot': k})
        for k in free:
            r = rng.random()
            if b['hiders'] > 1 and r < 0.25: b['hiders'] -= 1; add_ent(dict(hider_ent(), id=nid('hider')), {'room': rid, 'slot': k})
            elif b['coins'] > 0 and r < 0.6: b['coins'] -= 1; add_ent({'id': nid('coin'), 'type': 'pickup', 'item': 'coin'}, {'room': rid, 'slot': k})
            elif b['notes'] > 0 and r < 0.8 and notes_pool: b['notes'] -= 1; add_ent({'id': nid('note'), 'type': 'note', 'text': notes_pool.pop()}, {'room': rid, 'slot': k})
        es = data['eslots']; n = min(len(es), 2 + tier // 2)  # v9: compact combat rooms, mixed archetypes
        off = rng.randrange(len(ZONES[zid]['enemy']))
        for ei, p in enumerate(es[:n]):
            et = ZONES[zid]['enemy'][(ei + off) % len(ZONES[zid]['enemy'])]
            ENT.append({'id': nid('e'), 'type': 'enemy', 'etype': et, 'stats': estats(et, tier), 'room': rid, 'zone': zid, 'x': p[0] * 16 + 8, 'y': p[1] * 16 + 8})
for rid in RC['rooms']:  # curated rooms: enemy slots get the zone's first enemy type
    zid = RC['rooms'][rid]['zone']
    for ei, p in enumerate(ROOM_DATA[rid]['eslots'][:2 + tier_of(zid) // 2]):  # v9: compact encounters
        et = ZONES[zid]['enemy'][ei % len(ZONES[zid]['enemy'])]
        ENT.append({'id': nid('e'), 'type': 'enemy', 'etype': et, 'stats': estats(et, tier_of(zid)), 'room': rid, 'zone': zid, 'x': p[0] * 16 + 8, 'y': p[1] * 16 + 8})

# ---------------- procedural fill: outdoors ----------------
ZT = {z['id']: [i for i in OPEN if zone_at(i % W, i // W) == z['id'] and i not in LOCK_OF] for z in WD['zones']}
def interest_points(): return [(e['x'] // 16, e['y'] // 16) for e in ENT if 'room' not in e] + \
    [(p['x'] // 16, p['y'] // 16) for n in NPCS.values() for p in n['at'] if 'room' not in p] + [(d['x'], d['y']) for d in decor if d.get('lines')]
def spread_tile(zid, **kw):
    pts = interest_points(); best, bd = None, -1
    for _ in range(40):
        i = rng.choice(ZT[zid]); t = (i % W, i // W)
        if not acceptable(*t, sep=1, **kw): continue
        d = min([(t[0] - p[0]) ** 2 + (t[1] - p[1]) ** 2 for p in pts] or [999])
        if d > bd: best, bd = t, d
    return best
for z in WD['zones']:
    zid, b = z['id'], budget[z['id']]
    for _ in range(b['shells']):
        t = spread_tile(zid)
        if t: occupy(t); ENT.append({'id': nid('shell'), 'type': 'pickup', 'item': 'shell', 'x': px(t)[0], 'y': px(t)[1], 'zone': zid})
    for _ in range(b['coins']):
        t = spread_tile(zid)
        if t: occupy(t); ENT.append({'id': nid('coin'), 'type': 'pickup', 'item': 'coin', 'x': px(t)[0], 'y': px(t)[1], 'zone': zid})
    for _ in range(b['notes']):
        t = spread_tile(zid)
        if t and notes_pool: occupy(t); ENT.append({'id': nid('note'), 'type': 'note', 'text': notes_pool.pop(), 'x': px(t)[0], 'y': px(t)[1], 'zone': zid})
    for _ in range(b['whispers']):
        t = spread_tile(zid)
        if t and whisper_pool: occupy(t); ENT.append({'id': nid('whisper'), 'type': 'whisper', 'req': ['walkie'], 'text': [whisper_pool.pop()], 'effects': [{'give': 'coin'}], 'x': px(t)[0], 'y': px(t)[1], 'zone': zid})
    for _ in range(b['hiders']):  # hide next to something solid
        for _ in range(60):
            i = rng.choice(ZT[zid]); t = (i % W, i // W)
            if acceptable(*t, sep=1) and any(G.block[T(t[0] + dx, t[1] + dy)] for dx, dy in ((0, -1), (1, 0), (-1, 0))):
                occupy(t); ENT.append(dict(hider_ent(), id=nid('hider'), x=px(t)[0], y=px(t)[1], zone=zid)); break
    for _ in range(z.get('outdoorEnemies', 0)):
        for _ in range(60):
            i = rng.choice(ZT[zid]); t = (i % W, i // W)
            if acceptable(*t, sep=2) and all((t[0] - p[0]) ** 2 + (t[1] - p[1]) ** 2 > 64 for p in interest_points()[:0] + [(n['x'] // 16, n['y'] // 16) for nn in NPCS.values() for n in nn['at'] if 'room' not in n]):
                occupy(t); et = z['enemy'][len([e for e in ENT if e.get('zone') == zid and e['type'] == 'enemy' and 'room' not in e]) % len(z['enemy'])]
                ENT.append({'id': nid('e'), 'type': 'enemy', 'etype': et, 'stats': estats(et, z['tier']), 'x': px(t)[0], 'y': px(t)[1], 'zone': zid}); break

# v9 outdoor arenas: an open rectangle per listed zone, away from NPCs and doors; posts close it until the waves are cleared
ARENAS = []
for ad in WD.get('arenas', []):
    zid = ad['zone']; aw, ah = ad.get('size', [9, 7]); best, bd = None, -1e18
    npc_t = [(n['x'] // 16, n['y'] // 16) for nn in NPCS.values() for n in nn['at'] if 'room' not in n] + [(e['x'] // 16, e['y'] // 16) for e in ENT if 'room' not in e and e['type'] != 'pickup']
    zx = sum(i % W for i in ZT[zid]) / len(ZT[zid]); zy = sum(i // W for i in ZT[zid]) / len(ZT[zid])
    for i in ZT[zid][::3]:
        x0, y0 = i % W, i // W
        if not all(acceptable(x0 + dx, y0 + dy, zone=zid) for dx in range(aw) for dy in range(ah)): continue
        if any(G.inb(x0 + dx, y0 + dy) and G.block[T(x0 + dx, y0 + dy)] for dx in range(-1, aw + 1) for dy in range(ah, ah + 3)): continue  # tree canopies overhang from below
        cx, cy = x0 + aw / 2, y0 + ah / 2; d = min([(cx - a) ** 2 + (cy - b_) ** 2 for a, b_ in npc_t] or [999])
        d = min(d, 64) * 1000 - ((cx - zx) ** 2 + (cy - zy) ** 2)  # clear of NPCs first, then near the middle of the zone
        if d > bd: bd, best = d, (x0, y0)
    if not best: err(f"arena {ad['id']}: no open {aw}x{ah} rectangle in {zid}"); continue
    x0, y0 = best
    for dx in range(aw):
        for dy in range(ah): OCC.add(T(x0 + dx, y0 + dy))
    waves = [[[t, ad.get('n', 2 + tier_of(zid) // 2)] for t in w] for w in ad['waves']]
    ARENAS.append({'id': ad['id'], 'zone': zid, 'name': ad['name'], 'rect': [x0 * 16, y0 * 16, (x0 + aw) * 16, (y0 + ah) * 16], 'waves': waves,
                   'stats': {t: estats(t, tier_of(zid)) for w in ad['waves'] for t in w}, 'reward': ad.get('reward', [])})

# v10 combat-gated rewards: clearing a room or an arena is an 'encounter' entity the solver can collect
for a in ARENAS:
    if a['reward']: ENT.append({'id': 'enc_' + a['id'], 'type': 'encounter', 'arena': a['id'], 'effects': a['reward'], 'x': (a['rect'][0] + a['rect'][2]) // 2, 'y': (a['rect'][1] + a['rect'][3]) // 2, 'zone': a['zone']})
for enc in WD.get('encounters', []):
    rid = enc.get('room') or next((r for r in proc_rooms.get(enc['zone'], [])), None)
    if not rid: err(f"encounter: no procedural room in {enc.get('zone')}"); continue
    if rid not in ROOMS: err(f"encounter room {rid} does not exist"); continue
    if not any(e['type'] == 'enemy' and e.get('room') == rid for e in ENT): err(f"encounter room {rid} has no enemies to clear")
    sx, sy = ROOMS[rid]['spawn']
    ENT.append({'id': 'enc_' + rid, 'type': 'encounter', 'room': rid, 'effects': enc['reward'], 'x': sx * 16 + 8, 'y': sy * 16 + 4, 'zone': ROOMS[rid]['zone']})

# decor near caravans / on the beach / in the open
rules = DC['rules']
def pick_rule(where): rs = [r for r in rules if r['where'] in where]; return rng.choices(rs, [r['weight'] for r in rs])[0] if rs else None
def place_decor(rule, t):
    foot = solid_foot(rule['sprite']) if rule.get('solid') else [(0, 0)]
    if not all(acceptable(t[0] + f[0], t[1] + f[1], sep=0, road_ok=False) for f in foot): return False
    if rule.get('solid'):  # keep neighbours connected: every free 4-neighbour of the footprint must still reach each other
        for f in foot: G.block[T(t[0] + f[0], t[1] + f[1])] = 1
        nb = [(t[0] + f[0] + dx, t[1] + f[1] + dy) for f in foot for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
        nb = [n for n in nb if G.free(*n) and T(*n) in OPEN]
        if nb:
            reach = set(); q = deque([nb[0]]); reach.add(nb[0])
            while q:
                x, y = q.popleft()
                for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if n not in reach and abs(n[0] - t[0]) <= 5 and abs(n[1] - t[1]) <= 5 and G.free(*n): reach.add(n); q.append(n)
            if not all(n in reach for n in nb):
                for f in foot: G.block[T(t[0] + f[0], t[1] + f[1])] = 0
                return False
    for f in foot: occupy((t[0] + f[0], t[1] + f[1]))
    d = {'sprite': rule['sprite'], 'x': t[0], 'y': t[1], 'solid': bool(rule.get('solid'))}
    if rule.get('lines'): d['lines'] = [rng.choice(rule['lines'])]
    if rule['sprite'] in ANIM: d['anim'] = True
    decor.append(d); return True
for z in WD['zones']:
    zid = z['id']; cars = [c for c in G.caravans if zone_at(int((c['x'] + c['width'] / 2) // 16), int((c['y'] + c['height'] / 2) // 16)) == zid]
    n = int(len(cars) * 0.75 * z.get('decor', 1)) + (12 if z.get('beach') else 0)
    for _ in range(n):
        if z.get('beach') and rng.random() < 0.8:
            rule = pick_rule(['beach'])
            for _ in range(20):
                i = rng.choice(ZT[zid]); t = (i % W, i // W)
                if G.g(*t) == SAND and place_decor(rule, t): break
            continue
        if cars and rng.random() < 0.85:
            rule = pick_rule(['caravan']); c = rng.choice(cars)
            x0, y0, x1, y1 = int(c['x'] // 16) - 1, int(c['y'] // 16), int((c['x'] + c['width']) // 16), int((c['y'] + c['height']) // 16) + 1
            ring = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1) if x in (x0, x1) or y in (y0, y1)]
            rng.shuffle(ring)
            for t in ring[:8]:
                if place_decor(rule, t): break
        else:
            rule = pick_rule(['open'])
            for _ in range(10):
                i = rng.choice(ZT[zid]); t = (i % W, i // W)
                if G.g(*t) != SAND and place_decor(rule, t): break

# ambient walkers
AMB = []
for z in WD['zones']:
    zid = z['id']
    for k in range(z.get('ambient', 0)):
        pts = []
        for _ in range(40):
            i = rng.choice(ZT[zid]); t = (i % W, i // W)
            if acceptable(*t) and (not pts or 36 < (t[0] - pts[-1][0]) ** 2 + (t[1] - pts[-1][1]) ** 2 < 400): pts.append(t)
            if len(pts) == 3: break
        if len(pts) >= 2: AMB.append({'id': f'amb_{zid}_{k}', 'sprite': rng.choice(DC['ambientSprites']), 'zone': zid, 'route': [px(p) for p in pts], 'barks': DC['barks'].get(zid, [])})

# ---------------- coverage: never nothing fun nearby ----------------
R = WD['density']['interestRadius']
def coverage():
    cov = bytearray(W * H); pts = interest_points() + [(a['route'][0][0] // 16, a['route'][0][1] // 16) for a in AMB] + \
        [(int(d['out'][0] // 16), int(d['out'][1] // 16)) for d in DOORS if d.get('room')]
    for (x, y) in pts:
        for dy in range(-R, R + 1):
            w = int(math.sqrt(R * R - dy * dy))
            for dx in range(-w, w + 1):
                if 0 <= x + dx < W and 0 <= y + dy < H: cov[T(x + dx, y + dy)] = 1
    tiles = [i for i in OPEN if i not in LOCK_OF]
    return sum(cov[i] for i in tiles) / len(tiles), [i for i in tiles if not cov[i]]
c0, unc = coverage(); fills = 0
while c0 < WD['density']['minCoverage'] and unc and fills < 200:
    i = rng.choice(unc); t = snap((i % W, i // W), sep=1, road_ok=False)
    f = rng.choice(DC['fill'])
    if t: occupy(t); decor.append({'sprite': f['sprite'], 'x': t[0], 'y': t[1], 'solid': False, 'lines': [rng.choice(f['lines'])]}); fills += 1
    c0, unc = coverage()
if c0 < WD['density']['minCoverage']: err(f'interest coverage {c0:.2%} < {WD["density"]["minCoverage"]:.0%}')

# re-validate reachability after decor
OPEN2 = open_all()
for e in ENT:
    if 'room' in e: continue
    t = (e['x'] // 16, e['y'] // 16)
    if T(*t) not in OPEN2: err(f"entity {e['id']} at {t} unreachable after decoration")
for d in DOORS:
    if d.get('room') and T(int(d['out'][0] // 16), int(d['out'][1] // 16)) not in OPEN2: err(f"door to {d['room']} unreachable")

# ---------------- solver ----------------
STORY = C['story']; RECIPES = C['items']['recipes']
def room_access(rid, st, reach):
    r = ROOMS[rid]
    if 'exitTo' in r:  # reached through a door entity inside another room
        door = next((e for e in ENT if e['type'] == 'door' and e.get('to') == rid), None)
        return door is not None and room_access(door['room'], st, reach) and ok(door.get('req'), st) and chamber_open(door['room'], door, st)
    ds = [d for d in DOORS if d.get('room') == rid and T(int(d['out'][0] // 16), int(d['out'][1] // 16)) in reach]
    return any(ok(d.get('req'), st) for d in ds)
def chamber_open(rid, e, st):
    ch = chamber_of(rid, (e['x'], e['y']))
    for lk in ROOMS[rid]['locks']:
        sep_row = lk['tiles'][0][1]
        if ch is not None and ROOM_DATA[rid]['chamberOf'][sep_row - 1] is not None and ch <= ROOM_DATA[rid]['chamberOf'][sep_row - 1] and not ok(lk['req'], st): return False
    return True
def accessible(e, st, reach, rooms_ok):
    if 'room' in e: return e['room'] in rooms_ok and chamber_open(e['room'], e, st)
    x, y = e['x'] // 16, e['y'] // 16
    return any(T(x + dx, y + dy) in reach for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)))
def npc_pos(n, st):
    for p in n['at']:
        if ok(p.get('when'), st): return p
def reach_of(opened, st, portals=True):
    """outdoor tiles reachable with these locks open; a room with two outdoor doors (the Glen) links both ends"""
    pas = passable_fn(opened); reach = G.flood(START_T, pas)
    multi = {d['room'] for d in DOORS if d.get('side')}
    while portals:
        outs = [(int(d['out'][0] // 16), int(d['out'][1] // 16)) for d in DOORS if d.get('room') in multi and room_access(d['room'], st, reach)]
        add = [t for t in outs if T(*t) not in reach and pas(*t)]
        if not add: break
        for t in add: reach |= G.flood(t, pas)
    return reach
matched = set()
def solve(record=True):
    st = {'items': {}, 'flags': set(), 'maxhp': WD['start']['hp']}
    got, applied, fired = set(), set(), set()
    reach_n = 0
    spheres, zone_sphere, room_sphere = [], {}, {}
    def demanded(item):
        for n in NPCS.values():
            for i, t in enumerate(n['talk']):
                if (n['name'], i) not in applied and t.get('effects') and item in mentions(t.get('when')): return True
        return any(item in mentions(l['req']) for l in locks) or any(item in (r['a'], r['b']) for r in RECIPES)
    for sphere in range(60):
        opened = {l['id'] for l in locks if ok(l['req'], st)}
        reach = reach_of(opened, st)
        rooms_ok = {rid for rid in ROOMS if room_access(rid, st, reach)}
        log = []
        for z in WD['zones']:
            if z['id'] not in zone_sphere and any(zone_at(i % W, i // W) == z['id'] for i in reach if i not in LOCK_OF):
                zone_sphere[z['id']] = sphere; st['flags'].add('visited_' + z['id']); log.append(f"enter {z['name']}")
        for rid in rooms_ok:
            if rid not in room_sphere: room_sphere[rid] = sphere
        first_at = None
        changed = True
        for _pass in (0,):  # one pass per step: reach is recomputed between steps, so steps stay fine-grained
            changed = False
            for e in ENT:
                if e['id'] in got or not ok(e.get('when'), st) or not accessible(e, st, reach, rooms_ok): continue
                t = e['type']; eff = None
                if t == 'pickup': eff = [{'give': e['item'], 'n': e.get('n', 1)}]
                elif t in ('chest', 'whisper', 'hider', 'interact') and ok(e.get('req'), st): eff = e.get('effects', [])
                elif t == 'activity': eff = e['reward']
                elif t == 'enemy' and e['stats'].get('boss') and ok(e.get('req'), st): eff = e.get('drops', []) + e['stats'].get('drops', [])  # v10: the club beats bosses; guarded ones need their ability
                elif t == 'encounter': eff = e['effects']
                elif t in ('note', 'vista'): eff = []
                if eff is None: continue
                if t == 'interact' and any('refill' in x for x in eff): eff = []
                got.add(e['id']); apply(eff, st, ITEMS); changed = True
                if eff and t not in ('pickup',) or (t == 'pickup' and e['item'] not in ('coin', 'shell')):
                    log.append(f"{t} {e['id']} -> " + ', '.join(f"{k}:{v}" for x in eff for k, v in x.items() if k in ('give', 'set', 'maxhp')))
                    first_at = first_at or e
            for nid_, n in NPCS.items():
                p = npc_pos(n, st)
                if not p or not accessible(p, st, reach, rooms_ok): continue
                for i, tk in enumerate(n['talk']):
                    if not ok(tk.get('when'), st): continue
                    key = (n['name'], i); matched.add((nid_, i))
                    if tk.get('effects') and key not in applied:
                        applied.add(key); apply(tk['effects'], st, ITEMS); changed = True; log.append(f"talk {nid_} -> " + ', '.join(f"{k}:{v}" for x in tk['effects'] for k, v in x.items() if k in ('give', 'set', 'maxhp')))
                        first_at = first_at or dict(p, id=nid_)
                    for ch in tk.get('choices', []):
                        if not ch.get('effects') or not ok(ch.get('when'), st): continue
                        buys = [x['give'] for x in ch['effects'] if 'give' in x]
                        sets = [x['set'] for x in ch['effects'] if 'set' in x]
                        if any(x.get('take') == 'coin' for x in ch['effects']):  # buy only what's needed; a fee (v11 den fee) is paid once
                            if buys and not any(st['items'].get(b, 0) == 0 and demanded(b) for b in buys): continue
                            if not buys and all(f in st['flags'] for f in sets): continue
                        elif all(x.get('set') in st['flags'] for x in ch['effects'] if 'set' in x) and not buys: continue
                        apply(ch['effects'], st, ITEMS); changed = True; log.append(f"choose {nid_}: {ch['text']}"); first_at = first_at or dict(p, id=nid_)
                    break
            for r in RECIPES:
                need = r.get('need', {})
                while ok([r['a'], r['b']] + [f'{k}>={v}' for k, v in need.items()], st):
                    for c in r['consume']:
                        if isinstance(c, dict): [st['items'].__setitem__(k, st['items'][k] - v) for k, v in c.items()]
                        else: st['items'][c] -= 1
                    apply(r['effects'], st, ITEMS); changed = True; log.append(f"combine {r['id']}")
            for ev in STORY['events']:
                if ev['id'] not in fired and ok(ev['when'], st): fired.add(ev['id']); st['flags'].add('ev:' + ev['id']); apply(ev['effects'], st, ITEMS); changed = True; log.append(f"event {ev['id']}")
        snap_ = {'items': dict(st['items']), 'flags': sorted(st['flags']), 'maxhp': st['maxhp'], 'got': sorted(got)}
        spheres.append({'log': log, 'state': snap_, 'at': first_at})
        if ok(STORY['end'], st) or (not log and len(reach) == reach_n): break
        reach_n = len(reach)
    spheres = [s for s in spheres if s['log']] + [spheres[-1]] if spheres[-1]['log'] == [] else [s for s in spheres if s['log']]
    return st, spheres, zone_sphere, room_sphere, got

st, spheres, zone_sphere, room_sphere, got = solve()
if not ok(STORY['end'], st): err('NOT COMPLETABLE: end condition never reached. Last state: ' + json.dumps({'items': st['items'], 'flags': sorted(st['flags'])}))
for z in WD['zones']:
    if z['id'] not in zone_sphere: err(f"zone {z['id']} never reachable")
for rid in ROOMS:
    if rid not in room_sphere: err(f'room {rid} never reachable')
# v11: Scott's order, exactly: every zone is first entered in its own sphere, in zone order
ZORDER = [z['id'] for z in WD['zones']]
_sp = [zone_sphere.get(z) for z in ZORDER]
if None not in _sp and any(_sp[i] >= _sp[i + 1] for i in range(len(_sp) - 1)): err(f'zone order is not {ZORDER}: {zone_sphere}')
# v11 seal: shut every gate into zone k or later and open everything else (all items, all flags): no tile of zone k+ may be reachable.
# The borders follow the outlines, so this is the proof that nobody walks round the end of a fence; the Glen room counts as the way into z2.
ST_ALL = {'items': {k: 99 for k in ITEMS}, 'flags': {t[1:] for l in locks for t in l['req'] if t.startswith('@')}, 'maxhp': 99}
GATE_TO = {gd['id']: ZIDX[gd['to']] for gd in WD['gates']}
SEAL = {}
for k in range(2, len(ZORDER) + 1):
    shut = {g for g, to in GATE_TO.items() if to >= k}
    rch = reach_of(set(LOCKS) - shut, ST_ALL, portals=k > 2)
    leak = [i for i in rch if ZMAP[i] >= k]
    SEAL[ZORDER[k - 1]] = len(leak)
    if leak: err(f'zone {ZORDER[k - 1]} leaks: {len(leak)} tiles reachable with its way in shut, e.g. {(leak[0] % W, leak[0] // W)}')
if any(j in OPEN2 for j in FOREST): err('outdoor forest tiles are walkable')

never = [e['id'] for e in ENT if e['id'] not in got and e['type'] in ('pickup', 'chest', 'activity', 'interact', 'hider', 'whisper', 'note', 'vista')]
if never: err(f'{len(never)} entities never collectable: {never[:12]}')
for nid_, n in NPCS.items():
    for i, tk in enumerate(n['talk']):
        if (nid_, i) not in matched and tk.get('when') and 'evening' not in ' '.join(tk['when']): warn(f'talk entry {nid_}[{i}] never shown on the critical path')
# v10: fight abilities must come from fights (an encounter or a boss) and be reachable, and their gates must open after them
FIGHT_ABIL = [k for k, v in ITEMS.items() if v.get('how')]
for k in FIGHT_ABIL:
    src = [(i, l) for i, sp in enumerate(spheres) for l in sp['log'] if f'give:{k}' in l]
    if not src: err(f'ability {k} is never earned'); continue
    if not src[0][1].startswith(('encounter', 'enemy')): err(f'ability {k} is earned outside a fight: {src[0][1]}')
    for l in locks:
        if k in mentions(l['req']):
            gate_sp = next((i for i, sp in enumerate(spheres) if l['id'] in {x['id'] for x in locks if ok(x['req'], {'items': sp['state']['items'], 'flags': set(sp['state']['flags']), 'maxhp': sp['state']['maxhp']})}), None)
            if gate_sp is None or gate_sp < src[0][0]: err(f'gate {l["id"]} ({k}) opens before {k} is earned')
# ramp: zone tiers should not decrease along the unlock order
order = sorted(zone_sphere, key=zone_sphere.get); prev = 0
for zid in order:
    if ZONES[zid]['tier'] < prev: warn(f'tier ramp dips at {zid}')
    prev = max(prev, ZONES[zid]['tier'])
# hints: some hint must apply at every sphere until the end
for i, s in enumerate(spheres[:-1]):
    stt = {'items': s['state']['items'], 'flags': set(s['state']['flags'])}
    if not any(ok(h['when'], stt) for h in STORY['hints']): err(f'hint gap at sphere {i}')
# v10 hint audit: the current hint at every sphere must be doable then. If its target is a lock, boss or interact whose req isn't met yet,
# the HUD objective is asking for something the player can't do (e.g. "beat Gerry" before Putt Parry).
HINT_TRACE = []
for i, s in enumerate([{'state': {'items': {}, 'flags': [], 'maxhp': WD['start']['hp']}}] + spheres[:-1]):
    stt = {'items': s['state']['items'], 'flags': set(s['state']['flags']), 'maxhp': s['state']['maxhp']}
    hi = next((j for j, h in enumerate(STORY['hints']) if ok(h['when'], stt)), None)
    if hi is None: continue
    h = STORY['hints'][hi]; HINT_TRACE.append(hi); tg = h.get('target')
    if isinstance(tg, list): tg = next((t['to'] for t in tg if ok(t.get('when'), stt)), None)
    if not tg: continue
    obj = LOCKS.get(tg) or next((e for e in ENT if e.get('id') == tg), None)
    if obj and obj.get('req') and not ok(obj['req'], stt): err(f"hint {hi} ('{h['tiers'][0]}') at sphere {i} points at {tg}, which needs {obj['req']} the player hasn't got")
if '-v' in sys.argv: print('hint per sphere:', HINT_TRACE)
# off the solver's path too: a hint whose target needs a fight ability must sit below a hint that asks for that ability ('!k'),
# so the objective can never say "go through X" while X is still shut to you
for j, h in enumerate(STORY['hints']):
    for tg in ([h['target']] if isinstance(h.get('target'), str) else [t['to'] for t in h.get('target') or []]):
        obj = LOCKS.get(tg) or next((e for e in ENT if e.get('id') == tg), None)
        for k in (mentions(obj.get('req')) if obj else []):
            if k in FIGHT_ABIL and not any('!' + k in g['when'] for g in STORY['hints'][:j]): err(f"hint {j} ('{h['tiers'][0]}') targets {tg} needing {k}, but no earlier hint asks for {k}")
# hint targets (for ?hints arrow): id of an entity / NPC / lock, or [{when, to}] (first match wins); resolved to outdoor px
def outdoor_of_room(rid):
    r = ROOMS[rid]
    if 'exitTo' in r:
        door = next((e for e in ENT if e['type'] == 'door' and e.get('to') == rid), None)
        return outdoor_of_room(door['room']) if door else None
    d = next((d for d in DOORS if d.get('room') == rid), None)
    return [int(d['out'][0]), int(d['out'][1])] if d else None
def target_px(tid):
    e = next((e for e in ENT if e.get('id') == tid), None)
    if e: return outdoor_of_room(e['room']) if e.get('room') else [int(e['x']), int(e['y'])]
    if tid in NPCS: a = NPCS[tid]['at'][0]; return [int(a['x']), int(a['y'])]
    if tid in LOCKS: r = LOCKS[tid].get('rect'); return [int(r[0] + r[2] / 2), int(r[1] + r[3] / 2)] if r else None
    return None
for h in STORY['hints']:
    tg = h.get('target')
    if not tg: continue
    lst = [{'to': tg}] if isinstance(tg, str) else tg
    for t in lst:
        t['at'] = target_px(t['to'])
        if not t['at']: err(f"hint target {t['to']} not found")
    h['target'] = lst
# supply/demand: coins
coin_supply = sum(e.get('n', 1) for e in ENT if e['type'] == 'pickup' and e.get('item') == 'coin') + sum(x.get('n', 1) for e in ENT for x in e.get('effects', []) if x.get('give') == 'coin')
coin_spend = sum(x.get('n', 1) for n in NPCS.values() for t in n['talk'] for c in t.get('choices', []) for x in c.get('effects', []) if x.get('take') == 'coin')
if coin_supply < coin_spend * 2: warn(f'coin supply {coin_supply} is tight vs shop prices {coin_spend}')
shells = sum(1 for e in ENT if e.get('item') == 'shell') + sum(1 for e in ENT for x in e.get('reward', []) if x.get('give') == 'shell')
kids = sum(1 for e in ENT if e['type'] == 'hider')
if 'ciaran' in NPCS and kids < 12: err(f'only {kids} hiders placed (Ciarán needs 12)')

# snapshots: state at the start of each sphere, positioned next to the first thing done in it
def snap_pos(at):
    if not at: return {'room': None, 'x': px(START_T)[0], 'y': px(START_T)[1]}
    if at.get('room'): return {'room': at['room'], 'x': ROOMS[at['room']]['spawn'][0] * 16 + 8, 'y': ROOMS[at['room']]['spawn'][1] * 16 + 8}
    t = snap((at['x'] // 16, at['y'] // 16 + 1), sep=0) or (at['x'] // 16, at['y'] // 16)
    return {'room': None, 'x': px(t)[0], 'y': px(t)[1]}
SNAPS = {'start': {'items': {}, 'flags': [], 'maxhp': WD['start']['hp'], 'got': [], 'room': START_ROOM}}
prev_state = SNAPS['start']
for i, s in enumerate(spheres):
    gains = [l for l in s['log'] if l.startswith(('combine', 'event', 'enter', 'choose'))] + [l for l in s['log'] if l.startswith('chest')]
    name = f's{i:02d}'
    tag = next((l.split(' ', 1)[1].split(' ')[0] for l in s['log'] if l.startswith(('combine', 'event'))), None) or next((l[6:].replace('The ', '').split(' ')[0].lower() for l in s['log'] if l.startswith('enter')), None) or next((l.split(' ', 1)[1].split(' ')[0].rstrip(':').lower() for l in s['log'] if l.startswith(('choose', 'chest', 'interact', 'enemy', 'talk'))), 'step')
    SNAPS[f'{name}-{tag}'[:28]] = dict(prev_state, **snap_pos(s['at'])) if i else dict(SNAPS['start'])
    prev_state = {k: s['state'][k] for k in ('items', 'flags', 'maxhp', 'got')}
_tad = NPCS['tadhg']['at'][0]
SNAPS['night'] = next((dict({k: s['state'][k] for k in ('items', 'flags', 'maxhp', 'got')}, room=None, x=_tad['x'], y=_tad['y'] + 16) for s in spheres if 'evening' in s['state']['flags']), SNAPS['start'])
last = spheres[-2]['state'] if len(spheres) > 1 else spheres[-1]['state']
mam = NPCS['mam']['at'][0]
SNAPS['end-ready'] = dict({k: last[k] for k in ('items', 'flags', 'maxhp', 'got')}, room=None, x=mam['x'] + 16, y=mam['y'] + 16)
SNAPS['end-ready']['items'] = dict(SNAPS['end-ready']['items'], flag_tg=1)
SNAPS['everything'] = dict({k: last[k] for k in ('items', 'flags', 'maxhp', 'got')}, room=None, x=px(START_T)[0], y=px(START_T)[1])

# ---------------- outputs ----------------
for r in ROOMS.values(): r.pop('slotsUsed', None)
counts = {}
for e in ENT: counts.setdefault(e['zone'], {}).setdefault(e['type'], 0); counts[e['zone']][e['type']] += 1
stats = {'tilesOpen': len(OPEN2), 'coverage': round(c0, 4), 'fills': fills, 'entities': len(ENT), 'npcs': len(NPCS), 'ambient': len(AMB), 'decor': len(decor),
         'rooms': len(ROOMS), 'knockDoors': sum(1 for d in DOORS if d.get('knock')), 'hiders': kids, 'shells': shells, 'coinSupply': coin_supply, 'coinSpend': coin_spend,
         'maxhpEnd': st['maxhp'], 'arenas': len(ARENAS), 'seal': SEAL, 'borders': len(BORDERS), 'spheres': len(spheres), 'zoneSphere': zone_sphere, 'perZone': counts, 'errors': errors, 'warnings': warns}
world = {'v': 6, 'seed': WD['seed'], 'title': WD['title'], 'strings': WD['strings'], 'minigames': WD['minigames'], 'progression': [s['log'] for s in spheres], 'start': dict(WD['start'], out=px(START_T)), 'player': WD['player'], 'items': ITEMS, 'itemSprites': ITEM_SPRITES,
         'recipes': RECIPES, 'zones': [{'id': z['id'], 'name': z['name'], 'tier': z['tier'], 'beach': bool(z.get('beach'))} for z in WD['zones']], 'zoneGrid': ''.join(str(k) for k in ZMAP), 'mapW': W,
         'entities': ENT, 'npcs': NPCS, 'ambient': AMB, 'decor': decor, 'decorSizes': DECOR, 'locks': locks, 'barrierTiles': barrier_tiles, 'borders': BORDERS, 'doors': DOORS, 'arenas': ARENAS,
         'rooms': ROOMS, 'events': STORY['events'], 'hints': STORY['hints'], 'end': STORY['end'], 'snapshots': SNAPS, 'monsters': MONSTER_ORDER,
         'enemyTypes': {k: v.get('bark') for k, v in C['enemies']['types'].items() if v.get('bark')}, 'stats': stats}
rooms_out = {rid: dict({k: d[k] for k in ('w', 'h', 'floor', 'walls', 'furn')}, props=d.get('props', []), **({'marks': d['marks'], 'slots': d['slots']} if d.get('marks') else {})) for rid, d in ROOM_DATA.items()}

rep = ['# Tara Glen generator report', '', f"seed {WD['seed']} · {len(ENT)} entities · {len(NPCS)} NPCs · {len(AMB)} ambient walkers · {len(decor)} decor · {len(ROOMS)} interiors · {stats['knockDoors']} knock doors",
       f"coverage {c0:.1%} (radius {R}, {fills} fill items) · hiders {kids} · shells {shells} · coins {coin_supply} (shop {coin_spend}) · max hearts at end {st['maxhp']}", '',
       '## Progression (solver spheres)']
for i, s in enumerate(spheres):
    rep.append(f'### Sphere {i}'); rep += [f'- {l}' for l in s['log']] or ['- (nothing new)']
rep += ['', '## Zones', '| zone | tier | unlocked at sphere | entities |', '|---|---|---|---|']
for z in WD['zones']: rep.append(f"| {z['name']} | {z['tier']} | {zone_sphere.get(z['id'], 'NEVER')} | {counts.get(z['id'], {})} |")
rep += ['', '## Snapshots', ', '.join(SNAPS), '', '## Errors'] + ([f'- ❌ {e}' for e in errors] or ['- none']) + ['', '## Warnings'] + ([f'- ⚠️ {w}' for w in warns] or ['- none'])
outs = {'public/world.json': json.dumps(world, ensure_ascii=False, separators=(',', ':')), 'public/rooms.json': json.dumps(rooms_out, separators=(',', ':')), 'gen-report.md': '\n'.join(rep) + '\n'}
if CHECK:
    stale = [p for p, s in outs.items() if not os.path.exists(os.path.join(ROOT, p)) or open(os.path.join(ROOT, p), encoding='utf-8').read() != s]
    if stale: err(f'generated files are stale (run npm run gen): {stale}')
else:
    for p, s in outs.items(): open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(s)
print('\n'.join(rep[2:4])); print(f'spheres {len(spheres)}, zones {zone_sphere}')
for w in warns: print('WARN', w)
for e in errors: print('ERROR', e)
sys.exit(1 if errors else 0)
