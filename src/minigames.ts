// Placeholder mini games. Each is its own scene, launched over the paused World with { cfg, onDone(win) }.
// Lose = the scene restarts (retry). Virtual canvas is 320x320, centred and scaled to fit the screen.
import Phaser from 'phaser';
type Data = { cfg: any; strings: any; onDone: (win: boolean) => void };

abstract class Mini extends Phaser.Scene {
  d!: Data; z = 1; over = false; status!: Phaser.GameObjects.Text;
  init(d: Data) { this.d = d; this.over = false; }
  txt(x: number, y: number, s: string, size = 14, color = '#fff') {
    return this.add.text(x, y, s, { fontFamily: 'sans-serif', fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: 290 } })
      .setOrigin(0.5).setResolution(Math.max(1, this.z));
  }
  frame() {
    const { width: w, height: h } = this.scale;
    this.z = Math.min(w, h) / 340; const cam = this.cameras.main; cam.setZoom(this.z).centerOn(160, 160);
    this.add.rectangle(160, 160, w / this.z + 20, h / this.z + 20, 0x000000, 0.55);
    this.add.rectangle(160, 160, 320, 320, 0x2b3a4a).setStrokeStyle(3, 0xffffff);
    this.txt(160, 14, this.d.cfg.title, 16, '#ffe680'); this.txt(160, 34, this.d.cfg.help, 10);
    this.status = this.txt(160, 304, '', 13);
  }
  finish(win: boolean) {
    if (this.over) return; this.over = true;
    this.status.setText(win ? this.d.strings.win : this.d.strings.lose).setColor(win ? '#9f9' : '#fbb');
    if (win) this.time.delayedCall(1100, () => this.d.onDone(true));
    else this.time.delayedCall(500, () => this.input.once('pointerdown', () => this.scene.restart(this.d)));
  }
}

export class Swing extends Mini {
  t = 0; streak = 0; w = 2.2; A = 1.0; left = 30; dots: Phaser.GameObjects.Arc[] = []; g!: Phaser.GameObjects.Graphics; timer!: Phaser.GameObjects.Text;
  constructor() { super('swing'); }
  create() {
    this.frame(); this.t = 0; this.streak = 0; this.w = 2.2; this.left = this.d.cfg.timeLimit ?? 30;
    this.g = this.add.graphics(); this.timer = this.txt(290, 60, '', 11);
    this.dots = [0, 1, 2].slice(0, this.d.cfg.needed).map((i) => this.add.circle(130 + i * 30, 284, 8, 0x555555).setStrokeStyle(2, 0xffffff));
    this.input.on('pointerdown', () => this.tap()); this.input.keyboard?.on('keydown-SPACE', () => this.tap());
  }
  peak() { return Math.abs(Math.sin(this.t * this.w)); }
  tap() {
    if (this.over) return;
    if (this.peak() > 0.93) { this.dots[this.streak].setFillStyle(0x66dd66); this.streak++; this.w *= 1.15; this.status.setText('Good!').setColor('#9f9');
      if (this.streak >= this.d.cfg.needed) this.finish(true); }
    else { this.streak = 0; this.dots.forEach((d) => d.setFillStyle(0x555555)); this.status.setText('Missed').setColor('#fbb'); }
  }
  update(_: number, dt: number) {
    if (this.over) return;
    const s = Math.min(dt, 33) / 1000; this.t += s; this.left -= s; this.timer.setText(`${Math.ceil(this.left)}s`);
    if (this.left <= 0) return this.finish(false);
    const a = this.A * Math.sin(this.t * this.w), px = 160, py = 70, L = 150, sx = px + Math.sin(a) * L, sy = py + Math.cos(a) * L;
    const g = this.g.clear();
    g.lineStyle(6, 0x3c6ec8).lineBetween(70, 260, 110, 64).lineBetween(250, 260, 210, 64).lineBetween(100, 64, 220, 64);
    g.fillStyle(0xffffff, 0.25).fillCircle(px + Math.sin(this.A) * L, py + Math.cos(this.A) * L, 14).fillCircle(px - Math.sin(this.A) * L, py + Math.cos(this.A) * L, 14);
    g.lineStyle(2, 0xcccccc).lineBetween(px - 6, py, sx - 10, sy).lineBetween(px + 6, py, sx + 10, sy);
    g.fillStyle(0xdd4444).fillRect(sx - 14, sy - 3, 28, 7); g.fillStyle(0xffd0a0).fillCircle(sx, sy - 16, 8); g.fillStyle(0x3366cc).fillRect(sx - 6, sy - 9, 12, 8);
  }
}

