// Indoor scene built from generated rooms.json (stacked chambers). Camera zooms to COVER the phone screen;
// the area outside the room is wall-coloured so there are never black bars. Door/room transition idea from Wispguard (MIT).
import Phaser from 'phaser';
import { G, $, S, toast, persist, Player } from '../mech/core';
import { Pather } from '../mech/path';
import { cond, count, changed, onChange } from './logic';
import { hud, say, bossBar } from './ui';
import { Ents, type Host } from './entities';
import type { Enemy } from './enemies';
import { throwBalloon, darkTexture } from './fx';

export class Room extends Phaser.Scene implements Host {
  id = ''; resume = false; from: { x: number; y: number } | null = null;
  player!: Player; walls: Phaser.Tilemaps.TilemapLayer[] = []; roomId: string | null = null; pather?: Pather; enemies: Enemy[] = []; ents!: Ents;
  def: any; exit!: Phaser.Geom.Rectangle; spawn: [number, number] = [0, 0]; leaving = false; armed = false; saveT = 0;
  inner: { l: any; body: Phaser.GameObjects.Zone; sprites: Phaser.GameObjects.Image[]; open: boolean }[] = [];
  dark?: Phaser.GameObjects.Image; said = 0;
  constructor() { super('Room'); }
  init(d: { id: string; resume?: boolean; from?: { x: number; y: number } }) {
    this.id = d.id; this.roomId = d.id; this.resume = !!d.resume; this.from = d.from ?? null;
    this.enemies = []; this.inner = []; this.leaving = false; this.armed = false; this.dark = undefined;
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
    const [ex, ey] = def.exit; this.exit = new Phaser.Geom.Rectangle(ex * 16, ey * 16 + 4, 16, 12);
    this.spawn = [def.spawn[0] * 16 + 8, def.spawn[1] * 16 + 4];
    const start = this.resume && G.st.roomPos ? G.st.roomPos : this.from ? [this.from.x, this.from.y + 18] : this.spawn;
    this.player = new Player(this, start[0], start[1]);
    if (!this.resume) this.player.facing = 'up';
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
        if (this.time.now > this.said) { this.said = this.time.now + 3000; if (l.kind === 'dash' && cond(l.req)) toast(S('dashHint')); else say([l.text]); }
      }, () => !o.open && !(l.kind === 'dash' && this.player.dashing && cond(l.req)));
    }
    this.ents = new Ents(this);
    this.events.on('player-dead', () => { toast(S('fainted')); this.player.revive(...this.spawn); this.player.facing = 'up'; hud(); });
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
  fire() { throwBalloon(this, this.player, this.walls, this.enemies); }
  dash() { if (count('skateboard')) this.player.dash(); }
  interact() { this.ents?.interact(); }
  startActivity() {}
  goRoom(id: string) { // room -> room (clubhouse -> cellar)
    this.leaving = true; this.cameras.main.fadeOut(200);
    this.cameras.main.once('camerafadeoutcomplete', () => { G.st.roomPos = undefined; this.scene.restart({ id }); });
  }
  update(_: number, dt: number) {
    if (!this.player || !this.def) return;
    if (G.paused) { if (!this.player.dashing) this.player.setVelocity(0, 0); this.player.anims.stop(); $('prompt').style.display = 'none'; return; }
    if (!G.st.done) G.st.elapsed += dt;
    if ((this.saveT += dt) > 2000) { this.saveT = 0; G.st.roomPos = [Math.round(this.player.x), Math.round(this.player.y)]; persist(); }
    this.player.drive(this.player.readInput(), G.w.start.walk);
    this.ents.update();
    const cam = this.cameras.main, vw = cam.width / cam.zoom, vh = cam.height / cam.zoom, mw = this.def.w * 16, mh = this.def.h * 16;
    const c = (p: number, m: number, v: number) => (m <= v ? m / 2 : Phaser.Math.Clamp(p, v / 2, m - v / 2));
    cam.centerOn(Math.round(c(this.player.x, mw, vw)), Math.round(c(this.player.y, mh, vh)));
    this.dark?.setPosition(this.player.x, this.player.y);
    const inDoor = this.exit.contains(this.player.x, this.player.y + 4);
    if (!inDoor) this.armed = true;
    if (inDoor && this.armed && !this.leaving && !this.player.busy && this.player.body.velocity.y > 0) this.leave();
  }
  leave() {
    if (this.leaving || !this.sys.isActive()) return;
    this.leaving = true; this.player.setVelocity(0, 0); bossBar(null);
    this.cameras.main.fadeOut(200); this.cameras.main.once('camerafadeoutcomplete', () => {
      G.st.roomPos = undefined;
      const to = this.def.exitTo;
      if (to) { const door = G.w.entities.find((e: any) => e.type === 'door' && e.to === this.id); persist(); this.scene.restart({ id: to.room, from: door ? { x: door.x, y: door.y } : undefined }); return; }
      G.st.room = null; persist();
      const w = this.scene.get('World') as any; this.scene.stop(); this.scene.wake('World'); w.exitRoom(this.id);
    });
  }
}
