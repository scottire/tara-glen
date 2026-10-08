// Progress state + localStorage save. All text/positions come from public/progression.json (CFG) and public/mechanics.json (MECH).
// Inventory/save shape follows Wispguard's DataManager + InventoryManager (devshareacademy, MIT), merged into one small object.
export type Cfg = any;
export interface Inv { got: string[]; abilities: string[]; ammo: Record<string, number>; items: Record<string, number> }
export interface Save {
  stage: number; collected: number[]; elapsed: number; pos?: [number, number]; done?: boolean;
  room?: string | null; roomPos?: [number, number]; hp: number; inv: Inv; defeated: string[]; started?: boolean;
}
const KEY = 'tara-glen-save-v2'; // separate from v1 so the preview build never clobbers the live site's save
export const fresh = (): Save => ({ stage: 0, collected: [], elapsed: 0, hp: 3, inv: { got: [], abilities: [], ammo: {}, items: {} }, defeated: [] });
export function load(): Save {
  try { const s = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; s.inv = { ...fresh().inv, ...s.inv }; return s; } catch { return fresh(); }
}
export function save(s: Save) { localStorage.setItem(KEY, JSON.stringify(s)); }
export function reset() { localStorage.removeItem(KEY); }
export const fmt = (t: string, v: Record<string, any> = {}) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
export const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
