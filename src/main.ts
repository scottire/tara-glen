import Phaser from 'phaser';
import { stick } from './joystick';

const SPEED = 70;
const DIRS = ['down', 'up', 'left', 'right'] as const; // columns of the Ninja Adventure sheet

class World extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Sprite;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  facing: (typeof DIRS)[number] = 'down';

  preload() {
    this.load.image('tiles', 'assets/tiles.png');
    this.load.tilemapTiledJSON('map', 'assets/map.json');
    this.load.spritesheet('player', 'assets/player.png', { frameWidth: 16, frameHeight: 16 });
  }

  create() {
    const map = this.make.tilemap({ key: 'map' });
    const tiles = map.addTilesetImage('tiles', 'tiles')!;
    const ground = map.createLayer('ground', tiles)!;
    const objects = map.createLayer('objects', tiles)!;
    ground.setCollision([133, 134]); // water (tile index = Tiled GID = png index + 1)
    objects.setCollisionByExclusion([-1]);

    this.player = this.physics.add.sprite(14 * 16 + 8, 20 * 16 + 8, 'player', 0);
    this.player.setSize(10, 8).setOffset(3, 8).setCollideWorldBounds(true);
    this.physics.add.collider(this.player, [ground, objects]);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    DIRS.forEach((d, c) =>
      this.anims.create({ key: d, frameRate: 8, repeat: -1,
        frames: this.anims.generateFrameNumbers('player', { frames: [c, c + 4, c + 8, c + 12] }) }));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels).startFollow(this.player, true);
    const fit = () => cam.setZoom(Math.max(2, Math.floor(Math.min(this.scale.width, this.scale.height) / 160)));
    fit(); this.scale.on('resize', fit);

    this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  update() {
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

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: World,
});
