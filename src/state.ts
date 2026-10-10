// v6 save: flags + item counts (abilities are items too) + collected entity ids. One object, localStorage.
// Shape follows Wispguard's DataManager/InventoryManager idea (devshareacademy, MIT), flattened.
export interface Save {
  items: Record<string, number>; flags: string[]; got: string[]; defeated: string[];
  maxhp: number; hp: number; elapsed: number; done?: boolean; started?: boolean;
  pos?: [number, number]; room?: string | null; roomPos?: [number, number];
  hintTier: Record<string, number>; seenZones: string[]; cp?: [number, number];
  v?: number; // save format version (see migrateSave in v6/logic.ts)
}
export const SAVE_VERSION = 11;
const params = new URLSearchParams(location.search);
// v11.2 save safety. Scott lost progress after an iOS tab eviction: he had opened a ?snap link, the snap session lived in a
// scratch key, and the evicted tab reloaded the same URL, which re-applied the snapshot over everything he had played.
// Now: URL states (?snap ?state ?give ?flag ?fresh ?tp ?room ?at) apply only on a fresh navigation (never on reload or
// back/forward), are stripped from the address bar right after, and play on in the real save. Before a link replaces a
// real save that has progress, that save is kept in BEFORE_LINK. Every write also keeps a rolling backup slot.
const URL_STATE = ['snap', 'state', 'give', 'flag', 'fresh', 'tp', 'room', 'at'];
const navType = (() => { try { return (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type ?? 'navigate'; } catch { return 'navigate'; } })();
const hasUrlState = URL_STATE.some((k) => params.has(k));
/** a link's state is applied only when the user actually opened it (not when iOS or the user reloads that tab) */
export const URL_INTENT = hasUrlState && navType === 'navigate';
export const DEBUG_STATE = URL_INTENT && ['snap', 'state', 'give', 'flag'].some((k) => params.has(k));
export const urlParam = (k: string) => (URL_INTENT || !URL_STATE.includes(k) ? params.get(k) : null);
export const urlHas = (k: string) => (URL_INTENT || !URL_STATE.includes(k)) && params.has(k);
// v12.1 tour links (?tour=z3): view-only. Start from a fixed snapshot in the zone's intended time of day, never read or write
// the real save, and stay in the URL so a reload just shows the same tour again.
export const TOUR = /^z[1-7]$/.test(params.get('tour') ?? '') ? params.get('tour')! : null;
const KEY = 'tara-glen-save-v6', BAK = KEY + '-bak', BEFORE_LINK = KEY + '-before-link', OLD_DEBUG = KEY + '-debug';
export const fresh = (): Save => ({ items: {}, flags: [], got: [], defeated: [], maxhp: 3, hp: 3, elapsed: 0, hintTier: {}, seenZones: [], v: SAVE_VERSION });
const progress = (s: any) => (s && s.items ? (s.got?.length ?? 0) + (s.flags?.length ?? 0) : -1);
function read(key: string): any | null {
  try { const raw = localStorage.getItem(key); if (!raw) return null; const o = JSON.parse(raw); return o && typeof o === 'object' && o.items ? o : null; } catch { return null; }
}
/** strip the one-shot URL state so a reload can never re-run it (debug/god/hints/physics stay) */
export function stripUrlState() {
  if (!hasUrlState) return;
  const q = new URLSearchParams(location.search); URL_STATE.forEach((k) => q.delete(k));
  const s = q.toString(); try { history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch { /* ignore */ }
}
export function load(): Save {
  if (TOUR) return fresh();
  let raw = read(KEY);
  if (!raw && localStorage.getItem(KEY)) raw = read(BAK); // a corrupt main slot falls back to the backup
  // one-off rescue: v11 kept link sessions (?snap etc.) in a scratch key; if that holds more progress than the real save, adopt it
  const dbg = read(OLD_DEBUG);
  if (dbg && progress(dbg) > progress(raw)) { if (raw) try { localStorage.setItem(BEFORE_LINK, JSON.stringify(raw)); } catch { /* */ } raw = dbg; try { localStorage.setItem(KEY, JSON.stringify(dbg)); } catch { /* */ } }
  if (dbg) try { localStorage.removeItem(OLD_DEBUG); } catch { /* */ }
  if (URL_INTENT && (DEBUG_STATE || params.has('fresh'))) {
    if (progress(raw) > 0) try { localStorage.setItem(BEFORE_LINK, JSON.stringify(raw)); } catch { /* */ }
    return fresh();
  }
  if (!raw) return fresh();
  const s: Save = { ...fresh(), v: raw.v ?? 0, ...raw };
  // v11 redrew the zones: a pre-v11 position may now sit behind a new border, so older saves wake up at home (127)
  if ((s.v ?? 0) < 11) { s.pos = undefined; s.room = null; s.roomPos = undefined; s.cp = undefined; }
  return s;
}
let lastBak = 0;
export function save(s: Save) {
  if (TOUR || wiped) return; // tours never touch the real save; nothing may re-save after a reset
  try {
    const json = JSON.stringify(s), now = Date.now();
    if (now - lastBak > 20000) { const prev = localStorage.getItem(KEY); if (prev && read(KEY)) localStorage.setItem(BAK, prev); lastBak = now; }
    localStorage.setItem(KEY, json);
  } catch { /* private mode / quota */ }
}
// v12.2: reset used to be undone by the pagehide/beforeunload flush, which re-saved the in-memory game as the page navigated
// away, and it left the before-link slot behind. Now reset blocks every later save on this page and wipes every save slot.
let wiped = false;
export function reset() {
  if (TOUR) return;
  wiped = true;
  try { Object.keys(localStorage).filter((k) => k.startsWith('tara-glen-save')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ }
}
export const fmt = (t: string, v: Record<string, any> = {}) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
export const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
