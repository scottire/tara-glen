"""Condition DSL + effects, shared semantics with src/v6/logic.ts.
cond list = AND of terms. term: 'item' (have >=1) | 'item>=3' | '@flag' | '!term' | 'a|b' (OR)."""
import re


def term(t, st):
    t = t.strip()
    if '|' in t: return any(term(x, st) for x in t.split('|'))
    if t.startswith('!'): return not term(t[1:], st)
    if t.startswith('@'): return t[1:] in st['flags']
    m = re.match(r'^(\w+)\s*>=\s*(\d+)$', t)
    if m: return st['items'].get(m.group(1), 0) >= int(m.group(2))
    return st['items'].get(t, 0) > 0


def ok(cond, st): return all(term(t, st) for t in (cond or []))


def mentions(cond):
    """item names referenced positively by a condition (for demand tracking)."""
    out = set()
    for t in cond or []:
        for x in t.split('|'):
            x = x.strip()
            if x.startswith('!') or x.startswith('@'): continue
            out.add(re.split(r'\s*>=', x)[0])
    return out


def apply(effects, st, items_def):
    for e in effects or []:
        n = e.get('n', 1)
        if 'give' in e:
            k = e['give']; mx = items_def.get(k, {}).get('max')
            st['items'][k] = st['items'].get(k, 0) + n
            if mx: st['items'][k] = min(mx, st['items'][k])
        if 'take' in e: st['items'][e['take']] = max(0, st['items'].get(e['take'], 0) - n)
        if 'set' in e: st['flags'].add(e['set'])
        if 'clear' in e: st['flags'].discard(e['clear'])
        if 'maxhp' in e: st['maxhp'] += e['maxhp']
        if 'end' in e: st['flags'].add('ending')
