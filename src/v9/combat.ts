// v9 action combat: 3-hit combo, hold-to-charge spin, dodge-roll, input buffer, auto-aim (wide cone), hit-stop/flash/knockback/
// particles/shake, enemy attack tokens (only a few threats commit at once) and a visible enemy projectile.
import Phaser from 'phaser';
import { F, sfx, squash } from '../v12/feel';
import { G, DIRV, toast, type Dir, type Player, type Character } from '../mech/core';

const COMBO = [{ dmg: 1, push: 110, reach: 22, arc: 1.25 }, { dmg: 1, push: 120, reach: 22, arc: 1.25 }, { dmg: 2, push: 210, reach: 25, arc: 1.5 }, { dmg: 3, push: 260, reach: 27, arc: 1.7 }];
const has = (k: string) => (G.st.items[k] ?? 0) > 0;
const CHARGE_START = 260, CHARGE_FULL = 700, AIM_CONE = 1.25, AIM_RANGE = 56;
const MAX_ATTACKERS = 2, MAX_ENGAGED = 3;
export interface Foe extends Character { attacking: boolean; windup: boolean; armor?: number; s: any; hitBy(c: Combat | null, dmg: number, push: number, heavy: boolean, from: { x: number; y: number }): void; stun?(ms: number): void }

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
let stopUntil = 0, stopped: Phaser.Scene | null = null;
/** v10: hit-stop always restores, even if the scene sleeps/stops mid-pause or the timer is lost (watchdog in Combat.update) */
export function endHitStop() {
  const s = stopped; stopped = null; stopUntil = 0; if (!s) return;
  try { s.physics?.world?.resume(); } catch { /* scene gone */ }
  try { s.anims?.resumeAll(); } catch { /* */ }
}
export function hitStop(scene: Phaser.Scene, ms: number) {
  const now = performance.now(); if (now < stopUntil) return;
  if (stopped && stopped !== scene) endHitStop();
  stopUntil = now + ms; stopped = scene;
  scene.physics.world.pause(); scene.anims.pauseAll();
  setTimeout(endHitStop, ms);
}
export const hitStopStuck = () => !!stopped && performance.now() > stopUntil + 100;
/** enemy projectile: a visible glowing orb, dodgeable, stopped by walls; with Putt Parry it can be sent back (then it stuns) */
type Shot = Phaser.Physics.Arcade.Image & { reflected?: boolean; dmg: number; kill(): void };
export function spit(scene: Phaser.Scene & { player: Player; walls: any[]; enemies?: Foe[] }, from: { x: number; y: number }, angle: number, speed = 95, dmg = 1) {
  ensureFxTextures(scene);
  const b = scene.physics.add.image(from.x + Math.cos(angle) * 8, from.y + Math.sin(angle) * 8, 'fx-orb').setDepth(9e4) as Shot; b.dmg = dmg;
  (b.body as Phaser.Physics.Arcade.Body).setCircle(3, 1, 1); b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  const trail = scene.time.addEvent({ delay: 60, loop: true, callback: () => { if (!b.active) return; const t = scene.add.image(b.x, b.y, 'fx-dot').setTint(b.reflected ? 0xfff09a : 0xffa040).setDepth(9e4 - 1).setAlpha(0.7);
    scene.tweens.add({ targets: t, alpha: 0, scale: 0.3, duration: 220, onComplete: () => t.destroy() }); } });
  b.kill = () => { if (!b.active) return; trail.remove(); burst(scene, b.x, b.y, 0xffa040, 4, 20); b.destroy(); };
  scene.physics.add.collider(b, scene.walls.filter(Boolean), () => b.kill());
  scene.physics.add.overlap(b, scene.player, () => { if (b.reflected || scene.player.dashing) return; scene.player.hurt(b, dmg, G.w.player.knockback); b.kill(); });
  const shots: Shot[] = ((scene as any).shots ??= []); shots.push(b); b.once('destroy', () => shots.splice(shots.indexOf(b), 1));
  scene.time.delayedCall(2600, () => b.kill());
  return b;
}

