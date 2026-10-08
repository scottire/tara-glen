// Indoor room scene: a small Tiled map (assets/rooms/<id>.json) with door / spawn / pickup / enemy objects.
// Door + room transition pattern adapted from Wispguard (devshareacademy, MIT).
import Phaser from 'phaser';
import { G, S, toast, persist, Player, Baddie } from './core';
import { Pather } from './path';
import { spawnPickup, fire, hud } from './items';

type Obj = Phaser.Types.Tilemaps.TiledObject;
const prop = (o: Obj, k: string) => (o.properties as { name: string; value: any }[] | undefined)?.find((p) => p.name === k)?.value;

export class Room extends Phaser.Scene {
  id = ''; resume = false; player!: Player; enemies: Baddie[] = []; walls: Phaser.Tilemaps.TilemapLayer[] = [];
  door!: Phaser.Geom.Rectangle; mapW = 0; mapH = 0; doorSpawn: [number, number] = [0, 0]; leaving = false; armed = false; saveT = 0;
  constructor() { super('Room'); }
  init(d: { id: string; resume?: boolean }) { this.id = d.id; this.resume = !!d.resume; this.enemies = []; this.leaving = false; this.armed = false; }
  create() {
    const map = this.make.tilemap({ key: 'room-' + this.id });
    const ts = map.addTilesetImage('interior', 'interior')!;
    map.createLayer('floor', ts)!.setDepth(-10);
    this.walls = ['walls', 'furniture'].map((n) => map.createLayer(n, ts)!.setCollisionByExclusion([-1]) as Phaser.Tilemaps.TilemapLayer);
    this.walls[0].setDepth(-5); this.walls[1].setDepth(-4);
    const objs = map.getObjectLayer('objects')!.objects;
    const d = objs.find((o) => o.type === 'door')!, sp = objs.find((o) => o.type === 'spawn');
    this.door = new Phaser.Geom.Rectangle(d.x!, d.y! + 6, d.width!, d.height! - 6);
    this.doorSpawn = [d.x! + 8, d.y! - 6];
    const start = this.resume && G.st.roomPos ? G.st.roomPos : this.resume && sp ? [sp.x! + 8, sp.y! + 8] : this.doorSpawn;
    this.player = new Player(this, start[0], start[1]);
    if ((G.mech.healRooms ?? []).includes(this.id)) { this.player.life.heal(); G.st.hp = this.player.life.max; } // home mobile = safe spot
    if (!this.resume) this.player.facing = 'up';
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, this.walls);
    const pather = Pather.build(this, map.width, map.height, this.walls, []);
    for (const o of objs) {
      const id = prop(o, 'id'), cx = o.x! + 8, cy = o.y! + 8;
      if (o.type === 'pickup') spawnPickup(this, id, cx, cy, this.player);
      if (o.type === 'enemy' && !G.st.defeated.includes(id)) {
        const e = new Baddie(this, cx, cy, id, G.mech.enemies[id], pather, this.player);
        this.physics.add.collider(e, this.walls);
        this.physics.add.overlap(this.player, e, () => e.active && e.sm.current !== 'dead' && this.player.hurt(e, e.def.damage, G.mech.player.knockback));
        this.enemies.push(e);
      }
    }
    this.events.on('player-dead', () => { toast(S('fainted')); this.player.revive(...this.doorSpawn); this.player.facing = 'up'; hud(); });
    this.events.on('hud', hud);
    this.input.keyboard!.on('keydown-X', () => this.fire()); this.input.keyboard!.on('keydown-F', () => this.fire());
    const cam = this.cameras.main;
    this.mapW = map.widthInPixels; this.mapH = map.heightInPixels;
    const fit = () => cam.setZoom(Math.max(1, Math.round(Math.min(this.scale.width, this.scale.height) / 288)));
    fit(); this.scale.on('resize', fit); this.events.once('shutdown', () => this.scale.off('resize', fit));
    cam.fadeIn(250);
    G.st.room = this.id; persist(); hud();
    ['arrow', 'prompt', 'bike'].forEach((k) => (document.getElementById(k)!.style.display = 'none'));
    (window as any).room = this; // test hook
  }
  fire() { fire(this, this.player, this.walls, this.enemies); }
  update(_: number, dt: number) {
    if (!G.st.done) G.st.elapsed += dt;
    if ((this.saveT += dt) > 2000) { this.saveT = 0; G.st.roomPos = [Math.round(this.player.x), Math.round(this.player.y)]; persist(); }
    this.player.drive(this.player.readInput(), G.mech.player.walk);
    const cam = this.cameras.main, vw = cam.width / cam.zoom, vh = cam.height / cam.zoom; // centre small rooms, follow in big ones
    const c = (p: number, m: number, v: number) => (m <= v ? m / 2 : Phaser.Math.Clamp(p, v / 2, m - v / 2));
    cam.centerOn(Math.round(c(this.player.x, this.mapW, vw)), Math.round(c(this.player.y, this.mapH, vh)));
    const inDoor = this.door.contains(this.player.x, this.player.y + 4);
    if (!inDoor) this.armed = true; // must step off the mat before it works again
    if (inDoor && this.armed && !this.leaving && !this.player.busy && this.player.body.velocity.y > 0) this.leave(); // not when knocked back onto the mat
  }
  leave() {
    if (this.leaving || !this.sys.isActive()) return;
    this.leaving = true; this.player.setVelocity(0, 0);
    this.cameras.main.fadeOut(200); this.cameras.main.once('camerafadeoutcomplete', () => {
      G.st.room = null; G.st.roomPos = undefined; persist();
      const w = this.scene.get('World') as any; this.scene.stop(); this.scene.wake('World'); w.exitRoom(this.id);
    });
  }
}
