// combat-feel branch: one place for player-feel tunables (src/feel.json, numbers sourced in docs/feel-spec.md),
// accel/decel movement, squash & stretch, footstep dust, tiny WebAudio blips, a practice yard by the caravan and a
// ?feel overlay with live sliders (values persist in localStorage 'tg-feel' and can be copied back into feel.json).
import Phaser from 'phaser';
import base from '../feel.json';
import { G } from '../mech/core';
import { burst, flash, popup, ensureFxTextures } from '../v9/combat';

type FeelKey = Exclude<keyof typeof base, '_doc'>;
export const F: Record<FeelKey, number> = { ...(base as any) };
delete (F as any)._doc;
const params = new URLSearchParams(location.search);
export const feelDebug = params.has('feel');
if (feelDebug) { try { Object.assign(F, JSON.parse(localStorage.getItem('tg-feel') ?? '{}')); } catch { /* bad json */ } }

// ---------- movement ----------
const approach = (v: number, t: number, step: number) => (v < t ? Math.min(v + step, t) : Math.max(v - step, t));
/** Celeste-style velocity approach: reach `speed` in accelMs, stop in decelMs; turning gets a boost so reversals stay snappy */
export function steer(body: Phaser.Physics.Arcade.Body, tx: number, ty: number, speed: number, bike: boolean, dt: number) {
  const acc = speed / ((bike ? F.bikeAccelMs : F.walkAccelMs) || 1) * dt, dec = speed / ((bike ? F.bikeDecelMs : F.walkDecelMs) || 1) * dt;
  const v = body.velocity, moving = tx !== 0 || ty !== 0;
  const turning = moving && v.x * tx + v.y * ty < 0;
  const step = !moving ? dec : turning ? acc * F.turnBoost : acc;
  body.setVelocity(approach(v.x, tx, step), approach(v.y, ty, step));
}

// ---------- squash & stretch ----------
type Sq = Phaser.Physics.Arcade.Sprite & { sqx?: number; sqy?: number; bobT?: number; dustT?: number; wasMoving?: boolean; sqPatched?: boolean };
/** keep the physics body at its unscaled size: squash is visual only (no collision change near walls) */
function patchBody(p: Sq) {
  if (p.sqPatched) return; p.sqPatched = true;
  const b = p.body as any, ub = b.updateBounds.bind(b);
  b.updateBounds = () => { const sx = p.scaleX, sy = p.scaleY; (p as any)._scaleX = 1; (p as any)._scaleY = 1; ub(); (p as any)._scaleX = sx; (p as any)._scaleY = sy; };
}
export function squash(p: Sq, sx: number, sy: number) { patchBody(p); p.sqx = sx; p.sqy = sy; }
/** per frame: ease squash back to 1, walking bob, start/stop squash, footstep dust */
export function animateBody(p: Sq, moving: boolean, dt: number, riding: boolean) {
  patchBody(p);
  if (moving && !p.wasMoving) squash(p, 1 - F.squashStart, 1 + F.squashStart);
  else if (!moving && p.wasMoving) squash(p, 1 + F.squashStop, 1 - F.squashStop);
  p.wasMoving = moving;
  const k = Math.min(1, F.squashRecover * dt / 1000);
  p.sqx = (p.sqx ?? 1) + (1 - (p.sqx ?? 1)) * k; p.sqy = (p.sqy ?? 1) + (1 - (p.sqy ?? 1)) * k;
  let bob = 0;
  if (moving && !riding) { p.bobT = (p.bobT ?? 0) + dt; bob = Math.abs(Math.sin(p.bobT / 1000 * Math.PI * 4)) * F.walkBob; } else p.bobT = 0;
  p.setScale(p.sqx * (1 - bob * 0.5), p.sqy * (1 + bob));
  if (moving && (p.body as Phaser.Physics.Arcade.Body).velocity.length() > 20) {
    if ((p.dustT = (p.dustT ?? 0) - dt) <= 0) { p.dustT = riding ? F.dustEveryMs * 0.6 : F.dustEveryMs; dust(p.scene, p.x, p.y + 7); }
    if (((p as any).grassT = ((p as any).grassT ?? 0) - dt) <= 0) { (p as any).grassT = F.grassEveryMs; if (grassy(p.scene, p.x, p.y + 6)) { rustle(p.scene, p.x, p.y + 7); (p as any).rustles = ((p as any).rustles ?? 0) + 1; } }
  }
}
export function dust(scene: Phaser.Scene, x: number, y: number, n = 1) {
  ensureFxTextures(scene);
  for (let i = 0; i < n; i++) {
    const d = scene.add.image(x + (Math.random() - 0.5) * 4, y, 'fx-smoke').setDepth(y - 1).setAlpha(0.55).setScale(0.35 + Math.random() * 0.2);
    scene.tweens.add({ targets: d, y: y - 3 - Math.random() * 2, alpha: 0, scale: 0.7, duration: 320 + Math.random() * 120, onComplete: () => d.destroy() });
  }
}

