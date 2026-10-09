// Indoor scene built from generated rooms.json (stacked chambers). Camera zooms to COVER the phone screen;
// the area outside the room is wall-coloured so there are never black bars. Door/room transition idea from Wispguard (MIT).
import Phaser from 'phaser';
import { G, $, S, toast, persist, Player } from '../mech/core';
import { Pather } from '../mech/path';
import { cond, count, changed, onChange, apply } from './logic';
import { hud, say, bossBar } from './ui';
import { Ents, type Host } from './entities';
import type { Enemy } from './enemies';
import { throwBalloon, darkTexture } from './fx';
import { Combat, burst, ensureFxTextures } from '../v9/combat';
import { setObjective } from '../v9/arena';

export class Room extends Phaser.Scene implements Host {
  id = ''; resume = false; from: { x: number; y: number } | null = null; side?: string;
  // v11 Glen (forest interior): one-way slope, root steps, the path back up to 127, the rope swing over the stream
  slope = new Set<number>(); steps = new Set<number>(); topExit = new Set<number>(); swingPts: Phaser.GameObjects.Rectangle[] = [];
  rope?: Phaser.GameObjects.Graphics; seat?: Phaser.GameObjects.Rectangle; swinging = false; swingT = 0; steepSaid = 0; ropeTop: [number, number] = [0, 0];
  player!: Player; walls: Phaser.Tilemaps.TilemapLayer[] = []; roomId: string | null = null; pather?: Pather; enemies: Enemy[] = []; ents!: Ents;
  def: any; exit!: Phaser.Geom.Rectangle; spawn: [number, number] = [0, 0]; leaving = false; armed = false; saveT = 0;
  inner: { l: any; body: Phaser.GameObjects.Zone; sprites: Phaser.GameObjects.Image[]; open: boolean }[] = [];
  dark?: Phaser.GameObjects.Image; said = 0; combat!: Combat; locked = false; bars: Phaser.GameObjects.Image[] = [];
  constructor() { super('Room'); }
  init(d: { id: string; resume?: boolean; from?: { x: number; y: number }; side?: string }) {
    this.id = d.id; this.roomId = d.id; this.resume = !!d.resume; this.from = d.from ?? null; this.side = d.side;
    this.slope.clear(); this.steps.clear(); this.topExit.clear(); this.swingPts = []; this.swinging = false;
    this.enemies = []; this.inner = []; this.leaving = false; this.armed = false; this.dark = undefined; this.locked = false; this.bars = [];
  }
  create() {
    const def = this.def = G.w.rooms[this.id], data = this.cache.json.get('rooms')[this.id];
    if (!def || !data) { console.warn('no room', this.id); G.st.room = null; this.scene.stop(); this.scene.wake('World'); return; }
    const map = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: data.w, height: data.h });
    const ts = map.addTilesetImage('interior6img', 'interior6img', 16, 16, 0, 0)!;
    const layer = (name: string, arr: number[], depth: number) => {
      const l = map.createBlankLayer(name, ts)!.setDepth(depth) as Phaser.Tilemaps.TilemapLayer;
      arr.forEach((t, i) => { if (t >= 0) l.putTileAt(t, i % data.w, Math.floor(i / data.w)); }); return l;
    };
    layer('floor', data.floor, -10);
    this.walls = [layer('walls', data.walls, -5), layer('furn', data.furn, -4)];
    this.walls.forEach((l) => l.setCollisionByExclusion([-1]));
    this.furnish(data);
    const [ex, ey] = def.exit; this.exit = new Phaser.Geom.Rectangle(ex * 16, ey * 16 + 4, 16, 12);
    this.spawn = [def.spawn[0] * 16 + 8, def.spawn[1] * 16 + 4];
    const top = this.side === 'top' && data.slots?.['1'] ? [data.slots['1'][0] * 16 + 8, data.slots['1'][1] * 16 + 8] : null;
    const start = this.resume && G.st.roomPos ? G.st.roomPos : this.from ? [this.from.x, this.from.y + 18] : top ?? this.spawn;
    this.player = new Player(this, start[0], start[1]);
    if (!this.resume) this.player.facing = top ? 'down' : 'up';
    const key = (x: number, y: number) => y * data.w + x, m = data.marks ?? {};
    (m.slope ?? []).forEach(([x, y]: number[]) => this.slope.add(key(x, y))); (m.steps ?? []).forEach(([x, y]: number[]) => this.steps.add(key(x, y)));
    (m.top ?? []).forEach(([x, y]: number[]) => this.topExit.add(key(x, y)));
    if (def.heal && G.st.hp < G.st.maxhp) { G.st.hp = G.st.maxhp; this.player.life.life = G.st.maxhp; toast(S('heal')); }
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, this.walls);
    this.pather = Pather.build(this, data.w, data.h, this.walls, []);
    // inner chamber locks (dark curtain / low wardrobe gap)
    for (const l of def.locks ?? []) {
      const xs = l.tiles.map((t: number[]) => t[0]), y = l.tiles[0][1], x0 = Math.min(...xs) * 16, w = (Math.max(...xs) + 1) * 16 - x0;
      const body = this.add.zone(x0 + w / 2, y * 16 + 8, w, 16); this.physics.add.existing(body, true);
      const sprites = l.tiles.map(([tx, ty]: number[]) => this.add.image(tx * 16 + 8, ty * 16 + 8, l.kind === 'dark' ? 'd-curtain' : 'd-wardrobe').setDepth(ty * 16 + 12));
      const o = { l, body, sprites, open: false }; this.inner.push(o);
      this.physics.add.collider(this.player, body, () => {
        if (l.kind === 'dark' && cond(l.req)) { o.open = true; (body.body as Phaser.Physics.Arcade.StaticBody).enable = false; sprites.forEach((s: any) => this.tweens.add({ targets: s, alpha: 0, duration: 400 })); toast('🔦 You light the way.'); return; }
        if (this.time.now > this.said) { this.said = this.time.now + 3000; if (l.kind === 'dash' && cond(l.req)) toast(S('dashHint')); else toast(l.text); } // toast, not a dialogue box, so fights never stall
      }, () => !o.open && !(l.kind === 'dash' && this.player.dashing && cond(l.req)));
    }
    this.ents = new Ents(this); this.combat = new Combat(this);
    if (m.swing) this.buildSwing(m.swing[0], data);
    // v9 combat room: the door bars shut while anything hostile is alive; cleared rooms stay cleared (flag clear:<id>)
    if (this.enemies.some((e) => this.front(e))) this.lock();
    // fainting in a room puts you back at its door outside (the checkpoint); the room resets because it wasn't cleared
    this.events.off('player-dead'); this.events.off('hud');
    this.events.once('player-dead', () => { toast(S('fainted')); this.player.revive(...this.spawn); hud(); this.locked = false; setObjective(null); this.leave(true); });
    this.events.on('hud', hud);
    this.input.keyboard!.on('keydown-X', () => this.fire()); this.input.keyboard!.on('keydown-F', () => this.fire());
    this.input.keyboard!.on('keydown-Z', () => this.dash()); this.input.keyboard!.on('keydown-C', () => this.dash());
    if (def.dark) { this.dark = this.add.image(0, 0, darkTexture(this, count('torch') ? 78 : 30)).setDepth(9e5); }
    // camera: integer zoom that COVERS the screen (capped), wall-coloured surround, follow + clamp
    const cam = this.cameras.main; cam.setBackgroundColor('#46383a');
    const fit = () => {
      const base = Math.max(1, Math.round(Math.min(this.scale.width, this.scale.height) / 288));
      const cover = Math.ceil(Math.max(this.scale.width / (data.w * 16), this.scale.height / (data.h * 16)));
      cam.setZoom(Math.min(base + 2, Math.max(base, cover)));
    };
    fit(); this.scale.on('resize', fit); this.events.once('shutdown', () => this.scale.off('resize', fit));
    cam.fadeIn(250);
    G.st.room = this.id; persist(); hud(); changed();
    const off = onChange(() => this.ents && hud()); this.events.once('shutdown', off);
    ['arrow', 'prompt', 'bike'].forEach((k) => ($(k).style.display = 'none'));
    (window as any).room = this;
    if (!this.resume) this.time.delayedCall(250, () => { const b = document.getElementById('banner'); if (b) { b.innerHTML = `<b>${def.name}</b>`; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); } });
  }
  /** v11 interiors: one stylised sprite per furniture run (bottom-aligned on its footprint, so tall pieces stand against the
   * panelled wall), soft daylight pools under each window, and a warm glow round lamps after dark */
  furnish(data: any) {
    for (const p of data.props ?? []) {
      const key = 'ip-' + p.k; if (!this.textures.exists(key)) continue;
      const iw = this.textures.get(key).getSourceImage().width, fw = p.w * 16, n = Math.max(1, Math.floor(fw / iw + 0.25));
      const bottom = (p.y + p.h) * 16 - (p.k === 'rug' ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const cx = p.x * 16 + (fw / n) * (i + 0.5);
        const img = this.add.image(Math.round(cx), bottom, key).setOrigin(0.5, 1);
        img.setDepth(p.k === 'rug' ? -8 : bottom - 2);
      }
      if (p.k === 'lamp' && (G.st.flags.includes('evening'))) this.add.circle(p.x * 16 + 8, p.y * 16 + 2, 26, 0xffd27a, 0.18).setBlendMode(Phaser.BlendModes.ADD).setDepth(9e4);
    }
    const night = G.st.flags.includes('evening');
    data.walls.forEach((t: number, i: number) => {
      if (t !== 14) return; const x = (i % data.w) * 16 + 8, y = Math.floor(i / data.w) * 16;
      if (night) { this.add.rectangle(x, y + 6, 10, 8, 0x1f2a4a, 0.75).setDepth(-4); return; }
      this.add.ellipse(x, y + 30, 26, 22, 0xfff4d6, 0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(-7);
    });
  }
  fire() { if (this.combat.chip()) return; throwBalloon(this, this.player, this.walls, this.enemies); }
  /** the rope-swing tree (AI source, stylised) stands on the north bank; rope + seat are drawn here so they can swing.
   * Two A-prompt spots (north bank, south bank) carry you across the stream either way. */
  buildSwing([tx, ty]: number[], data: any) {
    const bx = tx * 16 + 8, by = ty * 16 + 16;
    this.add.image(bx - 10, by, 'glen-tree').setOrigin(0.5, 1).setDepth(by + 2);
    let s = ty + 1; while (s < data.h && data.walls[s * data.w + tx] >= 0) s++; // south bank row
    const north = [bx + 12, (ty - 1) * 16 + 10], south = [bx + 12, s * 16 + 10];
    this.ropeTop = [bx + 12, by - 44];
    this.rope = this.add.graphics().setDepth(by + 3);
    this.seat = this.add.rectangle(bx + 16, by + 4, 12, 3, 0x8d5537).setStrokeStyle(1, 0x312028).setDepth(by + 4);
    for (const [x, y] of [north, south]) {
      const r = this.add.rectangle(x, y, 4, 4, 0, 0); r.setData('to', x === north[0] && y === north[1] ? south : north);
      this.swingPts.push(r); (this.ents as any).things.push({ kind: 'activity', obj: r, e: { id: 'glen_swing', swing: true } });
    }
  }
  drawRope(x: number, y: number) {
    if (!this.rope) return; const [ax, ay] = this.ropeTop;
    this.rope.clear().lineStyle(1, 0xe2a55e, 1).lineBetween(ax - 5, ay, x - 5, y).lineBetween(ax + 5, ay, x + 5, y);
    this.seat!.setPosition(x, y);
  }
  swing(t: any) {
    if (this.swinging || this.player.busy) return;
    const to = t.obj.getData('to') as number[], p = this.player, from = [p.x, p.y]; this.swinging = true; p.body.enable = false; p.setVelocity(0, 0);
    const sh = this.add.ellipse(p.x, p.y + 6, 12, 4, 0x000000, 0.35).setDepth(p.y);
    toast('🌳 Hold on!');
    this.tweens.addCounter({ from: 0, to: 1, duration: 1100, ease: 'Sine.inOut',
      onUpdate: (tw) => { const k = tw.getValue() ?? 0, lift = Math.sin(k * Math.PI) * 18, y = from[1] + (to[1] - from[1]) * k, x = from[0] + (to[0] - from[0]) * k + Math.sin(k * Math.PI) * 5;
        p.setPosition(x, y - lift); p.setScale(1 + lift / 90); p.setDepth(9e4); sh.setPosition(x, y + 6); this.drawRope(x, y - lift - 6); },
      onComplete: () => { p.setScale(1); p.body.enable = true; p.setDepth(p.y); sh.destroy(); this.swinging = false; this.swingT = this.time.now;
        if (!G.st.flags.includes('swung:glen')) { G.st.flags.push('swung:glen'); persist(); } } });
  }
  dash() { this.combat.dodge(); }
  lock() {
    ensureFxTextures(this); this.locked = true;
    const [ex, ey] = this.def.exit;
    for (let i = -1; i <= 1; i++) { const b = this.add.image(ex * 16 + 8 + i * 5, ey * 16 + 16, 'fx-post').setOrigin(0.5, 1).setDepth(ey * 16 + 20).setScale(1, 0);
      this.tweens.add({ targets: b, scaleY: 1, duration: 250, delay: 300 + i * 40, ease: 'Back.out' }); this.bars.push(b); }
    this.left();
  }
  /** enemies that bar the door: alive and not shut behind an unopened inner lock (chambers stack upwards from the door) */
  front(e: Enemy) { return !this.inner.some((o) => !o.open && e.y < o.l.tiles[0][1] * 16); }
  left() { const n = this.enemies.filter((e) => e.active && e.sm.current !== 'dead' && this.front(e)).length; setObjective(this.locked ? `Clear the room: ${n} left` : null); return n; }
  onEnemyDeath() {
    if (!this.locked) return;
    if (this.left() > 0) return;
    this.locked = false; G.st.flags.push('clear:' + this.id); G.st.hp = Math.min(G.st.maxhp, G.st.hp + 1); this.player.life.life = G.st.hp; persist();
    this.bars.forEach((b) => { burst(this, b.x, b.y - 6, 0xffd27a, 4, 20); this.tweens.add({ targets: b, scaleY: 0, alpha: 0, duration: 300, onComplete: () => b.destroy() }); });
    this.cameras.main.flash(160, 255, 230, 140); toast('Room cleared. The door is open.'); setObjective(null);
    const enc = G.w.entities.find((e: any) => e.type === 'encounter' && e.room === this.id && !G.st.got.includes(e.id)); // v10: fight rewards
    if (enc) { G.st.got.push(enc.id); const lines = apply(enc.effects); if (lines.length) say(lines); }
    changed();
  }
  interact() { this.ents?.interact(); }
  startActivity() {}
  goRoom(id: string) { // room -> room (clubhouse -> cellar)
    this.leaving = true; this.cameras.main.fadeOut(200);
    this.cameras.main.once('camerafadeoutcomplete', () => { G.st.roomPos = undefined; this.scene.restart({ id }); });
  }
  update(_: number, dt: number) {
    if (!this.player || !this.def) return;
    if (G.paused) { if (!this.player.dashing) this.player.setVelocity(0, 0); this.player.idle(); $('prompt').style.display = 'none'; return; }
    if (!G.st.done) G.st.elapsed += dt;
    if ((this.saveT += dt) > 2000) { this.saveT = 0; G.st.roomPos = [Math.round(this.player.x), Math.round(this.player.y)]; persist(); }
    if (this.swinging) { this.ents.update(); return; }
    this.player.drive(this.player.readInput(), G.w.start.walk * (count('trainers') ? 1.15 : 1));
    if (this.slope.size || this.topExit.size) this.glenMove();
    if (this.rope && !this.swinging) { const [ax] = this.ropeTop, sw = Math.sin(this.time.now / 600) * 3; this.drawRope(ax + sw, this.ropeTop[1] + 46); }
    this.ents.update();
    const cam = this.cameras.main, vw = cam.width / cam.zoom, vh = cam.height / cam.zoom, mw = this.def.w * 16, mh = this.def.h * 16;
    const c = (p: number, m: number, v: number, extra = 0) => (m + extra <= v ? (m + extra) / 2 : Phaser.Math.Clamp(p, v / 2, m - v / 2 + extra)), off = vh > vw ? vh * 0.2 : 0;
    // player sits above centre and the view may run past the bottom wall, so the door fight never hides under the thumbs
    cam.centerOn(Math.round(c(this.player.x, mw, vw)), Math.round(c(this.player.y + off, mh, vh, off)));
    this.dark?.setPosition(this.player.x, this.player.y);
    const inDoor = this.exit.contains(this.player.x, this.player.y + 4);
    if (!inDoor) this.armed = true;
    if (inDoor && this.armed && !this.leaving && !this.player.busy && this.player.body.velocity.y > 0) {
      if (this.locked) { this.player.setPosition(this.player.x, this.exit.y - 6); if (this.time.now > this.said) { this.said = this.time.now + 2500; toast('The door is barred. Clear the room first.'); } }
      else this.leave();
    }
  }
  /** Glen: on the slope you slide downhill and can't walk up (the root steps at the side are the way back);
   * walking up into the path at the top takes you back out behind 127 */
  glenMove() {
    const p = this.player, w = this.def.w, k = Math.floor((p.y + 4) / 16) * w + Math.floor(p.x / 16), b = p.body as Phaser.Physics.Arcade.Body;
    if (this.slope.has(k) && !p.dashing) {
      if (b.velocity.y < 0 && this.time.now > this.steepSaid) { this.steepSaid = this.time.now + 4000; toast('Too steep to climb. The roots at the side look like steps.'); }
      b.setVelocityY(Math.max(b.velocity.y * 0, 0) + 150); b.setVelocityX(b.velocity.x * 0.6);
      if (!G.st.flags.includes('slid:glen')) { G.st.flags.push('slid:glen'); persist(); }
    } else if (this.steps.has(k)) b.setVelocity(b.velocity.x * 0.5, b.velocity.y * 0.6);
    if (this.topExit.has(k) && b.velocity.y < 0 && !this.leaving && !this.locked) this.leave(false, 'top');
  }
  leave(fainted = false, side?: string) {
    if (this.leaving || !this.sys.isActive()) return;
    if (fainted) { const w = this.scene.get('World') as any; this.leaving = true; this.cameras.main.fadeOut(300); this.cameras.main.once('camerafadeoutcomplete', () => {
      G.st.roomPos = undefined; G.st.room = null; persist(); this.scene.stop(); this.scene.wake('World'); w.exitRoom(this.id); }); return; }
    this.leaving = true; this.player.setVelocity(0, 0); bossBar(null);
    this.cameras.main.fadeOut(200); this.cameras.main.once('camerafadeoutcomplete', () => {
      G.st.roomPos = undefined;
      const to = this.def.exitTo;
      if (to) { const door = G.w.entities.find((e: any) => e.type === 'door' && e.to === this.id); persist(); this.scene.restart({ id: to.room, from: door ? { x: door.x, y: door.y } : undefined }); return; }
      G.st.room = null; persist();
      const w = this.scene.get('World') as any; this.scene.stop(); this.scene.wake('World'); w.exitRoom(this.id, side ?? (this.def.kind === 'forest' ? 'bottom' : undefined));
    });
  }
}
