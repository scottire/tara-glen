// Outdoor scene: the traced park map + everything from world.json (locks, barriers, doors, entities, NPCs, decor, life, events).
import Phaser from 'phaser';
import { urlParam, urlHas, stripUrlState } from '../state';
import { stickCtl } from '../joystick';
import { G, $, S, toast, persist, Player, DIRS } from '../mech/core';
import { Pather } from '../mech/path';
import { cond, count, apply, changed, onChange, flag, migrateSave } from './logic';
import { say, hud, banner, wireButtons, showEnd, bossBar } from './ui';
import { Ents, Walker, type Host } from './entities';
import type { Enemy } from './enemies';
import { throwBalloon, zoneAt } from './fx';
import { applyUrlState, debugPanel } from './debug';
import { practiceYard, feelOverlay, cameraLead } from '../v12/feel';
import { Combat, abilityMoment } from '../v9/combat';
import { Arenas, Checkpoints, LivingDoors, wireObjective } from '../v9/arena';
import CARAVAN_ART from '../../public/assets/art.json';

const BIKE_SPEED = 165;
const PROPS = ['goal', 'tennis-net', 'bench', 'picnic-table', 'bin', 'lamp', 'fence', 'hedge', 'flowerbed',
  'car-red', 'car-blue', 'car-silver', 'deckchair', 'windbreak', 'golf-flag', 'minigolf-hut', 'signpost', 'swings', 'slide', 'roundabout', 'climbing-frame'];
const SOLID = new Set(['bench', 'picnic-table', 'bin', 'lamp', 'signpost', 'fence', 'hedge', 'car-red', 'car-blue', 'car-silver', 'windbreak', 'minigolf-hut',
  'swings', 'slide', 'roundabout', 'climbing-frame']);
export const params = new URLSearchParams(location.search);
// cache-busting: every asset URL carries the build id, so a new deploy never mixes new code with cached old images/JSON
declare const __BUILD__: string;
const V = (u: string) => `${u}?v=${__BUILD__}`;
type Obj = Phaser.Types.Tilemaps.TiledObject;
const prop = (o: Obj, k: string) => (o.properties as { name: string; value: any }[] | undefined)?.find((p) => p.name === k)?.value;

export class World extends Phaser.Scene implements Host {
  constructor() { super('World'); }
  player!: Player; walls: any[] = []; roomId = null; pather?: Pather; enemies: Enemy[] = []; ents!: Ents;
  overview = params.has('overview');
  migrated: string[] = [];
  solids!: Phaser.Physics.Arcade.StaticGroup; gateSolids!: Phaser.Physics.Arcade.StaticGroup;
  camBaseY = 0; ground!: Phaser.Tilemaps.TilemapLayer; bike!: Phaser.GameObjects.Sprite; riding = false;
  gates: Record<string, { img: Phaser.GameObjects.TileSprite; body: Phaser.GameObjects.Zone }> = {};
  lockObjs: { l: any; body?: Phaser.GameObjects.Zone; sprites: Phaser.GameObjects.Image[]; open: boolean }[] = [];
  said = new Map<string, Phaser.Geom.Rectangle>(); doorArmed = true; lastSafe: [number, number] = [0, 0];
  labels: Phaser.GameObjects.Text[] = []; zone = ''; zoneT = 0; saveT = 0; inMini = false;
  night!: Phaser.GameObjects.Rectangle; glows: Phaser.GameObjects.Arc[] = [];
  hunt: { e: any; items: Phaser.GameObjects.Image[]; left: number } | null = null;
  combat!: Combat; arenas!: Arenas; cps!: Checkpoints; living!: LivingDoors; benches: [number, number][] = [];

