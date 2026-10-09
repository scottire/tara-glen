// Condition DSL + effects + world events + hints. Same semantics as scripts/gen/logic.py (the solver).
// cond = AND list of terms: 'item' | 'item>=3' | '@flag' | '!term' | 'a|b'
import { abilityMoment } from '../v9/combat';
import { G, persist, toast, S } from '../mech/core';
import { SAVE_VERSION } from '../state';
import { say, hud, showEnd } from './ui';

export const count = (k: string) => G.st.items[k] ?? 0;
export const flag = (f: string) => G.st.flags.includes(f);
export function term(t: string): boolean {
  t = t.trim();
  if (t.includes('|')) return t.split('|').some(term);
  if (t.startsWith('!')) return !term(t.slice(1));
  if (t.startsWith('@')) return flag(t.slice(1));
  const m = t.match(/^(\w+)\s*>=\s*(\d+)$/);
  if (m) return count(m[1]) >= Number(m[2]);
  return count(t) > 0;
}
export const cond = (c?: string[]) => !c || c.every(term);

const listeners: (() => void)[] = [];
export const onChange = (fn: () => void) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); };

export function give(k: string, n = 1, quiet = false) {
  const d = G.w.items[k] ?? {}, had = count(k); let v = had + n; if (d.max) v = Math.min(d.max, v);
  G.st.items[k] = v; persistSoon();
  if (d.how && !had) { // v10: fight ability unlocked -> pose + banner with the how-to
    const w = window as any, sc = w.room?.sys?.isActive() ? w.room : w.tg; setTimeout(() => sc && abilityMoment(sc, k), 250); return; }
  if (!quiet && !d.hidden) toast(S('got', { icon: d.icon ?? '', name: d.name ?? k, n: n > 1 ? ` x${n}` : '' }));
}
export function take(k: string, n = 1) { G.st.items[k] = Math.max(0, count(k) - n); }
export function setFlag(f: string) { if (!flag(f)) { G.st.flags.push(f); persistSoon(); } }
export function clearFlag(f: string) { G.st.flags = G.st.flags.filter((x) => x !== f); persistSoon(); }
/** v11.2: every meaningful change (pickup, flag, ability, zone entry) is saved within a moment */
let saveTimer = 0;
export function persistSoon() { if (!saveTimer) saveTimer = window.setTimeout(() => { saveTimer = 0; persist(); }, 250); }

/** Apply effects; returns lines to say (callers usually pass them straight to say()). */
export function apply(effects: any[] = [], quiet = false): string[] {
  const lines: string[] = [];
  for (const e of effects) {
    const n = e.n ?? 1;
    if (e.give) give(e.give, n, quiet);
    if (e.take) take(e.take, n);
    if (e.set) setFlag(e.set);
    if (e.clear) clearFlag(e.clear);
    if (e.say) lines.push(...e.say);
    if (e.maxhp) { G.st.maxhp = Math.min(G.w.player.maxhpCap, G.st.maxhp + e.maxhp); G.st.hp = G.st.maxhp; if (!quiet) toast('❤️ +1 heart!'); }
    if (e.heal) G.st.hp = G.st.maxhp;
    if (e.refill) { if (count('throw')) G.st.items.balloons = G.w.items.balloons.max; }
    if (e.hint) setTimeout(showHint, 50);
    if (e.end) { setFlag('ending'); G.st.done = true; setTimeout(showEnd, 1200); }
  }
  return lines;
}

/** Call after any state change: fires world events (once), saves, refreshes HUD + scenes. */
export function changed() {
  for (let guard = 0; guard < 5; guard++) {
    const ev = G.w.events.find((e: any) => !flag('ev:' + e.id) && cond(e.when));
    if (!ev) break;
    setFlag('ev:' + ev.id);
    const lines = apply(ev.effects);
    if (lines.length) say(lines);
  }
  persist(); hud(); listeners.slice().forEach((f) => f());
}

export function currentHint() {
  const i = G.w.hints.findIndex((h: any) => cond(h.when));
  return i < 0 ? null : { i, h: G.w.hints[i] };
}
export function showHint() {
  const c = currentHint();
  if (!c) return say([S('hintNone')]);
  const k = String(c.i), tier = Math.min(2, G.st.hintTier[k] ?? 0);
  G.st.hintTier[k] = tier + 1; persist();
  say([`📻 Hint ${tier + 1}/3: ${c.h.tiers[tier]}`, ...(tier < 2 ? ['(Ask again for a bigger hint.)'] : [])]);
}

export function tryCombine(a: string, b: string): boolean {
  const r = G.w.recipes.find((r: any) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  if (!r) return false;
  const need = { ...(r.need ?? {}) } as Record<string, number>;
  if (count(r.a) < (need[r.a] ?? 1) || count(r.b) < (need[r.b] ?? 1)) { toast(`Need ${Object.entries(need).map(([k, v]) => `${v} ${G.w.items[k].name}`).join(', ')}`); return true; }
  for (const c of r.consume) { if (typeof c === 'string') take(c); else for (const [k, v] of Object.entries<number>(c)) take(k, v); }
  apply(r.effects, true);
  say([r.text]); changed(); return true;
}

/** v10 save migration (idempotent; runs on every load once G.w exists). Older saves won fights that now carry rewards
 * (v9: boss131 had no drop, arenas paid coins, rooms paid nothing). Anything already beaten whose v10 reward is missing is granted
 * here, so a v9 player who beat the Big Dust Bunny gets Power Drive instead of an objective asking them to beat it again.
 * Returns the fight abilities granted so the caller can show their banners. */
export function migrateSave(): string[] {
  const st = G.st, granted: string[] = [], from = st.v ?? 0;
  const grant = (effects: any[] = []) => { for (const e of effects) {
    if (e.give && G.w.items[e.give]?.how) { if (!count(e.give)) { st.items[e.give] = 1; granted.push(e.give); } }
    else if (e.maxhp) st.maxhp = Math.min(G.w.player.maxhpCap, st.maxhp + e.maxhp);
    else if (e.give) st.items[e.give] = count(e.give) + (e.n ?? 1);
    if (e.set) setFlag(e.set);
  } };
  if (from < 11) { // v11 renamed/moved fights: keep what an older save already won
    if (flag('arena:arena_strand') && !flag('arena:arena_green')) setFlag('arena:arena_green');
    if (flag('clear:m377') && !count('dashstrike')) { st.items.dashstrike = 1; granted.push('dashstrike'); }
  }
  for (const e of G.w.entities) {
    if (e.type === 'enemy' && st.got.includes(e.id)) // beaten boss: only its fight abilities (other drops were paid at the time)
      grant((e.drops ?? []).filter((d: any) => d.give && G.w.items[d.give]?.how));
    else if (e.type === 'encounter' && !st.got.includes(e.id) && flag(e.arena ? 'arena:' + e.arena : 'clear:' + e.room)) {
      st.got.push(e.id); grant(e.effects); }
  }
  if (from < 11) { // v11 spine: the den fee is Sully's fiver, the clubhouse rope is a bribe (the old password counts)
    if (flag('sully_done') && !flag('match_joined') && !count('fiver')) st.items.fiver = 1;
    if (flag('clubhouse_open') && !flag('bribed')) setFlag('bribed');
  }
  st.v = SAVE_VERSION;
  if (granted.length || from !== SAVE_VERSION) persist();
  return granted;
}
