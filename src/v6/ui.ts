// UI: Rex TextBox dialogue (typewriter, paged, queued) with DOM choice buttons, HUD, bag/combine panel, zone banner, boss bar, end card.
import { objectiveText } from '../v9/arena';
import Phaser from 'phaser';
import TextBox from 'phaser4-rex-plugins/templates/ui/textbox/TextBox.js';
import RoundRectangle from 'phaser4-rex-plugins/plugins/roundrectangle.js';
import { G, $, S, persist } from '../mech/core';
import { reset, clock } from '../state';
import { count, cond, apply, changed, tryCombine, showHint } from './logic';

type Choice = { text: string; when?: string[]; effects?: any[]; reply?: string[] };
type Msg = { lines: string[]; choices?: Choice[]; done?: () => void };

let probe: HTMLElement | undefined;
/** safe-area insets in CSS px (env() only resolves in CSS, so measure a probe element) */
export function safeInsets() {
  if (!probe) { probe = document.createElement('div'); probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(probe); }
  const c = getComputedStyle(probe); return { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0, b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 };
}
/** height of one cinematic bar (must match --bar in index.html) */
const momentBar = () => Math.min(innerHeight * 0.06, 40);

export class UI extends Phaser.Scene {
  box?: any; queue: Msg[] = []; cur?: Msg;
  constructor() { super({ key: 'UI', active: true }); }
  create() {
    const adv = () => this.advance();
    this.input.on('pointerdown', adv);
    this.input.keyboard!.on('keydown-SPACE', adv); this.input.keyboard!.on('keydown-ENTER', adv);
    (G as any).ui = this;
    this.scale.on('resize', () => this.time.delayedCall(50, () => this.relayout()));
  }
  say(m: Msg) {
    // v10: never open an empty box. Rex's typing never finishes on an empty page, and skipping it then loops forever (the "room clear freeze")
    m = { ...m, lines: (m.lines ?? []).filter((l) => typeof l === 'string' && l.trim().length > 0) };
    if (!m.lines.length) { if (m.choices?.length) m.lines = ['…']; else { try { m.done?.(); } catch (e) { console.error(e); } return; } }
    if (this.box || this.cur) { this.queue.push(m); return; }
    this.cur = m; G.paused = true; document.body.classList.add('talking');
    this.render(m);
  }
  /** Lay the box out inside the *visible* area: safe-area insets (notch / home bar), the cinematic bars of a moment, real CSS width. */
  render(m: Msg, page = 0) {
    const k = 1 / this.scale.zoom, ins = safeInsets(), vw = innerWidth, vh = innerHeight;
    const bar = document.body.classList.contains('moment') ? momentBar() : 0;
    const visW = vw - ins.l - ins.r, Wc = Math.min(visW - 16, 520), fsC = Math.max(12, Math.min(15, Math.floor((Wc - 40) / 21)));
    const bottomC = Math.max(10, ins.b + 6) + bar + 6, W = Wc * k, fs = Math.round(fsC * k);
    const bg = this.add.existing(new RoundRectangle(this, 0, 0, 2, 2, 10 * k, 0x1b2230, 0.94)) as any;
    bg.setStrokeStyle(3 * k, 0xf4e7c5);
    const text = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: fs + 'px', color: '#ffffff', lineSpacing: 4 * k,
      wordWrap: { width: W - 32 * k, useAdvancedWrap: true }, fixedWidth: W - 32 * k, fixedHeight: (fs + 4 * k) * 3 + 8 * k, maxLines: 3 });
    const icon = this.add.text(0, 0, '▼', { fontSize: fs + 'px', color: '#f4e7c5' });
    const box = new TextBox(this, { x: (ins.l + (vw - ins.r)) / 2 * k, y: (vh - bottomC) * k, background: bg, text, action: icon,
      space: { left: 16 * k, right: 16 * k, top: 12 * k, bottom: 12 * k, text: 8 * k }, page: { maxLines: 3 }, type: { speed: 22 } } as any);
    this.add.existing(box as any); box.setOrigin(0.5, 1).layout();
    icon.setVisible(false);
    box.on('pageend', () => {
      icon.setVisible(true); this.tweens.add({ targets: icon, y: '+=4', duration: 300, yoyo: true, repeat: -1 });
      if (box.isLastPage && m.choices?.length) this.showChoices(m.choices);
    });
    box.on('type', () => icon.setVisible(false));
    box.start(m.lines.join('\f\n'), 22);
    for (let i = 0; i < page && !box.isLastPage; i++) box.typeNextPage();
    this.box = box; this.scene.bringToTop();
    document.documentElement.style.setProperty('--dlg', Math.round(bottomC + box.height / k) + 'px'); // choices sit above the box
  }
  /** orientation change / resize while talking: rebuild the box at the new size, on the same page */
  relayout() {
    const b = this.box as any, m = this.cur; if (!b || !m) return;
    const page = b.page?.pageIndex ?? 0; b.removeAllListeners(); try { if (b.isTyping) b.stop(false); } catch { /* */ } b.destroy(); this.box = undefined;
    this.render(m, Math.max(0, page));
  }
  showChoices(cs: Choice[]) {
    const el = $('choices'); el.innerHTML = ''; el.style.display = 'flex';
    cs.filter((c) => cond(c.when)).forEach((c) => {
      const b = document.createElement('button'); b.textContent = c.text;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.pick(c); });
      el.appendChild(b);
    });
  }
  pick(c: Choice) {
    $('choices').style.display = 'none';
    const lines = apply(c.effects ?? []);
    this.close();
    const more = [...(c.reply ?? []), ...lines];
    if (more.length) this.say({ lines: more });
    changed();
  }
  advance() {
    const b = this.box; if (!b) return;
    if ($('choices').style.display === 'flex') return; // must pick a choice
    try {
      const t = b.typing; // clamp so Rex's skip-to-end loop always terminates
      if (t && t.typingIndex > t.textLength) t.typingIndex = t.textLength;
      if (b.isTyping && t && t.textLength === 0) return this.close();
      if (b.isTyping) b.stop(true);
      else if (!b.isLastPage) b.typeNextPage();
      else this.close();
    } catch (e) { console.error('dialogue advance failed, closing', e); this.close(); }
  }
  close() {
    const m = this.cur, b = this.box as any;
    if (b) { b.removeAllListeners(); try { if (b.isTyping) b.stop(false); b.typing?.timer?.remove?.(); } catch { /* already stopped */ } b.destroy(); } this.box = undefined; this.cur = undefined;
    const next = this.queue.shift();
    if (next) { this.time.delayedCall(60, () => this.say(next)); }
    else this.time.delayedCall(150, () => { if (!this.box) { G.paused = bagOpen(); document.body.classList.remove('talking'); } });
    m?.done?.();
  }
}
/** error boundary helper: drop any dialogue and unpause so the game never stays stuck */
export function recoverUI() {
  const ui = (G as any).ui as UI | undefined; if (!ui) return;
  try { ui.queue = []; if (ui.box || ui.cur) ui.close(); } catch { ui.box = undefined; ui.cur = undefined; }
  $('choices').style.display = 'none'; G.paused = bagOpen(); document.body.classList.remove('talking', 'moment');
}
export const say = (lines: string[], choices?: Choice[], done?: () => void) => {
  const ui = (G as any).ui as UI | undefined;
  if (!ui) return console.warn('say before UI ready', lines);
  ui.say({ lines, choices, done });
};
export const dialogOpen = () => !!((G as any).ui?.box);

