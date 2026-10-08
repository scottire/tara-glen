// EasyStar.js (MIT) wrapper: a walkability grid built from tile layers + static bodies, and a scheduled NPC walker.
import Phaser from 'phaser';
import * as EasyStar from 'easystarjs';
import { ensureAnims, DIRS, type Dir } from './core';

type Node = { x: number; y: number };
export class Pather {
  es = new EasyStar.js();
  constructor(scene: Phaser.Scene, public grid: number[][]) {
    this.es.setGrid(grid); this.es.setAcceptableTiles([0]); this.es.enableDiagonals(); this.es.disableCornerCutting();
    this.es.setIterationsPerCalculation(4000);
    const tick = () => this.es.calculate();
    scene.events.on('update', tick); scene.events.once('shutdown', () => scene.events.off('update', tick));
  }
  free(x: number, y: number) { return this.grid[y]?.[x] === 0; }
  find(fx: number, fy: number, tx: number, ty: number): Promise<Node[] | null> {
    if (!this.free(fx, fy) || !this.free(tx, ty)) return Promise.resolve(null);
    return new Promise((r) => { this.es.findPath(fx, fy, tx, ty, (p) => r(p)); });
  }
  /** 0 = walkable. Blocked by colliding tiles in `layers` and by any rectangle in `rects` (static bodies). */
  static build(scene: Phaser.Scene, w: number, h: number, layers: Phaser.Tilemaps.TilemapLayer[], rects: Phaser.Geom.Rectangle[]) {
    const g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (layers.some((l) => l.getTileAt(x, y)?.collides) ? 1 : 0)));
    for (const r of rects) for (let y = Math.floor(r.top / 16); y <= Math.floor((r.bottom - 1) / 16); y++)
      for (let x = Math.floor(r.left / 16); x <= Math.floor((r.right - 1) / 16); x++) if (g[y]?.[x] !== undefined) g[y][x] = 1;
    return new Pather(scene, g);
  }
}

/** NPC that walks a schedule: route = tile points visited in a loop, pausing `wait` ms at each. */
export class Walker extends Phaser.Physics.Arcade.Sprite {
  nodes: Node[] = []; leg = 0; waiting = true; facing: Dir = 'down';
  constructor(scene: Phaser.Scene, public def: any, public pather: Pather) {
    super(scene, def.route[0][0] * 16 + 8, def.route[0][1] * 16 + 8, def.sprite, 0);
    scene.add.existing(this); scene.physics.add.existing(this);
    ensureAnims(scene, def.sprite, def.sprite + '-');
    this.next();
  }
  next() {
    this.leg = (this.leg + 1) % this.def.route.length; const [tx, ty] = this.def.route[this.leg];
    this.pather.find(Math.floor(this.x / 16), Math.floor(this.y / 16), tx, ty).then((n) => {
      if (!this.active) return;
      if (!n) { console.warn('npc: no path to', tx, ty); return; }
      this.nodes = n; this.waiting = false;
    });
  }
  preUpdate(t: number, dt: number) {
    super.preUpdate(t, dt); this.setDepth(this.y + 8);
    if (this.waiting) return;
    const b = this.body as Phaser.Physics.Arcade.Body;
    while (this.nodes.length && Phaser.Math.Distance.Between(this.x, this.y, this.nodes[0].x * 16 + 8, this.nodes[0].y * 16 + 8) < 2) this.nodes.shift();
    if (!this.nodes.length) { b.setVelocity(0, 0); this.anims.stop(); this.setFrame(DIRS.indexOf(this.facing)); this.waiting = true; this.scene.time.delayedCall(this.def.wait, () => this.next()); return; }
    const dx = this.nodes[0].x * 16 + 8 - this.x, dy = this.nodes[0].y * 16 + 8 - this.y, d = Math.hypot(dx, dy);
    b.setVelocity((dx / d) * this.def.speed, (dy / d) * this.def.speed);
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    this.anims.play(this.def.sprite + '-' + this.facing, true);
  }
}
