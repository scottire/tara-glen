// Data-driven pickups (collectible / note / ability / ammo / chest), ammo projectiles, HUD, and the Rex dialog box.
// Chest + inventory flow adapted from Wispguard (devshareacademy, MIT).
import Phaser from 'phaser';
import TextBox from 'phaser4-rex-plugins/templates/ui/textbox/TextBox.js';
import RoundRectangle from 'phaser4-rex-plugins/plugins/roundrectangle.js';
import { G, $, S, toast, persist, DIRV, type Player, type Character } from './core';

const SPRITE: Record<string, string> = { note: 'note', collectible: 'shell', ammo: 'balloon', ability: 'trainers' };

export function grant(g: any) {
  const inv = G.st.inv, M = G.mech;
  if (g.ammo) { const a = M.ammo[g.ammo]; inv.ammo[g.ammo] = Math.min(a.max, (inv.ammo[g.ammo] ?? 0) + g.amount); toast(S('gotAmmo', { n: g.amount, name: a.name })); }
  if (g.item) { inv.items[g.item] = (inv.items[g.item] ?? 0) + 1; toast(S('gotItem', { name: M.items[g.item].name.replace(/s$/, ''), n: inv.items[g.item] })); }
  if (g.ability && !inv.abilities.includes(g.ability)) { inv.abilities.push(g.ability); toast(S('gotAbility', { name: M.abilities[g.ability].name })); }
  persist(); hud();
}
export const has = (ability: string) => G.st.inv.abilities.includes(ability);