  preload() {
    this.load.json('world', V('world.json')); this.load.json('rooms', V('rooms.json'));
    this.load.image('tiles', V('assets/tiles.png')); this.load.tilemapTiledJSON('map', V('assets/map.json'));
    this.load.spritesheet('player', V('assets/player.png'), { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('hero', V('assets/v10/player.png'), { frameWidth: 24, frameHeight: 24 }); this.load.json('hero', V('assets/v10/player.json'));
    this.load.spritesheet('herofx', V('assets/v10/fx.png'), { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('chars', V('assets/v6/chars.png'), { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('dog', V('assets/v6/dog.png'), { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('monsters', V('assets/v6/monsters.png'), { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('items', V('assets/v6/items.png'), { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('interior6', V('assets/v6/interior.png'), { frameWidth: 16, frameHeight: 16 });
    this.load.image('interior6img', V('assets/v6/interior.png'));
    // v11: Glen rope-swing tree + caravan furniture cut from the AI props sheet (scripts/gen/restyle.py v11)
    this.load.image('glen-tree', V('assets/v6/glen-tree.png'));
    for (const k of ['sofa', 'tv', 'kitchen', 'bunk', 'wardrobe', 'table', 'lamp', 'shelf', 'rug', 'plant']) this.load.image('ip-' + k, V(`assets/v6/ip/${k}.png`));
    this.load.spritesheet('chest', V('assets/chest.png'), { frameWidth: 16, frameHeight: 16 });
    this.load.image('balloon', V('assets/balloon.png'));
    // caravan art overhangs its 72x48 / 48x80 footprint (frame sizes + offsets in art.json, written by scripts/gen/restyle.py)
    this.load.spritesheet('caravan-h', V('assets/caravan-h.png'), { frameWidth: CARAVAN_ART.h.fw, frameHeight: CARAVAN_ART.h.fh });
    this.load.spritesheet('caravan-v', V('assets/caravan-v.png'), { frameWidth: CARAVAN_ART.v.fw, frameHeight: CARAVAN_ART.v.fh });
    this.load.image('canopy', V('assets/canopy.png')); this.load.json('canopy', V('assets/canopy.json'));
    PROPS.forEach((p) => this.load.image(p, V(`assets/props/${p}.png`)));
    ['clubhouse', 'waves', 'foam', 'gate-h', 'gate-v', 'spot'].forEach((k) => this.load.image(k, V(`assets/${k}.png`)));
    this.load.spritesheet('bike', V('assets/bike.png'), { frameWidth: 24, frameHeight: 24 });
  }

  create() {
    G.w = this.cache.json.get('world'); applyUrlState(); this.migrated = migrateSave();
    for (const [k, [w, h]] of Object.entries<number[]>(G.w.decorSizes)) this.load.spritesheet('d-' + k, V(`assets/v6/decor/${k}.png`), { frameWidth: w, frameHeight: h });
    const mp = this.cache.tilemap.get('map').data.properties as { name: string; value: number }[];
    const P = (k: string) => mp.find((p) => p.name === k)!.value;
    for (let y = 0; y < P('groundRows'); y++) for (let x = 0; x < P('groundCols'); x++) this.load.image(`g_${x}_${y}`, V(`assets/ground/g_${x}_${y}.png`));
    this.load.once('complete', () => this.build(P('groundChunk'), P('groundCols'), P('groundRows'), P('shoreX')));
    this.load.start();
  }

  label(x: number, y: number, text: string, always = false) {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '40px', color: '#fff', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5, 1).setScale(this.overview ? 0.5 : 0.25).setDepth(1e6).setAlpha(this.overview || always ? 1 : 0);
    t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR); this.labels.push(t); return t;
  }

  build(chunk: number, cols: number, rows: number, shoreX: number) {
    (this as any).groundChunk = chunk;
    const anims = this.anims;
    for (const k of ['sparkle', 'bush', 'cat', 'gullsit', 'bonfire']) if (!anims.exists('d-' + k)) anims.create({ key: 'd-' + k, frames: anims.generateFrameNumbers('d-' + k, {}), frameRate: k === 'bonfire' ? 6 : 2, repeat: -1 });
    if (!anims.exists('dog-idle')) anims.create({ key: 'dog-idle', frames: anims.generateFrameNumbers('dog', {}), frameRate: 2, repeat: -1 });
    G.w.decorAnim = ['sparkle', 'bush', 'cat', 'gullsit', 'bonfire'];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) this.add.image(x * chunk, y * chunk, `g_${x}_${y}`).setOrigin(0).setDepth(-10);
    const map = this.make.tilemap({ key: 'map' }), tiles = map.addTilesetImage('tiles', 'tiles')!;
    const ground = this.ground = map.createLayer('ground', tiles)!.setVisible(false) as Phaser.Tilemaps.TilemapLayer;
    const objects = map.createLayer('objects', tiles)! as Phaser.Tilemaps.TilemapLayer;
    objects.forEachTile((t) => { if (t.index >= 1121 && t.index <= 1125) objects.removeTileAt(t.x, t.y); }); // v11: the old make-world hedge lines are gone
    for (const [x, y, gid] of G.w.barrierTiles) objects.putTileAt(gid, x, y); // v11 zone borders: collision only, the art is baked into the ground
    // trees: trunks are baked into the ground chunks, canopies into a deduplicated tileset drawn above the player
    // (scripts/gen/ground.py); the old roofs layer is empty and the trunk tiles in `objects` keep the collision
    const cj = this.cache.json.get('canopy') as { w: number; h: number; data: number[] }, rowsC: number[][] = [];
    for (let y = 0; y < cj.h; y++) rowsC.push(cj.data.slice(y * cj.w, (y + 1) * cj.w).map((v) => v - 1));
    const cmap = this.make.tilemap({ data: rowsC, tileWidth: 16, tileHeight: 16 });
    cmap.createLayer(0, cmap.addTilesetImage('canopy')!, 0, 0)!.setDepth(5e5);
    ground.setCollision([245]); objects.setCollisionByExclusion([-1]);
    const waves = this.add.tileSprite(shoreX + 24, 0, map.widthInPixels - shoreX, map.heightInPixels, 'waves').setOrigin(0).setDepth(-5).setAlpha(0.7);
    const foam = this.add.tileSprite(shoreX, 0, 32, map.heightInPixels, 'foam').setOrigin(0).setDepth(-4);
    this.tweens.add({ targets: foam, x: shoreX - 4, alpha: 0.6, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.events.on('update', () => { waves.tilePositionX -= 0.06; waves.tilePositionY += 0.12; });
    // static scenery is culled to the camera (a few hundred images; only those near the view are drawn)
    const statics: Phaser.GameObjects.Image[] = [], cull = <T extends Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.Text>(o: T) => { statics.push(o as any); return o; };
    const solids = this.solids = this.physics.add.staticGroup();
    const body = (x: number, y: number, w: number, h: number) => { const z = this.add.zone(x + w / 2, y + h / 2, w, h); solids.add(z); return z; };
    for (const o of map.getObjectLayer('buildings')!.objects) {
      cull(this.add.image(o.x!, o.y!, o.name).setOrigin(0).setDepth(o.y! + o.height!));
      const inset = prop(o, 'inset') ?? 0; body(o.x! + 4, o.y! + inset, o.width! - 8, o.height! - inset - 3);
    }
    for (const o of map.getObjectLayer('caravans')!.objects) {
      const key = prop(o, 'orient') === 'v' ? 'caravan-v' : 'caravan-h', inset = key === 'caravan-v' ? 20 : 14;
      const a = CARAVAN_ART[key === 'caravan-v' ? 'v' : 'h'], flip = key === 'caravan-h' && prop(o, 'segId') % 2 === 1; // same rule as grid.py Grid.art
      cull(this.add.image(o.x! - a.ox, o.y! + o.height! - a.fh, key, prop(o, 'variant')).setOrigin(0).setFlipX(flip).setDepth(o.y! + o.height!));
      body(o.x! + 2, o.y! + inset, o.width! - 4, o.height! - inset - 2);
      const lab = prop(o, 'label') ?? (params.has('ids') ? String(prop(o, 'segId')) : null);
      if (prop(o, 'home') || [127, 131].includes(prop(o, 'segId'))) cull(this.add.text(o.x! + o.width! / 2, o.y! + o.height! - 3, lab ?? String(prop(o, 'segId')), { fontFamily: 'monospace', fontSize: '24px', color: '#fff', stroke: '#3a2a20', strokeThickness: 4 })
        .setOrigin(0.5).setScale(0.25).setDepth(o.y! + o.height! + 1)).texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    const lamps: [number, number][] = [];
    for (const o of map.getObjectLayer('props')!.objects) {
      const img = cull(this.add.image(o.x!, o.y!, o.name).setFlipY(!!prop(o, 'flipY')));
      if (prop(o, 'w')) img.setDisplaySize(prop(o, 'w'), img.height);
      img.setDepth(img.y + img.height / 2);
      if (SOLID.has(o.name)) { const bh = Math.min(10, img.height * 0.6); body(img.x - img.displayWidth / 2 + 1, img.y + img.height / 2 - bh, img.displayWidth - 2, bh); }
      if (o.name === 'lamp') lamps.push([o.x!, o.y! - 10]);
      if (o.name === 'bench') this.benches.push([o.x!, o.y!]);
      if (prop(o, 'label')) this.label(o.x!, o.y! - 10, prop(o, 'label'));
    }
    const gateSolids = this.gateSolids = this.physics.add.staticGroup();
    for (const o of G.w.legacyGates ? map.getObjectLayer('gates')!.objects : []) { // v11: the old posts/gates are gone (gates[] in world.json)
      const v = prop(o, 'orient') === 'v';
      const img = this.add.tileSprite(o.x! + o.width! / 2, o.y! + o.height! / 2, o.width!, v ? o.height! : 22, v ? 'gate-v' : 'gate-h').setDepth(o.y! + o.height!);
      this.gates[o.name!] = { img, body: this.add.zone(o.x! + o.width! / 2, o.y! + o.height! / 2, o.width!, o.height!) };
    }
    // generated decor (solid ones get bodies)
    for (const d of G.w.decor) {
      const s = cull(this.add.sprite(d.x * 16 + 8, d.y * 16 + 16, 'd-' + d.sprite).setOrigin(0.5, 1).setDepth(d.y * 16 + 14));
      if (d.anim || G.w.decorAnim.includes(d.sprite)) s.play({ key: 'd-' + d.sprite, startFrame: Math.floor(Math.random() * 2) });
      if (d.solid) { const w = s.width; body(d.x * 16 + 8 - w / 2 + 2, d.y * 16 + 4, w - 4, 11); }
      (d as any).obj = s;
    }
    const sb = statics.map((o) => o.getBounds());
    const cullAll = () => { const v = this.cameras.main.worldView, m = 48; for (let i = 0; i < statics.length; i++) { const r = sb[i]; statics[i].setVisible(r.right > v.x - m && r.x < v.right + m && r.bottom > v.y - m && r.y < v.bottom + m); } };
    this.time.addEvent({ delay: 150, loop: true, callback: cullAll }); this.events.once('postupdate', cullAll);
    const spawnAt = G.w.start.out;
    const at = urlParam('at')?.split(',').map(Number);
    const start = at ? [at[0] * 16 + 8, at[1] * 16 + 8] : G.st.pos ?? spawnAt;
    this.lastSafe = [spawnAt[0], spawnAt[1]];
    this.player = new Player(this, start[0], start[1]);
    this.walls = [ground, objects, solids, gateSolids];
    this.physics.add.collider(this.player, [ground, objects, solids]);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.buildLocks();
    const rects = [...solids.getChildren(), ...gateSolids.getChildren()].map((z) => (z as Phaser.GameObjects.Zone).getBounds());
    this.pather = Pather.build(this, map.width, map.height, [ground, objects], rects);
    this.ents = new Ents(this);
    for (const d of G.w.decor) if (d.lines) this.ents.things.push({ kind: 'decor', e: { ...d, x: d.x * 16 + 8, y: d.y * 16 + 8 }, obj: (d as any).obj });
    for (const a of G.w.ambient) { const wk = new Walker(this, a, this.pather); this.physics.add.collider(wk, [objects, solids]);
      if (a.barks?.length) this.ents.things.push({ kind: 'decor', e: { lines: [a.barks[Math.floor(Math.random() * a.barks.length)]] }, obj: wk }); } // v9: no filler barks
    this.combat = new Combat(this); practiceYard(this); feelOverlay(); this.arenas = new Arenas(this); this.cps = new Checkpoints(this, this.benches); this.living = new LivingDoors(this);
    // night + lamps (world event: evening)
    this.night = this.add.rectangle(0, 0, 4000, 4000, 0x101a50, 0.5).setDepth(9e5).setVisible(false); // follows the camera (scrollFactor 0 shapes don't render in Phaser 4)
    for (const [x, y] of lamps) this.glows.push(this.add.circle(x, y, 26, 0xffd27a, 0.22).setDepth(9e5 + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    const fire = G.w.entities.find((e: any) => e.id === 'bonfire');
    if (fire) this.glows.push(this.add.circle(fire.x, fire.y, 46, 0xff9a3a, 0.3).setDepth(9e5 + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    onChange(() => { this.applyWorld(); this.living?.refresh(); }); this.applyWorld(true);

    this.input.keyboard!.on('keydown-X', () => this.fire()); this.input.keyboard!.on('keydown-F', () => this.fire());
    this.input.keyboard!.on('keydown-Z', () => this.dash()); this.input.keyboard!.on('keydown-C', () => this.dash());
    this.bike = this.add.sprite(0, 0, 'bike', 0).setVisible(false);
    DIRS.forEach((d, c) => this.anims.create({ key: 'bike-' + d, frameRate: 10, repeat: -1, frames: this.anims.generateFrameNumbers('bike', { frames: [c, c + 4] }) }));
    $('bike').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.toggleBike(); });
    this.input.keyboard!.on('keydown-B', () => this.toggleBike());
    this.input.keyboard!.on('keydown-I', () => $('bag-btn').dispatchEvent(new Event('pointerdown')));
    this.events.on('player-dead', () => { toast(S('fainted')); if (this.riding) this.toggleBike(); this.arenas.reset(); this.player.revive(...this.cps.respawn()); this.cameras.main.fadeIn(300); hud(); });
    this.events.on('hud', hud);
    const cam = this.cameras.main; cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    if (this.overview) {
      cam.setZoom(Math.min(this.scale.width / map.widthInPixels, this.scale.height / map.heightInPixels)).centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
      document.body.classList.add('overview');
    } else {
      cam.startFollow(this.player, true);
      // v9: keep the action in the upper-middle, clear of the thumbs (player sits ~12% above centre on portrait screens)
      const fit = () => { const z = Math.max(1, Math.round(Math.min(this.scale.width, this.scale.height) / 288)); cam.setZoom(z);
        this.camBaseY = this.scale.height > this.scale.width ? -Math.round(this.scale.height / z * 0.12) : 0; cam.setFollowOffset(0, this.camBaseY); };
      fit(); this.scale.on('resize', fit);
    }
    document.title = G.w.title; wireButtons(); wireObjective(); debugPanel(this);
    (window as any).tg = this;
    if (!G.st.started) { G.st.started = true; if (!at && !this.overview && G.st.room === undefined) G.st.room = G.w.start.room; }
    if (urlParam('room')) G.st.room = urlParam('room');
    stripUrlState(); // v11.2: one-shot; a reload (iOS tab eviction) must never re-apply ?snap/?fresh over real progress
    persist();
    // v11.2: save when the tab is hidden, closed or frozen (iOS evicts backgrounded tabs without warning)
    const flush = () => { try { if (!G.st.room && this.player?.active) G.st.pos = [Math.round(this.player.x), Math.round(this.player.y)];
      const r = (window as any).room; if (G.st.room && r?.player?.active) G.st.roomPos = [Math.round(r.player.x), Math.round(r.player.y)]; persist(); } catch { /* ignore */ } };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush); document.addEventListener('freeze', flush); window.addEventListener('beforeunload', flush);
    (window as any).tgFlush = flush;
    hud(); changed();
    this.migrated.forEach((k, i) => setTimeout(() => abilityMoment((window as any).room?.sys?.isActive() ? (window as any).room : this, k), 900 + i * 2600)); // v10: rewards for fights won in an older save
    if (G.st.done && flag('ending')) showEnd();
    if (G.st.room && !at && !this.overview) this.enterRoom(G.st.room, true);
    else if (!this.overview) this.time.delayedCall(400, () => this.checkZone(true));
  }

  // ---------- locks ----------
  buildLocks() {
    for (const l of G.w.locks) {
      const o: (typeof this.lockObjs)[number] = { l, sprites: [], open: false };
      const [x, y, w, h] = l.rect;
      if (l.kind === 'water') {
        if (['sandbar', 'rock', 'shallows'].includes(l.id)) for (const [tx, ty] of l.tiles)
          o.sprites.push(this.add.image(tx * 16 + 8, ty * 16 + 8, 'd-sandbar').setDepth(-3).setVisible(false).setAlpha(l.id === 'shallows' ? 0.55 : 1));
        if (!l.silent) o.body = this.add.zone(x + w / 2, y + h / 2, w + 8, h + 8); // talk zone only (no collision)
      } else {
        if (l.gate) { const g = this.gates[l.gate]; o.body = g.body; if (l.kind === 'ride') { g.img.setVisible(false); for (const [tx, ty] of l.tiles) o.sprites.push(this.add.image(tx * 16 + 8, ty * 16 + 8, 'd-cattlegrid').setDepth(-2)); } else o.sprites.push(g.img as any); }
        else {
          o.body = this.add.zone(x + w / 2, y + h / 2, w, h);
          const art = ({ brambles: 'd-brambles', roadclosed: 'd-roadclosed', chasm: 'd-chasm', crowd: 'd-crowd', rope: 'd-rope', terrace: 'd-terrace' } as any)[l.art] ?? 'd-pole';
          for (const [tx, ty] of l.tiles) {
            const sp = this.add.sprite(tx * 16 + 8, ty * 16 + 16, art).setOrigin(0.5, 1).setDepth(l.kind === 'jump' ? -3 : ty * 16 + 12);
            if (art === 'd-crowd') sp.play({ key: 'd-crowd', startFrame: (tx + ty) % 2 });
            o.sprites.push(sp as any);
          }
          if (l.kind === 'jump') { // a ramp on the near side of the gully (the gully stays: it's the landscape, not a gate)
            const t = l.tiles[Math.floor(l.tiles.length / 2)], up = this.zoneIdx(t[0], t[1] - 1) < this.zoneIdx(t[0], t[1] + 1);
            this.add.image(t[0] * 16 + 8, (t[1] + (up ? -1 : 1)) * 16 + 8, 'd-ramp').setFlipY(!up).setDepth(-2);
          }
        }
        this.gateSolids.add(o.body);
        this.physics.add.collider(this.player, o.body, () => this.bump(o), () => this.passable(o));
      }
      this.lockObjs.push(o);
    }
  }
  passable(o: (typeof this.lockObjs)[number]) { // false = collide
    if (o.open) return false;
    if (o.l.kind === 'dash') return !(this.player.dashing && cond(o.l.req));
    if (o.l.kind === 'ride') return !(this.riding && cond(o.l.req));
    return true; // jump/crowd/guard/solid: bump() decides
  }
  sayOnce(id: string, rect: Phaser.Geom.Rectangle, lines: string[], toastOnly = false) {
    if (this.said.has(id)) return; this.said.set(id, Phaser.Geom.Rectangle.Inflate(Phaser.Geom.Rectangle.Clone(rect), 40, 40));
    if (toastOnly) toast(lines[0]); else say(lines);
  }
  bump(o: (typeof this.lockObjs)[number]) {
    const l = o.l, r = o.body!.getBounds(), has = cond(l.req);
    if (l.kind === 'climb' && has) return this.hop(o);
    if (l.kind === 'solid' && has) return this.openLock(o, '🔓 Unlocked!');
    if (l.kind === 'crack' && has) return this.sayOnce(l.id, r, ['Hold ⚔️ and let go when the ring glows to drive through it.'], true);
    if (l.kind === 'dash' && has) return this.sayOnce(l.id, r, [S('dashHint')], true);
    if (l.kind === 'ride' && has) return this.sayOnce(l.id, r, [S('rideHint')], true);
    if (l.kind === 'jump' && has) { if (this.riding) return this.hop(o, true); return this.sayOnce(l.id + 'r', r, ['Get on the bike 🚲 and hit the ramp.'], true); }
    if ((l.kind === 'crowd' || l.kind === 'guard') && has) return this.openLock(o, l.kind === 'crowd' ? 'Full time. The crowd drifts off.' : 'Tadhg lifts the rope.');
    this.sayOnce(l.id, r, [l.text]);
  }
  openLock(o: (typeof this.lockObjs)[number], msg: string) {
    if (o.open) return; o.open = true; (o.body!.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    o.sprites.forEach((s) => this.tweens.add({ targets: s, scaleY: 0.05, alpha: 0, duration: 600, ease: 'Back.in' })); toast(msg); G.st.flags.push('open:' + o.l.id); persist(); changed();
  }
  /** v10: a charged drive breaks rotten gates (crack locks) in reach */
  driveHit(x: number, y: number, r: number) {
    for (const o of this.lockObjs) if (o.l.kind === 'crack' && !o.open && cond(o.l.req) && o.body && Phaser.Geom.Rectangle.Overlaps(Phaser.Geom.Rectangle.Inflate(o.body.getBounds(), r, r), new Phaser.Geom.Rectangle(x - 1, y - 1, 2, 2))) {
      const b = o.body.getBounds(); this.cameras.main.shake(200, 0.008);
      for (let i = 0; i < 10; i++) { const p = this.add.rectangle(b.centerX + (Math.random() - 0.5) * b.width, b.centerY, 3, 2, 0x8d5537).setDepth(9e4);
        this.tweens.add({ targets: p, x: p.x + (Math.random() - 0.5) * 40, y: p.y - 10 - Math.random() * 20, alpha: 0, angle: 180, duration: 600, onComplete: () => p.destroy() }); }
      this.openLock(o, 'The rotten gate gives way.');
    }
  }
  hop(o: (typeof this.lockObjs)[number], jump = false) {
    if ((this.player as any).hopping) return; (this.player as any).hopping = true;
    const r = o.body!.getBounds(), p = this.player, v = r.width > r.height, d = jump ? 22 : 10;
    const tx = v ? p.x : (p.x < r.centerX ? r.right + d : r.left - d), ty = v ? (p.y < r.centerY ? r.bottom + d + 2 : r.top - d - 2) : p.y;
    p.body.enable = false; toast(jump ? '🚲 Wheee!' : S('hop'));
    if (jump) { this.cameras.main.shake(120, 0.004); G.st.flags.includes('jumped:' + o.l.id) || (G.st.flags.push('jumped:' + o.l.id), persist()); }
    this.tweens.add({ targets: p, x: tx, y: ty, duration: jump ? 620 : 420, ease: 'Sine.inOut', onComplete: () => { p.body.enable = true; (p as any).hopping = false; if (jump) this.cameras.main.shake(90, 0.006); } });
    this.tweens.add({ targets: p, scaleY: jump ? 1.35 : 1.2, scaleX: jump ? 1.15 : 1, duration: jump ? 310 : 210, yoyo: true });
  }
  zoneIdx(tx: number, ty: number) { return +(G.w.zoneGrid[ty * G.w.mapW + tx] ?? 0); }
  applyWorld(first = false) {
    const eve = flag('evening'), tide = flag('tide_out');
    if (!G.st.room) $('bike').style.display = count('bike') ? 'flex' : 'none'; // also on load (a save outdoors with the bike had no button)
    this.night.setVisible(eve); this.glows.forEach((g) => g.setVisible(eve));
    for (const o of this.lockObjs) {
      if (o.l.kind !== 'water') {
        const auto = o.l.kind === 'crowd' || o.l.kind === 'guard'; // v11: the match ends / Tadhg steps aside the moment the flag is set
        if (first && (o.l.kind === 'solid' || o.l.kind === 'crack' || auto) && (flag('open:' + o.l.id) || (auto && cond(o.l.req)))) { o.open = true; (o.body!.body as Phaser.Physics.Arcade.StaticBody).enable = false; o.sprites.forEach((s) => s.setVisible(false)); }
        else if (auto && !o.open && cond(o.l.req)) this.openLock(o, o.l.kind === 'crowd' ? 'Full time. The crowd drifts off.' : 'Tadhg lifts the rope.');
        continue; }
      const open = cond(o.l.req);
      if (open === o.open && !first) continue; o.open = open;
      for (const [tx, ty] of o.l.tiles) { const t = this.ground.getTileAt(tx, ty); if (t) t.setCollision(!open, !open, !open, !open); }
      o.sprites.forEach((s) => s.setVisible(open && (o.l.id !== 'shallows' || tide)));
      if (open && !first && !o.l.silent) toast('🌊 ' + (tide ? 'The tide has gone out!' : 'You can wade out now.'));
    }
  }

  // ---------- rooms ----------
  enterRoom(id: string, resume = false, side?: string) {
    if (this.riding) this.toggleBike(); bossBar(null);
    this.player.setVelocity(0, 0); ['bike', 'prompt', 'arrow'].forEach((k) => ($(k).style.display = 'none'));
    const go = () => { this.scene.sleep(); this.scene.launch('Room', { id, resume, side }); };
    if (resume) return go();
    this.cameras.main.fadeOut(200); this.cameras.main.once('camerafadeoutcomplete', go);
  }
  goRoom(id: string) { this.enterRoom(id); }
  exitRoom(id: string, side?: string) { // v11: the Glen has two doors (top = behind 127, bottom = Playground Row)
    const d = G.w.doors.find((x: any) => x.room === id && (!side || (x.side ?? 'bottom') === side)) ?? G.w.doors.find((x: any) => x.room === id);
    if (d) { this.player.setPosition(d.out[0], d.out[1]); this.lastSafe = [d.out[0], d.out[1]]; this.cps.setAt(d.out[0], d.out[1]); }
    this.player.facing = 'down'; this.doorArmed = false; this.input.keyboard!.resetKeys(); bossBar(null);
    this.cameras.main.fadeIn(250); $('bike').style.display = count('bike') ? 'flex' : 'none'; changed(); this.checkZone();
  }
  fire() { if (this.combat.chip()) return; throwBalloon(this, this.player, [this.ground, ...this.walls.slice(1)], this.enemies); }
  dash() { if (!this.riding && !this.inMini) this.combat.dodge(); }
  onEnemyDeath(en: Enemy) { this.arenas?.onDeath(en); }
  interact() { if (!this.inMini && !this.hunt) this.ents.interact(); }

  // ---------- activities ----------
  startActivity(e: any) {
    if (this.inMini || this.hunt || G.paused) return;
    if (e.minigame === 'hunt') return this.startHunt(e);
    if (this.riding) this.toggleBike();
    this.inMini = true; stickCtl.enabled = false; this.player.setVelocity(0, 0); $('prompt').style.display = 'none';
    this.scene.launch(e.minigame, { cfg: G.w.minigames[e.minigame], strings: G.w.strings, onDone: (win: boolean) => {
      this.scene.stop(e.minigame); this.inMini = false; stickCtl.enabled = true; this.input.keyboard!.resetKeys();
      if (win) this.activityWon(e); } });
    this.scene.bringToTop(e.minigame);
  }
  activityWon(e: any) {
    G.st.got.push(e.id); const lines = apply(e.reward);
    this.ents.things.filter((t) => t.e === e).forEach((t) => t.obj.destroy());
    if (lines.length) say(lines); changed();
  }
  startHunt(e: any) {
    toast(S('huntStart', { n: e.points.length }));
    this.hunt = { e, left: e.time, items: e.points.map(([x, y]: number[]) => { const t = this.add.image(x, y, 'items', G.w.itemSprites.indexOf('star')).setDepth(y + 6);
      this.tweens.add({ targets: t, scale: 1.25, duration: 500, yoyo: true, repeat: -1 }); return t; }) };
    $('timer').style.display = 'block';
  }
  toggleBike() {
    if (!count('bike') || this.inMini || !this.scene.isActive()) return;
    if (!this.riding && this.onSand()) return toast(S('noSand'));
    this.riding = !this.riding; this.bike.setVisible(this.riding); $('bike').classList.toggle('on', this.riding);
  }
  onSand() { const t = this.ground.getTileAt(Math.floor(this.player.x / 16), Math.floor((this.player.y + 4) / 16)); return !!t && t.index === 299; }
  checkZone(force = false) {
    const z = zoneAt(Math.floor(this.player.x / 16), Math.floor(this.player.y / 16)); if (!z || (z.id === this.zone && !force)) return;
    this.zone = z.id; const first = !G.st.seenZones.includes(z.id);
    if (first) { G.st.seenZones.push(z.id); persist(); }
    // the hints and the solver both key on visited_<zone> (it was never set at runtime before v11, so "!@visited_z2" hints stuck)
    if (!flag('visited_' + z.id)) { G.st.flags.push('visited_' + z.id); persist(); changed(); }
    banner(z.name, first ? 'New area!' : '');
  }

  arrowT = 0;
  // ?hints only: edge arrow towards the current hint's target (resolved by the generator), or a bobbing marker over it when on screen
  pointArrow() {
    const el = $('arrow'), h = G.w.hints.find((h: any) => cond(h.when));
    const t = h?.target?.find((t: any) => cond(t.when))?.at;
    if (!t || G.paused) { el.style.display = 'none'; return; }
    const cam = this.cameras.main, v = cam.worldView, q = this.game.canvas.getBoundingClientRect().width / this.scale.width;
    const sx = (t[0] - v.x) * cam.zoom * q, sy = (t[1] - v.y) * cam.zoom * q, W = innerWidth, H = innerHeight, m = 40;
    let x = sx, y = sy - 26, rot = 90;
    if (sx < m || sx > W - m || sy < 90 || sy > H - 120) {
      const cx = W / 2, cy = H / 2, a = Math.atan2(sy - cy, sx - cx), k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 110) / Math.abs(Math.sin(a) || 1e-6));
      x = cx + Math.cos(a) * k; y = cy + Math.sin(a) * k; rot = a * 180 / Math.PI;
    } else y += Math.sin(this.time.now / 180) * 4;
    el.style.display = 'block'; el.style.transform = `translate(${x - 16}px, ${y - 16}px) rotate(${rot}deg)`;
  }
  update(_: number, dt: number) {
    if (!this.player) return;
    if (this.night.visible) { const m = this.cameras.main.midPoint; this.night.setPosition(m.x, m.y); }
        if (this.inMini || G.paused) { if (!this.player.dashing) this.player.setVelocity(0, 0); this.player.idle(); if (G.paused) $('prompt').style.display = 'none'; return; }
    if (!G.st.done) G.st.elapsed += dt;
    if ((this.saveT += dt) > 2000) { this.saveT = 0; G.st.pos = [Math.round(this.player.x), Math.round(this.player.y)]; persist(); }
    if ((this.zoneT += dt) > 500) { this.zoneT = 0; this.checkZone(); }
    if (document.body.classList.contains('hints') && (this.arrowT += dt) > 100) { this.arrowT = 0; this.pointArrow(); }
    for (const [id, r] of this.said) if (!r.contains(this.player.x, this.player.y)) this.said.delete(id);
    this.ents.update(); this.arenas.update(); this.cps.update(dt); this.living.update(dt);
    if (this.hunt) {
      const h = this.hunt; h.left -= dt / 1000;
      h.items = h.items.filter((t) => Phaser.Math.Distance.Between(t.x, t.y, this.player.x, this.player.y) < 14 ? (t.destroy(), false) : true);
      $('timer').textContent = `⏱ ${Math.ceil(h.left)}  ·  ⭐ ${h.e.points.length - h.items.length}/${h.e.points.length}`;
      if (!h.items.length) { this.hunt = null; $('timer').style.display = 'none'; this.activityWon(h.e); }
      else if (h.left <= 0) { h.items.forEach((t) => t.destroy()); this.hunt = null; $('timer').style.display = 'none'; toast(S('huntFail')); }
    }
    // doors: walk up into a mobile's front door
    const p = this.player, door = G.w.doors.find((d: any) => Math.abs(p.x - d.x) < 7 && p.y + 4 > d.y - 6 && p.y + 4 < d.y + 4);
    if (!door) this.doorArmed = true;
    else if (this.doorArmed && (p.body.velocity.y < 0 || p.readInput().y < -0.3)) { // pushing up into it counts (a solid shed stops the body dead)
      this.doorArmed = false;
      if (door.knock) return this.sayOnce('door' + door.x, new Phaser.Geom.Rectangle(door.x - 8, door.y - 8, 16, 16), [door.knock]);
      if (!cond(door.req)) return this.sayOnce('door' + door.x, new Phaser.Geom.Rectangle(door.x - 8, door.y - 8, 16, 16), [door.locked]);
      return this.enterRoom(door.room, false, door.side);
    }
    for (const o of this.lockObjs) if (o.l.kind === 'water' && !o.open && o.body && Phaser.Geom.Rectangle.Contains(o.body.getBounds(), p.x, p.y)) this.sayOnce(o.l.id, o.body.getBounds(), [o.l.text]);
    if (!this.overview) for (const t of this.labels) t.setAlpha(Phaser.Math.Distance.Between(t.x, t.y, p.x, p.y) < 64 ? 1 : 0);
    if (this.riding && this.onSand()) { this.toggleBike(); toast(S('offSand')); }
    if ((p as any).hopping) return;
    const moving = p.drive(p.readInput(), this.riding ? BIKE_SPEED : G.w.start.walk * (count('trainers') ? 1.15 : 1));
    const f = p.facing; if (!this.overview) cameraLead(this, this.camBaseY, this.riding);
    if (this.riding) {
      this.bike.setPosition(p.x, p.y + 2).setDepth(p.depth - 0.5); p.setDisplayOrigin(12, 17);
      if (moving) this.bike.anims.play('bike-' + f, true); else { this.bike.anims.stop(); this.bike.setFrame(DIRS.indexOf(f)); }
      if (f === 'down') this.bike.setDepth(p.depth + 0.5);
      return;
    }
    p.setDisplayOrigin(12, 14);
  }
}
