// v12 per-zone vibe: colour grade + time of day (one camera-following overlay, cross-faded), Clubhouse night torchlight,
// enemy families, signature props and pooled ambient particles. Cheap by design: 1 grade rect, 1 darkness image, <=1 live emitter.
import Phaser from 'phaser';
import { G } from '../mech/core';
import { flag } from './logic';
import { zoneAt, darkTexture } from './fx';
import { audio } from '../audio';

type Grade = { c: number; a: number };
export const VIBES: Record<string, { name: string; day: Grade; eve: Grade; tod: string }> = {
  z1: { name: 'Glen Top', tod: 'summer morning', day: { c: 0xffd49a, a: 0.12 }, eve: { c: 0x101a50, a: 0.5 } },
  z2: { name: 'Playground Row', tod: 'bright midday', day: { c: 0xfff6d0, a: 0.03 }, eve: { c: 0x101a50, a: 0.5 } },
  z3: { name: 'The Crescent', tod: 'grey afternoon', day: { c: 0x56604c, a: 0.24 }, eve: { c: 0x0c1440, a: 0.55 } },
  z4: { name: 'The Links', tod: 'breezy afternoon', day: { c: 0xc8ff9a, a: 0.07 }, eve: { c: 0x101a50, a: 0.5 } },
  z5: { name: 'Eighteen', tod: 'hot match-day afternoon', day: { c: 0xffa040, a: 0.2 }, eve: { c: 0x1a1850, a: 0.5 } },
  z6: { name: 'The Clubhouse', tod: 'night', day: { c: 0x1a2470, a: 0.4 }, eve: { c: 0x0a1040, a: 0.3 } },
  z7: { name: 'The Strand', tod: 'sunset', day: { c: 0xff7030, a: 0.24 }, eve: { c: 0xff5a2a, a: 0.3 } },
};
/** an enemy family per zone: recolour + a behaviour tweak; the stat ramp (tiers) is untouched */
export const FAMILIES: Record<string, { name: string; tint: number; sight: number; pack?: number; hidden?: boolean }> = {
  z1: { name: 'Fluffballs (sleepy: notice you late)', tint: 0xfff0d8, sight: 0.8 },
  z2: { name: 'Dust bunnies (swarm: one spots you, the pack wakes)', tint: 0xffe24a, sight: 1, pack: 70 },
  z3: { name: 'Weedlings (lurk in the weeds: short sight)', tint: 0x98b07a, sight: 0.7 },
  z4: { name: 'Links pests (open ground: see you from afar, and you them)', tint: 0xc8ffb0, sight: 1.4 },
  z5: { name: 'Supporters (rowdy groups wake together)', tint: 0xff9a8a, sight: 1.1, pack: 110 },
  z6: { name: 'Night things (only in your torchlight)', tint: 0x8c9cff, sight: 1, hidden: true },
  z7: { name: 'Strand crabs (sunset)', tint: 0xffb070, sight: 1 },
};
export function familyOf(e: any) {
  const z = e.room ? G.w.rooms?.[e.room]?.zone : zoneAt(Math.floor(e.x / 16), Math.floor(e.y / 16))?.id;
  return z ? { zone: z, ...FAMILIES[z] } : null;
}

