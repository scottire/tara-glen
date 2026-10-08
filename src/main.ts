import Phaser from 'phaser';
import { stick } from './joystick';

const SPEED = 80;
const DIRS = ['down', 'up', 'left', 'right'] as const; // columns of the Ninja Adventure sheet
const PROPS = ['tennis', 'hardcourt', 'goal', 'tennis-net', 'bench', 'picnic-table', 'bin', 'lamp', 'sign', 'fence', 'hedge', 'flowerbed',
  'car-red', 'car-blue', 'car-silver', 'deckchair', 'windbreak', 'golf-flag', 'minigolf-hut'];
const SOLID = new Set(['bench', 'picnic-table', 'bin', 'lamp', 'sign', 'fence', 'hedge', 'car-red', 'car-blue', 'car-silver', 'windbreak', 'minigolf-hut']);
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

  preload() {
    this.load.image('tiles', 'assets/tiles.png');
    this.load.tilemapTiledJSON('map', 'assets/map.json');
    this.load.spritesheet('player', 'assets/player.png', { frameWidth: 16, frameHeight: 16 });
    // caravan placeholder: swap these two sheets (3 frames = colour variants) for real models later
    this.load.spritesheet('caravan-h', 'assets/caravan-h.png', { frameWidth: 72, frameHeight: 48 });
    this.load.spritesheet('caravan-v', 'assets/caravan-v.png', { frameWidth: 48, frameHeight: 80 });
    PROPS.forEach((p) => this.load.image(p, `assets/props/${p}.png`));
  }

  label(x: number, y: number, text: string, always = false) {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '40px', color: '#fff', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5, 1).setScale(this.overview ? 0.5 : 0.25).setDepth(1e6).setAlpha(this.overview || always ? 1 : 0);
    t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.labels.push(t);
  }

  create() {
    const map = this.make.tilemap({ key: 'map' });
    const tiles = map.addTilesetImage('tiles', 'tiles')!;
    const ground = map.createLayer('ground', tiles)!;
    map.createLayer('decor', tiles);
    const objects = map.createLayer('objects', tiles)!;
    map.createLayer('roofs', tiles)!.setDepth(5e5); // tree canopies + clubhouse roof, drawn above the player
    ground.setCollision([243, 245]); // sea (tile index = png index + 1)
    objects.setCollisionByExclusion([-1]);
    const solids = this.physics.add.staticGroup();
    const body = (x: number, y: number, w: number, h: number) => solids.add(this.add.zone(x + w / 2, y + h / 2, w, h));

    for (const o of map.getObjectLayer('courts')!.objects) this.add.image(o.x!, o.y!, o.name).setOrigin(0).setDisplaySize(o.width!, o.height!).setDepth(1);
    for (const o of map.getObjectLayer('caravans')!.objects) {
      const key = prop(o, 'orient') === 'v' ? 'caravan-v' : 'caravan-h', inset = key === 'caravan-v' ? 20 : 14;
      this.add.image(o.x!, o.y!, key, prop(o, 'variant')).setOrigin(0).setDepth(o.y! + o.height!).setData('segId', prop(o, 'segId'));
      body(o.x! + 2, o.y! + inset, o.width! - 4, o.height! - inset - 2);
      if (params.has('ids')) this.label(o.x! + o.width! / 2, o.y! + 20, String(prop(o, 'segId')));
    }
    for (const o of map.getObjectLayer('props')!.objects) {
      const img = this.add.image(o.x!, o.y!, o.name).setFlipY(!!prop(o, 'flipY'));
      img.setDepth(img.y + img.height / 2);
      if (SOLID.has(o.name)) body(img.x - img.width / 2 + 1, img.y + img.height / 2 - Math.min(10, img.height * 0.6), img.width - 2, Math.min(10, img.height * 0.6));
      if (prop(o, 'label')) this.label(o.x!, o.y! - 10, prop(o, 'label'));
    }
    if (this.overview) for (const o of map.getObjectLayer('landmarks')!.objects) this.label(o.x!, o.y!, `#${prop(o, 'segId')}`, true);

    const spawn = map.getObjectLayer('markers')!.objects.find((o) => o.type === 'spawn')!;
    const at = params.get('at')?.split(',').map(Number); // debug: ?at=tileX,tileY
    this.player = this.physics.add.sprite(at ? at[0] * 16 + 8 : spawn.x!, at ? at[1] * 16 + 8 : spawn.y!, 'player', 0);
    this.player.setSize(10, 8).setOffset(3, 8).setCollideWorldBounds(true);
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

  update() {
    if (!this.overview) for (const t of this.labels) // show a sign's text when you walk up to it
      t.setAlpha(Phaser.Math.Distance.Between(t.x, t.y, this.player.x, this.player.y) < 64 ? 1 : 0);
    this.player.setDepth(this.player.y + 8); // y-sort against caravans and props
    const k = this.keys;
    let x = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let y = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (!x && !y && Math.hypot(stick.x, stick.y) > 0.25) { x = stick.x; y = stick.y; }
    const v = new Phaser.Math.Vector2(x, y);
    if (v.length() > 1) v.normalize();
    this.player.setVelocity(v.x * SPEED, v.y * SPEED);
    if (v.length() < 0.01) { this.player.anims.stop(); this.player.setFrame(DIRS.indexOf(this.facing)); return; }
    this.facing = Math.abs(v.x) > Math.abs(v.y) ? (v.x > 0 ? 'right' : 'left') : (v.y > 0 ? 'down' : 'up');
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
