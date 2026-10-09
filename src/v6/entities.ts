// Spawns everything from world.json for one scene (outdoors or a room): pickups, chests, notes, vistas, interactables,
// activities, hiders, whispers, room doors, NPCs (scheduled), enemies, decor, ambient walkers. Handles the A-button prompt.
import Phaser from 'phaser';
import { G, $, S, toast, persist, DIRS, ensureAnims, type Player } from '../mech/core';
import type { Pather } from '../mech/path';
import { cond, apply, changed, count, give, onChange } from './logic';
import { say } from './ui';
import { Enemy } from './enemies';
import { ensureFxTextures, burst } from '../v9/combat';

export interface Host extends Phaser.Scene {
  player: Player; walls: any[]; roomId: string | null; pather?: Pather; enemies: Enemy[];
  startActivity(e: any): void; goRoom(id: string): void; onEnemyDeath?(e: Enemy): void;
}
type Thing = { kind: string; e: any; obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image; label?: string; walker?: Walker; glint?: Phaser.GameObjects.Image; bubble?: Phaser.GameObjects.Image };
const heard = new Set<string>(); // talk entries already heard this session (bubble goes quiet)
const charBase = (n: number) => (n - 1) * 16;
export function charAnims(scene: Phaser.Scene, n: number) { ensureAnims(scene, 'chars', `c${n}-`, charBase(n), 6); }
export const itemFrame = (sprite?: string) => Math.max(0, G.w.itemSprites.indexOf(sprite ?? 'parcel'));