/** Place pickup `id` at x,y (pixel centre). Walk into it to collect; chests are solid and open on contact. */
export function spawnPickup(scene: Phaser.Scene, id: string, x: number, y: number, player: Player) {
  const def = G.mech.pickups[id]; if (!def) return console.warn('unknown pickup', id);
  const got = G.st.inv.got.includes(id);
  if (def.kind === 'chest') {
    const c = scene.physics.add.staticImage(x, y, 'chest', got ? 1 : 0).setDepth(y + 8);
    (c.body as Phaser.Physics.Arcade.StaticBody).setSize(14, 10).setOffset(1, 5);
    scene.physics.add.collider(player, c, () => {
      if (G.st.inv.got.includes(id)) return;
      G.st.inv.got.push(id); c.setFrame(1); scene.tweens.add({ targets: c, y: y - 2, duration: 90, yoyo: true });
      (def.contents ?? []).forEach((g: any, i: number) => scene.time.delayedCall(i * 600, () => grant(g)));
      if (def.text) scene.time.delayedCall(300, () => say(def.text));
      persist();
    });
    return c;
  }
  if (got) return;
  const img = scene.physics.add.staticImage(x, y, def.sprite ?? SPRITE[def.kind]).setDepth(y + 6);
  const bob = scene.tweens.add({ targets: img, y: y - 2, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  scene.physics.add.overlap(player, img, () => {
    if (!img.active) return; bob.remove(); img.destroy();
    G.st.inv.got.push(id);
    if (def.kind === 'note') say(def.text);
    else grant(def.kind === 'collectible' ? { item: def.item } : def.kind === 'ammo' ? { ammo: def.ammo, amount: def.amount } : { ability: def.ability });
    persist();
  });
  return img;
}

/** Throw one unit of ammo in the facing direction; splashes on walls, damages targets. */
export function fire(scene: Phaser.Scene, player: Player, walls: any[], targets: Character[], kind = 'balloon') {
  if (G.paused || player.busy) return;
  const inv = G.st.inv, a = G.mech.ammo[kind];
  if (!inv.ammo[kind]) return toast(S('noAmmo'));
  inv.ammo[kind]--; persist(); hud();
  const [vx, vy] = DIRV[player.facing];
  const b = scene.physics.add.image(player.x + vx * 8, player.y + vy * 8, 'balloon').setDepth(player.depth + 1);
  b.setVelocity(vx * a.speed, vy * a.speed).setAngularVelocity(360);
  const pop = () => { if (!b.active) return; const p = scene.add.circle(b.x, b.y, 3, 0x7fc8ff, 0.8).setDepth(b.depth);
    scene.tweens.add({ targets: p, scale: 3, alpha: 0, duration: 250, onComplete: () => p.destroy() }); b.destroy(); };
  scene.physics.add.collider(b, walls, pop);
  scene.physics.add.overlap(b, targets.filter((t) => t.active), (_b, t) => { (t as Character).hurt(b, a.damage, 160); pop(); });
  scene.time.delayedCall(a.lifeMs, pop);
}

export function hud() {
  const st = G.st, M = G.mech; if (!M.player) return;
  $('hearts').textContent = Array.from({ length: M.player.health }, (_, i) => (i < st.hp ? '❤️' : '🤍')).join('');
  $('abilities').textContent = st.inv.abilities.map((k) => M.abilities[k]?.icon ?? '').join('');
  $('items').textContent = Object.entries(st.inv.items).map(([k, n]) => `${M.items[k]?.icon ?? k} ${n}`).join(' ');
  const kind = 'balloon', f = $('fire');
  f.style.display = kind in st.inv.ammo ? 'flex' : 'none';
  f.innerHTML = `${M.ammo[kind].icon}<small>${st.inv.ammo[kind] ?? 0}</small>`;
  f.classList.toggle('empty', !st.inv.ammo[kind]);
}

// ---------- dialog: Rex TextBox (typewriter, paged) in an unzoomed overlay scene ----------
export class UI extends Phaser.Scene {
  box?: any; closing = 0;
  constructor() { super({ key: 'UI', active: true }); }
  create() {
    const adv = () => this.advance();
    this.input.on('pointerdown', adv);
    this.input.keyboard!.on('keydown-SPACE', adv); this.input.keyboard!.on('keydown-ENTER', adv);
  }
  say(lines: string[]) {
    this.box?.destroy(); G.paused = true;
    const dpr = 1 / this.scale.zoom, W = Math.min(this.scale.width - 24 * dpr, 520 * dpr), fs = Math.round(15 * dpr);
    const bg = this.add.existing(new RoundRectangle(this, 0, 0, 2, 2, 10 * dpr, 0x1b2230, 0.94)) as any;
    bg.setStrokeStyle(3 * dpr, 0xf4e7c5);
    const text = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: fs + 'px', color: '#ffffff', lineSpacing: 4 * dpr,
      wordWrap: { width: W - 32 * dpr }, fixedWidth: W - 32 * dpr, fixedHeight: (fs + 4 * dpr) * 3 + 8 * dpr, maxLines: 3 });
    const icon = this.add.text(0, 0, '▼', { fontSize: fs + 'px', color: '#f4e7c5' });
    const box = new TextBox(this, { x: this.scale.width / 2, y: this.scale.height - 16 * dpr, background: bg, text, action: icon,
      space: { left: 16 * dpr, right: 16 * dpr, top: 12 * dpr, bottom: 12 * dpr, text: 8 * dpr }, page: { maxLines: 3 }, type: { speed: 28 } } as any);
    this.add.existing(box as any); box.setOrigin(0.5, 1).layout();
    icon.setVisible(false);
    box.on('pageend', () => { icon.setVisible(true); this.tweens.add({ targets: icon, y: '+=4', duration: 300, yoyo: true, repeat: -1 }); });
    box.on('type', () => icon.setVisible(false));
    box.start(lines.join('\f\n'), 28);
    this.box = box; this.scene.bringToTop();
  }
  advance() {
    const b = this.box; if (!b) return;
    if (b.isTyping) b.stop(true);
    else if (!b.isLastPage) b.typeNextPage();
    else { b.destroy(); this.box = undefined; this.time.delayedCall(150, () => (G.paused = false)); }
  }
}
export const say = (lines: string[]) => (G as any).ui?.say(lines);
