// v9 structure: outdoor arenas (posts close the ring until every wave is cleared), checkpoints (caravan doors + benches),
// living caravans (door glow + chimney smoke on enterable ones only) and the HUD objective line.
import Phaser from 'phaser';
import { G, $, toast, persist } from '../mech/core';
import { apply, changed, cond } from '../v6/logic';
import { say, banner, hud } from '../v6/ui';
import { burst, ensureFxTextures } from './combat';
import type { Enemy } from '../v6/enemies';

export let objectiveOverride: string | null = null;
export function setObjective(t: string | null) { if (objectiveOverride === t) return; objectiveOverride = t; hud(); }
export function objectiveText() {
  if (objectiveOverride) return objectiveOverride;
  const h = G.w.hints?.find((h: any) => cond(h.when)); return h ? h.tiers[0] : 'Explore the park.';
}
export function wireObjective() {
  const el = $('objective'); if (localStorage.getItem('tg-obj-min') === '1') el.classList.add('min');
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); el.classList.toggle('min'); localStorage.setItem('tg-obj-min', el.classList.contains('min') ? '1' : '0'); });
}

type W = Phaser.Scene & { player: any; enemies: Enemy[]; ents: any; walls: any[]; lastSafe: [number, number] };
export class Arenas {
  active: { a: any; wave: number; alive: Set<Enemy>; posts: Phaser.GameObjects.Image[]; body: Phaser.Physics.Arcade.StaticGroup; colls: Phaser.Physics.Arcade.Collider[] } | null = null;
  marks: Phaser.GameObjects.Graphics;
  constructor(public w: W) {
    ensureFxTextures(w);
    this.marks = w.add.graphics().setDepth(-3);
    for (const a of G.w.arenas ?? []) this.drawMark(a);
  }
  done(a: any) { return G.st.flags.includes('arena:' + a.id); }
  drawMark(a: any) { // dashed ring on the grass so the space reads as an arena before it closes
    const [x0, y0, x1, y1] = a.rect, g = this.marks, c = this.done(a) ? 0x9fd89f : 0xffd27a;
    g.lineStyle(1, c, 0.55);
    for (let x = x0; x < x1; x += 8) { g.lineBetween(x, y0, x + 4, y0); g.lineBetween(x, y1, x + 4, y1); }
    for (let y = y0; y < y1; y += 8) { g.lineBetween(x0, y, x0, y + 4); g.lineBetween(x1, y, x1, y + 4); }
  }
  update() {
    const p = this.w.player; if (this.active || !p.active || G.paused) return;
    for (const a of G.w.arenas ?? []) {
      if (this.done(a)) continue;
      const [x0, y0, x1, y1] = a.rect;
      if (p.x > x0 + 20 && p.x < x1 - 20 && p.y > y0 + 20 && p.y < y1 - 20) return this.start(a);
    }
  }
  start(a: any) {
    const w = this.w, [x0, y0, x1, y1] = a.rect, posts: Phaser.GameObjects.Image[] = [], body = w.physics.add.staticGroup();
    const put = (x: number, y: number, i: number) => { const o = w.add.image(x, y, 'fx-post').setOrigin(0.5, 1).setDepth(y).setScale(1, 0); posts.push(o);
      w.tweens.add({ targets: o, scaleY: 1, duration: 220, delay: i * 12, ease: 'Back.out' }); };
    let i = 0;
    for (let x = x0; x <= x1; x += 12) { put(x, y0 + 4, i++); put(x, y1 + 4, i++); }
    for (let y = y0 + 12; y < y1; y += 12) { put(x0, y + 4, i++); put(x1, y + 4, i++); }
    const z = (x: number, y: number, ww: number, hh: number) => { const r = w.add.zone(x + ww / 2, y + hh / 2, ww, hh); body.add(r); };
    z(x0 - 4, y0 - 4, x1 - x0 + 8, 6); z(x0 - 4, y1 - 2, x1 - x0 + 8, 6); z(x0 - 4, y0, 6, y1 - y0); z(x1 - 2, y0, 6, y1 - y0);
    const colls = [w.physics.add.collider(w.player, body)];
    this.active = { a, wave: -1, alive: new Set(), posts, body, colls };
    w.cameras.main.shake(160, 0.004); banner(a.name, 'Clear every wave!');
    w.lastSafe = [w.player.x, w.player.y];
    this.next();
  }
  next() {
    const s = this.active!, a = s.a; s.wave++;
    if (s.wave >= a.waves.length) return this.finish();
    const [x0, y0, x1, y1] = a.rect, p = this.w.player;
    let k = 0;
    for (const [t, n] of a.waves[s.wave]) for (let j = 0; j < n; j++) {
      let x = 0, y = 0;
      for (let tries = 0; tries < 20; tries++) { x = x0 + 16 + Math.random() * (x1 - x0 - 32); y = y0 + 16 + Math.random() * (y1 - y0 - 32); if (Phaser.Math.Distance.Between(x, y, p.x, p.y) > 48) break; }
      const e = { id: `${a.id}_w${s.wave}_${k++}`, type: 'enemy', etype: t, stats: { ...a.stats[t], sight: 260 }, x, y, zone: a.zone, minion: false };
      this.w.time.delayedCall(k * 160, () => { if (!this.active) return; burst(this.w, x, y, 0xffd27a, 8, 40); const en = this.w.ents.enemy(e) as Enemy; s.alive.add(en);
        s.colls.push(this.w.physics.add.collider(en, s.body)); this.label(); });
    }
    toast(`Wave ${s.wave + 1} of ${a.waves.length}`);
  }
  label() { const s = this.active; if (s) setObjective(`${s.a.name}: wave ${s.wave + 1}/${s.a.waves.length}, ${[...s.alive].filter((e) => e.active && e.sm.current !== 'dead').length} left`); }
  onDeath(en: Enemy) {
    const s = this.active; if (!s || !s.alive.has(en)) return;
    s.alive.delete(en); this.label();
    if (![...s.alive].some((e) => e.active && e.sm.current !== 'dead')) this.w.time.delayedCall(900, () => this.active === s && this.next());
  }
  open() { const s = this.active!; s.colls.forEach((c) => c.destroy()); s.body.destroy(true);
    s.posts.forEach((o, i) => this.w.tweens.add({ targets: o, scaleY: 0, alpha: 0, duration: 260, delay: i * 6, onComplete: () => o.destroy() })); this.active = null; setObjective(null); }
  finish() {
    const a = this.active!.a; this.open();
    G.st.flags.push('arena:' + a.id); G.st.hp = G.st.maxhp; this.w.player.life.life = G.st.maxhp; persist();
    this.w.cameras.main.flash(200, 255, 230, 140);
    const lines = apply(a.reward ?? []); say([`${a.name} cleared.`, ...lines]); changed(); this.marks.clear(); for (const b of G.w.arenas) this.drawMark(b);
  }
  /** player fainted mid-arena: reset it (enemies gone, posts down) */
  reset() { const s = this.active; if (!s) return; for (const e of s.alive) if (e.active) e.destroy(); this.w.enemies = this.w.enemies.filter((e) => e.active); this.open(); }
}

