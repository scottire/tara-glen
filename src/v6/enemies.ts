// Enemies: one Character subclass, behaviour picked by stats.ai (chase/hop/dart/scuttle/swoop); bosses are scaled up with a health bar.
// Hurt/knockback/invulnerability via the Wispguard-derived Character (MIT, see licenses/wispguard-MIT.txt).
import Phaser from 'phaser';
import { Character, G, ensureAnims, type Player } from '../mech/core';
import type { Pather } from '../mech/path';
import { say, bossBar } from './ui';

export class Enemy extends Character {
  t = 0; path: { x: number; y: number }[] = []; repath = 0; seen = false; home: { x: number; y: number }; charging = 0;
  onDeath?: (e: Enemy) => void;
  constructor(scene: Phaser.Scene, public e: any, public target: Player, public pather?: Pather) {
    super(scene, e.x, e.y, 'monsters', e.stats.hp, e.stats.hp, 300);
    const s = e.stats; ensureAnims(scene, 'monsters', `m${s.sheet}-`, s.sheet * 16, 6);
    this.setFrame(s.sheet * 16); this.play(`m${s.sheet}-down`);
    if (s.scale) this.setScale(s.scale);
    this.setSize(12, 10).setOffset(2, 5); this.setCollideWorldBounds(true);
    this.home = { x: e.x, y: e.y };
    this.sm.add({ name: 'live', onUpdate: (dt) => this.think(dt) }, this.hurtState('live'), { name: 'dead', onEnter: () => this.die() });
    this.sm.set('live');
  }
  get s() { return this.e.stats; }
  get flying() { return this.s.ai === 'swoop' || this.s.ai === 'dart'; }
  onDamage() { if (this.s.boss) bossBar(this.s.name, this.life.life / this.life.max); }
  toward(speed: number, spread = 0) {
    const a = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y) + spread;
    this.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
  }
  wander(dt: number) {
    if ((this.t -= dt) > 0) return;
    this.t = 900 + Math.random() * 1400;
    const far = Phaser.Math.Distance.Between(this.x, this.y, this.home.x, this.home.y) > 56;
    const a = far ? Phaser.Math.Angle.Between(this.x, this.y, this.home.x, this.home.y) : Math.random() * Math.PI * 2;
    const go = far || Math.random() < 0.65; this.setVelocity(go ? Math.cos(a) * this.s.speed : 0, go ? Math.sin(a) * this.s.speed : 0);
  }
  think(dt: number) {
    const s = this.s, tg = this.target;
    if (G.paused || !tg.active || (this.scene as any).leaving) { this.setVelocity(0, 0); return; }
    const d = Phaser.Math.Distance.Between(this.x, this.y, tg.x, tg.y), sees = !tg.busy && d < s.sight;
    if (sees && s.boss && !this.seen) { this.seen = true; bossBar(s.name, this.life.life / this.life.max); if (G.w.enemyTypes[s.type]) say([G.w.enemyTypes[s.type]]); }
    if (s.boss && this.seen && d > s.sight * 2) bossBar(null);
    if (!sees) { this.wander(dt); this.anim(); return; }
    this.t -= dt;
    switch (s.ai) {
      case 'hop': if (this.t <= 0) { this.t = 900; this.toward(s.chase * 1.7); this.scene.time.delayedCall(330, () => this.active && this.sm.current === 'live' && this.setVelocity(0, 0)); } break;
      case 'dart': if (this.t <= 0) { this.t = 380; this.toward(s.chase, (Math.random() - 0.5) * 2); } break;
      case 'scuttle': { const dx = tg.x - this.x, dy = tg.y - this.y; this.setVelocity(Math.sign(dx) * s.chase * (Math.abs(dx) > 4 ? 1 : 0), Math.sign(dy) * s.chase * 0.4); break; }
      case 'swoop':
        if (this.charging > 0) { this.charging -= dt; break; }
        if (this.t <= 0) { this.t = s.boss ? 1800 : 2400; this.charging = 520; this.toward(s.chase * 2.1); break; }
        { const a = Phaser.Math.Angle.Between(tg.x, tg.y, this.x, this.y) + 0.9, r = 46; // circle the player, then dive
          const gx = tg.x + Math.cos(a) * r, gy = tg.y + Math.sin(a) * r, aa = Phaser.Math.Angle.Between(this.x, this.y, gx, gy);
          this.setVelocity(Math.cos(aa) * s.chase, Math.sin(aa) * s.chase); }
        break;
      default: // chase: EasyStar indoors, straight line outdoors; bosses also charge
        if (s.boss && this.t <= 0) { this.t = 2600; this.charging = 450; this.toward(s.chase * 2.4); break; }
        if (this.charging > 0) { this.charging -= dt; break; }
        if (this.pather) {
          if ((this.repath -= dt) <= 0) { this.repath = 450; const T = (n: number) => Math.floor(n / 16);
            this.pather.find(T(this.x), T(this.y), T(tg.x), T(tg.y + 4)).then((n) => { if (n) this.path = n.slice(1); }); }
          if (this.follow(this.path, s.chase)) this.toward(s.chase);
        } else this.toward(s.chase);
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
    this.onDeath?.(this);
    this.scene.tweens.add({ targets: this, alpha: 0, scaleX: (this.s.scale ?? 1) * 1.6, scaleY: (this.s.scale ?? 1) * 0.3, duration: 350, onComplete: () => this.destroy() });
  }
}