// ---------- HUD ----------
export function hud() {
  const st = G.st, I = G.w.items; if (!I) return;
  $('hearts').textContent = Array.from({ length: st.maxhp }, (_, i) => (i < st.hp ? '❤️' : '🤍')).join('');
  $('coins').textContent = `🪙${count('coin')}`;
  $('shells').textContent = count('shell') ? `🐚${count('shell')}` : '';
  $('kids').textContent = count('kids') ? `🙈${count('kids')}/12` : '';
  $('abilities').textContent = Object.keys(I).filter((k) => I[k].kind === 'ability' && count(k)).map((k) => I[k].icon).join('');
  const f = $('fire'); f.style.display = count('throw') ? 'flex' : 'none';
  f.innerHTML = `💦<small>${count('balloons')}</small>`; f.classList.toggle('empty', !count('balloons'));
  $('dash').textContent = count('skateboard') ? '🛹' : '💨';
  $('hint-btn').style.display = count('walkie') || document.body.classList.contains('hints') ? 'flex' : 'none';
  $('objective').textContent = '🎯 ' + objectiveText(); // v9: short current objective, tap to fold
}

// ---------- bag / combine ----------
let sel: string | null = null;
export const bagOpen = () => $('bag').classList.contains('show');
export function openBag() { sel = null; renderBag(); $('bag').classList.add('show'); G.paused = true; }
export function closeBag() { $('bag').classList.remove('show'); G.paused = dialogOpen(); }
function renderBag() {
  const I = G.w.items, keys = Object.keys(I).filter((k) => count(k) > 0 && !I[k].hidden);
  const cell = (k: string) => `<button data-k="${k}" class="${sel === k ? 'sel' : ''}"><span>${I[k].icon}</span>${count(k) > 1 ? `<small>${count(k)}</small>` : ''}</button>`;
  const stuff = keys.filter((k) => I[k].kind !== 'ability'), abil = keys.filter((k) => I[k].kind === 'ability');
  $('bag-items').innerHTML = stuff.length ? stuff.map(cell).join('') : `<p>${S('bagEmpty')}</p>`;
  $('bag-abil').innerHTML = abil.map(cell).join('');
  $('bag-desc').innerHTML = sel ? `<b>${I[sel].name}</b> ${I[sel].desc ?? ''}<br><i>Tap another item to combine.</i>` : 'Tap an item to look at it. Tap two to combine them.';
  $('bag').querySelectorAll<HTMLButtonElement>('button[data-k]').forEach((b) => b.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); const k = b.dataset.k!;
    if (!sel || sel === k) { sel = sel === k ? null : k; return renderBag(); }
    const a = sel; sel = null;
    if (tryCombine(a, k)) { closeBag(); return; }
    $('bag-desc').textContent = S('combineFail'); setTimeout(renderBag, 900);
  }));
}

