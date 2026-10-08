#!/usr/bin/env python3
"""Tara Glen content generator + validator.
  content/*.json + public/assets/map.json  ->  public/world.json, public/rooms.json, gen-report.md
Deterministic (world.seed). Never hand-edit the outputs: edit content/ and run `npm run gen`.
`--check` regenerates in memory and fails if the committed outputs differ (CI)."""
import json, os, sys, random, math
from collections import deque
from grid import Grid, ROOT, ROAD, SAND, SEA, HEDGE, BLOCK_H, BLOCK_V
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
def rects_of(z): return z['rects'] if isinstance(z['rects'][0], list) else [z['rects']]
ZMAP = bytearray(W * H)  # zone index+1 per tile
for i, z in enumerate(WD['zones']):
    for r in rects_of(z):
        for y in range(r[1], min(H, r[3] + 1)):
            for x in range(r[0], min(W, r[2] + 1)):
                if not ZMAP[T(x, y)]: ZMAP[T(x, y)] = i + 1
def zone_at(x, y): k = ZMAP[T(x, y)]; return WD['zones'][k - 1]['id'] if k else None

# ---------------- barriers + locks ----------------
barrier_tiles, decor, locks = [], [], []
LOCK_OF = {}
def line(a, b):
    (x0, y0), (x1, y1) = a, b
    if y0 == y1: return [(x, y0) for x in range(min(x0, x1), max(x0, x1) + 1)]
    return [(x0, y) for y in range(min(y0, y1), max(y0, y1) + 1)]
lock_tiles_named = {}
for b in WD['barriers']:
    ts = line(b['from'], b['to'])
    if b['type'] == 'hedge':
        free = [t for t in ts if G.free(*t)]
        runs, cur = [], []
        for t in free:
            if G.g(*t) == ROAD and (not cur or abs(t[0] - cur[-1][0]) + abs(t[1] - cur[-1][1]) == 1): cur.append(t)
            else:
                if cur: runs.append(cur)
                cur = [t] if G.g(*t) == ROAD else []
        if cur: runs.append(cur)
        la = tuple(b['lockAt'])
        lockrun = min(runs, key=lambda r: min(abs(t[0] - la[0]) + abs(t[1] - la[1]) for t in r)) if runs else []
        lock_tiles_named[b['id']] = lockrun
        vert = b['from'][0] == b['to'][0]
        for t in free:
            if t in lockrun: continue
            gid = (BLOCK_V if vert else BLOCK_H) if G.g(*t) == ROAD else HEDGE
            barrier_tiles.append([t[0], t[1], gid]); G.block[T(*t)] = 1
    elif b['type'] == 'rocks':
        for t in ts:
            if G.free(*t): decor.append({'sprite': 'groyne', 'x': t[0], 'y': t[1], 'solid': True}); G.block[T(*t)] = 1

