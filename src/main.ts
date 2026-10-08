import Phaser from 'phaser';
import { stickCtl } from './joystick';
import { Swing, Keepy, Putt } from './minigames';
import { save, reset, fmt, clock, type Save } from './state';
import { G, Player, DIRS } from './mech/core';
import { Pather, Walker } from './mech/path';
import { spawnPickup, fire, hud as mechHud, has, say, UI } from './mech/items';
import { Room } from './mech/room';

const BIKE_SPEED = 165; // walking speed lives in mechanics.json (player.walk)
const PROPS = ['goal', 'tennis-net', 'bench', 'picnic-table', 'bin', 'lamp', 'fence', 'hedge', 'flowerbed',
  'car-red', 'car-blue', 'car-silver', 'deckchair', 'windbreak', 'golf-flag', 'minigolf-hut', 'signpost', 'swings', 'slide', 'roundabout', 'climbing-frame'];
const SOLID = new Set(['bench', 'picnic-table', 'bin', 'lamp', 'signpost', 'fence', 'hedge', 'car-red', 'car-blue', 'car-silver', 'windbreak', 'minigolf-hut',
  'swings', 'slide', 'roundabout', 'climbing-frame']);
const params = new URLSearchParams(location.search);
const DPR = params.has('overview') ? 1 : Math.min(window.devicePixelRatio || 1, 3);
type Obj = Phaser.Types.Tilemaps.TiledObject;
const prop = (o: Obj, k: string) => (o.properties as { name: string; value: any }[] | undefined)?.find((p) => p.name === k)?.value;
const $ = (id: string) => document.getElementById(id)!;
if (params.has('hints')) document.body.classList.add('hints'); // objective text + arrow are hidden unless ?hints

class World extends Phaser.Scene {
  constructor() { super('World'); }
  player!: Player;
  doors: { room: string; rect: Phaser.Geom.Rectangle; out: [number, number] }[] = [];
  doorArmed = true; lockSaid = new Set<string>(); solids!: Phaser.Physics.Arcade.StaticGroup; gateSolids!: Phaser.Physics.Arcade.StaticGroup;
  labels: Phaser.GameObjects.Text[] = [];
  overview = params.has('overview');
  bike!: Phaser.GameObjects.Sprite;
  riding = false;
  groundLayer!: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  cfg: any; S = (k: string, v?: Record<string, any>) => fmt(this.cfg.strings[k] ?? k, v);
  st: Save = G.st;
  gates: Record<string, { img: Phaser.GameObjects.TileSprite; body: Phaser.GameObjects.Zone }> = {};
  spot?: Phaser.GameObjects.Image;
  gems: (Phaser.GameObjects.Image | null)[] = [];
  hunt: { items: Phaser.GameObjects.Image[]; left: number } | null = null;
  inMini = false; nearSpot = false; saveT = 0;

  preload() {
    this.load.image('tiles', 'assets/tiles.png');
    this.load.tilemapTiledJSON('map', 'assets/map.json');
    this.load.json('cfg', 'progression.json');
    this.load.json('mech', 'mechanics.json');
    this.load.image('interior', 'assets/interior.png');
    ['baddie', 'chest'].forEach((k) => this.load.spritesheet(k, `assets/${k}.png`, { frameWidth: 16, frameHeight: 16 }));
    this.load.spritesheet('npc', 'assets/npc.png', { frameWidth: 16, frameHeight: 16 });
    ['note', 'balloon', 'trainers', 'shell'].forEach((k) => this.load.image(k, `assets/${k}.png`));
    this.load.spritesheet('player', 'assets/player.png', { frameWidth: 16, frameHeight: 16 });
    // caravan placeholder: swap these two sheets (3 frames = colour variants) for real models later
    this.load.spritesheet('caravan-h', 'assets/caravan-h.png', { frameWidth: 72, frameHeight: 48 });
    this.load.spritesheet('caravan-v', 'assets/caravan-v.png', { frameWidth: 48, frameHeight: 80 });
    PROPS.forEach((p) => this.load.image(p, `assets/props/${p}.png`));
    ['clubhouse', 'waves', 'foam', 'gate-h', 'gate-v', 'spot', 'gem', 'token'].forEach((k) => this.load.image(k, `assets/${k}.png`));
    this.load.spritesheet('bike', 'assets/bike.png', { frameWidth: 24, frameHeight: 24 });
  }

