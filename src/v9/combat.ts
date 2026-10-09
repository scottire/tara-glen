// v9 action combat: 3-hit combo, hold-to-charge spin, dodge-roll, input buffer, auto-aim (wide cone), hit-stop/flash/knockback/
// particles/shake, enemy attack tokens (only a few threats commit at once) and a visible enemy projectile.
import Phaser from 'phaser';
import { G, DIRV, type Dir, type Player, type Character } from '../mech/core';

const COMBO = [{ dmg: 1, push: 110, reach: 22, arc: 1.25 }, { dmg: 1, push: 120, reach: 22, arc: 1.25 }, { dmg: 2, push: 210, reach: 25, arc: 1.5 }];
const SWING_MS = 190, CHAIN_MS = 420, BUFFER_MS = 220, CHARGE_START = 260, CHARGE_FULL = 700, AIM_CONE = 1.25, AIM_RANGE = 56;
const MAX_ATTACKERS = 2, MAX_ENGAGED = 3;
export interface Foe extends Character { attacking: boolean; windup: boolean; armor?: number; s: any; hitBy(c: Combat, dmg: number, push: number, heavy: boolean, from: { x: number; y: number }): void }

export function ensureFxTextures(scene: Phaser.Scene) {
  const T = scene.textures; if (T.exists('fx-dot')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff).fillCircle(2, 2, 2).generateTexture('fx-dot', 4, 4).clear();
  g.fillStyle(0xff7a2a).fillCircle(4, 4, 4).fillStyle(0xffe08a).fillCircle(3, 3, 2).generateTexture('fx-orb', 8, 8).clear();
  // 4-point glint
  g.fillStyle(0xffffff).fillRect(3, 0, 1, 7).fillRect(0, 3, 7, 1).fillStyle(0xfff3b0).fillRect(2, 2, 3, 3).generateTexture('fx-glint', 7, 7).clear();
  // "!" badge and speech bubble
  g.fillStyle(0x2a1e18).fillRoundedRect(0, 0, 9, 11, 3).fillStyle(0xffd23f).fillRoundedRect(1, 1, 7, 9, 2).fillStyle(0x2a1e18).fillRect(4, 2, 1, 4).fillRect(4, 7, 1, 1).generateTexture('fx-excl', 9, 11).clear();
  g.fillStyle(0x2a1e18).fillRoundedRect(0, 0, 13, 9, 3).fillTriangle(3, 8, 7, 8, 3, 11).fillStyle(0xffffff).fillRoundedRect(1, 1, 11, 7, 2).fillTriangle(4, 7, 6, 7, 4, 9)
    .fillStyle(0x2a1e18).fillRect(3, 4, 1, 1).fillRect(6, 4, 1, 1).fillRect(9, 4, 1, 1).generateTexture('fx-bubble', 13, 12).clear();
  g.fillStyle(0x2a1e18).fillRoundedRect(0, 0, 13, 9, 3).fillTriangle(3, 8, 7, 8, 3, 11).fillStyle(0xffd23f).fillRoundedRect(1, 1, 11, 7, 2).fillTriangle(4, 7, 6, 7, 4, 9)
    .fillStyle(0x2a1e18).fillRect(6, 2, 1, 3).fillRect(6, 6, 1, 1).generateTexture('fx-bubble2', 13, 12).clear();
  g.fillStyle(0xbfc4c8).fillCircle(4, 4, 4).fillStyle(0xe8eaec).fillCircle(3, 3, 2).generateTexture('fx-smoke', 8, 8).clear();
  g.fillStyle(0x6a4a2a).fillRect(1, 0, 4, 14).fillStyle(0xc9a06a).fillRect(2, 0, 2, 13).fillStyle(0xd84a3a).fillRect(1, 2, 4, 2).generateTexture('fx-post', 6, 14).clear();
  g.destroy();
}