/** checkpoints: enterable caravan doors and benches. The latest one touched is where you wake up. */
export class Checkpoints {
  pts: [number, number][] = []; cur = -1; flag: Phaser.GameObjects.Image;
  constructor(public w: W, benches: [number, number][]) {
    for (const d of G.w.doors) if (d.room) this.pts.push([d.out[0], d.out[1]]);
    for (const b of benches) this.pts.push([b[0], b[1] + 12]);
    this.flag = w.add.image(0, 0, 'fx-glint').setDepth(9e4).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    w.tweens.add({ targets: this.flag, scale: 1.6, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    if (G.st.cp) this.cur = this.pts.findIndex((p) => p[0] === G.st.cp![0] && p[1] === G.st.cp![1]);
  }
  t = 0;
  update(dt: number) {
    if ((this.t += dt) < 250) return; this.t = 0;
    const p = this.w.player;
    for (let i = 0; i < this.pts.length; i++) if (i !== this.cur && Phaser.Math.Distance.Between(p.x, p.y, this.pts[i][0], this.pts[i][1]) < 18) this.set(i, true);
  }
  set(i: number, show: boolean) {
    this.cur = i; G.st.cp = [this.pts[i][0], this.pts[i][1]]; persist();
    if (show) { toast('✔ Checkpoint'); burst(this.w, this.pts[i][0], this.pts[i][1], 0x9fffb0, 8, 30); }
    this.flag.setPosition(this.pts[i][0], this.pts[i][1] - 8).setVisible(true);
  }
  setAt(x: number, y: number) { const i = this.pts.findIndex((p) => Math.abs(p[0] - x) < 2 && Math.abs(p[1] - y) < 2); if (i >= 0) this.set(i, false); else G.st.cp = [x, y]; }
  respawn(): [number, number] { return G.st.cp ?? this.w.lastSafe; }
}

/** enterable caravans breathe: warm door glow + chimney smoke near the camera; plain caravans stay static */
export class LivingDoors {
  glows: { d: any; g: Phaser.GameObjects.Ellipse }[] = []; t = 0;
  constructor(public w: Phaser.Scene) {
    for (const d of G.w.doors) {
      if (!d.room) continue;
      const g = w.add.ellipse(d.x, d.y + 2, 22, 10, 0xffc860, 0.0).setDepth(d.y - 2).setBlendMode(Phaser.BlendModes.ADD); // warm light spilling onto the step
      w.tweens.add({ targets: g, fillAlpha: { from: 0.25, to: 0.6 }, scaleX: { from: 0.9, to: 1.15 }, duration: 800 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.glows.push({ d, g });
    }
    this.refresh();
  }
  refresh() { for (const { d, g } of this.glows) { const cleared = G.st.flags.includes('clear:' + d.room), open = cond(d.req);
    g.setFillStyle(!open ? 0x8090a0 : cleared ? 0xa0ffb0 : 0xffc860, g.fillAlpha); g.setVisible(true); } }
  update(dt: number) {
    if ((this.t += dt) < 380) return; this.t = 0;
    const v = this.w.cameras.main.worldView;
    for (const { d, g } of this.glows) {
      const on = d.x > v.x - 40 && d.x < v.right + 40 && d.y > v.y - 60 && d.y < v.bottom + 60; g.setVisible(on);
      if (!on || Math.random() < 0.35) continue;
      const s = this.w.add.image(d.x + 16 + Math.random() * 3, d.y - 40, 'fx-smoke').setDepth(5e5 + 1).setAlpha(0.55).setScale(0.5);
      this.w.tweens.add({ targets: s, y: s.y - 18, x: s.x + 5, alpha: 0, scale: 1.3, duration: 1800, onComplete: () => s.destroy() });
    }
  }
}
