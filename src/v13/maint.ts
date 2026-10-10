// v13 zone-one boss: the Maintenance Man (177). Three phases, all telegraphed, all cute:
//   sweeper - plods after you with a sweeping brush; a slow wide sweep in front. The brush blocks hits from the front: hit him from behind or after a sweep.
//   blower  - keeps a few steps off and runs a leaf blower: a cone that shoves you back (rolling ignores it). Front blocked while blowing; get round the side.
//   lobber  - winded, sits on an upturned bucket and lobs junk (paint tin, traffic cone, roll of bin bags) in slow arcs.
// He never dies: at 0 he gives up and sits down (Enemy.die with stats.yield).
import Phaser from 'phaser';
import { G } from '../mech/core';
import { burst, popup, flash } from '../v9/combat';

const BOSS_AI = new Set(['sweeper', 'blower', 'lobber']);
export const isMaintAi = (ai: string) => BOSS_AI.has(ai);
const ang = (a: number, b: number) => Math.abs(Phaser.Math.Angle.Wrap(a - b));

export function maintTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists('v13-junk')) return;
  const src = scene.textures.get('v13-junk'); if (src.has('j0')) return;
  for (let i = 0; i < 3; i++) src.add('j' + i, 0, i * 8, 0, 8, 8);
}

/** front guard: true if the hit should be blocked */
export function maintGuard(en: any, from: { x: number; y: number }) {
  const ai = en.ai; if (ai !== 'sweeper' && ai !== 'blower') return false;
  if (en.mode === 'recover' || en.mode === 'dizzy') return false; // open after a sweep / blow
  const toHit = Phaser.Math.Angle.Between(en.x, en.y, from.x, from.y);
  if (ang(toHit, en.dir) < 1.0) { flash(en, 0xd6f0ff, 80); popup(en.scene, en.x, en.y - 10, ai === 'sweeper' ? 'BRUSH!' : 'WHOOSH', '#d6f0ff'); burst(en.scene, from.x, from.y, 0xd8c8a0, 4, 20); return true; }
  return false;
}

