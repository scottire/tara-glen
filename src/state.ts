// Progress state + localStorage save. All text/positions come from public/progression.json (CFG).
export type Cfg = any;
export interface Save { stage: number; collected: number[]; elapsed: number; pos?: [number, number]; done?: boolean }
const KEY = 'tara-glen-save-v1';
export const fresh = (): Save => ({ stage: 0, collected: [], elapsed: 0 });
export function load(): Save { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return fresh(); } }
export function save(s: Save) { localStorage.setItem(KEY, JSON.stringify(s)); }
export function reset() { localStorage.removeItem(KEY); }
export const fmt = (t: string, v: Record<string, any> = {}) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
export const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
