// State-bouncing for preview testing.
// URL: ?snap=<name> (solver snapshot) · ?state=<base64 save> · ?give=item,item:3 · ?flag=a,b · ?tp=z3 | 120,40 | room:131
//      ?room=<id> · ?at=x,y · ?god · ?hints · ?physics · ?fresh · ?debug (panel)
// URL states use a scratch save key, so a real playthrough is never touched.
import { G, $, persist, toast } from '../mech/core';
import { fresh } from '../state';
import { changed, setFlag, clearFlag, give, currentHint } from './logic';

const params = new URLSearchParams(location.search);
export function loadSnapshot(name: string) {
  const s = G.w.snapshots[name]; if (!s) { toast('no snapshot ' + name); return false; }
  const st = fresh();
  st.items = { ...s.items }; st.flags = [...s.flags]; st.maxhp = s.maxhp; st.hp = s.maxhp; st.got = [...s.got]; st.started = true;
  st.defeated = s.got.filter((id: string) => G.w.entities.find((e: any) => e.id === id && e.type === 'enemy'));
  st.seenZones = G.w.zones.filter((z: any) => st.flags.includes('visited_' + z.id)).map((z: any) => z.id);
  st.room = s.room ?? null; if (!s.room && s.x) st.pos = [s.x, s.y];
  G.st = st; return true;
}
function tpTarget(v: string): { room?: string; x?: number; y?: number } | null {
  if (v.startsWith('room:')) return { room: v.slice(5) };
  const m = v.match(/^(\d+),(\d+)$/); if (m) return { x: +m[1] * 16 + 8, y: +m[2] * 16 + 8 };
  const z = G.w.zones.find((z: any) => z.id === v); if (!z) return null;
  const n = Object.values<any>(G.w.npcs).flatMap((n) => n.at).find((a: any) => !a.room && a.zone === v) ?? G.w.entities.find((e: any) => !e.room && e.zone === v);
  return n ? { x: n.x, y: n.y + 16 } : null;
}
export function applyUrlState() {
  if (params.has('snap')) loadSnapshot(params.get('snap')!);
  if (params.has('state')) { try { G.st = { ...fresh(), ...JSON.parse(decodeURIComponent(escape(atob(params.get('state')!)))) }; } catch { toast('bad ?state'); } }
  for (const g of (params.get('give') ?? '').split(',').filter(Boolean)) { const [k, n] = g.split(':'); give(k, Number(n ?? 1), true); }
  for (const f of (params.get('flag') ?? '').split(',').filter(Boolean)) setFlag(f);
  if (params.has('tp')) { const t = tpTarget(params.get('tp')!); if (t?.room) G.st.room = t.room; else if (t) { G.st.room = null; G.st.pos = [t.x!, t.y!]; } }
  if (params.has('god')) G.god = true;
  if (params.has('hints')) document.body.classList.add('hints');
}
export function shareLink() {
  const s = { ...G.st, pos: G.st.room ? G.st.pos : [Math.round((window as any).tg.player.x), Math.round((window as any).tg.player.y)] };
  return `${location.origin}${location.pathname}?debug&state=${btoa(unescape(encodeURIComponent(JSON.stringify(s))))}`;
}
const go = (q: string) => { location.href = `${location.pathname}?debug&${q}`; };