// ---------- banner / boss bar / end ----------
export function banner(text: string, sub = '') {
  const el = $('banner'); el.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
export function bossBar(name: string | null, frac = 1) {
  const el = $('bossbar'); if (!name) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.innerHTML = `<span>${name}</span><i style="width:${Math.max(0, frac) * 100}%"></i>`;
}
export function showEnd() {
  const s = G.st; $('end-title').textContent = S('endTitle'); $('end-sub').textContent = S('endSubtitle');
  $('end-stats').innerHTML = `<div><b>Time</b><span>${clock(s.elapsed)}</span></div><div><b>Hiders found</b><span>${count('kids')}/12</span></div>
    <div><b>Hearts</b><span>${s.maxhp}/${G.w.player.maxhpCap}</span></div><div><b>Shells</b><span>${count('shell')}</span></div>`;
  $('end-again').textContent = S('playAgain'); $('end-more').textContent = S('keepExploring');
  $('end-again').onclick = () => { reset(); location.href = location.pathname; };
  $('end-more').onclick = () => $('end').classList.remove('show');
  $('end').classList.add('show'); persist();
}
export function wireButtons() {
  $('bag-btn').addEventListener('pointerdown', (e) => { e.stopPropagation(); bagOpen() ? closeBag() : openBag(); });
  $('bag-close').addEventListener('pointerdown', (e) => { e.stopPropagation(); closeBag(); });
  $('hint-btn').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!G.paused) showHint(); });
  $('menu-btn').onclick = () => $('menu').classList.toggle('show');
  $('menu-close').onclick = () => $('menu').classList.remove('show');
  $('menu-reset').onclick = () => { if (confirm(S('resetConfirm'))) { reset(); location.href = location.pathname; } };
}