export class Ents {
  things: Thing[] = []; npcs: Thing[] = []; near: Thing | null = null; off: () => void; excl!: Phaser.GameObjects.Image; cullT = 0;
  constructor(public h: Host) {
    ensureFxTextures(h);
    this.excl = h.add.image(0, 0, 'fx-excl').setDepth(9.6e5).setVisible(false);
    h.tweens.add({ targets: this.excl, scale: 1.2, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.spawn();
    this.off = onChange(() => this.refresh());
    h.events.once('shutdown', () => this.off()); h.events.once('destroy', () => this.off());
  }
  here(e: any) { return (e.room ?? null) === this.h.roomId; }
  spawn() {
    const h = this.h, st = G.st;
    for (const e of G.w.entities) {
      if (!this.here(e)) continue;
      const got = st.got.includes(e.id);
      if (e.type === 'enemy') { if (e.stats.boss && (got || st.defeated.includes(e.id))) continue; if (e.room && !e.stats.boss && st.flags.includes('clear:' + e.room)) continue; this.enemy(e); continue; }
      if (got && !['chest', 'note', 'vista', 'interact', 'activity', 'decor', 'door'].includes(e.type)) continue;
      if (got && (e.type === 'interact' || e.type === 'activity')) continue;
      let obj: Thing['obj'];
      switch (e.type) {
        case 'pickup': obj = h.add.image(e.x, e.y, 'items', itemFrame(G.w.items[e.item]?.sprite));
          h.tweens.add({ targets: obj, y: e.y - 2, duration: 600 + Math.random() * 200, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); break;
        case 'chest': obj = h.physics.add.staticImage(e.x, e.y, 'chest', got ? 1 : 0); (obj.body as Phaser.Physics.Arcade.StaticBody).setSize(14, 10).setOffset(1, 5);
          h.physics.add.collider(h.player, obj); break;
        case 'note': obj = h.add.image(e.x, e.y, 'items', itemFrame('note')); break;
        case 'vista': case 'whisper': obj = h.add.sprite(e.x, e.y, 'd-sparkle').play('d-sparkle'); break;
        case 'interact': obj = h.add.image(e.x, e.y - 4, 'd-' + (e.kind === 'hook' ? 'whitethorn' : 'tap')); break;
        case 'activity': obj = h.add.image(e.x, e.y, 'spot'); h.tweens.add({ targets: obj, scale: 1.3, alpha: 0.6, angle: 45, duration: 800, yoyo: true, repeat: -1 }); break;
        case 'hider': obj = h.add.sprite(e.x, e.y, 'd-bush').play('d-bush'); break;
        case 'door': obj = h.physics.add.staticImage(e.x, e.y, 'interior6', 29); h.physics.add.collider(h.player, obj, () => this.use({ kind: 'door', e, obj })); break;
        case 'decor': obj = h.add.sprite(e.x, e.y + 8, 'd-' + e.sprite).setOrigin(0.5, 1); if (G.w.decorAnim?.includes(e.sprite) || e.sprite === 'bonfire') (obj as Phaser.GameObjects.Sprite).play('d-' + e.sprite); break;
        default: continue;
      }
      obj.setDepth(e.y + 6);
      const t: Thing = { kind: e.type, e, obj }; this.things.push(t);
      // v9 attention: everything worth pressing the button for gets a bobbing glint; pickups bounce and shine
      if (['chest', 'interact', 'activity', 'door', 'pickup'].includes(e.type) && !(e.type === 'chest' && got)) this.glint(t, e.type === 'pickup' ? 9 : 14);
      if (e.type === 'pickup') h.tweens.add({ targets: obj, scaleX: 1.12, scaleY: 0.9, duration: 300, yoyo: true, repeat: -1, delay: Math.random() * 600, ease: 'Quad.inOut' });
    }
    for (const [id, n] of Object.entries<any>(G.w.npcs)) {
      const key = n.sprite === 'dog' ? 'dog' : 'chars';
      const o = h.physics.add.staticSprite(0, 0, key, n.sprite === 'dog' ? 0 : charBase(n.sprite));
      if (key === 'dog') o.play('dog-idle'); else { charAnims(h, n.sprite); }
      (o.body as Phaser.Physics.Arcade.StaticBody).setSize(12, 8).setOffset(2, 8);
      h.physics.add.collider(h.player, o);
      const t: Thing = { kind: 'npc', e: { ...n, id }, obj: o };
      t.bubble = h.add.image(0, 0, 'fx-bubble').setVisible(false);
      h.tweens.add({ targets: t.bubble, y: '-=2', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: Math.random() * 500 });
      if (key !== 'dog') h.tweens.add({ targets: o, scaleY: 0.95, duration: 650 + Math.random() * 200, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); // idle breathing
      if (n.prop === 'van') t.label = 'van';
      this.npcs.push(t); this.things.push(t);
      if (n.prop) (t as any).prop = h.physics.add.staticImage(0, 0, 'd-' + n.prop).setOrigin(0.5, 1);
      if ((t as any).prop) h.physics.add.collider(h.player, (t as any).prop);
    }
    this.refresh();
  }
  glint(t: Thing, up: number) {
    const g = this.h.add.image(t.obj.x + 4, t.obj.y - up, 'fx-glint').setDepth(9e4).setBlendMode(Phaser.BlendModes.ADD);
    this.h.tweens.add({ targets: g, y: g.y - 3, alpha: 0.35, scale: 0.6, angle: 45, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: Math.random() * 700 });
    t.glint = g; t.obj.once('destroy', () => g.destroy());
  }
  enemy(e: any) {
    const h = this.h, en = new Enemy(h, e, h.player, h.roomId ? h.pather : undefined);
    if (!en.flying) h.physics.add.collider(en, h.walls);
    h.physics.add.overlap(h.player, en, () => {
      if (!en.active || en.sm.current === 'dead') return;
      if (h.player.dashing) { if (count('skateboard')) en.hitBy(null as any, G.w.player.dashDamage, 200, true, h.player); return; } // dodge = i-frames
      if (en.attacking) h.player.hurt(en, en.s.dmg, G.w.player.knockback); // contact only hurts mid-attack (telegraphed)
    });
    en.onDeath = () => {
      if (e.stats.boss) { G.st.defeated.push(e.id); G.st.got.push(e.id); const lines = apply([...(e.drops ?? []), ...(e.stats.drops ?? [])]); say([...(e.text ?? []), ...lines]); changed(); }
      else if (!e.minion) { const r = Math.random(), hurt = G.st.hp < G.st.maxhp;
        if (r < (hurt ? 0.4 : 0.12)) this.drop(en.x, en.y, 'heart'); else if (r < 0.62) this.drop(en.x, en.y, Math.random() < 0.3 && count('throw') ? 'balloon' : 'coin'); }
      h.onEnemyDeath?.(en);
    };
    h.enemies.push(en); return en;
  }
  drop(x: number, y: number, what: 'heart' | 'balloon' | 'coin') {
    const o = this.h.add.image(x, y, 'items', itemFrame(what)).setDepth(y + 6).setScale(0.75);
    this.h.tweens.add({ targets: o, y: { from: y - 10, to: y }, duration: 380, ease: 'Bounce.out' });
    this.h.time.delayedCall(400, () => o.active && this.h.tweens.add({ targets: o, scale: 0.9, duration: 260, yoyo: true, repeat: -1 }));
    this.things.push({ kind: 'drop', e: { x, y, what }, obj: o });
    this.h.time.delayedCall(9000, () => o.active && this.h.tweens.add({ targets: o, alpha: 0, duration: 600, onComplete: () => o.destroy() }));
  }
  refresh() {
    const h = this.h;
    for (const t of this.things) {
      if (!t.obj.active) continue;
      if (t.kind === 'npc') {
        const p = (t.e.at as any[]).find((a) => cond(a.when)); const show = !!p && (p.room ?? null) === h.roomId;
        t.obj.setVisible(show); (t.obj.body as Phaser.Physics.Arcade.StaticBody).enable = show;
        const entry = show ? (t.e.talk as any[]).find((x) => cond(x.when)) : null, key = entry ? t.e.id + ':' + t.e.talk.indexOf(entry) : '';
        const want = !!entry && (!!entry.effects?.length || !!entry.choices || !heard.has(key));
        t.bubble!.setTexture(entry?.effects?.length || entry?.choices ? 'fx-bubble2' : 'fx-bubble').setVisible(want).setData('want', want);
        if (show) { t.bubble!.setPosition(p.x + 6, p.y - 14).setDepth(9.5e5);
          t.obj.setPosition(p.x, p.y); (t.obj.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject(); t.obj.setDepth(p.y + 8); t.e.x = p.x; t.e.y = p.y; }
        const prop = (t as any).prop as Phaser.Physics.Arcade.Image | undefined;
        if (prop) { prop.setVisible(show); (prop.body as Phaser.Physics.Arcade.StaticBody).enable = show;
          if (show) { prop.setPosition(p.x - 26, p.y + 8).setDepth(p.y + 8); (prop.body as Phaser.Physics.Arcade.StaticBody).setSize(28, 10).setOffset(2, 14); (prop.body as any).updateFromGameObject?.(); } }
        continue;
      }
      let vis = cond(t.e.when);
      if (t.kind === 'whisper') vis = vis && count('walkie') > 0;
      t.obj.setVisible(vis); t.glint?.setVisible(vis && !(t.kind === 'chest' && G.st.got.includes(t.e.id)));
    }
  }
  /** per-frame: pickups by touch, A-prompt for the nearest interactable */
  update() {
    const p = this.h.player; let best: Thing | null = null, bd = 22;
    for (const t of this.things) {
      if (!t.obj.active || !t.obj.visible) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y + 4, t.obj.x, t.obj.y + (t.kind === 'npc' ? 4 : 0));
      if (t.kind === 'pickup' || t.kind === 'drop') { if (Phaser.Math.Distance.Between(p.x, p.y + 2, t.obj.x, t.obj.y) < 14) this.collect(t); continue; }
      if (t.kind === 'decor' && !t.e.lines) continue;
      if (t.kind === 'chest' && G.st.got.includes(t.e.id)) continue;
      if (d < bd) { bd = d; best = t; }
    }
    this.near = best;
    // context button: Attack turns into Interact (hand / speech / play) when something is in range and no threat is close
    const c = (this.h as any).combat, talk = !!best && !G.paused && !(c?.threatNear(48));
    const atk = $('atk'), icon = talk ? ({ npc: '💬', activity: '▶', chest: '🔓', door: '🚪' } as any)[best!.kind] ?? '✋' : '⚔️';
    if (atk.textContent !== icon) { atk.textContent = icon; atk.classList.toggle('talk', talk); }
    this.excl.setVisible(talk);
    if (talk) this.excl.setPosition(best!.obj.x, best!.obj.y - (best!.kind === 'npc' ? 16 : 14));
    if ((this.cullT += 16) > 200) { this.cullT = 0; this.cull(); }
  }
  /** off-screen glints/bubbles are hidden (tweens keep running but nothing is drawn) */
  cull() {
    const v = this.h.cameras.main.worldView, m = 32;
    for (const t of this.things) {
      const o = t.obj; if (!o.active) continue;
      const on = o.x > v.x - m && o.x < v.right + m && o.y > v.y - m && o.y < v.bottom + m;
      if (t.glint) t.glint.setVisible(on && o.visible && !(t.kind === 'chest' && G.st.got.includes(t.e.id)) && !(t.kind === 'interact' && G.st.got.includes(t.e.id)));
      if (t.bubble) t.bubble.setVisible(on && o.visible && !!t.bubble.getData('want'));
    }
  }
  collect(t: Thing) {
    t.obj.destroy();
    if (t.kind === 'drop') { burst(this.h, t.e.x, t.e.y, t.e.what === 'heart' ? 0xff6080 : 0xffe066, 6, 30);
      if (t.e.what === 'heart') { G.st.hp = Math.min(G.st.maxhp, G.st.hp + 1); this.h.player.life.life = G.st.hp; } else if (t.e.what === 'coin') give('coin', 1); else give('balloons', 2); changed(); return; }
    G.st.got.push(t.e.id); give(t.e.item, t.e.n ?? 1);
    if (t.e.text) say(t.e.text);
    changed();
  }
  interact() { if (this.near && !G.paused) this.use(this.near); }
  use(t: Thing) {
    const e = t.e, h = this.h, st = G.st;
    switch (t.kind) {
      case 'npc': return this.talk(e);
      case 'note': case 'vista': return say(e.text);
      case 'decor': return say(e.lines);
      case 'chest':
        if (st.got.includes(e.id)) return;
        st.got.push(e.id); (t.obj as Phaser.GameObjects.Image).setFrame(1); h.tweens.add({ targets: t.obj, y: e.y - 2, duration: 90, yoyo: true });
        say([...(e.text ?? []), ...apply(e.effects)]); return changed();
      case 'interact':
        if (!cond(e.req)) return say([e.locked]);
        if (!(e.effects ?? []).every((x: any) => x.refill)) { st.got.push(e.id); t.obj.setAlpha(0.6); }
        say([...(e.text ?? []), ...apply(e.effects, true)]); return changed();
      case 'whisper':
        st.got.push(e.id); t.obj.destroy(); say(['📻 ' + e.text[0], ...apply(e.effects, true)]); toast('+🪙'); return changed();
      case 'hider': {
        st.got.push(e.id); t.obj.destroy(); give('kids', 1, true);
        const kid = h.add.sprite(e.x, e.y, 'chars', charBase(e.sprite)).setDepth(e.y + 9);
        h.tweens.add({ targets: kid, y: e.y - 10, duration: 220, yoyo: true, onComplete: () => h.tweens.add({ targets: kid, alpha: 0, delay: 1200, duration: 400, onComplete: () => kid.destroy() }) });
        say([e.text[0], S('found', { n: count('kids') })]); return changed();
      }
      case 'activity': return h.startActivity(e);
      case 'door':
        if (!cond(e.req)) { if (!(t as any).said) { (t as any).said = true; say([e.locked]); h.time.delayedCall(2500, () => ((t as any).said = false)); } return; }
        return h.goRoom(e.to);
    }
  }
  talk(n: any) {
    const entry = n.talk.find((t: any) => cond(t.when)); if (!entry) return;
    heard.add(n.id + ':' + n.talk.indexOf(entry));
    const facePlayer = this.npcs.find((x) => x.e.id === n.id)?.obj;
    if (facePlayer && n.sprite !== 'dog') { const p = this.h.player, dx = p.x - facePlayer.x, dy = p.y - facePlayer.y;
      const f = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); facePlayer.setFrame(charBase(n.sprite) + DIRS.indexOf(f)); }
    if (entry.moment) document.body.classList.add('moment');
    say(entry.lines, entry.choices, () => {
      document.body.classList.remove('moment');
      if (entry.effects) { const lines = apply(entry.effects); if (lines.length) say(lines); }
      changed();
    });
  }
  destroy() { this.off(); }
}

/** Ambient park life: walks a looping route (EasyStar), says a bark when tapped. */
export class Walker extends Phaser.Physics.Arcade.Sprite {
  nodes: { x: number; y: number }[] = []; leg = 0; waiting = true; facing = 'down';
  constructor(scene: Phaser.Scene, public def: any, public pather: Pather) {
    super(scene, def.route[0][0], def.route[0][1], 'chars', charBase(def.sprite));
    scene.add.existing(this); scene.physics.add.existing(this); charAnims(scene, def.sprite);
    (this.body as Phaser.Physics.Arcade.Body).setSize(10, 8).setOffset(3, 8);
    scene.time.delayedCall(Math.random() * 3000, () => this.next());
  }
  next() {
    if (!this.active) return;
    this.leg = (this.leg + 1) % this.def.route.length; const [x, y] = this.def.route[this.leg];
    this.pather.find(Math.floor(this.x / 16), Math.floor(this.y / 16), Math.floor(x / 16), Math.floor(y / 16)).then((n) => {
      if (!this.active) return; if (!n) { this.scene.time.delayedCall(4000, () => this.next()); return; }
      this.nodes = n; this.waiting = false;
    });
  }
  preUpdate(t: number, dt: number) {
    super.preUpdate(t, dt); this.setDepth(this.y + 8);
    const b = this.body as Phaser.Physics.Arcade.Body;
    if (this.waiting || G.paused) { b.setVelocity(0, 0); return; }
    while (this.nodes.length && Phaser.Math.Distance.Between(this.x, this.y, this.nodes[0].x * 16 + 8, this.nodes[0].y * 16 + 8) < 2) this.nodes.shift();
    if (!this.nodes.length) { b.setVelocity(0, 0); this.anims.stop(); this.waiting = true; this.scene.time.delayedCall(2000 + Math.random() * 4000, () => this.next()); return; }
    const dx = this.nodes[0].x * 16 + 8 - this.x, dy = this.nodes[0].y * 16 + 8 - this.y, d = Math.hypot(dx, dy);
    b.setVelocity((dx / d) * 34, (dy / d) * 34);
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    this.anims.play(`c${this.def.sprite}-${this.facing}`, true);
  }
}
export function persistNow() { persist(); }
