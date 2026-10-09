// v6 save: flags + item counts (abilities are items too) + collected entity ids. One object, localStorage.
// Shape follows Wispguard's DataManager/InventoryManager idea (devshareacademy, MIT), flattened.
export interface Save {
  items: Record<string, number>; flags: string[]; got: string[]; defeated: string[];
  maxhp: number; hp: number; elapsed: number; done?: boolean; started?: boolean;
  pos?: [number, number]; room?: string | null; roomPos?: [number, number];
  hintTier: Record<string, number>; seenZones: string[]; cp?: [number, number];
  v?: number; // save format version (see migrateSave in v6/logic.ts)
}
export const SAVE_VERSION = 10;
const params = new URLSearchParams(location.search);
// URL-driven states (?snap, ?state, ?give, ?flag) use a scratch save so testing never clobbers a real playthrough
export const DEBUG_STATE = ['snap', 'state', 'give', 'flag'].some((k) => params.has(k));
const KEY = DEBUG_STATE ? 'tara-glen-save-v6-debug' : 'tara-glen-save-v6';
export const fresh = (): Save => ({ items: {}, flags: [], got: [], defeated: [], maxhp: 3, hp: 3, elapsed: 0, hintTier: {}, seenZones: [], v: SAVE_VERSION });
export function load(): Save {
  if (DEBUG_STATE || params.has('fresh')) return fresh();
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...fresh(), v: raw.v ?? 0, ...raw }; } catch { return fresh(); }
}
export function save(s: Save) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }
export function reset() { localStorage.removeItem(KEY); }
export const fmt = (t: string, v: Record<string, any> = {}) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
export const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
