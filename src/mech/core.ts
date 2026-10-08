// Character core: state machine + components + Player/Baddie.
// StateMachine, LifeComponent, InvulnerableComponent and the hurt-state flow are adapted from
// "Legend of the Wispguard" (devshareacademy/phaser-zelda-like-tutorial), MIT - see licenses/wispguard-MIT.txt.
import Phaser from 'phaser';
import { stick } from '../joystick';
import { load, save, fmt, type Save } from '../state';
import type { Pather } from './path';

// ---------- shared game state (one save object for both scenes) ----------
export const G = { st: load() as Save, mech: {} as any, paused: false };
export const $ = (id: string) => document.getElementById(id)!;
export const S = (k: string, v?: Record<string, any>) => fmt(G.mech.strings?.[k] ?? k, v);
export const persist = () => save(G.st);
export function toast(msg: string) {
  const el = $('toast'); el.textContent = msg; el.style.opacity = '1';
  clearTimeout((el as any)._t); (el as any)._t = setTimeout(() => (el.style.opacity = '0'), 2200);
}
export const DIRS = ['down', 'up', 'left', 'right'] as const; // columns of the Ninja Adventure sheet
export type Dir = (typeof DIRS)[number];
export const DIRV: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
export function ensureAnims(scene: Phaser.Scene, key: string, prefix = '') {
  DIRS.forEach((d, c) => { if (!scene.anims.exists(prefix + d)) scene.anims.create({ key: prefix + d, frameRate: 8, repeat: -1, frames: scene.anims.generateFrameNumbers(key, { frames: [c, c + 4, c + 8, c + 12] }) }); });
}