export class Keepy extends Mini {
  bx = 160; by = 120; vx = 0; vy = 0; n = 0; started = false; ball!: Phaser.GameObjects.Arc; count!: Phaser.GameObjects.Text;
  constructor() { super('keepy'); }
  create() {
    this.frame(); this.bx = 160; this.by = 190; this.vx = 0; this.vy = 0; this.n = 0; this.started = false;
    this.add.rectangle(160, 290, 316, 26, 0x3f8f3f);
    this.ball = this.add.circle(this.bx, this.by, 13, 0xffffff).setStrokeStyle(3, 0x222222);
    this.count = this.txt(160, 70, `0 / ${this.d.cfg.needed}`, 22);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.tapAt(p.worldX, p.worldY));
  }
  tapAt(x: number, y: number) {
    if (this.over || Math.hypot(x - this.bx, y - this.by) > 36) return;
    this.started = true; this.vy = -340 - Math.random() * 40; this.vx = (this.bx - x) * 4 + (Math.random() - 0.5) * 120; this.n++;
    this.count.setText(`${this.n} / ${this.d.cfg.needed}`); if (this.n >= this.d.cfg.needed) this.finish(true);
  }
  update(_: number, dt: number) {
    if (this.over || !this.started) return; // ball waits on the first tap
    const s = Math.min(dt, 33) / 1000; this.vy += 520 * s; // clamped dt: slow phones get slow-mo, not tunnelling
    this.bx += this.vx * s; this.by += this.vy * s;
    if (this.bx < 16 || this.bx > 304) { this.vx *= -0.8; this.bx = Phaser.Math.Clamp(this.bx, 16, 304); }
    if (this.by < 60) { this.by = 60; this.vy = Math.abs(this.vy) * 0.5; }
    this.ball.setPosition(this.bx, this.by);
    if (this.by > 264) this.finish(false);
  }
}

export class Putt extends Mini {
  bx = 160; by = 262; vx = 0; vy = 0; strokes = 0; moving = false; aim: { x: number; y: number } | null = null;
  ball!: Phaser.GameObjects.Arc; line!: Phaser.GameObjects.Graphics; info!: Phaser.GameObjects.Text;
  hole = { x: 210, y: 84 }; block = { x: 60, y: 168, w: 110, h: 14 };
  constructor() { super('putt'); }
  create() {
    this.frame(); this.bx = 160; this.by = 262; this.vx = this.vy = 0; this.strokes = 0; this.moving = false; this.aim = null;
    this.add.rectangle(160, 168, 280, 240, 0x4caf50).setStrokeStyle(4, 0x8d6e63);
    this.add.rectangle(this.block.x + this.block.w / 2, this.block.y + this.block.h / 2, this.block.w, this.block.h, 0x8d6e63);
    this.add.circle(this.hole.x, this.hole.y, 8, 0x111111); this.add.line(0, 0, this.hole.x + 1, this.hole.y, this.hole.x + 1, this.hole.y - 26, 0xffffff).setOrigin(0);
    this.add.triangle(this.hole.x + 2, this.hole.y - 26, 0, 0, 14, 5, 0, 10, 0xe53935).setOrigin(0);
    this.line = this.add.graphics(); this.ball = this.add.circle(this.bx, this.by, 5, 0xffffff).setStrokeStyle(1, 0x333333);
    this.info = this.txt(160, 60, '', 11);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!this.moving && !this.over && Math.hypot(p.worldX - this.bx, p.worldY - this.by) < 60) this.aim = { x: p.worldX, y: p.worldY }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (this.aim) this.aim = { x: p.worldX, y: p.worldY }; });
    this.input.on('pointerup', () => {
      if (!this.aim) return; const dx = this.bx - this.aim.x, dy = this.by - this.aim.y, d = Math.min(Math.hypot(dx, dy), 90);
      this.aim = null; if (d > 6) this.shoot(Math.atan2(dy, dx), d * 5);
    });
  }
  shoot(angle: number, speed: number) { this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed; this.moving = true; this.strokes++; }
  update(_: number, dt: number) {
    const s = Math.min(dt, 33) / 1000;
    this.info.setText(`Strokes: ${this.strokes} / ${this.d.cfg.strokes}`);
    this.line.clear();
    if (this.aim) { const dx = this.bx - this.aim.x, dy = this.by - this.aim.y, d = Math.min(Math.hypot(dx, dy), 90), a = Math.atan2(dy, dx);
      this.line.lineStyle(2, 0xffffff, 0.8).lineBetween(this.bx, this.by, this.bx + Math.cos(a) * d * 1.2, this.by + Math.sin(a) * d * 1.2); }
    if (!this.moving || this.over) return;
    this.bx += this.vx * s; this.by += this.vy * s; const f = Math.pow(0.35, s); this.vx *= f; this.vy *= f;
    if (this.bx < 26 || this.bx > 294) { this.vx *= -1; this.bx = Phaser.Math.Clamp(this.bx, 26, 294); }
    if (this.by < 54 || this.by > 282) { this.vy *= -1; this.by = Phaser.Math.Clamp(this.by, 54, 282); }
    const b = this.block;
    if (this.bx > b.x - 4 && this.bx < b.x + b.w + 4 && this.by > b.y - 4 && this.by < b.y + b.h + 4) {
      const ox = Math.min(this.bx - (b.x - 4), b.x + b.w + 4 - this.bx), oy = Math.min(this.by - (b.y - 4), b.y + b.h + 4 - this.by);
      if (ox < oy) { this.vx *= -1; this.bx += this.bx < b.x + b.w / 2 ? -ox : ox; } else { this.vy *= -1; this.by += this.by < b.y + b.h / 2 ? -oy : oy; }
    }
    this.ball.setPosition(this.bx, this.by);
    const sp = Math.hypot(this.vx, this.vy);
    if (Math.hypot(this.bx - this.hole.x, this.by - this.hole.y) < 8 && sp < 280) { this.ball.setVisible(false); return this.finish(true); }
    if (sp < 8) { this.moving = false; if (this.strokes >= this.d.cfg.strokes) this.finish(false); }
  }
}