const TORCH = 78;
export class Vibe {
  grade: Phaser.GameObjects.Rectangle; dark: Phaser.GameObjects.Image; cur = { r: 255, g: 255, b: 255, a: 0 }; darkA = 0;
  emitters: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {}; view = new Phaser.Geom.Rectangle(0, 0, 400, 700);
  zone = ''; t = 0; windows: Phaser.GameObjects.Arc[] = [];
  constructor(public s: any) {
    const sc = s as Phaser.Scene;
    this.grade = sc.add.rectangle(0, 0, 1400, 2000, 0xffffff, 0).setDepth(9e5);
    this.dark = sc.add.image(0, 0, darkTexture(sc, TORCH)).setDepth(9e5 + 0.5).setAlpha(0).setVisible(false);
    this.textures(); this.particles(); this.props();
  }
  textures() {
    const sc = this.s as Phaser.Scene, g = sc.make.graphics({}, false);
    const mk = (k: string, f: () => void, w: number, h: number) => { if (sc.textures.exists(k)) return; g.clear(); f(); g.generateTexture(k, w, h); };
    mk('vx-dot', () => g.fillStyle(0xffffff).fillRect(0, 0, 2, 2), 2, 2);
    mk('vx-leaf', () => { g.fillStyle(0xffffff).fillRect(0, 1, 3, 1); g.fillRect(1, 0, 1, 1); }, 3, 2);
    mk('vx-fly', () => { g.fillStyle(0xffffff).fillRect(0, 0, 2, 2); g.fillRect(3, 0, 2, 2); g.fillStyle(0x333333).fillRect(2, 0, 1, 3); }, 5, 3);
    mk('vx-soft', () => { for (let r = 6; r > 0; r--) { g.fillStyle(0xffffff, 0.12).fillCircle(6, 6, r); } }, 12, 12);
    g.destroy();
  }
  particles() {
    const sc = this.s as Phaser.Scene, low = sc.sys.game.device.os.desktop ? 1 : 0.6;
    const zone = { type: 'random', source: this.view } as any;
    const mk = (z: string, tex: string, cfg: any) => {
      const em = sc.add.particles(0, 0, tex, { emitZone: zone, emitting: false, ...cfg, frequency: cfg.frequency / low, maxParticles: Math.ceil((cfg.maxParticles ?? 20) * low) });
      em.setDepth(9e5 + 2); this.emitters[z] = em; };
    mk('z1', 'vx-fly', { tint: [0xfff080, 0xffffff, 0xa8d8ff, 0xffb0d0], speedX: { min: -14, max: 14 }, speedY: { min: -10, max: 6 }, lifespan: 5000, frequency: 700, alpha: { start: 1, end: 0 }, maxParticles: 10 });
    mk('z2', 'vx-leaf', { tint: [0xff4040, 0x40a0ff, 0xffe040], speedX: { min: -8, max: 8 }, speedY: { min: 6, max: 16 }, rotate: { min: 0, max: 360 }, lifespan: 4000, frequency: 900, alpha: { start: 0.9, end: 0 }, maxParticles: 8 });
    mk('z3', 'vx-dot', { tint: 0xb0a890, speedX: { min: 4, max: 14 }, speedY: { min: -2, max: 4 }, lifespan: 5000, frequency: 600, alpha: { start: 0.6, end: 0 }, maxParticles: 10 });
    mk('z4', 'vx-leaf', { tint: [0x9adf5a, 0x6fbf3a, 0xd8f0a0], speedX: { min: 40, max: 75 }, speedY: { min: -6, max: 10 }, rotate: { min: 0, max: 360 }, lifespan: 4500, frequency: 260, alpha: { start: 1, end: 0.2 }, maxParticles: 24 });
    mk('z5', 'vx-soft', { tint: 0xffd890, speedX: { min: 2, max: 8 }, speedY: { min: -3, max: 3 }, scale: { min: 2, max: 4 }, lifespan: 7000, frequency: 500, alpha: { start: 0, end: 0.35, ease: 'Sine.easeInOut' }, maxParticles: 14 });
    mk('z6', 'vx-dot', { tint: 0xd8ff70, blendMode: 'ADD', speedX: { min: -8, max: 8 }, speedY: { min: -8, max: 8 }, lifespan: 4000, frequency: 450, alpha: { values: [0, 1, 0.2, 1, 0] }, maxParticles: 12 });
    mk('z7', 'vx-dot', { tint: [0xffffff, 0xd8f4ff, 0xffd0a0], speedX: { min: -10, max: 10 }, speedY: { min: -26, max: -8 }, lifespan: 1800, frequency: 160, alpha: { start: 0.9, end: 0 }, maxParticles: 24 });
  }
  /** pick open outdoor tiles inside a zone, seeded, spread out */
  spots(z: string, n: number, gap = 10, seed = 7) {
    const W = G.w.mapW, Z = G.w.zoneGrid, H = Z.length / W, k = +z.slice(1), [ground, objects] = (this.s as any).walls ?? [], out: [number, number][] = [];
    let r = seed; const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 4000 && out.length < n; i++) {
      const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
      if (+Z[y * W + x] !== k || +Z[y * W + x + 3] !== k) continue;
      if (ground?.getTileAt(x, y)?.collides || objects?.getTileAt(x, y)?.collides || objects?.getTileAt(x + 3, y)) continue;
      if (G.w.doors.some((d: any) => Math.abs(d.x / 16 - x) < 4 && Math.abs(d.y / 16 - y) < 4)) continue;
      if (out.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < gap)) continue;
      out.push([x, y]); }
    return out;
  }
  props() {
    // static props are baked once into small textures and placed as images (Graphics re-tessellates every frame)
    const sc = this.s as Phaser.Scene, g = sc.make.graphics({}, false);
    const bake = (k: string, w: number, h: number, f: () => void) => { if (!sc.textures.exists(k)) { g.clear(); f(); g.generateTexture(k, w, h); } };
    bake('vx-bunting', 60, 28, () => { g.lineStyle(1, 0x553322, 1).lineBetween(2, 2, 58, 6); g.fillStyle(0x553322).fillRect(1, 2, 2, 26).fillRect(57, 6, 2, 22);
      for (let i = 0; i < 7; i++) { const px = 5 + i * 7.5, py = 2 + (i * 4) / 7; g.fillStyle([0xe03030, 0xffffff, 0x2a60d0, 0xf0d020][i % 4]).fillTriangle(px, py, px + 6, py, px + 3, py + 6); } });
    bake('vx-flag', 12, 24, () => { g.fillStyle(0xeeeeee).fillRect(1, 2, 1, 20); g.fillStyle(0xe02020).fillTriangle(2, 2, 11, 5, 2, 8); g.fillStyle(0x222222).fillEllipse(2, 22, 5, 2); });
    bake('vx-bunker', 32, 14, () => { g.fillStyle(0xc9b67a).fillEllipse(16, 7, 32, 14); g.fillStyle(0xeadca4).fillEllipse(16, 6, 28, 10); });
    bake('vx-weeds', 14, 10, () => { for (let i = 0; i < 4; i++) g.lineStyle(1, [0x5a7a30, 0x6a8a3a, 0x7a6a30][i % 3], 1).lineBetween(2 + i * 3, 10, 2 + i * 3 + (i % 2 ? 2 : -2), 4 - (i % 3) * 2 + 2); });
    bake('vx-swingframe', 40, 30, () => { g.lineStyle(2, 0xd02828).lineBetween(2, 29, 6, 2).lineBetween(38, 29, 34, 2).lineBetween(6, 2, 34, 2); });
    bake('vx-swing', 8, 24, () => { g.fillStyle(0x999999).fillRect(3, 0, 1, 21); g.fillStyle(0x2a60d0).fillRect(0, 21, 8, 2); });
    g.destroy();
    for (const [x, y] of this.spots('z5', 6, 9, 11)) sc.add.image(x * 16, y * 16 - 12, 'vx-bunting').setOrigin(0, 0).setDepth(y * 16 + 18);
    for (const [x, y] of this.spots('z4', 5, 14, 5)) { sc.add.image(x * 16 + 26, y * 16 + 12, 'vx-bunker').setDepth(1); sc.add.image(x * 16 + 8, y * 16 + 10, 'vx-flag').setOrigin(0.1, 0.95).setDepth(y * 16 + 10); }
    for (const [x, y] of this.spots('z3', 40, 4, 3)) sc.add.image(x * 16 + 8, y * 16 + 10, 'vx-weeds').setDepth(2);
    for (const [x, y] of this.spots('z2', 2, 20, 9)) { const X = x * 16, Y = y * 16; sc.add.image(X, Y - 10, 'vx-swingframe').setOrigin(0, 0).setDepth(Y + 20);
      for (const sx of [14, 26]) sc.tweens.add({ targets: sc.add.image(X + sx, Y - 8, 'vx-swing').setOrigin(0.5, 0).setDepth(Y + 21), angle: { from: -18, to: 18 }, duration: 900 + sx * 20, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); }
    const club = G.w.doors.find((d: any) => d.room === 'clubhouse');
    if (club) for (const dx of [-40, -24, 24, 40]) this.windows.push(sc.add.circle(club.x + dx, club.y - 14, 12, 0xffd890, 0.35).setDepth(9e5 + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
  }
  update(dt: number) {
    const s = this.s, p = s.player, cam = (s as Phaser.Scene).cameras.main, m = cam.midPoint, v = cam.worldView;
    const z = zoneAt(Math.floor(p.x / 16), Math.floor(p.y / 16))?.id ?? this.zone ?? 'z1', eve = flag('evening');
    if (z !== this.zone) { this.zone = z; for (const [k, em] of Object.entries(this.emitters)) em.emitting = k === z; audio.zone(z, eve); }
    const vb = VIBES[z], tgt = eve ? vb.eve : vb.day, k = 1 - Math.exp(-dt / 700);
    const c = this.cur; c.r += (((tgt.c >> 16) & 255) - c.r) * k; c.g += (((tgt.c >> 8) & 255) - c.g) * k; c.b += ((tgt.c & 255) - c.b) * k; c.a += (tgt.a - c.a) * k;
    this.grade.setVisible(c.a > 0.01).setPosition(m.x, m.y).setFillStyle((Math.round(c.r) << 16) | (Math.round(c.g) << 8) | Math.round(c.b), c.a);
    this.view.setTo(v.x - 8, v.y - 8, v.width + 16, v.height + 16);
    // Clubhouse night: torchlight darkness, windows glow, night things only show inside the torch
    const want = z === 'z6' && eve ? 0.92 : 0; this.darkA += (want - this.darkA) * k;
    this.dark.setVisible(this.darkA > 0.01).setPosition(p.x, p.y).setAlpha(this.darkA);
    this.windows.forEach((w) => w.setVisible(eve));
    if ((this.t += dt) > 100) { this.t = 0;
      for (const e of s.enemies ?? []) { if (!e.active || !e.fam?.hidden) continue;
        const d = Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y), lit = eve ? Phaser.Math.Clamp((TORCH + 10 - d) / 40, 0.06, 1) : 1;
        e.setAlpha(lit); e.shield?.setVisible(lit > 0.5); } }
  }
}
