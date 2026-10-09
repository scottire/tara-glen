"""One-off v9 content cleanup (kept for the record): brief, grounded dialogue (v9_rewrite.json; null = drop the line),
no knock-door gags, no whispers/hider manhunt/filler notes, decor is scenery (no tap lines), fewer scattered coins."""
import json, re, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
C = {f: json.load(open(f'{ROOT}/content/{f}.json')) for f in ('npcs', 'story', 'world', 'items', 'rooms', 'decor')}
RW = json.load(open(f'{ROOT}/scripts/content/v9_rewrite.json'))
def parse(p): return [int(t[1:-1]) if t.startswith('[') else t for t in re.findall(r'\[\d+\]|[^.\[\]]+', p)]
def get(o, ks):
    for k in ks: o = o[k]
    return o
dels = []
for p, v in RW.items():
    ks = parse(p); f, ks = ks[0], ks[1:]
    if v is None: dels.append((f, ks))
    else: get(C[f], ks[:-1])[ks[-1]] = v
for f, ks in sorted(dels, key=lambda d: d[1][-1], reverse=True): del get(C[f], ks[:-1])[ks[-1]]
S = C['story']
drop_ids = {e['id'] for e in S['entities'] if e['type'] == 'whisper' or (e['type'] == 'note' and e['id'] not in ('mam_note',)) or e['type'] == 'vista' and e['id'] not in ('frame_view',)}
S['entities'] = [e for e in S['entities'] if e['id'] not in drop_ids]
C['npcs']['npcs'].pop('ciaran', None)                       # manhunt hider counter (hiders are gone)
D = C['decor']
for r in D['rules']: r.pop('lines', None)
D['knock'] = []; D['barks'] = {}; D['notes'] = []; D['whispers'] = []; D['hiders'] = []; D['fill'] = []
SIGNS = {'frame_sign': 'Playground. Under-12s only.', 'beach_sign': 'Beach: mind the gulls.', 'groyne_sign': 'DANGER: deep water round the groyne at high tide.'}
for c in D['curated']:
    if c['id'] in SIGNS: c['lines'] = [SIGNS[c['id']]]
for z in C['world']['zones']:
    z.update(notes=0, whispers=0, hiders=0, coins=min(z.get('coins', 0), 2), ambient=(z.get('ambient', 0) + 1) // 2)
C['world']['density']['minCoverage'] = 0.0
for f, d in C.items(): json.dump(d, open(f'{ROOT}/content/{f}.json', 'w'), indent=1, ensure_ascii=False)
print('dropped entities', sorted(drop_ids))
