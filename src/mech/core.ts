// Character core: state machine + components + Player/Baddie.
// StateMachine, LifeComponent, InvulnerableComponent and the hurt-state flow are adapted from
// "Legend of the Wispguard" (devshareacademy/phaser-zelda-like-tutorial), MIT - see licenses/wispguard-MIT.txt.
import Phaser from 'phaser';
import { stick } from '../joystick';
import { load, save, fmt, type Save } from '../state';

// ---------- shared game state (one save object for both scenes) ----------
export const G = { st: load() as Save, w: {} as any, paused: false, god: false };
export const $ = (id: string) => document.getElementById(id)!;
export const S = (k: string, v?: Record<string, any>) => fmt(G.w.strings?.[k] ?? k, v);
export const persist = () => save(G.st);
export function toast(msg: string) {
  const el = $('toast'); el.textContent = msg; el.style.opacity = '1';
  clearTimeout((el as any)._t); (el as any)._t = setTimeout(() => (el.style.opacity = '0'), 2200);
}
export const DIRS = ['down', 'up', 'left', 'right'] as const; // columns of the Ninja Adventure sheet
export type Dir = (typeof DIRS)[number];
export const DIRV: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
export function ensureAnims(scene: Phaser.Scene, key: string, prefix = '', base = 0, rate = 8) {
  DIRS.forEach((d, c) => { if (!scene.anims.exists(prefix + d)) scene.anims.create({ key: prefix + d, frameRate: rate, repeat: -1, frames: scene.anims.generateFrameNumbers(key, { frames: [c, c + 4, c + 8, c + 12].map((f) => f + base) }) }); });
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
    if ((G.god || (this as any).dashing) && this instanceof Player) return;
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
    const P = G.w.player;
    super(scene, x, y, 'player', G.st.hp > 0 ? Math.min(G.st.hp, G.st.maxhp) : G.st.maxhp, G.st.maxhp, P.invulnMs);
    this.setSize(10, 8).setOffset(3, 8).setCollideWorldBounds(true);
    ensureAnims(scene, 'player');
    this.keys = scene.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Keys;
    this.sm.add({ name: 'idle' }, { name: 'move' }, this.hurtState('idle'),
      { name: 'dead', onEnter: () => { this.setVelocity(0, 0); this.anims.stop(); this.setAngle(90); this.scene.time.delayedCall(700, () => this.scene.events.emit('player-dead')); } });
    this.sm.set('idle');
  }
  onDamage() { G.st.hp = this.life.life; persist(); this.scene.cameras.main.shake(140, 0.006); this.setTint(0xff4040).setTintMode(Phaser.TintModes.FILL); this.scene.time.delayedCall(90, () => this.active && this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)); this.scene.events.emit('hud'); }
  revive(x: number, y: number) { this.life.heal(); G.st.hp = this.life.max; this.setAngle(0).setAlpha(1).setPosition(x, y); this.sm.set('idle'); persist(); }
  dashing = false; dashReady = 0; slow = 1;
  /** v9 dodge-roll: always available; burst along `angle` with i-frames (the `dashing` flag). With the skateboard it goes
   *  further, passes dash locks and hurts enemies on contact. Cooldown is enforced by Combat. */
  dodge(angle: number) {
    const P = G.w.player, board = (G.st.items.skateboard ?? 0) > 0;
    if (this.dashing || this.busy || G.paused) return false;
    const sp = board ? P.dashSpeed : P.dodgeSpeed ?? 210, ms = board ? P.dashMs : P.dodgeMs ?? 220;
    this.dashing = true; this.setVelocity(Math.cos(angle) * sp, Math.sin(angle) * sp);
    this.facing = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? (Math.cos(angle) > 0 ? 'right' : 'left') : (Math.sin(angle) > 0 ? 'down' : 'up');
    this.setFrame(DIRS.indexOf(this.facing)); this.scene.tweens.add({ targets: this, scaleY: 0.8, duration: ms / 2, yoyo: true });
    const ghost = () => { if (!this.active) return; const g = this.scene.add.image(this.x, this.y, this.texture.key, this.frame.name).setAlpha(0.4).setTint(0x9fd0ff).setDepth(this.depth - 1);
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() }); };
    const t = this.scene.time.addEvent({ delay: 40, repeat: Math.floor(ms / 40), callback: ghost });
    this.scene.time.delayedCall(ms, () => { this.dashing = false; t.remove(); if (this.active && !this.busy) this.setVelocity(0, 0); });
    return true;
  }
  /** legacy entry (keyboard Z/C): dodge in the facing/stick direction */
  dash() { const c = (this.scene as any).combat; return c ? c.dodge() : this.dodge(Math.atan2(DIRV[this.facing][1], DIRV[this.facing][0])); }
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
    if (this.busy || this.dashing) return this.dashing;
    speed *= this.slow; this.setVelocity(v.x * speed, v.y * speed);
    if ((this.scene as any).combat?.swingUntil > this.scene.time.now) return true; // facing locked mid-swing
    const moving = v.length() >= 0.01;
    if (moving) this.facing = Math.abs(v.x) > Math.abs(v.y) ? (v.x > 0 ? 'right' : 'left') : (v.y > 0 ? 'down' : 'up');
    if (moving) this.anims.play(this.facing, true); else { this.anims.stop(); this.setFrame(DIRS.indexOf(this.facing)); }
    this.sm.set(moving ? 'move' : 'idle'); return moving;
  }
}