export function flash(o: Phaser.GameObjects.Sprite, color = 0xffffff, ms = 70) {
  o.setTint(color).setTintMode(Phaser.TintModes.FILL);
  o.scene.time.delayedCall(ms, () => o.active && o.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
}
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, n = 6, speed = 40) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = speed * (0.5 + Math.random() * 0.6), p = scene.add.image(x, y, 'fx-dot').setTint(color).setDepth(9e4).setScale(0.6 + Math.random() * 0.6);
    scene.tweens.add({ targets: p, x: x + Math.cos(a) * d * 0.3, y: y + Math.sin(a) * d * 0.3, alpha: 0, scale: 0.2, duration: 260 + Math.random() * 120, onComplete: () => p.destroy() });
  }
}
export function popup(scene: Phaser.Scene, x: number, y: number, text: string, color = '#fff') {
  const t = scene.add.text(x, y - 10, text, { fontFamily: 'monospace', fontSize: '28px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setScale(0.25).setDepth(9.5e5);
  scene.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 520, ease: 'Cubic.out', onComplete: () => t.destroy() });
}
let stopUntil = 0;
export function hitStop(scene: Phaser.Scene, ms: number) {
  const now = performance.now(); if (now < stopUntil) return; stopUntil = now + ms;
  scene.physics.world.pause(); scene.anims.pauseAll();
  setTimeout(() => { if (!scene.sys?.isActive()) return; scene.physics.world.resume(); scene.anims.resumeAll(); }, ms);
}
/** enemy projectile: a visible glowing orb, dodgeable, stopped by walls */
export function spit(scene: Phaser.Scene & { player: Player; walls: any[] }, from: { x: number; y: number }, angle: number, speed = 95, dmg = 1) {
  ensureFxTextures(scene);
  const b = scene.physics.add.image(from.x + Math.cos(angle) * 8, from.y + Math.sin(angle) * 8, 'fx-orb').setDepth(9e4);
  (b.body as Phaser.Physics.Arcade.Body).setCircle(3, 1, 1); b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  const trail = scene.time.addEvent({ delay: 60, loop: true, callback: () => { if (!b.active) return; const t = scene.add.image(b.x, b.y, 'fx-dot').setTint(0xffa040).setDepth(9e4 - 1).setAlpha(0.7);
    scene.tweens.add({ targets: t, alpha: 0, scale: 0.3, duration: 220, onComplete: () => t.destroy() }); } });
  const kill = () => { if (!b.active) return; trail.remove(); burst(scene, b.x, b.y, 0xffa040, 4, 20); b.destroy(); };
  scene.physics.add.collider(b, scene.walls.filter(Boolean), kill);
  scene.physics.add.overlap(b, scene.player, () => { if (scene.player.dashing) return; scene.player.hurt(b, dmg, G.w.player.knockback); kill(); });
  scene.time.delayedCall(2600, kill);
  return b;
}

