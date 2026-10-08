// UI: Rex TextBox dialogue (typewriter, paged, queued) with DOM choice buttons, HUD, bag/combine panel, zone banner, boss bar, end card.
import Phaser from 'phaser';
import TextBox from 'phaser4-rex-plugins/templates/ui/textbox/TextBox.js';
import RoundRectangle from 'phaser4-rex-plugins/plugins/roundrectangle.js';
import { G, $, S, persist } from '../mech/core';
import { reset, clock } from '../state';
import { count, cond, apply, changed, tryCombine, showHint } from './logic';

type Choice = { text: string; when?: string[]; effects?: any[]; reply?: string[] };
type Msg = { lines: string[]; choices?: Choice[]; done?: () => void };

export class UI extends Phaser.Scene {
  box?: any; queue: Msg[] = []; cur?: Msg;
  constructor() { super({ key: 'UI', active: true }); }
  create() {
    const adv = () => this.advance();
    this.input.on('pointerdown', adv);
    this.input.keyboard!.on('keydown-SPACE', adv); this.input.keyboard!.on('keydown-ENTER', adv);
    (G as any).ui = this;
  }
  say(m: Msg) {
    if (this.box || this.cur) { this.queue.push(m); return; }
    this.cur = m; G.paused = true;
    const dpr = 1 / this.scale.zoom, W = Math.min(this.scale.width - 24 * dpr, 520 * dpr), fs = Math.round(15 * dpr);
    const bg = this.add.existing(new RoundRectangle(this, 0, 0, 2, 2, 10 * dpr, 0x1b2230, 0.94)) as any;
    bg.setStrokeStyle(3 * dpr, 0xf4e7c5);
    const text = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: fs + 'px', color: '#ffffff', lineSpacing: 4 * dpr,
      wordWrap: { width: W - 32 * dpr }, fixedWidth: W - 32 * dpr, fixedHeight: (fs + 4 * dpr) * 3 + 8 * dpr, maxLines: 3 });
    const icon = this.add.text(0, 0, '▼', { fontSize: fs + 'px', color: '#f4e7c5' });
    const box = new TextBox(this, { x: this.scale.width / 2, y: this.scale.height - 16 * dpr, background: bg, text, action: icon,
      space: { left: 16 * dpr, right: 16 * dpr, top: 12 * dpr, bottom: 12 * dpr, text: 8 * dpr }, page: { maxLines: 3 }, type: { speed: 22 } } as any);
    this.add.existing(box as any); box.setOrigin(0.5, 1).layout();
    icon.setVisible(false);
    box.on('pageend', () => {
      icon.setVisible(true); this.tweens.add({ targets: icon, y: '+=4', duration: 300, yoyo: true, repeat: -1 });
      if (box.isLastPage && m.choices?.length) this.showChoices(m.choices);
    });
    box.on('type', () => icon.setVisible(false));
    box.start(m.lines.join('\f\n'), 22);
    this.box = box; this.scene.bringToTop();
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
    if (b.isTyping) b.stop(true);
    else if (!b.isLastPage) b.typeNextPage();
    else this.close();
  }
  close() {
    const m = this.cur; this.box?.destroy(); this.box = undefined; this.cur = undefined;
    const next = this.queue.shift();
    if (next) { this.time.delayedCall(60, () => this.say(next)); }
    else this.time.delayedCall(150, () => { if (!this.box) G.paused = bagOpen(); });
    m?.done?.();
  }
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
  $('dash').style.display = count('skateboard') ? 'flex' : 'none';
  $('hint-btn').style.display = count('walkie') || document.body.classList.contains('hints') ? 'flex' : 'none';
  if (document.body.classList.contains('hints')) {
    const h = G.w.hints.find((h: any) => cond(h.when)); $('objective').textContent = h ? '🎯 ' + h.tiers[0] : '🎯 Explore!';
  }
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