// ---------- sound: tiny synth blips, no assets ----------
let ac: AudioContext | null = null;
const audio = () => { try { ac ??= new (window.AudioContext || (window as any).webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch { return null; } };
addEventListener('pointerdown', () => audio(), { once: true }); addEventListener('keydown', () => audio(), { once: true });
type Blip = 'swing' | 'hit' | 'heavy' | 'roll' | 'hurt' | 'finisher';
const SFX: Record<Blip, [OscillatorType, number, number, number, boolean]> = { // wave, f0, f1, ms, noise
  swing: ['triangle', 900, 300, 70, true], hit: ['square', 320, 90, 90, true], heavy: ['square', 220, 50, 140, true], roll: ['sine', 260, 520, 90, true], hurt: ['sawtooth', 420, 110, 200, false], finisher: ['square', 160, 35, 260, true],
};
export function sfx(name: Blip) {
  if (!F.sound || G.paused) return; const a = audio(); if (!a || a.state !== 'running') return;
  const [type, f0, f1, ms, noise] = SFX[name], t = a.currentTime, d = ms / 1000;
  const g = a.createGain(); g.gain.setValueAtTime(F.sound, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); g.connect(a.destination);
  const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d); o.connect(g); o.start(t); o.stop(t + d);
  if (noise) {
    const buf = a.createBuffer(1, Math.ceil(a.sampleRate * d), a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const s = a.createBufferSource(), ng = a.createGain(); ng.gain.value = name === 'finisher' ? 0.9 : name === 'swing' || name === 'roll' ? 0.35 : 0.6; s.buffer = buf; s.connect(ng).connect(g); s.start(t);
  }
}

// ---------- practice yard (Area 1, beside the caravan) ----------
/** training post: takes hits forever, wobbles, flashes, slides back and springs home */
export class Dummy extends Phaser.Physics.Arcade.Sprite {
  sm = { current: 'idle' as string }; home: { x: number; y: number }; attacking = false; windup = false; s = { name: 'Practice post', boss: false }; hits = 0;
  constructor(scene: Phaser.Scene, x: number, y: number) {
    dummyTexture(scene); super(scene, x, y, 'fx-dummy'); scene.add.existing(this); scene.physics.add.existing(this);
    this.setOrigin(0.5, 0.8).setDepth(y); this.home = { x, y };
    (this.body as Phaser.Physics.Arcade.Body).setSize(10, 6).setOffset(3, 14).setDrag(600, 600).setMaxVelocity(140, 140);
  }
  hitBy(_c: any, dmg: number, push: number, heavy: boolean, from: { x: number; y: number }) {
    this.hits++; flash(this as any, 0xffffff, heavy ? 110 : 80); burst(this.scene, this.x, this.y - 6, heavy ? 0xffe066 : 0xffffff, heavy ? 10 : 6, heavy ? 60 : 40);
    popup(this.scene, this.x, this.y - 8, String(dmg), heavy ? '#ffe066' : '#fff'); sfx(heavy ? 'heavy' : 'hit');
    const a = Phaser.Math.Angle.Between(from.x, from.y, this.x, this.y); this.setVelocity(Math.cos(a) * push * 0.5 * F.postWobble, Math.sin(a) * push * 0.5 * F.postWobble);
    const dir = Math.cos(a) >= 0 ? 1 : -1; this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({ targets: this, angle: { from: dir * (heavy ? 28 : 18) * F.postWobble, to: 0 }, duration: 520, ease: 'Elastic.out' });
    this.scene.tweens.add({ targets: this, scaleX: { from: 1.25, to: 1 }, scaleY: { from: 0.8, to: 1 }, duration: 200, ease: 'Back.out' });
  }
  preUpdate(t: number, dt: number) {
    super.preUpdate(t, dt); const b = this.body as Phaser.Physics.Arcade.Body;
    if (b.velocity.length() < 5) { const dx = this.home.x - this.x, dy = this.home.y - this.y; if (Math.hypot(dx, dy) > 1) b.setVelocity(dx * 3, dy * 3); }
    this.setDepth(this.y);
  }
}
function dummyTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('fx-dummy')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x000000, 0.25).fillEllipse(8, 19, 12, 4);
  g.fillStyle(0x5a3a1e).fillRect(7, 8, 2, 12);
  g.fillStyle(0xc9a06a).fillRect(3, 7, 10, 2);
  g.fillStyle(0xd9b25a).fillRoundedRect(4, 1, 8, 9, 3).fillStyle(0xb48a3a).fillRect(4, 5, 8, 1);
  g.fillStyle(0xd84a3a).fillCircle(8, 4, 2).fillStyle(0xffffff).fillCircle(8, 4, 1);
  g.generateTexture('fx-dummy', 16, 22); g.destroy();
}
/** a free outdoor spot near (x, y): not on a colliding tile of any wall layer */
function freeSpot(scene: any, x: number, y: number, tries: [number, number][]) {
  const blocked = (px: number, py: number) => scene.walls.some((w: any) => w?.getTileAtWorldXY?.(px, py)?.collides) || G.w.barrierTiles.some((t: number[]) => t[0] === Math.floor(px / 16) && t[1] === Math.floor(py / 16));
  for (const [dx, dy] of tries) { const px = x + dx, py = y + dy; if (!blocked(px, py) && !blocked(px - 8, py) && !blocked(px + 8, py) && !blocked(px, py + 8)) return [px, py]; }
  return null;
}
export function practiceYard(scene: any) {
  if (params.has('nofeelyard') || params.has('overview')) return;
  const [ox, oy] = G.w.start.out as [number, number], spots: [number, number][] = [];
  for (let r = 40; r <= 120; r += 16) for (let a = 0; a < 12; a++) spots.push([Math.round(Math.cos(a / 12 * Math.PI * 2 + 0.3) * r), Math.round(Math.sin(a / 12 * Math.PI * 2 + 0.3) * r)]);
  const used: number[][] = [];
  const pick = () => { const s = freeSpot(scene, ox, oy, spots.filter(([dx, dy]) => used.every(([ux, uy]) => Math.hypot(ox + dx - ux, oy + dy - uy) > 28))); if (s) used.push(s); return s; };
  for (let i = 0; i < 2; i++) { const s = pick(); if (!s) break; const d = new Dummy(scene, s[0], s[1]); scene.physics.add.collider(d, scene.walls.filter(Boolean)); scene.enemies.push(d); }
  // one slow dust bunny that wanders here and can bump you (tests i-frames/knockback); respawns, drops nothing
  const s = pick(); if (!s) return;
  const spawn = () => { if (!scene.scene.isActive()) return;
    const en = scene.ents.enemy({ id: 'feel_bunny_' + Date.now(), type: 'enemy', minion: true, room: null, x: s[0], y: s[1],
      stats: { name: 'Practice bunny', sheet: 0, ai: 'chaser', hp: 3, dmg: 1, speed: 16, chase: 30, sight: 56 } });
    en.once('destroy', () => scene.time.delayedCall(4000, spawn)); };
  spawn();
}

