// Enemies (v9): readable action archetypes picked by stats.ai. Every attack is telegraphed (flash + marker) before it lands,
// contact only hurts while an enemy is actually attacking, and a shared token budget (Combat) limits how many commit at once.
//   chaser  - closes in, short wind-up, lunge
//   charger - stops, flashes and draws a ground line, then dashes along it (and is stunned afterwards)
//   spitter - keeps its distance, glows, then fires a slow visible orb
//   tank    - armour plates absorb normal hits (shown as a blue shield); a charged spin or a combo finisher breaks them
//   boss    - mini-boss with phases (stats.phases): each phase borrows an archetype, faster each time; last phase calls help
// Hurt/knockback/invulnerability via the Wispguard-derived Character (MIT, see licenses/wispguard-MIT.txt).
import Phaser from 'phaser';
import { Character, G, ensureAnims, type Player } from '../mech/core';
import type { Pather } from '../mech/path';
import { say, bossBar } from './ui';
import { flash, burst, popup, spit, type Combat, type Foe } from '../v9/combat';

type Mode = 'idle' | 'move' | 'windup' | 'attack' | 'recover';
export class Enemy extends Character implements Foe {
  t = 0; path: { x: number; y: number }[] = []; repath = 0; seen = false; home: { x: number; y: number };
  mode: Mode = 'idle'; mt = 0; mt0 = 1; dir = 0; attacking = false; windup = false; armor = 0; phase = 0; tele?: Phaser.GameObjects.Graphics; shield?: Phaser.GameObjects.Arc;
  strafe = Math.random() < 0.5 ? 1 : -1; sight: number;
  onDeath?: (e: Enemy) => void;
  constructor(scene: Phaser.Scene, public e: any, public target: Player, public pather?: Pather) {
    super(scene, e.x, e.y, 'monsters', e.stats.hp, e.stats.hp, 140);
    const s = e.stats; ensureAnims(scene, 'monsters', `m${s.sheet}-`, s.sheet * 16, 6);
    this.setFrame(s.sheet * 16); this.play(`m${s.sheet}-down`);
    if (s.scale) this.setScale(s.scale);
    this.setSize(12, 10).setOffset(2, 5); this.setCollideWorldBounds(true);
    this.home = { x: e.x, y: e.y };
    this.sight = e.room ? 9999 : Math.max(s.sight, 90); // combat rooms: everyone wakes up
    this.armor = s.armor ?? 0;
    if (this.armor) this.shield = scene.add.circle(e.x, e.y, 10, 0x6aa8ff, 0.18).setStrokeStyle(1, 0x9cc8ff, 0.9);
    this.sm.add({ name: 'live', onUpdate: (dt) => this.think(dt) }, this.hurtState('live'), { name: 'dead', onEnter: () => this.die() });
    this.sm.set('live');
    this.once('destroy', () => { this.tele?.destroy(); this.shield?.destroy(); });
  }
  get s() { return this.e.stats; }
  get flying() { return !!this.s.fly; }
  get combat(): Combat | undefined { return (this.scene as any).combat; }
  /** current archetype (bosses switch by phase) */
  get ai(): string { return this.s.ai === 'boss' ? (this.s.phases ?? ['chaser'])[this.phase] : this.s.ai; }
  get spd() { return this.s.chase * (1 + this.phase * 0.2); }
  onDamage() { if (this.s.boss) bossBar(this.s.name, this.life.life / this.life.max); }
  hitBy(_c: Combat, dmg: number, push: number, heavy: boolean, from: { x: number; y: number }) {
    if (this.invuln.invulnerable || this.sm.current === 'dead') return;
    if (this.armor > 0) { // armour soaks the hit; heavy hits crack a plate and still stagger
      this.armor = heavy ? Math.max(0, this.armor - 2) : this.armor - 1;
      flash(this, 0x9cc8ff, 80); burst(this.scene, this.x, this.y - 2, 0x9cc8ff, 5, 30); popup(this.scene, this.x, this.y, this.armor ? 'CLINK' : 'CRACK', '#9cc8ff');
      if (!this.armor) { this.shield?.destroy(); this.shield = undefined; }
      const v = new Phaser.Math.Vector2(this.x - from.x, this.y - from.y).normalize().scale(heavy ? 120 : 50); this.setVelocity(v.x, v.y);
      this.target.setVelocity(-v.x * 0.8, -v.y * 0.8); return;
    }
    flash(this); burst(this.scene, this.x, this.y - 2, 0xffffff, heavy ? 9 : 6, heavy ? 60 : 40); popup(this.scene, this.x, this.y, String(dmg), heavy ? '#ffe066' : '#fff');
    const poise = this.s.boss && !heavy; // bosses only flinch on heavy hits
    if (!poise) this.cancel();
    if (poise) { this.life.takeDamage(dmg); this.onDamage(); if (this.life.life <= 0) this.sm.set('dead'); else this.checkPhase(); return; }
    this.hurt(from, dmg, push); this.checkPhase();
  }
  checkPhase() {
    if (this.s.ai !== 'boss') return;
    const n = (this.s.phases ?? []).length, k = Math.min(n - 1, Math.floor((1 - this.life.life / this.life.max) * n));
    if (k <= this.phase || this.life.life <= 0) return;
    this.phase = k; this.cancel(); this.invuln.invulnerable = true; flash(this, 0xff5050, 400);
    this.scene.cameras.main.shake(250, 0.006); popup(this.scene, this.x, this.y - 12, `PHASE ${k + 1}`, '#ff8080');
    this.scene.time.delayedCall(700, () => { if (this.active) this.invuln.invulnerable = false; });
    if (k === n - 1) this.summon();
  }
  summon() {
    const ents = (this.scene as any).ents; if (!ents) return;
    const t = G.w.zones && this.s.summon ? this.s.summon : 'dust';
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2, x = this.x + Math.cos(a) * 24, y = this.y + Math.sin(a) * 24;
      ents.enemy({ id: `${this.e.id}_add${i}_${Date.now()}`, type: 'enemy', etype: t, stats: { name: 'Dust bunny', sheet: this.s.sheet, ai: 'chaser', hp: 2, dmg: 1, speed: 28, chase: 46, sight: 140 }, x, y, room: this.e.room, minion: true });
      burst(this.scene, x, y, 0xcccccc, 8, 40);
    }
  }
  cancel() {
    if (this.windup || this.attacking) this.combat?.done(this);
    this.windup = this.attacking = false; this.tele?.clear(); this.mode = 'recover'; this.mt = 450;
    if (this.tintMode !== Phaser.TintModes.MULTIPLY || this.isTinted) this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }
  toward(speed: number, spread = 0) {
    const a = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y) + spread;
    this.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
  }
  approach(speed: number) {
    if (this.pather && !this.flying) {
      if ((this.repath -= 16) <= 0) { this.repath = 450; const T = (n: number) => Math.floor(n / 16), tg = this.target;
        this.pather.find(T(this.x), T(this.y), T(tg.x), T(tg.y + 4)).then((n) => { if (n) this.path = n.slice(1); }); }
      if (this.follow(this.path, speed)) this.toward(speed);
    } else this.toward(speed);
  }
  wander(dt: number) {
    if ((this.t -= dt) > 0) return;
    this.t = 900 + Math.random() * 1400;
    const far = Phaser.Math.Distance.Between(this.x, this.y, this.home.x, this.home.y) > 56;
    const a = far ? Phaser.Math.Angle.Between(this.x, this.y, this.home.x, this.home.y) : Math.random() * Math.PI * 2;
    const go = far || Math.random() < 0.65; this.setVelocity(go ? Math.cos(a) * this.s.speed : 0, go ? Math.sin(a) * this.s.speed : 0);
  }
  /** hang back on a ring around the player while others have the tokens */
  circle(r: number, speed: number) {
    const tg = this.target, a = Phaser.Math.Angle.Between(tg.x, tg.y, this.x, this.y) + 0.5 * this.strafe;
    const gx = tg.x + Math.cos(a) * r, gy = tg.y + Math.sin(a) * r, aa = Phaser.Math.Angle.Between(this.x, this.y, gx, gy);
    const d = Phaser.Math.Distance.Between(this.x, this.y, gx, gy); this.setVelocity(Math.cos(aa) * Math.min(speed, d * 4), Math.sin(aa) * Math.min(speed, d * 4));
  }
  telegraph() {
    const tg = this.target; this.dir = Phaser.Math.Angle.Between(this.x, this.y, tg.x, tg.y);
    this.windup = true; this.mode = 'windup'; this.setVelocity(0, 0);
    const g = this.tele ?? (this.tele = this.scene.add.graphics().setDepth(this.y - 1)); g.clear();
    const ai = this.ai;
    this.mt = ai === 'charger' ? 620 : ai === 'spitter' ? 520 : ai === 'tank' ? 560 : 420;
    if (this.s.boss) this.mt *= 0.85;
    this.mt0 = this.mt;
    this.setTint(ai === 'spitter' ? 0xffd040 : 0xff5040).setTintMode(Phaser.TintModes.FILL);
    this.scene.tweens.add({ targets: this, scaleX: (this.s.scale ?? 1) * 1.15, scaleY: (this.s.scale ?? 1) * 0.88, duration: this.mt / 2, yoyo: true });
  }
  drawTele(k: number) {
    const g = this.tele!; g.clear().setDepth(this.y - 1); const ai = this.ai, c = Math.cos(this.dir), s = Math.sin(this.dir);
    const blink = Math.sin(this.scene.time.now / 45) > 0;
    if (ai === 'charger') { const L = 90 * (this.s.scale ?? 1); g.lineStyle(6 * (this.s.scale ?? 1), 0xff3020, 0.15 + 0.3 * k).lineBetween(this.x, this.y + 4, this.x + c * L, this.y + 4 + s * L);
      g.lineStyle(1, 0xffffff, blink ? 0.8 : 0.3).lineBetween(this.x, this.y + 4, this.x + c * L * k, this.y + 4 + s * L * k); }
    else if (ai === 'spitter') { g.fillStyle(0xffa040, 0.5 + 0.3 * k).fillCircle(this.x + c * 9, this.y + s * 9, 1 + 3 * k); g.lineStyle(1, 0xffe08a, 0.8).strokeCircle(this.x, this.y, 14 - 8 * k); }
    else { g.lineStyle(1.5, 0xff3020, 0.3 + 0.5 * k).strokeCircle(this.x, this.y + 5, 6 + 10 * k * (this.s.scale ?? 1)); }
    if (blink) this.setTint(ai === 'spitter' ? 0xffd040 : 0xff5040).setTintMode(Phaser.TintModes.FILL); else this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }
  strike() {
    this.windup = false; this.tele?.clear(); this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    const ai = this.ai, c = Math.cos(this.dir), s = Math.sin(this.dir), boss = this.s.boss ? 1.25 : 1;
    if (ai === 'spitter') {
      const n = this.s.boss ? 3 : 1;
      for (let i = 0; i < n; i++) spit(this.scene as any, this, this.dir + (i - (n - 1) / 2) * 0.35, 90 + this.phase * 10, this.s.dmg);
      this.mode = 'recover'; this.mt = 900; this.combat?.done(this); return;
    }
    this.attacking = true; this.mode = 'attack';
    const sp = ai === 'charger' ? 210 * boss : ai === 'tank' ? 120 : 170 * boss; this.mt = ai === 'charger' ? 420 : 200;
    this.setVelocity(c * sp, s * sp);
  }
  think(dt: number) {
    const s = this.s, tg = this.target, c = this.combat;
    if (this.shield) this.shield.setPosition(this.x, this.y).setDepth(this.depth + 1).setAlpha(0.6 + 0.3 * Math.sin(this.scene.time.now / 200));
    if (G.paused || !tg.active || (this.scene as any).leaving) { this.setVelocity(0, 0); return; }
    const d = Phaser.Math.Distance.Between(this.x, this.y, tg.x, tg.y), sees = !tg.busy && d < this.sight;
    if (sees && s.boss && !this.seen) { this.seen = true; bossBar(s.name, this.life.life / this.life.max); if (G.w.enemyTypes[s.type ?? this.e.etype]) say([G.w.enemyTypes[s.type ?? this.e.etype]]); }
    if (s.boss && this.seen && d > this.sight * 2) bossBar(null);
    this.mt -= dt;
    switch (this.mode) {
      case 'windup': this.drawTele(1 - Math.max(0, this.mt) / this.mt0); if (this.mt <= 0) this.strike(); return this.anim();
      case 'attack':
        if (this.mt <= 0 || (this.body.blocked.none === false && this.ai === 'charger')) {
          this.attacking = false; this.setVelocity(0, 0); c?.done(this);
          this.mode = 'recover'; this.mt = this.ai === 'charger' ? 800 : 500; // charger is dizzy: punish window
          if (this.ai === 'charger') { this.scene.tweens.add({ targets: this, angle: { from: -12, to: 12 }, duration: 120, yoyo: true, repeat: 2, onComplete: () => this.setAngle(0) }); burst(this.scene, this.x, this.y + 4, 0xd8c8a0, 5, 25); }
        }
        return this.anim();
      case 'recover': this.setVelocity(this.body.velocity.x * 0.85, this.body.velocity.y * 0.85); if (this.mt <= 0) this.mode = 'move'; return;
    }
    if (!sees) { c?.disengage(this); this.wander(dt); this.anim(); return; }
    if (c && !c.engage(this)) { this.circle(70, s.speed); this.anim(); return; }
    const ai = this.ai, spd = this.spd;
    const range = ai === 'charger' ? 84 : ai === 'spitter' ? 96 : ai === 'tank' ? 24 : 26;
    if (ai === 'spitter') { // keep distance, strafe
      if (d < 50) this.toward(-spd); else if (d > 90) this.approach(spd);
      else { const a = Phaser.Math.Angle.Between(tg.x, tg.y, this.x, this.y) + 0.6 * this.strafe; this.setVelocity((tg.x + Math.cos(a) * d - this.x) * 2, (tg.y + Math.sin(a) * d - this.y) * 2); }
    } else if (ai === 'charger' && d < 40) this.toward(-spd * 0.7); // backs off to get a run-up
    else if (d > range * 0.7) this.approach(ai === 'tank' ? spd * 0.8 : spd); else this.setVelocity(0, 0);
    if (d < range && (this.t -= dt) <= 0) {
      if (!c || c.token(this)) { this.telegraph(); this.t = (ai === 'spitter' ? 1400 : 900) / (1 + this.phase * 0.3); }
      else { this.t = 400; this.circle(60, s.speed); }
    }
    this.anim();
  }
  anim() {
    const v = this.body.velocity; if (Math.hypot(v.x, v.y) < 1) return;
    const f = Math.abs(v.x) > Math.abs(v.y) ? (v.x > 0 ? 'right' : 'left') : (v.y > 0 ? 'down' : 'up');
    this.anims.play(`m${this.s.sheet}-${f}`, true);
  }
  die() {
    this.body.enable = false; if (this.s.boss) bossBar(null);
    this.combat?.disengage(this); this.tele?.destroy(); this.tele = undefined; this.clearTint();
    burst(this.scene, this.x, this.y, 0xffffff, 10, 60);
    this.onDeath?.(this);
    this.scene.tweens.add({ targets: this, alpha: 0, scaleX: (this.s.scale ?? 1) * 1.6, scaleY: (this.s.scale ?? 1) * 0.3, duration: 300, onComplete: () => this.destroy() });
  }
}