// ---------- state machine (Wispguard) ----------
export interface State { name: string; onEnter?: (args: unknown[]) => void; onUpdate?: (dt: number) => void }
export class StateMachine {
  #states = new Map<string, State>(); #cur?: State; #changing = false; #queue: { name: string; args: unknown[] }[] = [];
  get current() { return this.#cur?.name; }
  add(...s: State[]) { s.forEach((x) => this.#states.set(x.name, x)); return this; }
  update(dt: number) { const q = this.#queue.shift(); if (q) this.set(q.name, ...q.args); this.#cur?.onUpdate?.(dt); }
  set(name: string, ...args: unknown[]) {
    if (!this.#states.has(name) || this.#cur?.name === name) return;
    if (this.#changing) { this.#queue.push({ name, args }); return; }
    this.#changing = true; this.#cur = this.#states.get(name)!; this.#cur.onEnter?.(args); this.#changing = false;
  }
}

// ---------- components (Wispguard) ----------
export class LifeComponent {
  constructor(public max: number, public life = max) {}
  takeDamage(n: number) { this.life = Math.max(0, this.life - n); }
  heal() { this.life = this.max; }
}
export class InvulnerableComponent { constructor(public invulnerable = false, public afterHitMs = 0) {} }

// ---------- character ----------
export class Character extends Phaser.Physics.Arcade.Sprite {
  sm = new StateMachine(); life: LifeComponent; invuln: InvulnerableComponent; facing: Dir = 'down';
  declare body: Phaser.Physics.Arcade.Body;
  constructor(scene: Phaser.Scene, x: number, y: number, key: string, hp: number, maxHp: number, invulnMs: number) {
    super(scene, x, y, key, 0);
    scene.add.existing(this); scene.physics.add.existing(this);
    this.life = new LifeComponent(maxHp, hp); this.invuln = new InvulnerableComponent(false, invulnMs);
  }
  get busy() { return this.sm.current === 'hurt' || this.sm.current === 'dead'; }
  /** Wispguard HurtState: knock back away from the source, flash, short invulnerability, then `next`. */
  hurt(src: { x: number; y: number }, dmg: number, push = 120) {
    if (this.invuln.invulnerable || this.sm.current === 'dead' || !this.active) return;
    this.life.takeDamage(dmg); this.onDamage();
    this.sm.set(this.life.life > 0 ? 'hurt' : 'dead', src, push);
  }
  onDamage() {}
  hurtState(next: string): State {
    return { name: 'hurt', onEnter: ([src, push]) => {
      const s = src as { x: number; y: number }, v = new Phaser.Math.Vector2(this.x - s.x, this.y - s.y).normalize().scale(push as number);
      this.setVelocity(v.x, v.y); this.invuln.invulnerable = true;
      const blink = this.scene.tweens.add({ targets: this, alpha: 0.2, duration: 80, yoyo: true, repeat: -1 });
      this.scene.time.delayedCall(180, () => { if (!this.active) return; this.setVelocity(0, 0); this.sm.set(next); });
      this.scene.time.delayedCall(this.invuln.afterHitMs, () => { blink.remove(); if (!this.active) return; this.setAlpha(1); this.invuln.invulnerable = false; });
    } };
  }
  /** steer along a list of tile nodes (from EasyStar); returns true when finished */
  follow(nodes: { x: number; y: number }[], speed: number) {
    while (nodes.length && Phaser.Math.Distance.Between(this.x, this.y, nodes[0].x * 16 + 8, nodes[0].y * 16 + 8) < 3) nodes.shift();
    if (!nodes.length) { this.setVelocity(0, 0); return true; }
    const dx = nodes[0].x * 16 + 8 - this.x, dy = nodes[0].y * 16 + 8 - this.y, d = Math.hypot(dx, dy);
    this.setVelocity((dx / d) * speed, (dy / d) * speed);
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    return false;
  }
  preUpdate(t: number, dt: number) { super.preUpdate(t, dt); this.sm.update(dt); this.setDepth(this.y + 8); }
}

// ---------- player ----------
type Keys = Record<string, Phaser.Input.Keyboard.Key>;
export class Player extends Character {
  keys: Keys;
  constructor(scene: Phaser.Scene, x: number, y: number) {
    const P = G.mech.player;
    super(scene, x, y, 'player', G.st.hp > 0 ? G.st.hp : P.health, P.health, P.invulnMs);
    this.setSize(10, 8).setOffset(3, 8).setCollideWorldBounds(true);
    ensureAnims(scene, 'player');
    this.keys = scene.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Keys;
    this.sm.add({ name: 'idle' }, { name: 'move' }, this.hurtState('idle'),
      { name: 'dead', onEnter: () => { this.setVelocity(0, 0); this.anims.stop(); this.setAngle(90); this.scene.time.delayedCall(700, () => this.scene.events.emit('player-dead')); } });
    this.sm.set('idle');
  }
  onDamage() { G.st.hp = this.life.life; persist(); toast(S('ouch')); this.scene.events.emit('hud'); }
  revive(x: number, y: number) { this.life.heal(); G.st.hp = this.life.max; this.setAngle(0).setAlpha(1).setPosition(x, y); this.sm.set('idle'); persist(); }
  readInput() {
    if (G.paused) return new Phaser.Math.Vector2(0, 0);
    const k = this.keys;
    let x = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let y = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (!x && !y && Math.hypot(stick.x, stick.y) > 0.25) { x = stick.x; y = stick.y; }
    const v = new Phaser.Math.Vector2(x, y); if (v.length() > 1) v.normalize(); return v;
  }
  /** move + face + animate; ignored while hurt/dead. Returns whether moving. */
  drive(v: Phaser.Math.Vector2, speed: number) {
    if (this.busy) return false;
    this.setVelocity(v.x * speed, v.y * speed);
    const moving = v.length() >= 0.01;
    if (moving) this.facing = Math.abs(v.x) > Math.abs(v.y) ? (v.x > 0 ? 'right' : 'left') : (v.y > 0 ? 'down' : 'up');
    if (moving) this.anims.play(this.facing, true); else { this.anims.stop(); this.setFrame(DIRS.indexOf(this.facing)); }
    this.sm.set(moving ? 'move' : 'idle'); return moving;
  }
}

// ---------- baddie: patrol between points, chase the player with EasyStar when close ----------
export class Baddie extends Character {
  path: { x: number; y: number }[] = []; repath = 0; leg = 0;
  constructor(scene: Phaser.Scene, x: number, y: number, public id: string, public def: any, public pather: Pather, public target: Player) {
    super(scene, x, y, def.sprite, def.health, def.health, 400);
    this.setSize(12, 10).setOffset(2, 5);
    if (!scene.anims.exists(def.sprite + '-wobble')) scene.anims.create({ key: def.sprite + '-wobble', frames: scene.anims.generateFrameNumbers(def.sprite, {}), frameRate: 4, repeat: -1 });
    this.play(def.sprite + '-wobble');
    const sees = () => this.target.active && !this.target.busy && Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) < def.sight;
    const tile = (n: number) => Math.floor(n / 16);
    this.sm.add(
      { name: 'patrol', onEnter: () => { this.path = []; this.repath = 0; }, onUpdate: (dt) => {
        if (sees()) return this.sm.set('chase');
        if ((this.repath -= dt) <= 0 && !this.path.length) {
          const p = def.patrol[this.leg = (this.leg + 1) % def.patrol.length]; this.repath = 1500;
          this.pather.find(tile(this.x), tile(this.y), p[0], p[1]).then((n) => { if (this.sm.current === 'patrol') this.path = n ?? []; });
        }
        this.follow(this.path, def.speed);
      } },
      { name: 'chase', onEnter: () => { this.repath = 0; }, onUpdate: (dt) => {
        if (Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) > def.sight * 1.6 || this.target.busy) return this.sm.set('patrol');
        if ((this.repath -= dt) <= 0) { this.repath = 400;
          this.pather.find(tile(this.x), tile(this.y), tile(this.target.x), tile(this.target.y + 4)).then((n) => { if (n) this.path = n.slice(1); }); }
        if (this.follow(this.path, def.chaseSpeed)) this.scene.physics.moveToObject(this, this.target, def.chaseSpeed); // same tile: go straight at them
      } },
      this.hurtState('chase'),
      { name: 'dead', onEnter: () => {
        this.body.enable = false; G.st.defeated.push(this.id); persist();
        this.scene.tweens.add({ targets: this, alpha: 0, scaleX: 1.6, scaleY: 0.3, duration: 350, onComplete: () => this.destroy() });
      } },
    );
    this.sm.set('patrol');
  }
}