type HostLike = Phaser.Scene & { player: Player; enemies: Foe[]; walls: any[]; interact(): void; ents?: any };
export class Combat {
  step = 0; chainUntil = 0; swingUntil = 0; buffered = 0; holdAt = 0; holding = false; charged = false; ring: Phaser.GameObjects.Graphics;
  slash: Phaser.GameObjects.Graphics; dodgeReady = 0; attackers = new Set<Foe>(); engaged = new Set<Foe>(); stats = { swings: 0, hits: 0, spins: 0, dodges: 0 };
  constructor(public h: HostLike) {
    ensureFxTextures(h);
    this.ring = h.add.graphics().setDepth(9e4); this.slash = h.add.graphics().setDepth(9e4 + 1);
    const fn = (_: number, dt: number) => this.update(dt); h.events.on('update', fn); h.events.once('shutdown', () => h.events.off('update', fn));
    (h as any).combat = this;
  }
  get p() { return this.h.player; }
  /** a live enemy nearby means the button is an attack, otherwise it talks/opens */
  threatNear(r = 64) { return this.h.enemies.some((e) => e.active && e.sm.current !== 'dead' && Phaser.Math.Distance.Between(e.x, e.y, this.p.x, this.p.y) < r); }
  canTalk() { return !!this.h.ents?.near && !this.threatNear(48); }
  press() {
    if (G.paused || this.p.busy) return;
    if (this.canTalk()) { this.h.interact(); return; }
    this.holding = true; this.holdAt = this.h.time.now; this.charged = false; this.attack();
  }
  release() {
    if (!this.holding) return; this.holding = false; this.ring.clear(); document.getElementById('atk')?.classList.remove('charged', 'held');
    if (this.charged) this.spin(); this.charged = false;
  }
  attack() {
    const now = this.h.time.now;
    if (now < this.swingUntil) { this.buffered = now + BUFFER_MS; return; } // buffer: queue the next hit
    if (now > this.chainUntil) this.step = 0;
    const c = COMBO[this.step], a = this.aim();
    this.swing(a, c.reach, c.arc, c.dmg, c.push, this.step === 2);
    this.swingUntil = now + SWING_MS; this.chainUntil = now + SWING_MS + CHAIN_MS; this.step = (this.step + 1) % COMBO.length; this.stats.swings++;
  }
  /** auto-aim: nearest enemy inside a wide cone around the stick/facing direction snaps the swing */
  aim() {
    const v = this.p.readInput(), base = v.length() > 0.3 ? Math.atan2(v.y, v.x) : Math.atan2(DIRV[this.p.facing][1], DIRV[this.p.facing][0]);
    let best = base, bd = AIM_RANGE;
    for (const e of this.h.enemies) {
      if (!e.active || e.sm.current === 'dead') continue;
      const d = Phaser.Math.Distance.Between(this.p.x, this.p.y, e.x, e.y), a = Phaser.Math.Angle.Between(this.p.x, this.p.y, e.x, e.y);
      if (d < bd && Math.abs(Phaser.Math.Angle.Wrap(a - base)) < AIM_CONE) { bd = d; best = a; }
    }
    const f: Dir = Math.abs(Math.cos(best)) > Math.abs(Math.sin(best)) ? (Math.cos(best) > 0 ? 'right' : 'left') : (Math.sin(best) > 0 ? 'down' : 'up');
    this.p.facing = f; this.p.anims.stop(); this.p.setFrame(['down', 'up', 'left', 'right'].indexOf(f));
    return best;
  }
  swing(a: number, reach: number, arc: number, dmg: number, push: number, heavy: boolean) {
    const p = this.p, g = this.slash; p.setVelocity(Math.cos(a) * 60, Math.sin(a) * 60); // small lunge
    g.clear().setAlpha(1).setPosition(p.x, p.y);
    g.lineStyle(heavy ? 4 : 3, 0xffffff, 0.95).beginPath().arc(0, 0, reach - 6, a - arc / 2, a + arc / 2).strokePath();
    g.lineStyle(2, 0xffe9a8, 0.8).beginPath().arc(0, 0, reach - 2, a - arc / 2 + 0.15, a + arc / 2 - 0.15).strokePath();
    this.h.tweens.killTweensOf(g); this.h.tweens.add({ targets: g, alpha: 0, duration: 160 });
    this.hitArc(a, reach, arc, dmg, push, heavy);
  }
  spin() {
    const p = this.p, g = this.slash; this.stats.spins++;
    g.clear().setAlpha(1).setPosition(p.x, p.y).lineStyle(4, 0xffe066, 1).strokeCircle(0, 0, 26).lineStyle(2, 0xffffff, 0.9).strokeCircle(0, 0, 20);
    this.h.tweens.killTweensOf(g); g.setScale(0.6); this.h.tweens.add({ targets: g, scale: 1.15, alpha: 0, duration: 260 });
    this.hitArc(0, 32, Math.PI * 2.01, 3, 260, true);
    this.h.cameras.main.shake(90, 0.004); this.swingUntil = this.h.time.now + 260; this.step = 0;
  }
  hitArc(a: number, reach: number, arc: number, dmg: number, push: number, heavy: boolean) {
    let hit = 0;
    for (const e of [...this.h.enemies]) {
      if (!e.active || e.sm.current === 'dead') continue;
      const d = Phaser.Math.Distance.Between(this.p.x, this.p.y, e.x, e.y), ea = Phaser.Math.Angle.Between(this.p.x, this.p.y, e.x, e.y);
      const r = reach + (e.displayWidth / 2 - 4);
      if (d < r && (arc > 6 || Math.abs(Phaser.Math.Angle.Wrap(ea - a)) < arc / 2 + 0.3)) { e.hitBy(this, dmg, push, heavy, this.p); hit++; }
    }
    if (hit) { this.stats.hits += hit; hitStop(this.h, heavy ? 85 : 55); this.h.cameras.main.shake(heavy ? 90 : 50, heavy ? 0.005 : 0.0025); }
  }
  dodge() {
    const now = this.h.time.now, p = this.p;
    if (G.paused || p.busy || p.dashing || now < this.dodgeReady) return false;
    this.release(); this.step = 0;
    const v = p.readInput(), a = v.length() > 0.3 ? Math.atan2(v.y, v.x) : Math.atan2(DIRV[p.facing][1], DIRV[p.facing][0]);
    if (!p.dodge(a)) return false;
    this.dodgeReady = now + G.w.player.dashCooldownMs; this.stats.dodges++;
    const b = document.getElementById('dash'); b?.classList.add('cool'); this.h.time.delayedCall(G.w.player.dashCooldownMs, () => b?.classList.remove('cool'));
    return true;
  }
  /** attack tokens: only MAX_ATTACKERS may wind up at once; only MAX_ENGAGED close in, the rest hang back */
  engage(e: Foe) { if (this.engaged.has(e)) return true; this.prune(); if (this.engaged.size >= MAX_ENGAGED && !e.s.boss) return false; this.engaged.add(e); return true; }
  token(e: Foe) { this.prune(); if (this.attackers.size >= MAX_ATTACKERS && !e.s.boss) return false; this.attackers.add(e); return true; }
  done(e: Foe) { this.attackers.delete(e); }
  disengage(e: Foe) { this.engaged.delete(e); this.attackers.delete(e); }
  prune() { for (const s of [this.engaged, this.attackers]) for (const e of s) if (!e.active || e.sm.current === 'dead') s.delete(e); }
  update(dt: number) {
    const now = this.h.time.now, p = this.p; if (!p?.active) return;
    if (this.buffered && now >= this.swingUntil) { if (now <= this.buffered && !G.paused && !p.busy) this.attack(); this.buffered = 0; }
    if (now < this.swingUntil) p.slow = 0.25; else p.slow = this.holding ? 0.55 : 1;
    if (this.holding && now - this.holdAt > CHARGE_START && !G.paused) {
      const k = Math.min(1, (now - this.holdAt - CHARGE_START) / (CHARGE_FULL - CHARGE_START)), g = this.ring.clear();
      g.lineStyle(2, 0x000000, 0.35).strokeCircle(p.x, p.y + 2, 13);
      g.lineStyle(2, k >= 1 ? 0xffe066 : 0xffffff, k >= 1 ? 0.6 + 0.4 * Math.sin(now / 50) : 0.9).beginPath().arc(p.x, p.y + 2, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).strokePath();
      document.getElementById('atk')?.classList.add('held');
      if (k >= 1 && !this.charged) { this.charged = true; document.getElementById('atk')?.classList.add('charged'); burst(this.h, p.x, p.y, 0xffe066, 5, 24); }
    }
    void dt;
  }
}
