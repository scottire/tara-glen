import Phaser from 'phaser';
import { stick } from './joystick';

const SPEED = 80, BIKE_SPEED = 165;
const DIRS = ['down', 'up', 'left', 'right'] as const; // columns of the Ninja Adventure sheet
const PROPS = ['goal', 'tennis-net', 'bench', 'picnic-table', 'bin', 'lamp', 'fence', 'hedge', 'flowerbed',
  'car-red', 'car-blue', 'car-silver', 'deckchair', 'windbreak', 'golf-flag', 'minigolf-hut', 'signpost'];
const SOLID = new Set(['bench', 'picnic-table', 'bin', 'lamp', 'signpost', 'fence', 'hedge', 'car-red', 'car-blue', 'car-silver', 'windbreak', 'minigolf-hut']);
const params = new URLSearchParams(location.search);
const DPR = params.has('overview') ? 1 : Math.min(window.devicePixelRatio || 1, 3);
type Obj = Phaser.Types.Tilemaps.TiledObject;
const prop = (o: Obj, k: string) => (o.properties as { name: string; value: any }[] | undefined)?.find((p) => p.name === k)?.value;

class World extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Sprite;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  facing: (typeof DIRS)[number] = 'down';
  labels: Phaser.GameObjects.Text[] = [];
  overview = params.has('overview');
  bike!: Phaser.GameObjects.Sprite;
  riding = false;
  groundLayer!: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;

  preload() {
    this.load.image('tiles', 'assets/tiles.png');
    this.load.tilemapTiledJSON('map', 'assets/map.json');
    this.load.spritesheet('player', 'assets/player.png', { frameWidth: 16, frameHeight: 16 });
    // caravan placeholder: swap these two sheets (3 frames = colour variants) for real models later
    this.load.spritesheet('caravan-h', 'assets/caravan-h.png', { frameWidth: 72, frameHeight: 48 });
    this.load.spritesheet('caravan-v', 'assets/caravan-v.png', { frameWidth: 48, frameHeight: 80 });
    PROPS.forEach((p) => this.load.image(p, `assets/props/${p}.png`));
    this.load.image('clubhouse', 'assets/clubhouse.png');
    this.load.image('waves', 'assets/waves.png');
    this.load.image('foam', 'assets/foam.png');
    this.load.spritesheet('bike', 'assets/bike.png', { frameWidth: 24, frameHeight: 24 });
  }

  label(x: number, y: number, text: string, always = false) {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '40px', color: '#fff', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5, 1).setScale(this.overview ? 0.5 : 0.25).setDepth(1e6).setAlpha(this.overview || always ? 1 : 0);
    t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.labels.push(t);
  }

  create() { // ground is pre-baked into image chunks listed in the map properties: load them, then build the world
    const mp = (this.cache.tilemap.get('map').data.properties as { name: string; value: number }[]);
    const P = (n: string) => mp.find((p) => p.name === n)!.value;
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
    const objects = map.createLayer('objects', tiles)!;
    map.createLayer('roofs', tiles)!.setDepth(5e5); // tree canopies + clubhouse roof, drawn above the player
    ground.setCollision([245]); // sea (tile index = png index + 1)
    // animated sea: drifting wave highlights + shoreline foam that laps in and out
    const seaW = map.widthInPixels - shoreX;
    const waves = this.add.tileSprite(shoreX + 24, 0, seaW, map.heightInPixels, 'waves').setOrigin(0).setDepth(-5).setAlpha(0.7);
    const foam = this.add.tileSprite(shoreX, 0, 32, map.heightInPixels, 'foam').setOrigin(0).setDepth(-4);
    this.tweens.add({ targets: foam, x: shoreX - 4, alpha: 0.6, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.events.on('update', () => { waves.tilePositionX -= 0.06; waves.tilePositionY += 0.12; });
    objects.setCollisionByExclusion([-1]);
    const solids = this.physics.add.staticGroup();
    const body = (x: number, y: number, w: number, h: number) => solids.add(this.add.zone(x + w / 2, y + h / 2, w, h));

    for (const o of map.getObjectLayer('buildings')!.objects) { // clubhouse: y-sorted sprite, walk behind its roof
      this.add.image(o.x!, o.y!, o.name).setOrigin(0).setDepth(o.y! + o.height!);
      const inset = prop(o, 'inset') ?? 0; body(o.x! + 4, o.y! + inset, o.width! - 8, o.height! - inset - 3);
    }
    for (const o of map.getObjectLayer('caravans')!.objects) {
      const key = prop(o, 'orient') === 'v' ? 'caravan-v' : 'caravan-h', inset = key === 'caravan-v' ? 20 : 14;
      this.add.image(o.x!, o.y!, key, prop(o, 'variant')).setOrigin(0).setDepth(o.y! + o.height!).setData('segId', prop(o, 'segId'));
      body(o.x! + 2, o.y! + inset, o.width! - 4, o.height! - inset - 2);
      if (params.has('ids')) this.label(o.x! + o.width! / 2, o.y! + 20, String(prop(o, 'segId')));
    }
    for (const o of map.getObjectLayer('props')!.objects) {
      const img = this.add.image(o.x!, o.y!, o.name).setFlipY(!!prop(o, 'flipY'));
      if (prop(o, 'w')) img.setDisplaySize(prop(o, 'w'), img.height);
      img.setDepth(img.y + img.height / 2);
      if (SOLID.has(o.name)) body(img.x - img.displayWidth / 2 + 1, img.y + img.height / 2 - Math.min(10, img.height * 0.6), img.displayWidth - 2, Math.min(10, img.height * 0.6));
      if (prop(o, 'label')) this.label(o.x!, o.y! - 10, prop(o, 'label'));
    }
    if (this.overview) for (const o of map.getObjectLayer('landmarks')!.objects) this.label(o.x!, o.y!, `#${prop(o, 'segId')}`, true);

    const spawn = map.getObjectLayer('markers')!.objects.find((o) => o.type === 'spawn')!;
    const at = params.get('at')?.split(',').map(Number); // debug: ?at=tileX,tileY
    this.player = this.physics.add.sprite(at ? at[0] * 16 + 8 : spawn.x!, at ? at[1] * 16 + 8 : spawn.y!, 'player', 0);
    this.player.setSize(10, 8).setOffset(3, 8).setCollideWorldBounds(true);
    this.bike = this.add.sprite(0, 0, 'bike', 0).setVisible(false);
    DIRS.forEach((d, c) => this.anims.create({ key: 'bike-' + d, frameRate: 10, repeat: -1, frames: this.anims.generateFrameNumbers('bike', { frames: [c, c + 4] }) }));
    const btn = document.getElementById('bike')!;
    btn.style.display = this.overview ? 'none' : 'flex';
    btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.toggleBike(); });
    this.input.keyboard!.on('keydown-B', () => this.toggleBike());
    this.input.keyboard!.on('keydown-SHIFT', () => this.toggleBike());
    this.physics.add.collider(this.player, [ground, objects, solids]);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    DIRS.forEach((d, c) =>
      this.anims.create({ key: d, frameRate: 8, repeat: -1,
        frames: this.anims.generateFrameNumbers('player', { frames: [c, c + 4, c + 8, c + 12] }) }));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    if (this.overview) { // ?overview: whole map, for screenshots (add &ids for caravan segmentation ids)
      cam.setZoom(Math.min(this.scale.width / map.widthInPixels, this.scale.height / map.heightInPixels))
        .centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
    } else {
      cam.startFollow(this.player, true);
      // SNES-like view: ~256-320 game pixels across the short side, integer zoom on the device-pixel canvas
      const fit = () => cam.setZoom(Math.max(1, Math.round(Math.min(this.scale.width, this.scale.height) / 288)));
      fit(); this.scale.on('resize', fit);
    }
    this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  onSand() { const t = this.groundLayer.getTileAtWorldXY(this.player.x, this.player.y + 4); return !!t && t.index === 299; }
  toast(msg: string) {
    const el = document.getElementById('toast')!; el.textContent = msg; el.style.opacity = '1';
    clearTimeout((el as any)._t); (el as any)._t = setTimeout(() => (el.style.opacity = '0'), 1400);
  }
  toggleBike() { // Pokémon-style: hop on/off anywhere except the beach
    if (!this.riding && this.onSand()) return this.toast("Can't ride on the sand");
    this.riding = !this.riding; this.bike.setVisible(this.riding);
    document.getElementById('bike')!.classList.toggle('on', this.riding);
  }

  update() {
    if (!this.player) return; // still loading ground chunks
    if (!this.overview) for (const t of this.labels) // show a sign's text when you walk up to it
      t.setAlpha(Phaser.Math.Distance.Between(t.x, t.y, this.player.x, this.player.y) < 64 ? 1 : 0);
    this.player.setDepth(this.player.y + 8); // y-sort against caravans and props
    const k = this.keys;
    let x = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let y = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (!x && !y && Math.hypot(stick.x, stick.y) > 0.25) { x = stick.x; y = stick.y; }
    const v = new Phaser.Math.Vector2(x, y);
    if (v.length() > 1) v.normalize();
    if (this.riding && this.onSand()) { this.toggleBike(); this.toast('Hopped off: sand'); }
    const sp = this.riding ? BIKE_SPEED : SPEED;
    this.player.setVelocity(v.x * sp, v.y * sp);
    const moving = v.length() >= 0.01;
    if (moving) this.facing = Math.abs(v.x) > Math.abs(v.y) ? (v.x > 0 ? 'right' : 'left') : (v.y > 0 ? 'down' : 'up');
    if (this.riding) { // bike drawn under the rider; rider sits a few px higher
      this.bike.setPosition(this.player.x, this.player.y + 2).setDepth(this.player.depth - 0.5);
      this.player.setDisplayOrigin(8, 11);
      if (moving) { this.bike.anims.play('bike-' + this.facing, true); this.player.anims.play(this.facing, true); }
      else { this.bike.anims.stop(); this.bike.setFrame(DIRS.indexOf(this.facing)); this.player.anims.stop(); this.player.setFrame(DIRS.indexOf(this.facing)); }
      if (this.facing === 'down') this.bike.setDepth(this.player.depth + 0.5); // front wheel + bars in front when riding towards camera
      return;
    }
    this.player.setDisplayOrigin(8, 8);
    if (!moving) { this.player.anims.stop(); this.player.setFrame(DIRS.indexOf(this.facing)); return; }
    this.player.anims.play(this.facing, true);
  }
}

// canvas at device resolution, CSS-scaled down, so integer camera zoom gives crisp SNES-sized pixels on phones
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE, width: innerWidth * DPR, height: innerHeight * DPR, zoom: 1 / DPR },
  physics: { default: 'arcade', arcade: { debug: params.has('debug') } },
  scene: World,
});
addEventListener('resize', () => game.scale.resize(innerWidth * DPR, innerHeight * DPR));