/** per-frame AI for the three phases; returns after handling movement/attacks */
export function maintThink(en: any, dt: number, d: number) {
  const tg = en.target, ai = en.ai, sc = en.scene as Phaser.Scene;
  const g = en.tele ?? (en.tele = sc.add.graphics()); g.setDepth(en.y - 1);
  en.mt -= dt;
  const face = () => { en.dir = Phaser.Math.Angle.Between(en.x, en.y, tg.x, tg.y); };
  if (ai === 'lobber') {
    en.setVelocity(0, 0); g.clear();
    if (!en.seatT) { en.seatT = 1; popup(sc, en.x, en.y - 14, '*wheeze*', '#fff'); en.setAngle(0); }
    if (en.mode !== 'windup' && en.mt <= 0) { en.mode = 'windup'; en.mt = 650; en.mt0 = 650; face(); }
    if (en.mode === 'windup') {
      const k = 1 - Math.max(0, en.mt) / en.mt0; g.lineStyle(1, 0xffe08a, 0.4 + 0.5 * k).strokeCircle(tg.x, tg.y + 4, 12 - 6 * k);
      if (en.mt <= 0) { lob(en, tg.x, tg.y); en.mode = 'move'; en.mt = 1500 - en.phase * 100; g.clear(); }
    }
    return;
  }
  if (en.mode === 'windup') {
    const k = 1 - Math.max(0, en.mt) / en.mt0; g.clear();
    if (ai === 'sweeper') { g.fillStyle(0xff5030, 0.12 + 0.25 * k).beginPath().slice(en.x, en.y + 4, 34, en.dir - 1.2, en.dir + 1.2).fillPath(); g.lineStyle(1, 0xffffff, 0.6).beginPath().arc(en.x, en.y + 4, 34 * k, en.dir - 1.2, en.dir + 1.2).strokePath(); }
    else { g.fillStyle(0x9fd8ff, 0.1 + 0.2 * k).beginPath().slice(en.x, en.y + 4, 80, en.dir - 0.45, en.dir + 0.45).fillPath(); }
    if (en.mt <= 0) { en.mode = 'attack'; en.mt = ai === 'sweeper' ? 260 : 1500; en.hitDone = false; }
    return;
  }
  if (en.mode === 'attack') {
    g.clear();
    const pa = Phaser.Math.Angle.Between(en.x, en.y, tg.x, tg.y);
    if (ai === 'sweeper') { // the brush swings across the arc; one hit
      const k = 1 - Math.max(0, en.mt) / 260, a = en.dir - 1.2 + 2.4 * k;
      g.lineStyle(4, 0xc9a06a, 0.9).lineBetween(en.x, en.y + 2, en.x + Math.cos(a) * 30, en.y + 2 + Math.sin(a) * 30);
      if (!en.hitDone && d < 36 && ang(pa, en.dir) < 1.25 && !tg.dashing) { en.hitDone = true; tg.hurt(en, en.s.dmg, 170); }
      if (en.mt <= 0) { en.mode = 'recover'; en.mt = 1000; popup(sc, en.x, en.y - 12, 'huff', '#fff'); burst(sc, en.x + Math.cos(en.dir) * 20, en.y + Math.sin(en.dir) * 20, 0xd8c8a0, 6, 30); }
    } else { // leaf blower: cone push, leaves fly
      en.dir += Phaser.Math.Angle.Wrap(pa - en.dir) * 0.02; // slowly tracks you
      g.fillStyle(0x9fd8ff, 0.18).beginPath().slice(en.x, en.y + 4, 80, en.dir - 0.45, en.dir + 0.45).fillPath();
      if (Math.random() < 0.5) { const l = sc.add.image(en.x + Math.cos(en.dir) * 10, en.y + Math.sin(en.dir) * 10, 'fx-dot').setTint(Math.random() < 0.5 ? 0xd8a040 : 0x7fb040).setDepth(9e4).setScale(0.7);
        const r = 50 + Math.random() * 30, aa = en.dir + (Math.random() - 0.5) * 0.8; sc.tweens.add({ targets: l, x: en.x + Math.cos(aa) * r, y: en.y + Math.sin(aa) * r, alpha: 0, angle: 180, duration: 450, onComplete: () => l.destroy() }); }
      if (d < 82 && ang(pa, en.dir) < 0.5 && !tg.dashing && !tg.busy) { const b = tg.body as Phaser.Physics.Arcade.Body; b.velocity.x += Math.cos(en.dir) * 40; b.velocity.y += Math.sin(en.dir) * 40; (tg as any).blown = ((tg as any).blown ?? 0) + 1; }
      if (en.mt <= 0) { en.mode = 'recover'; en.mt = 900; popup(sc, en.x, en.y - 12, '*splutter*', '#fff'); }
    }
    return;
  }
  if (en.mode === 'recover') { g.clear(); en.setVelocity(0, 0); if (en.mt <= 0) en.mode = 'move'; return; }
  // move
  g.clear(); face();
  const spd = en.s.chase * (1 + en.phase * 0.15), want = ai === 'sweeper' ? 26 : 56;
  if (d > want + 6) en.approach(spd); else if (d < want - 14 && ai === 'blower') en.toward(-spd); else en.setVelocity(0, 0);
  if (d < want + 14 && (en.t -= dt) <= 0) { en.mode = 'windup'; en.mt = en.mt0 = ai === 'sweeper' ? 700 : 600; en.t = ai === 'sweeper' ? 700 : 1300; en.setVelocity(0, 0); face(); }
  en.anim();
}

/** a slow lobbed bit of junk: arcs to where you stood, lands with a puff; hurts if you're still there */
function lob(en: any, tx: number, ty: number) {
  const sc = en.scene as Phaser.Scene, f = Math.floor(Math.random() * 3), names = ['paint tin', 'traffic cone', 'roll of bin bags'];
  maintTextures(sc);
  const o = sc.add.image(en.x, en.y - 8, 'v13-junk', 'j' + f).setDepth(9e4), sh = sc.add.ellipse(tx, ty + 6, 10, 4, 0x000000, 0.3).setDepth(ty);
  const dur = 900; let t = 0;
  const ev = sc.time.addEvent({ delay: 16, loop: true, callback: () => {
    t += 16; const k = Math.min(1, t / dur); o.x = en.x + (tx - en.x) * k; o.y = (en.y - 8) + (ty - en.y + 8) * k - Math.sin(k * Math.PI) * 40; o.angle += 12;
    if (k >= 1) { ev.remove(); o.destroy(); sh.destroy(); burst(sc, tx, ty + 4, 0xd8c8a0, 6, 25);
      const p = en.target; if (p.active && Phaser.Math.Distance.Between(p.x, p.y, tx, ty) < 12 && !p.dashing) p.hurt({ x: tx, y: ty - 4 }, en.s.dmg, 120); }
  } });
  if (Math.random() < 0.3) popup(sc, en.x, en.y - 16, names[f] + '!', '#fff');
  void G;
}
