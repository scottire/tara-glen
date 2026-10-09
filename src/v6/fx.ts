// Shared scene helpers: balloon projectile, room/zone lookup, darkness texture.
import Phaser from 'phaser';
import { G, S, toast, DIRV, type Player, type Character } from '../mech/core';
import { count, changed } from './logic';

export function throwBalloon(scene: Phaser.Scene, player: Player, walls: any[], targets: Character[]) {
  if (G.paused || player.busy || !count('throw')) return;
  if (!count('balloons')) return toast(S('noAmmo'));
  G.st.items.balloons--; changed();
  const aim = (scene as any).combat?.aim?.(), [vx, vy] = aim !== undefined ? [Math.cos(aim), Math.sin(aim)] : DIRV[player.facing], speed = 190;
  const b = scene.physics.add.image(player.x + vx * 8, player.y + vy * 8, 'balloon').setDepth(player.depth + 1);
  b.setVelocity(vx * speed, vy * speed).setAngularVelocity(360);
  const pop = () => { if (!b.active) return; const p = scene.add.circle(b.x, b.y, 3, 0x7fc8ff, 0.8).setDepth(b.depth);
    scene.tweens.add({ targets: p, scale: 3, alpha: 0, duration: 250, onComplete: () => p.destroy() }); b.destroy(); };
  scene.physics.add.collider(b, walls, pop);
  scene.physics.add.overlap(b, targets.filter((t) => t.active), (_b, t) => { const c = t as any; if (c.hitBy) c.hitBy(null, G.w.player.balloonDamage, 160, false, b); else c.hurt(b, G.w.player.balloonDamage, 160); pop(); });
  scene.time.delayedCall(700, pop);
}
export function zoneAt(tx: number, ty: number) {
  return G.w.zones.find((z: any) => z.rects.some((r: number[]) => tx >= r[0] && tx <= r[2] && ty >= r[1] && ty <= r[3]));
}
/** black canvas with a soft hole in the middle (torchlight); drawn following the player in dark rooms */
export function darkTexture(scene: Phaser.Scene, radius: number) {
  const key = 'dark' + radius; if (scene.textures.exists(key)) return key;
  const w = 1200, h = 1800, c = scene.textures.createCanvas(key, w, h)!, ctx = c.getContext();
  ctx.fillStyle = 'rgba(4,4,10,0.97)'; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  const g = ctx.createRadialGradient(w / 2, h / 2, radius * 0.35, w / 2, h / 2, radius);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2); ctx.fill();
  c.refresh(); return key;
}