  label(x: number, y: number, text: string, always = false) {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '40px', color: '#fff', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5, 1).setScale(this.overview ? 0.5 : 0.25).setDepth(1e6).setAlpha(this.overview || always ? 1 : 0);
    t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.labels.push(t); return t;
  }

  create() { // ground is pre-baked into image chunks listed in the map properties: load them, then build the world
    this.cfg = this.cache.json.get('cfg');
    G.mech = this.cache.json.get('mech'); (G as any).ui = this.scene.get('UI');
    for (const d of G.mech.doors) this.load.tilemapTiledJSON('room-' + d.room, `assets/rooms/${d.room}.json`);
    const n = this.cfg.stages.length;
    if (params.get('unlock') === 'all') this.st.stage = Math.max(this.st.stage, n - 1);
    if (params.has('stage')) this.st.stage = Phaser.Math.Clamp(Number(params.get('stage')), 0, n);
    const mp = (this.cache.tilemap.get('map').data.properties as { name: string; value: number }[]);
    const P = (k: string) => mp.find((p) => p.name === k)!.value;
    for (let y = 0; y < P('groundRows'); y++) for (let x = 0; x < P('groundCols'); x++) this.load.image(`g_${x}_${y}`, `assets/ground/g_${x}_${y}.png`);
    this.load.once('complete', () => this.build(P('groundChunk'), P('groundCols'), P('groundRows'), P('shoreX')));
    this.load.start();
  }

  build(chunk: number, cols: number, rows: number, shoreX: number) {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) this.add.image(x * chunk, y * chunk, `g_${x}_${y}`).setOrigin(0).setDepth(-10);
    const map = this.make.tilemap({ key: 'map' });
    const tiles = map.addTilesetImage('tiles', 'tiles')!;
    const ground = map.createLayer('ground', tiles)!.setVisible(false); // collision/terrain lookup only
    this.groundLayer = ground;
    const objects = map.createLayer('objects', tiles)!; // tree trunks + area hedges/fences/road blocks (all collide)
    map.createLayer('roofs', tiles)!.setDepth(5e5); // tree canopies, drawn above the player
    ground.setCollision([245]); // sea (tile index = png index + 1)
    objects.setCollisionByExclusion([-1]);
    // animated sea: drifting wave highlights + shoreline foam that laps in and out
    const waves = this.add.tileSprite(shoreX + 24, 0, map.widthInPixels - shoreX, map.heightInPixels, 'waves').setOrigin(0).setDepth(-5).setAlpha(0.7);
    const foam = this.add.tileSprite(shoreX, 0, 32, map.heightInPixels, 'foam').setOrigin(0).setDepth(-4);
    this.tweens.add({ targets: foam, x: shoreX - 4, alpha: 0.6, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.events.on('update', () => { waves.tilePositionX -= 0.06; waves.tilePositionY += 0.12; });
    const solids = this.solids = this.physics.add.staticGroup();
    const body = (x: number, y: number, w: number, h: number) => { const z = this.add.zone(x + w / 2, y + h / 2, w, h); solids.add(z); return z; };

    for (const o of map.getObjectLayer('buildings')!.objects) { // clubhouse: y-sorted sprite, walk behind its roof
      this.add.image(o.x!, o.y!, o.name).setOrigin(0).setDepth(o.y! + o.height!);
      const inset = prop(o, 'inset') ?? 0; body(o.x! + 4, o.y! + inset, o.width! - 8, o.height! - inset - 3);
    }
    for (const o of map.getObjectLayer('caravans')!.objects) {
      const key = prop(o, 'orient') === 'v' ? 'caravan-v' : 'caravan-h', inset = key === 'caravan-v' ? 20 : 14;
      this.add.image(o.x!, o.y!, key, prop(o, 'variant')).setOrigin(0).setDepth(o.y! + o.height!).setData('segId', prop(o, 'segId'));
      body(o.x! + 2, o.y! + inset, o.width! - 4, o.height! - inset - 2);
      if (prop(o, 'home')) this.add.text(o.x! + o.width! / 2, o.y! + o.height! - 3, prop(o, 'label'), { fontFamily: 'monospace', fontSize: '24px', color: '#fff', stroke: '#3a2a20', strokeThickness: 4 })
        .setOrigin(0.5).setScale(0.25).setDepth(o.y! + o.height! + 1).texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      if (params.has('ids')) this.label(o.x! + o.width! / 2, o.y! + 20, String(prop(o, 'segId')));
      const door = G.mech.doors.find((d: any) => d.caravan === prop(o, 'segId') && key === 'caravan-h'); // door = gap in the front fence
      if (door) { const cx = o.x! + o.width! / 2, by = o.y! + o.height!;
        this.doors.push({ room: door.room, rect: new Phaser.Geom.Rectangle(cx - 6, by - 6, 12, 10), out: [cx, by + 10] }); }
    }
    for (const o of map.getObjectLayer('props')!.objects) {
      const img = this.add.image(o.x!, o.y!, o.name).setFlipY(!!prop(o, 'flipY'));
      if (prop(o, 'w')) img.setDisplaySize(prop(o, 'w'), img.height);
      img.setDepth(img.y + img.height / 2);
      if (SOLID.has(o.name)) { const bh = Math.min(10, img.height * 0.6); body(img.x - img.displayWidth / 2 + 1, img.y + img.height / 2 - bh, img.displayWidth - 2, bh); }
      if (prop(o, 'label')) this.label(o.x!, o.y! - 10, prop(o, 'label'));
    }
    // gates: closed = wooden gate across the gap with its own body; open = swings away (tween) and body removed
    const gateSolids = this.gateSolids = this.physics.add.staticGroup();
    for (const o of map.getObjectLayer('gates')!.objects) {
      const v = prop(o, 'orient') === 'v';
      const img = this.add.tileSprite(o.x! + o.width! / 2, o.y! + o.height! / 2, o.width!, v ? o.height! : 22, v ? 'gate-v' : 'gate-h').setDepth(o.y! + o.height!);
      const z = this.add.zone(o.x! + o.width! / 2, o.y! + o.height! / 2, o.width!, o.height!); gateSolids.add(z);
      this.gates[o.name!] = { img, body: z };
    }
    if (this.overview) {
      for (const o of map.getObjectLayer('landmarks')!.objects) this.label(o.x!, o.y!, `#${prop(o, 'segId')}`, true);
      for (const a of this.cfg.areas) for (const r of a.rects) // tint areas
        this.add.rectangle(r[0] * 16, r[1] * 16, (r[2] - r[0]) * 16, (r[3] - r[1]) * 16, Phaser.Display.Color.HexStringToColor(a.tint).color, 0.18).setOrigin(0).setDepth(9e5);
      for (const g of Object.keys(this.gates)) this.label(this.gates[g].img.x, this.gates[g].img.y - 12, `gate ${g}`, true);
    }

    const spawn = map.getObjectLayer('markers')!.objects.find((o) => o.type === 'spawn')!;
    const at = params.get('at')?.split(',').map(Number); // debug: ?at=tileX,tileY
    const start = at ? [at[0] * 16 + 8, at[1] * 16 + 8] : this.st.pos && !params.has('stage') && !params.has('unlock') ? this.st.pos : [spawn.x!, spawn.y!];
    this.player = new Player(this, start[0], start[1]);
    this.physics.add.collider(this.player, [ground, objects, solids, gateSolids]);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    // mechanics: outdoor pickups, scheduled NPCs (EasyStar over a grid of tiles + static bodies), ammo
    for (const [id, d] of Object.entries<any>(G.mech.pickups)) if (d.at) spawnPickup(this, id, d.at[0] * 16 + 8, d.at[1] * 16 + 8, this.player);
    const rects = [...solids.getChildren(), ...gateSolids.getChildren()].map((z) => (z as Phaser.GameObjects.Zone).getBounds());
    const pather = Pather.build(this, map.width, map.height, [ground as Phaser.Tilemaps.TilemapLayer, objects as Phaser.Tilemaps.TilemapLayer], rects);
    for (const n of G.mech.npcs) new Walker(this, n, pather);
    this.input.keyboard!.on('keydown-X', () => this.fire()); this.input.keyboard!.on('keydown-F', () => this.fire());
    this.bike = this.add.sprite(0, 0, 'bike', 0).setVisible(false);
    DIRS.forEach((d, c) => this.anims.create({ key: 'bike-' + d, frameRate: 10, repeat: -1, frames: this.anims.generateFrameNumbers('bike', { frames: [c, c + 4] }) }));
    $('bike').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.toggleBike(); });
    this.input.keyboard!.on('keydown-B', () => this.toggleBike());
    this.input.keyboard!.on('keydown-SHIFT', () => this.toggleBike());
    $('prompt').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.interact(); });
    this.input.keyboard!.on('keydown-ENTER', () => this.interact());
    this.input.keyboard!.on('keydown-SPACE', () => this.interact());

    // collectibles
    this.cfg.collectibles.forEach((c: number[], i: number) => {
      if (this.st.collected.includes(i)) return this.gems.push(null);
      const g = this.add.image(c[0] * 16 + 8, c[1] * 16 + 8, 'gem').setDepth(c[1] * 16 + 14);
      this.tweens.add({ targets: g, y: g.y - 3, duration: 700 + i * 37, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); this.gems.push(g);
    });
    this.applyStage(false);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    if (this.overview) { // ?overview: whole map, for screenshots (add &ids for caravan segmentation ids)
      cam.setZoom(Math.min(this.scale.width / map.widthInPixels, this.scale.height / map.heightInPixels)).centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
      document.body.classList.add('overview');
    } else {
      cam.startFollow(this.player, true);
      const fit = () => cam.setZoom(Math.max(1, Math.round(Math.min(this.scale.width, this.scale.height) / 288)));
      fit(); this.scale.on('resize', fit);
    }
    $('menu-reset').textContent = this.S('reset'); $('menu-close').textContent = this.S('close'); document.title = this.cfg.title;
    $('menu-btn').onclick = () => $('menu').classList.toggle('show');
    $('menu-close').onclick = () => $('menu').classList.remove('show');
    $('menu-reset').onclick = () => { if (confirm(this.S('resetConfirm'))) { reset(); location.href = location.pathname; } };
    (window as any).tg = this; // debug/test hook
    if (this.st.stage >= this.cfg.stages.length && this.st.done) this.showEnd();
    // indoor start: fresh games spawn inside mobile 127 (mechanics.json start.room); reloads resume in the saved room
    if (!this.st.started) { this.st.started = true; if (!at && !this.overview) this.st.room = G.mech.start.room; }
    if (params.get('room')) this.st.room = params.get('room');
    if (this.st.room && !at && !this.overview) this.enterRoom(this.st.room, true);
  }

  // ---------- rooms ----------
  enterRoom(id: string, resume = false) {
    if (this.riding) this.toggleBike();
    this.player.setVelocity(0, 0); $('bike').style.display = 'none'; $('prompt').style.display = 'none'; $('arrow').style.display = 'none';
    const go = () => { this.scene.sleep(); this.scene.launch('Room', { id, resume }); };
    if (resume) return go();
    this.cameras.main.fadeOut(200); this.cameras.main.once('camerafadeoutcomplete', go);
  }
  exitRoom(id: string) {
    const d = this.doors.find((x) => x.room === id);
    if (d) this.player.setPosition(d.out[0], d.out[1]);
    this.player.facing = 'down'; this.doorArmed = false; this.input.keyboard!.resetKeys();
    this.cameras.main.fadeIn(250); this.applyStage(true);
  }
  fire() { fire(this, this.player, [this.solids, this.gateSolids], []); }

  // ---------- progression ----------
  stageDef() { return this.cfg.stages[this.st.stage]; }
  opened(): Set<string> { const s = new Set<string>(); this.cfg.stages.slice(0, this.st.stage).forEach((d: any) => (d.reward.open ?? []).forEach((g: string) => s.add(g)));
    for (const a of G.mech.abilityGates) if (has(a.needs)) s.add(a.gate); // ability-gated: opens once you have the ability
    return s; }
  hasBike() { return this.cfg.stages.slice(0, this.st.stage).some((d: any) => d.reward.bike); }
  applyStage(animate: boolean) {
    const open = this.opened();
    for (const [id, g] of Object.entries(this.gates)) {
      if (!open.has(id) || !g.body.active) continue;
      (g.body.body as Phaser.Physics.Arcade.StaticBody).enable = false; g.body.setActive(false);
      if (animate && this.cfg.stages.slice(0, this.st.stage).every((d: any) => !(d.reward.open ?? []).includes(id))) this.toast(G.mech.strings.gateHop);
      if (animate) this.tweens.add({ targets: g.img, scaleX: g.img.width > g.img.height ? 0.05 : 1, scaleY: g.img.width > g.img.height ? 1 : 0.05, alpha: 0, duration: 900, ease: 'Back.in' });
      else g.img.setVisible(false);
    }
    $('bike').style.display = this.hasBike() && !this.overview ? 'flex' : 'none';
    this.spot?.destroy(); this.spot = undefined;
    const d = this.stageDef();
    if (d) { this.spot = this.add.image(d.spot[0] * 16 + 8, d.spot[1] * 16 + 8, 'spot').setDepth(d.spot[1] * 16 + 16);
      this.tweens.add({ targets: this.spot, scale: 1.4, alpha: 0.55, angle: 45, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); }
    this.hud(); save(this.st);
  }
  hud() {
    const d = this.stageDef();
    $('objective').textContent = d ? this.S('objectivePrefix') + d.objective : this.S('allDone');
    $('badges').innerHTML = this.cfg.stages.map((s: any, i: number) => `<span class="${i < this.st.stage ? 'got' : ''}">${s.badge}</span>`).join('');
    $('gems').textContent = `💎 ${this.st.collected.length}/${this.cfg.collectibles.length}`;
    mechHud();
  }
  interact() {
    if (!this.nearSpot || this.inMini || this.hunt || G.paused) return;
    const d = this.stageDef(); const mg = this.cfg.minigames[d.minigame];
    if (d.minigame === 'hunt') return this.startHunt(mg);
    if (this.riding) this.toggleBike();
    this.inMini = true; stickCtl.enabled = false; this.player.setVelocity(0, 0); $('prompt').style.display = 'none';
    this.scene.launch(d.minigame, { cfg: mg, strings: this.cfg.strings, onDone: (win: boolean) => {
      this.scene.stop(d.minigame); this.inMini = false; stickCtl.enabled = true; this.input.keyboard!.resetKeys(); if (win) this.complete(); } });
    this.scene.bringToTop(d.minigame);
  }
  complete() {
    const d = this.stageDef(); this.st.stage++;
    this.applyStage(true);
    if (d.reward.open?.length) this.toast(this.S('gateOpened'));
    if (d.reward.bike) this.time.delayedCall(1500, () => this.toast(this.S('gotBike')));
    if (d.reward.end) { this.st.done = true; save(this.st); this.time.delayedCall(800, () => this.showEnd()); }
  }
  startHunt(mg: any) {
    this.toast(this.S('huntStart', { n: mg.items.length }));
    this.hunt = { left: mg.time, items: mg.items.map((c: number[]) => { const t = this.add.image(c[0] * 16 + 8, c[1] * 16 + 8, 'token').setDepth(c[1] * 16 + 14);
      this.tweens.add({ targets: t, scale: 1.25, duration: 500, yoyo: true, repeat: -1 }); return t; }) };
    $('timer').style.display = 'block';
  }
  showEnd() {
    const s = this.st; $('end-title').textContent = this.S('endTitle'); $('end-sub').textContent = this.S('endSubtitle');
    $('end-stats').innerHTML = `<div><b>${this.S('endTime')}</b><span>${clock(s.elapsed)}</span></div>
      <div><b>${this.S('endGames')}</b><span>${Math.min(s.stage, this.cfg.stages.length)}/${this.cfg.stages.length}</span></div>
      <div><b>${this.S('endCollectibles')}</b><span>${s.collected.length}/${this.cfg.collectibles.length}</span></div>`;
    $('end-badges').innerHTML = this.cfg.stages.map((d: any, i: number) => `<span class="${i < s.stage ? 'got' : ''}">${d.badge}</span>`).join('');
    $('end-again').textContent = this.S('playAgain'); $('end-more').textContent = this.S('keepExploring');
    $('end-again').onclick = () => { reset(); location.href = location.pathname; };
    $('end-more').onclick = () => $('end').classList.remove('show');
    $('end').classList.add('show');
  }

  onSand() { const t = this.groundLayer.getTileAtWorldXY(this.player.x, this.player.y + 4); return !!t && t.index === 299; }
  toast(msg: string) {
    const el = $('toast'); el.textContent = msg; el.style.opacity = '1';
    clearTimeout((el as any)._t); (el as any)._t = setTimeout(() => (el.style.opacity = '0'), 2200);
  }
  toggleBike() { // Pokémon-style: hop on/off anywhere except the beach, once unlocked
    if (!this.hasBike() || this.inMini || !this.scene.isActive()) return;
    if (!this.riding && this.onSand()) return this.toast(this.S('noSand'));
    this.riding = !this.riding; this.bike.setVisible(this.riding); $('bike').classList.toggle('on', this.riding);
  }

  update(_: number, dt: number) {
    if (!this.player) return; // still loading ground chunks
    if (this.inMini || G.paused) { this.player.setVelocity(0, 0); this.player.anims.stop(); return; }
    if (!this.st.done) this.st.elapsed += dt;
    if ((this.saveT += dt) > 2000) { this.saveT = 0; this.st.pos = [Math.round(this.player.x), Math.round(this.player.y)]; save(this.st); }
    // collectibles, mini-game spot, beach hunt
    this.gems.forEach((g, i) => { if (g && Phaser.Math.Distance.Between(g.x, g.y, this.player.x, this.player.y) < 14) {
      g.destroy(); this.gems[i] = null; this.st.collected.push(i); this.toast(this.S('collected', { n: this.st.collected.length, total: this.cfg.collectibles.length })); this.hud(); save(this.st); } });
    this.nearSpot = !!this.spot && !this.hunt && Phaser.Math.Distance.Between(this.spot.x, this.spot.y, this.player.x, this.player.y) < 30;
    $('prompt').style.display = this.nearSpot && !this.overview ? 'flex' : 'none';
    if (this.hunt) {
      this.hunt.left -= dt / 1000; $('timer').textContent = `⏱ ${Math.ceil(this.hunt.left)}  ·  ${this.cfg.minigames.hunt.items.length - this.hunt.items.length}/${this.cfg.minigames.hunt.items.length}`;
      this.hunt.items = this.hunt.items.filter((t) => Phaser.Math.Distance.Between(t.x, t.y, this.player.x, this.player.y) < 14 ? (t.destroy(), false) : true);
      if (!this.hunt.items.length) { this.hunt = null; $('timer').style.display = 'none'; this.complete(); }
      else if (this.hunt.left <= 0) { this.hunt.items.forEach((t) => t.destroy()); this.hunt = null; $('timer').style.display = 'none'; this.toast(this.S('huntFail')); }
    }
    // guidance arrow at the screen edge pointing at the next objective
    const arrow = $('arrow');
    if (this.spot && !this.overview) {
      const dx = this.spot.x - this.player.x, dy = this.spot.y - this.player.y, far = Math.hypot(dx, dy) > 110;
      arrow.style.display = far ? 'block' : 'none';
      if (far) { const a = Math.atan2(dy, dx), r = Math.min(innerWidth, innerHeight) / 2 - 34;
        arrow.style.transform = `translate(${innerWidth / 2 + Math.cos(a) * r - 16}px, ${innerHeight / 2 + Math.sin(a) * r - 16}px) rotate(${a}rad)`; }
    } else arrow.style.display = 'none';

    // doors into mobiles: walk into the gap in the front fence
    const door = this.doors.find((d) => d.rect.contains(this.player.x, this.player.y + 4));
    if (!door) this.doorArmed = true; else if (this.doorArmed) { this.doorArmed = false; return this.enterRoom(door.room); }
    for (const a of G.mech.abilityGates) { // locked ability gate: say why when you bump into it (once per approach)
      const g = this.gates[a.gate]; if (!g?.body.active || has(a.needs)) continue;
      const r = Phaser.Geom.Rectangle.Inflate(g.body.getBounds(), 6, 6), near = r.contains(this.player.x, this.player.y + 4);
      if (near && !this.lockSaid.has(a.gate)) { this.lockSaid.add(a.gate); say([a.locked]); }
      if (!Phaser.Geom.Rectangle.Inflate(r, 24, 24).contains(this.player.x, this.player.y)) this.lockSaid.delete(a.gate);
    }
    if (!this.overview) for (const t of this.labels) t.setAlpha(Phaser.Math.Distance.Between(t.x, t.y, this.player.x, this.player.y) < 64 ? 1 : 0);
    this.player.setDepth(this.player.y + 8);
    if (this.riding && this.onSand()) { this.toggleBike(); this.toast(this.S('offSand')); }
    const moving = this.player.drive(this.player.readInput(), this.riding ? BIKE_SPEED : G.mech.player.walk);
    const f = this.player.facing;
    if (this.riding) { // bike drawn under the rider; rider sits a few px higher
      this.bike.setPosition(this.player.x, this.player.y + 2).setDepth(this.player.depth - 0.5);
      this.player.setDisplayOrigin(8, 11);
      if (moving) this.bike.anims.play('bike-' + f, true); else { this.bike.anims.stop(); this.bike.setFrame(DIRS.indexOf(f)); }
      if (f === 'down') this.bike.setDepth(this.player.depth + 0.5);
      return;
    }
    this.player.setDisplayOrigin(8, 8);
  }
}

// canvas at device resolution, CSS-scaled down, so integer camera zoom gives crisp SNES-sized pixels on phones
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', backgroundColor: '#000000', pixelArt: true, roundPixels: true,
  scale: { mode: Phaser.Scale.NONE, width: innerWidth * DPR, height: innerHeight * DPR, zoom: 1 / DPR },
  physics: { default: 'arcade', arcade: { debug: params.has('debug') } },
  scene: [World, Room, Swing, Keepy, Putt, UI],
});
$('fire').addEventListener('pointerdown', (e) => { e.stopPropagation(); ((game.scene.isActive('Room') ? game.scene.getScene('Room') : game.scene.getScene('World')) as any).fire(); });
addEventListener('resize', () => game.scale.resize(innerWidth * DPR, innerHeight * DPR));