def rect_tiles(r): return [(x, y) for y in range(r[1], r[3] + 1) for x in range(r[0], r[2] + 1)]
def gate_tiles(name):
    g = G.gates[name]
    return [(tx, ty) for ty in range(int(g['y'] // 16), int((g['y'] + g['height'] - 1) // 16) + 1) for tx in range(int(g['x'] // 16), int((g['x'] + g['width'] - 1) // 16) + 1)]
TIDE = WD['tide']
lock_defs = list(C['story']['locks']) + [
    {'id': 'sandbar', 'tide': 'sandbar', 'kind': 'water', 'req': ['@' + TIDE['flag']], 'silent': True},
    {'id': 'rock', 'rect': TIDE['rock'], 'kind': 'water', 'req': ['@' + TIDE['flag']], 'silent': True}]
for L in lock_defs:
    if 'gate' in L: tiles = gate_tiles(L['gate'])
    elif 'barrier' in L: tiles = lock_tiles_named[L['barrier']]
    elif 'tide' in L: tiles = [t for r in TIDE[L['tide']] for t in rect_tiles(r)]
    else: tiles = rect_tiles(L['rect'])
    tiles = [t for t in tiles if t not in LOCK_OF]
    for t in tiles: LOCK_OF[T(*t)] = L['id']
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
OPEN = G.flood(START_T, passable_fn(ALL_OPEN))
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
OPEN = G.flood(START_T, passable_fn(ALL_OPEN))

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
        elif ref.startswith('caravan:'): d = ALL_DOORS[int(ref.split(':')[1])]; door = {k: d[k] for k in ('x', 'y', 'out')}; d['used'] = True
        elif ref.startswith('decor:'):
            dd = CURATED_DECOR[ref.split(':')[1]]; door = {'x': dd['x'] * 16 + 8, 'y': dd['y'] * 16 + 16, 'out': [dd['x'] * 16 + 8, dd['y'] * 16 + 26]}
        if r.get('req'): door.update(req=r['req'], locked=r.get('locked', ''))
    extra = {k: r[k] for k in ('dark', 'heal', 'exitTo') if k in r}
    if r.get('req'): extra['req'] = r['req']
    mkroom(rid, r['name'], r['chambers'], r['zone'], door, **extra)
    if door: door['tileOut'] = (int(door['out'][0] // 16), int(door['out'][1] // 16)); DOOR_TILES.add(T(*door['tileOut']))

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
    DOORS.append({'x': d['x'], 'y': d['y'], 'out': d['out'], 'knock': rng.choice(KNOCK)})

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
        es = data['eslots']; n = min(len(es), 1 + tier // 2)
        for p in es[:n]:
            et = rng.choice(ZONES[zid]['enemy'])
            ENT.append({'id': nid('e'), 'type': 'enemy', 'etype': et, 'stats': estats(et, tier), 'room': rid, 'zone': zid, 'x': p[0] * 16 + 8, 'y': p[1] * 16 + 8})
for rid in RC['rooms']:  # curated rooms: enemy slots get the zone's first enemy type
    zid = RC['rooms'][rid]['zone']
    for p in ROOM_DATA[rid]['eslots']:
        et = ZONES[zid]['enemy'][0]
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
    n = int(len(cars) * 0.45 * z.get('decor', 1)) + (12 if z.get('beach') else 0)
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
OPEN2 = G.flood(START_T, passable_fn(ALL_OPEN))
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
    d = next((d for d in DOORS if d.get('room') == rid), None)
    if not d or T(int(d['out'][0] // 16), int(d['out'][1] // 16)) not in reach: return False
    return ok(d.get('req'), st)
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
        reach = G.flood(START_T, passable_fn(opened))
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
                elif t == 'enemy' and e['stats'].get('boss') and st['items'].get('throw'): eff = e.get('drops', []) + e['stats'].get('drops', [])
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
                        if any(x.get('take') == 'coin' for x in ch['effects']):
                            if not any(st['items'].get(b, 0) == 0 and demanded(b) for b in buys): continue
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
never = [e['id'] for e in ENT if e['id'] not in got and e['type'] in ('pickup', 'chest', 'activity', 'interact', 'hider', 'whisper', 'note', 'vista')]
if never: err(f'{len(never)} entities never collectable: {never[:12]}')
for nid_, n in NPCS.items():
    for i, tk in enumerate(n['talk']):
        if (nid_, i) not in matched and tk.get('when') and 'evening' not in ' '.join(tk['when']): warn(f'talk entry {nid_}[{i}] never shown on the critical path')
# ramp: zone tiers should not decrease along the unlock order
order = sorted(zone_sphere, key=zone_sphere.get); prev = 0
for zid in order:
    if ZONES[zid]['tier'] < prev: warn(f'tier ramp dips at {zid}')
    prev = max(prev, ZONES[zid]['tier'])
# hints: some hint must apply at every sphere until the end
for i, s in enumerate(spheres[:-1]):
    stt = {'items': s['state']['items'], 'flags': set(s['state']['flags'])}
    if not any(ok(h['when'], stt) for h in STORY['hints']): err(f'hint gap at sphere {i}')
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
if kids < 12: err(f'only {kids} hiders placed (Ciarán needs 12)')

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
SNAPS['night'] = next(dict({k: s['state'][k] for k in ('items', 'flags', 'maxhp', 'got')}, room=None, x=NPCS['nana']['at'][0]['x'], y=NPCS['nana']['at'][0]['y'] + 16) for s in spheres if 'evening' in s['state']['flags'])
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
         'maxhpEnd': st['maxhp'], 'spheres': len(spheres), 'zoneSphere': zone_sphere, 'perZone': counts, 'errors': errors, 'warnings': warns}
world = {'v': 6, 'seed': WD['seed'], 'title': WD['title'], 'strings': WD['strings'], 'minigames': WD['minigames'], 'progression': [s['log'] for s in spheres], 'start': dict(WD['start'], out=px(START_T)), 'player': WD['player'], 'items': ITEMS, 'itemSprites': ITEM_SPRITES,
         'recipes': RECIPES, 'zones': [{'id': z['id'], 'name': z['name'], 'tier': z['tier'], 'rects': rects_of(z), 'beach': bool(z.get('beach'))} for z in WD['zones']],
         'tide': TIDE, 'entities': ENT, 'npcs': NPCS, 'ambient': AMB, 'decor': decor, 'decorSizes': DECOR, 'locks': locks, 'barrierTiles': barrier_tiles, 'doors': DOORS,
         'rooms': ROOMS, 'events': STORY['events'], 'hints': STORY['hints'], 'end': STORY['end'], 'snapshots': SNAPS, 'monsters': MONSTER_ORDER,
         'enemyTypes': {k: v.get('bark') for k, v in C['enemies']['types'].items() if v.get('bark')}, 'stats': stats}
rooms_out = {rid: {k: d[k] for k in ('w', 'h', 'floor', 'walls', 'furn')} for rid, d in ROOM_DATA.items()}

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