export function debugPanel(world: any) {
  if (!params.has('debug')) return;
  $('debug-btn').style.display = 'flex';
  const el = $('debug'), W = G.w, st = W.stats;
  const opt = (arr: string[]) => arr.map((k) => `<option>${k}</option>`).join('');
  el.innerHTML = `
    <h3>🛠 Tara Glen debug <button id="dbg-x">✕</button></h3>
    <label>Snapshot <select id="dbg-snap">${opt(Object.keys(W.snapshots))}</select><button id="dbg-snap-go">Load</button></label>
    <label>Teleport <select id="dbg-tp">${opt([...W.zones.map((z: any) => z.id), ...Object.keys(W.rooms).map((r) => 'room:' + r)])}</select><button id="dbg-tp-go">Go</button></label>
    <label>Give <select id="dbg-item">${opt(Object.keys(W.items))}</select><button id="dbg-give">+1</button></label>
    <label>Flag <input id="dbg-flag" list="dbg-flags" placeholder="evening"><datalist id="dbg-flags">${opt(['evening', 'tide_out', 'knows_password', 'clubhouse_open', 'photo_returned', 'biscuit_fed'])}</datalist>
      <button id="dbg-set">Set</button><button id="dbg-clear">Clear</button></label>
    <label><button id="dbg-god">God mode: ${G.god ? 'on' : 'off'}</button><button id="dbg-hint">Hint</button><button id="dbg-phys">Physics</button><button id="dbg-fresh">Fresh</button></label>
    <label><button id="dbg-share">📋 Copy state link</button></label><input id="dbg-link" readonly>
    <details><summary>Solver report: ${st.errors.length ? '❌ ' + st.errors.length + ' errors' : '✅ completable'} · ${W.progression.length} steps · coverage ${(st.coverage * 100).toFixed(1)}%</summary>
      <p>${st.entities} entities · ${st.npcs} NPCs · ${st.ambient} walkers · ${st.decor} decor · ${st.rooms} interiors · ${st.knockDoors} knock doors · ${st.hiders} hiders · ${st.shells} shells · coins ${st.coinSupply} (shop ${st.coinSpend}) · max hearts ${st.maxhpEnd}</p>
      <ol>${W.progression.map((s: string[]) => `<li>${s.filter((l) => !/^(pickup coin|pickup shell|hider|whisper)/.test(l)).join(' · ')}</li>`).join('')}</ol></details>
    <details><summary>State</summary><pre id="dbg-state"></pre></details>`;
  const v = (id: string) => ($(id) as HTMLInputElement).value, on = (id: string, f: () => void) => $(id).addEventListener('click', (e) => { e.stopPropagation(); f(); });
  ['pointerdown', 'touchstart'].forEach((t) => el.addEventListener(t, (e) => e.stopPropagation()));
  on('dbg-x', () => el.classList.remove('show'));
  on('dbg-snap-go', () => go('snap=' + encodeURIComponent(v('dbg-snap'))));
  on('dbg-tp-go', () => go(`state=${shareLink().split('state=')[1]}&tp=${v('dbg-tp')}`));
  on('dbg-give', () => { give(v('dbg-item')); changed(); });
  on('dbg-set', () => { setFlag(v('dbg-flag')); changed(); });
  on('dbg-clear', () => { clearFlag(v('dbg-flag')); changed(); });
  on('dbg-god', () => { G.god = !G.god; $('dbg-god').textContent = 'God mode: ' + (G.god ? 'on' : 'off'); });
  on('dbg-hint', () => { const c = currentHint(); toast(c ? c.h.tiers[0] : 'no hint'); });
  on('dbg-phys', () => { location.href = location.href + (location.search ? '&' : '?') + 'physics'; });
  on('dbg-fresh', () => go('fresh'));
  on('dbg-share', () => { const l = shareLink(); ($('dbg-link') as HTMLInputElement).value = l; navigator.clipboard?.writeText(l).then(() => toast('State link copied'), () => toast('Copy the link below')); });
  $('debug-btn').addEventListener('pointerdown', (e) => { e.stopPropagation(); el.classList.toggle('show'); $('dbg-state').textContent = JSON.stringify({ ...G.st, got: G.st.got.length + ' ids' }, null, 1); persist(); });
  void world;
}

// ---------- test API (Playwright drives the critical path through these) ----------
export const testApi = {
  scene: () => ((window as any).room?.sys?.isActive() ? (window as any).room : (window as any).tg),
  tp(id: string) { // move next to an entity / npc in the current scene
    const s = testApi.scene(), t = s.ents.things.find((t: any) => t.e.id === id);
    if (!t) return 'missing ' + id;
    const dy = t.kind === 'pickup' ? 8 : 14; s.player.body.reset(t.obj.x, t.obj.y + dy); return 'ok';
  },
  use(id: string) { const s = testApi.scene(), t = s.ents.things.find((t: any) => t.e.id === id); if (!t) return 'missing ' + id; s.ents.use(t); return 'ok'; },
  adv(n = 30) { const ui = (G as any).ui; for (let i = 0; i < n && ui.box; i++) { if ($('choices').style.display === 'flex') return 'choice'; ui.advance(); ui.box?.stop?.(true); } return ui.box ? 'open' : 'closed'; },
  choose(text: string) { const b = [...$('choices').querySelectorAll('button')].find((b) => b.textContent!.includes(text)); if (!b) return 'nochoice'; b.dispatchEvent(new Event('pointerdown')); return 'ok'; },
  give: (k: string, n = 1) => { give(k, n, true); changed(); return G.st.items[k]; },
  state: () => ({ items: G.st.items, flags: G.st.flags.filter((f) => !f.startsWith('ev:') && !f.startsWith('visited')), hp: G.st.hp, maxhp: G.st.maxhp, room: G.st.room }),
};
(window as any).tgTest = testApi;