// ---------- ?feel overlay ----------
const RANGES: Partial<Record<FeelKey, [number, number, number]>> = {
  blinkMs: [20, 200, 2], enemyKnockMul: [0.5, 3, 0.1], postWobble: [0.5, 3, 0.1], finisherHitstopMs: [0, 300, 5], finisherShake: [0, 0.03, 0.001], bufferMax: [1, 4, 1], rollCancelAfterMs: [0, 190, 5], cornerPx: [0, 10, 1], camLead: [0, 60, 1], camLeadBike: [0, 60, 1], camLerp: [0.01, 0.3, 0.01], trailMs: [0, 400, 10], vibrateMs: [0, 80, 2],
  walkAccelMs: [0, 400, 5], walkDecelMs: [0, 400, 5], bikeAccelMs: [0, 1000, 10], bikeDecelMs: [0, 1000, 10], squashStart: [0, 0.4, 0.01], squashStop: [0, 0.4, 0.01], walkBob: [0, 0.2, 0.01],
  swingMs: [80, 400, 5], bufferMs: [0, 400, 10], hitstopMs: [0, 200, 5], hitstopHeavyMs: [0, 250, 5], shake: [0, 0.02, 0.0005], dodgeSpeed: [80, 400, 5], dodgeMs: [80, 500, 10],
  dodgeCooldownMs: [0, 1500, 25], dodgeEndCarry: [0, 1, 0.05], invulnMs: [0, 2000, 50], sound: [0, 0.5, 0.01],
};
export function feelOverlay() {
  if (!feelDebug || document.getElementById('feelpanel')) return;
  const el = document.createElement('div'); el.id = 'feelpanel';
  el.style.cssText = 'position:fixed;top:4px;right:4px;z-index:99;background:rgba(0,0,0,.75);color:#fff;font:11px monospace;padding:6px;max-height:60vh;overflow:auto;border-radius:6px;width:210px';
  el.innerHTML = '<b>feel</b> <button id="feelcopy">copy</button> <button id="feelreset">reset</button> <button id="feelhide">–</button><div id="feelrows"></div>';
  const rows = el.querySelector('#feelrows')!;
  for (const [k, [lo, hi, st]] of Object.entries(RANGES) as [FeelKey, [number, number, number]][]) {
    const r = document.createElement('label'); r.style.cssText = 'display:block';
    r.innerHTML = `${k} <span>${F[k]}</span><br><input type=range min=${lo} max=${hi} step=${st} value=${F[k]} style="width:100%">`;
    const inp = r.querySelector('input')!, sp = r.querySelector('span')!;
    inp.addEventListener('input', () => { F[k] = +inp.value; sp.textContent = inp.value; localStorage.setItem('tg-feel', JSON.stringify(F)); });
    ['pointerdown', 'touchstart'].forEach((ev) => r.addEventListener(ev, (e) => e.stopPropagation()));
    rows.appendChild(r);
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
  el.querySelector('#feelcopy')!.addEventListener('click', () => navigator.clipboard?.writeText(JSON.stringify(F, null, 2)));
  el.querySelector('#feelreset')!.addEventListener('click', () => { localStorage.removeItem('tg-feel'); location.reload(); });
  el.querySelector('#feelhide')!.addEventListener('click', () => { const s = (rows as HTMLElement).style; s.display = s.display === 'none' ? '' : 'none'; });
  document.body.appendChild(el);
}

// ---------- v2 polish ----------
export const vibrate = (ms: number) => { try { if (ms > 0) navigator.vibrate?.(ms); } catch { /* iOS: no-op */ } };
/** slash trail: a fading crescent along the swing arc */
export function slashTrail(scene: Phaser.Scene, x: number, y: number, a: number, reach: number, arc: number, heavy: boolean, depth: number) {
  if (F.trailMs <= 0) return;
  const g = scene.add.graphics().setDepth(depth + 2), col = heavy ? 0xffe066 : 0xffffff, a0 = a - arc / 2, n = 6;
  for (let i = 0; i < n; i++) { const t0 = a0 + (arc * i) / n, t1 = a0 + (arc * (i + 1)) / n, w = 1 + (heavy ? 3 : 2) * (i / n);
    g.lineStyle(w, col, 0.25 + 0.6 * (i / n)).beginPath().arc(x, y + 1, reach * 0.8, t0, t1).strokePath(); }
  scene.tweens.add({ targets: g, alpha: 0, duration: F.trailMs, onComplete: () => g.destroy() });
}
/** grass rustle: green blades flick up at the feet when the ground pixel under them is grassy */
export function grassy(scene: any, x: number, y: number) {
  const c = scene.groundChunk; if (!c) return false;
  const k = `g_${Math.floor(x / c)}_${Math.floor(y / c)}`; if (!scene.textures.exists(k)) return false;
  const px = scene.textures.getPixel(Math.floor(x % c), Math.floor(y % c), k); if (!px) return false;
  return px.green > px.red * 1.15 && px.green > px.blue * 1.2;
}
export function rustle(scene: Phaser.Scene, x: number, y: number) {
  ensureFxTextures(scene);
  for (let i = 0; i < 3; i++) { const b = scene.add.image(x + (Math.random() - 0.5) * 6, y, 'fx-dot').setTint(Math.random() < 0.5 ? 0x5fae3a : 0x8fd05a).setDepth(y + 1).setScale(0.4, 0.8);
    scene.tweens.add({ targets: b, y: y - 4 - Math.random() * 3, x: b.x + (Math.random() - 0.5) * 5, angle: (Math.random() - 0.5) * 90, alpha: 0, duration: 300 + Math.random() * 150, onComplete: () => b.destroy() }); }
}
/** Celeste-style corner correction: blocked while pushing along an axis -> slide up to cornerPx sideways if that frees the way */
function solidAt(scene: any, x: number, y: number, w: number, h: number) {
  for (const wl of scene.walls ?? []) {
    if (!wl) continue;
    if (wl.getTilesWithinWorldXY) { if (wl.getTilesWithinWorldXY(x, y, w, h, { isColliding: true }).length) return true; }
    else if (wl.getChildren) { for (const o of wl.getChildren()) { const b = o.body; if (b && b.enable !== false && x < b.right && x + w > b.left && y < b.bottom && y + h > b.top) return true; } }
  }
  return false;
}
export function cornerCorrect(p: Phaser.Physics.Arcade.Sprite, vx: number, vy: number) {
  const b = p.body as Phaser.Physics.Arcade.Body, s: any = p.scene, N = Math.round(F.cornerPx); if (N <= 0) return 0;
  const bl = b.blocked as any, tch = b.touching as any;
  const horiz = Math.abs(vx) > Math.abs(vy) * 1.5 && ((vx > 0 && (bl.right || tch.right)) || (vx < 0 && (bl.left || tch.left)));
  const vert = Math.abs(vy) > Math.abs(vx) * 1.5 && ((vy > 0 && (bl.down || tch.down)) || (vy < 0 && (bl.up || tch.up)));
  if (!horiz && !vert) return 0;
  const dx = horiz ? Math.sign(vx) * 2 : 0, dy = vert ? Math.sign(vy) * 2 : 0;
  for (let k = 1; k <= N; k++) for (const sg of [1, -1]) {
    const ox = vert ? sg * k : 0, oy = horiz ? sg * k : 0;
    if (!solidAt(s, b.x + ox, b.y + oy, b.width, b.height) && !solidAt(s, b.x + ox + dx, b.y + oy + dy, b.width, b.height)) {
      const st = Math.min(k, F.cornerStep) * sg; if (vert) p.x += st; else p.y += st; (p as any).corrections = ((p as any).corrections ?? 0) + 1; return st;
    }
  }
  return 0;
}
/** camera look-ahead: follow offset eases toward the movement direction */
export function cameraLead(scene: any, baseY: number, riding: boolean) {
  const cam = scene.cameras.main, v = scene.player.body.velocity, L = riding ? F.camLeadBike : F.camLead, sp = Math.max(1, v.length());
  const tx = sp > 10 ? -(v.x / sp) * L * Math.min(1, sp / 60) : 0, ty = sp > 10 ? -(v.y / sp) * L * Math.min(1, sp / 60) : 0;
  const o = cam.followOffset; cam.setFollowOffset(o.x + (tx - o.x) * F.camLerp, o.y + (baseY + ty - o.y) * F.camLerp);
}
(window as any).tgFeel = F;