type HostLike = Phaser.Scene & { player: Player; enemies: Foe[]; walls: any[]; interact(): void; ents?: any; driveHit?(x: number, y: number, r: number): void; shots?: Shot[] };
export class Combat {
  step = 0; chainUntil = 0; swingUntil = 0; buffered = 0; holdAt = 0; holding = false; charged = false; ring: Phaser.GameObjects.Graphics;
  dodgeReady = 0; chipReady = 0; dodgeEnd = 0; attackers = new Set<Foe>(); engaged = new Set<Foe>();
  stats = { swings: 0, hits: 0, spins: 0, dodges: 0, dashStrikes: 0, parries: 0, chips: 0 };
  constructor(public h: HostLike) {
    ensureFxTextures(h);
    this.ring = h.add.graphics().setDepth(9e4);
    const fn = (_: number, dt: number) => this.update(dt); h.events.on('update', fn);
    h.events.once('shutdown', () => { h.events.off('update', fn); endHitStop(); }); h.events.on('sleep', endHitStop);
    (h as any).combat = this;
  }
  get p() { return this.h.player; }
  /** a live enemy nearby means the button is an attack, otherwise it talks/opens */
  threatNear(r = 64) { return this.h.enemies.some((e) => e.active && e.sm.current !== 'dead' && Phaser.Math.Distance.Between(e.x, e.y, this.p.x, this.p.y) < r); }
  canTalk() { return !!this.h.ents?.near && !this.threatNear(48); }
  press() {
    if (G.paused || this.p.busy) return;
    if (this.parry()) return;
    if (this.p.dashing && has('dashstrike')) { this.dashStrike(); return; }
    if (this.h.time.now - this.dodgeEnd < 140 && has('dashstrike')) { this.dashStrike(); return; } // a little grace after the roll
    if (this.canTalk()) { this.p.pose('interact', 300); this.h.interact(); return; }
    this.holding = true; this.holdAt = this.h.time.now; this.charged = false; this.attack();
  }
  release() {
    if (!this.holding) return; this.holding = false; this.ring.clear(); document.getElementById('atk')?.classList.remove('charged', 'held');
    if (this.charged) this.spin(); this.charged = false;
  }
  attack() {
    const now = this.h.time.now;
    if (now < this.swingUntil) { this.buffered = now + F.bufferMs; return; } // buffer: queue the next hit
    const n = has('combo4') ? 4 : 3;
    if (now > this.chainUntil || this.step >= n) this.step = 0;
    const c = COMBO[this.step], a = this.aim();
    this.swing(a, c.reach, c.arc, c.dmg, c.push, this.step >= 2, Math.min(3, this.step + 1));
    this.swingUntil = now + F.swingMs; this.chainUntil = now + F.swingMs + F.chainMs; this.step = (this.step + 1) % n; this.stats.swings++;
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
    this.p.facing = dirOf(best);
    return best;
  }
  /** swoosh sprite (scripts/gen/player.py fx.png) rotated to the swing angle, snapped to 45 degrees like the pixel art */
  swoosh(a: number, heavy: boolean, frames = [0, 1, 2]) {
    const p = this.p, snap = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
    const o = this.h.add.sprite(p.x, p.y + 1, 'herofx', frames[0]).setRotation(snap).setDepth(p.depth + 1).setScale(heavy ? 1.15 : 1);
    frames.forEach((f, i) => this.h.time.delayedCall(i * 55, () => o.active && o.setFrame(f)));
    this.h.tweens.add({ targets: o, alpha: 0, delay: 110, duration: 90, onComplete: () => o.destroy() });
  }
  swing(a: number, reach: number, arc: number, dmg: number, push: number, heavy: boolean, anim: number) {
    const p = this.p; p.setVelocity(Math.cos(a) * F.lungeSpeed, Math.sin(a) * F.lungeSpeed); sfx('swing'); squash(p, 1.15, 0.88); // small lunge
    p.pose('swing' + anim, F.swingMs + 40); this.swoosh(a, heavy);
    this.hitArc(a, reach, arc, dmg, push, heavy);
  }
  spin() {
    const p = this.p; this.stats.spins++; p.pose('spin', 280);
    const o = this.h.add.sprite(p.x, p.y + 1, 'herofx', 3).setDepth(p.depth + 1).setScale(0.7);
    this.h.time.delayedCall(90, () => o.active && o.setFrame(4));
    this.h.tweens.add({ targets: o, scale: 1.2, angle: 200, alpha: 0, duration: 300, onComplete: () => o.destroy() });
    this.hitArc(0, 32, Math.PI * 2.01, 3, 260, true);
    this.h.driveHit?.(p.x, p.y, 30);
    this.h.cameras.main.shake(90, 0.004); this.swingUntil = this.h.time.now + 260; this.step = 0;
  }
  /** Dash Strike: attack mid-roll = lunge along the roll, i-frames kept, hits everything on the way, slips through low gaps */
  dashStrike() {
    const p = this.p, v = p.body.velocity, a = v.length() > 10 ? Math.atan2(v.y, v.x) : Math.atan2(DIRV[p.facing][1], DIRV[p.facing][0]);
    this.stats.dashStrikes++; p.dashing = true; p.facing = dirOf(a); p.pose('swing2', 240);
    p.setVelocity(Math.cos(a) * 280, Math.sin(a) * 280); this.swoosh(a, true, [1, 1, 2]);
    const hit = new Set<Foe>();
    const ev = this.h.time.addEvent({ delay: 30, repeat: 6, callback: () => {
      for (const e of this.h.enemies) if (e.active && e.sm.current !== 'dead' && !hit.has(e) && Phaser.Math.Distance.Between(p.x, p.y, e.x, e.y) < 18 + e.displayWidth / 4) {
        hit.add(e); e.hitBy(this, 2, 200, true, p); this.stats.hits++; hitStop(this.h, 50); }
    } });
    this.h.time.delayedCall(220, () => { ev.remove(); p.dashing = false; if (p.active && !p.busy) p.setVelocity(0, 0); });
    this.swingUntil = this.h.time.now + 220;
  }
  /** Putt Parry: tap Attack as an enemy shot arrives -> it flies back at the nearest enemy and stuns what it hits */
  parry() {
    if (!has('parry')) return false;
    const p = this.p, shot = (this.h.shots ?? []).find((b) => b.active && !b.reflected && Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y) < 26);
    if (!shot) return false;
    const tgt = this.h.enemies.filter((e) => e.active && e.sm.current !== 'dead').sort((x, y) => Phaser.Math.Distance.Between(x.x, x.y, p.x, p.y) - Phaser.Math.Distance.Between(y.x, y.y, p.x, p.y))[0];
    const a = tgt ? Phaser.Math.Angle.Between(shot.x, shot.y, tgt.x, tgt.y) : Math.atan2(-shot.body!.velocity.y, -shot.body!.velocity.x);
    shot.reflected = true; shot.setTint(0xfff09a).setVelocity(Math.cos(a) * 190, Math.sin(a) * 190);
    this.h.physics.add.overlap(shot, this.h.enemies.filter((e) => e.active), (_s, e) => { const f = e as Foe; if (!shot.active || f.sm.current === 'dead') return;
      f.stun?.(1800); f.hitBy(null, 2, 160, true, Object.assign({ x: shot.x, y: shot.y }, { reflected: true })); shot.kill(); });
    p.facing = dirOf(a); p.pose('swing1', 200); this.swoosh(a, false); this.stats.parries++;
    burst(this.h, shot.x, shot.y, 0xfff09a, 8, 40); popup(this.h, p.x, p.y - 8, 'PARRY', '#fff09a'); hitStop(this.h, 70);
    return true;
  }
  /** Chip Shot (secondary button): a golf ball along the aim; knocks down things that need a chip (interacts with req chip) */
  chip() {
    if (!has('chip') || G.paused || this.p.busy) return false;
    const now = this.h.time.now; if (now < this.chipReady) return true; this.chipReady = now + 380; this.stats.chips++;
    const p = this.p, a = this.aim(); p.pose('swing1', 220); this.swoosh(a, false, [0, 2, 2]);
    const b = this.h.physics.add.sprite(p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8, 'herofx', 7).setDepth(9e4);
    (b.body as Phaser.Physics.Arcade.Body).setCircle(3, 13, 13); b.setVelocity(Math.cos(a) * 210, Math.sin(a) * 210);
    this.h.tweens.add({ targets: b, scale: { from: 1, to: 1.4 }, yoyo: true, duration: 180 }); // a little loft
    const done = () => { if (!b.active) return; burst(this.h, b.x, b.y, 0xf8f4e4, 4, 20); b.destroy(); };
    this.h.physics.add.collider(b, this.h.walls.filter(Boolean), done);
    this.h.physics.add.overlap(b, this.h.enemies.filter((e) => e.active), (_b, e) => { const f = e as Foe; if (f.sm.current === 'dead') return; f.hitBy(this, 1, 140, false, b); done(); });
    const tick = this.h.time.addEvent({ delay: 40, loop: true, callback: () => {
      if (!b.active) return tick.remove();
      const t = this.h.ents?.things.find((t: any) => t.kind === 'interact' && t.obj.active && (t.e.req ?? []).includes('chip') && Phaser.Math.Distance.Between(t.obj.x, t.obj.y, b.x, b.y) < 16);
      if (t) { done(); this.h.ents.use(t); }
    } });
    this.h.time.delayedCall(900, () => { done(); tick.remove(); });
    return true;
  }
  hitArc(a: number, reach: number, arc: number, dmg: number, push: number, heavy: boolean) {
    let hit = 0;
    for (const e of [...this.h.enemies]) {
      if (!e.active || e.sm.current === 'dead') continue;
      const d = Phaser.Math.Distance.Between(this.p.x, this.p.y, e.x, e.y), ea = Phaser.Math.Angle.Between(this.p.x, this.p.y, e.x, e.y);
      const r = reach + (e.displayWidth / 2 - 4);
      if (d < r && (arc > 6 || Math.abs(Phaser.Math.Angle.Wrap(ea - a)) < arc / 2 + 0.3)) { e.hitBy(this, dmg, push, heavy, this.p); hit++; }
    }
    if (hit) { this.stats.hits += hit; hitStop(this.h, heavy ? F.hitstopHeavyMs : F.hitstopMs); this.h.cameras.main.shake(heavy ? 90 : 50, heavy ? F.shakeHeavy : F.shake);
      const k = heavy ? 0.6 : 0.35; this.p.setVelocity(-Math.cos(a) * F.lungeSpeed * k, -Math.sin(a) * F.lungeSpeed * k); } // recoil on our side too
  }
  dodge() {
    const now = this.h.time.now, p = this.p;
    if (G.paused || p.busy || p.dashing || now < this.dodgeReady) return false;
    this.release(); this.step = 0;
    const v = p.readInput(), a = v.length() > 0.3 ? Math.atan2(v.y, v.x) : Math.atan2(DIRV[p.facing][1], DIRV[p.facing][0]);
    if (!p.dodge(a)) return false;
    const ms = has('skateboard') ? G.w.player.dashMs : F.dodgeMs; this.dodgeEnd = now + ms;
    this.dodgeReady = now + F.dodgeCooldownMs; this.stats.dodges++;
    const b = document.getElementById('dash'); b?.classList.add('cool'); this.h.time.delayedCall(F.dodgeCooldownMs, () => b?.classList.remove('cool'));
    return true;
  }
  /** attack tokens: only MAX_ATTACKERS may wind up at once; only MAX_ENGAGED close in, the rest hang back */
  engage(e: Foe) { if (this.engaged.has(e)) return true; this.prune(); if (this.engaged.size >= MAX_ENGAGED && !e.s.boss) return false; this.engaged.add(e); return true; }
  token(e: Foe) { this.prune(); if (this.attackers.size >= MAX_ATTACKERS && !e.s.boss) return false; this.attackers.add(e); return true; }
  done(e: Foe) { this.attackers.delete(e); }
  disengage(e: Foe) { this.engaged.delete(e); this.attackers.delete(e); }
  prune() { for (const s of [this.engaged, this.attackers]) for (const e of s) if (!e.active || e.sm.current === 'dead') s.delete(e); }
  update(dt: number) {
    if (hitStopStuck()) endHitStop();
    const now = this.h.time.now, p = this.p; if (!p?.active) return;
    if (this.buffered && now >= this.swingUntil) { if (now <= this.buffered && !G.paused && !p.busy) this.attack(); this.buffered = 0; }
    if (now < this.swingUntil) p.slow = F.swingSlow; else p.slow = this.holding ? 0.55 : 1;
    if (this.holding && has('drive') && now - this.holdAt > CHARGE_START && now >= this.swingUntil && !G.paused) {
      const k = Math.min(1, (now - this.holdAt - CHARGE_START) / (CHARGE_FULL - CHARGE_START)), g = this.ring.clear();
      p.pose('charge', 120);
      g.lineStyle(2, 0x000000, 0.35).strokeCircle(p.x, p.y + 4, 13);
      g.lineStyle(2, k >= 1 ? 0xffe066 : 0xffffff, k >= 1 ? 0.6 + 0.4 * Math.sin(now / 50) : 0.9).beginPath().arc(p.x, p.y + 4, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).strokePath();
      document.getElementById('atk')?.classList.add('held');
      if (k >= 1) { if (!this.charged) { this.charged = true; document.getElementById('atk')?.classList.add('charged'); burst(this.h, p.x, p.y, 0xffe066, 5, 24); }
        if (Math.floor(now / 90) % 2) p.setTint(0xfff09a).setTintMode(Phaser.TintModes.ADD); else p.clearTint().setTintMode(Phaser.TintModes.MULTIPLY); }
    } else if (p.isTinted && !this.charged && p.tintMode === Phaser.TintModes.ADD) p.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    void dt;
  }
}
export const dirOf = (a: number): Dir => Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 'right' : 'left') : (Math.sin(a) > 0 ? 'down' : 'up');
/** v10 ability unlock moment: club raised, banner with a one-line how-to */
export function abilityMoment(scene: Phaser.Scene & { player?: Player }, k: string) {
  const it = G.w.items[k]; if (!it?.how) return;
  const p = scene.player; if (p?.active) { p.pose('interact', 900, 'down'); burst(scene, p.x, p.y - 6, 0xffe066, 14, 60); scene.cameras.main.flash(180, 255, 240, 160); }
  const el = document.getElementById('banner'); if (el) { el.innerHTML = `<b>${it.icon} ${it.name}</b><small>${it.how}</small>`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  toast(it.how);
}
