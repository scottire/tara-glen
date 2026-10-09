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

import { F, steer, animateBody, squash, sfx, dust, cornerCorrect, grassy, rustle, vibrate } from '../v12/feel';
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
      const pl = this instanceof Player; let on = false; // v12: hard flicker for the player (zelda3 countdown_for_blink), soft pulse for enemies
      const blink = pl ? this.scene.time.addEvent({ delay: F.blinkMs, loop: true, callback: () => { on = !on; this.setAlpha(on ? F.blinkAlpha : 1); } }) : this.scene.tweens.add({ targets: this, alpha: 0.2, duration: 80, yoyo: true, repeat: -1 });
      this.scene.time.delayedCall(this instanceof Player ? F.recoilMs : F.enemyHitstunMs, () => { if (!this.active) return; this.setVelocity(0, 0); this.sm.set(next); });
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
/** animations from public/assets/v10/player.json (scripts/gen/player.py): h-<anim>-<dir> */
const HERO_RATE: Record<string, [number, number]> = { idle: [2, -1], walk: [8, -1], swing1: [16, 0], swing2: [16, 0], swing3: [14, 0], charge: [6, -1], spin: [16, 0], roll: [18, 0], hurt: [1, 0], faint: [3, 0], interact: [4, 0] };
export function heroAnims(scene: Phaser.Scene) {
  const meta = scene.cache.json.get('hero'); if (!meta || scene.anims.exists('h-idle-down')) return;
  for (const [name, dirs] of Object.entries<Record<string, number[]>>(meta.anims)) for (const [d, frames] of Object.entries(dirs)) {
    const [rate, repeat] = HERO_RATE[name] ?? [8, -1];
    scene.anims.create({ key: `h-${name}-${d}`, frameRate: rate, repeat, frames: scene.anims.generateFrameNumbers('hero', { frames }) });
  }
}
type Keys = Record<string, Phaser.Input.Keyboard.Key>;
export class Player extends Character {
  keys: Keys;
  constructor(scene: Phaser.Scene, x: number, y: number) {
    const P = G.w.player;
    super(scene, x, y, 'hero', G.st.hp > 0 ? Math.min(G.st.hp, G.st.maxhp) : G.st.maxhp, G.st.maxhp, F.invulnMs ?? P.invulnMs);
    // v10 hero: 24x24 frames, feet on row 22; origin keeps the feet where the old 16px sprite had them
    this.setOrigin(0.5, 14 / 24).setSize(10, 8).setOffset(7, 14).setCollideWorldBounds(true);
    heroAnims(scene); this.play('h-idle-down');
    this.keys = scene.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Keys;
    this.sm.add({ name: 'idle' }, { name: 'move' }, this.hurtState('idle'),
      { name: 'dead', onEnter: () => { this.setVelocity(0, 0); this.play('h-faint-down'); this.scene.time.delayedCall(900, () => this.scene.events.emit('player-dead')); } });
    this.sm.set('idle');
  }
  onDamage() { G.st.hp = this.life.life; persist(); this.pose('hurt', 300); this.scene.cameras.main.shake(140, F.hurtShake); sfx('hurt'); vibrate(F.vibrateFinisherMs); squash(this, 1.3, 0.7); this.setTint(0xff4040).setTintMode(Phaser.TintModes.FILL); this.scene.time.delayedCall(90, () => this.active && this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)); this.scene.events.emit('hud'); }
  revive(x: number, y: number) { this.life.heal(); G.st.hp = this.life.max; this.setAngle(0).setAlpha(1).setPosition(x, y); this.sm.set('idle'); this.play('h-idle-' + this.facing); persist(); }
  dashing = false; dashReady = 0; slow = 1; poseUntil = 0;
  /** play a one-off action animation (swing/roll/hurt/...) for `ms`; walking/idle won't override it meanwhile */
  pose(name: string, ms: number, dir: Dir = this.facing) {
    const k = `h-${name}-${dir}`; if (!this.scene.anims.exists(k)) return;
    this.poseUntil = this.scene.time.now + ms; this.anims.play(k, true);
  }
  idle() { if (this.scene.time.now >= this.poseUntil && this.sm.current !== 'dead') this.anims.play('h-idle-' + this.facing, true); }
  /** v9 dodge-roll: always available; burst along `angle` with i-frames (the `dashing` flag). With the skateboard it goes
   *  further, passes dash locks and hurts enemies on contact. Cooldown is enforced by Combat. */
  dodge(angle: number) {
    const P = G.w.player, board = (G.st.items.skateboard ?? 0) > 0;
    if (this.dashing || this.busy || G.paused) return false;
    const sp = board ? P.dashSpeed : F.dodgeSpeed, ms = board ? P.dashMs : F.dodgeMs;
    this.dashing = true; this.setVelocity(Math.cos(angle) * sp, Math.sin(angle) * sp);
    this.facing = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? (Math.cos(angle) > 0 ? 'right' : 'left') : (Math.sin(angle) > 0 ? 'down' : 'up');
    this.pose('roll', ms); squash(this, 1.25, 0.75); sfx('roll'); dust(this.scene, this.x, this.y + 7, 3);
    const ghost = () => { if (!this.active) return; const g = this.scene.add.image(this.x, this.y, this.texture.key, this.frame.name).setOrigin(this.originX, this.originY).setFlipX(this.flipX).setAlpha(0.4).setTint(0x9fd0ff).setDepth(this.depth - 1);
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() }); };
    const t = this.scene.time.addEvent({ delay: 40, repeat: Math.floor(ms / 40), callback: ghost });
    const td = this.scene.time.addEvent({ delay: F.dodgeDustEveryMs, repeat: Math.floor(ms / F.dodgeDustEveryMs), callback: () => this.active && dust(this.scene, this.x, this.y + 7) }); // tmc: FX_DASH every 4 frames
    this.scene.time.delayedCall(ms, () => { this.dashing = false; t.remove(); td.remove(); if (this.active && !this.busy) { this.setVelocity(Math.cos(angle) * G.w.start.walk * F.dodgeEndCarry * 1.5, Math.sin(angle) * G.w.start.walk * F.dodgeEndCarry * 1.5); squash(this, 0.85, 1.15); } }); // Celeste EndDashSpeed: carry momentum out
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
    speed *= this.slow; const riding = !!(this.scene as any).riding;
    if (v.length() >= 0.01) cornerCorrect(this, v.x, v.y);
    steer(this.body, v.x * speed, v.y * speed, speed, riding, this.scene.game.loop.delta); // v12: accel/decel instead of instant
    animateBody(this, v.length() >= 0.01, this.scene.game.loop.delta, riding);
    if ((this.scene as any).combat?.swingUntil > this.scene.time.now) return true; // facing locked mid-swing
    const moving = v.length() >= 0.01;
    if (moving) this.facing = Math.abs(v.x) > Math.abs(v.y) ? (v.x > 0 ? 'right' : 'left') : (v.y > 0 ? 'down' : 'up');
    if (this.scene.time.now >= this.poseUntil) this.anims.play(`h-${moving ? 'walk' : 'idle'}-${this.facing}`, true);
    this.sm.set(moving ? 'move' : 'idle'); return moving;
  }
}

