// v13 cute hit feedback: a white 'bonk' puff with little stars circling, instead of damage numbers.
import Phaser from 'phaser';
import { ensureFxTextures } from '../v9/combat';
export function bonk(scene: Phaser.Scene, x: number, y: number, s = 1) {
  ensureFxTextures(scene);
  const puff = scene.add.image(x, y, 'fx-smoke').setDepth(9.4e5).setScale(0.6 * s).setAlpha(0.95);
  scene.tweens.add({ targets: puff, scale: 1.6 * s, alpha: 0, duration: 260, ease: 'Quad.out', onComplete: () => puff.destroy() });
  const t = scene.add.text(x, y - 6, 'bonk', { fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold', color: '#ffffff', stroke: '#2a1e18', strokeThickness: 6 }).setOrigin(0.5).setScale(0.22 * s).setDepth(9.5e5);
  scene.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 520, ease: 'Cubic.out', onComplete: () => t.destroy() });
  for (let i = 0; i < 3; i++) {
    const st = scene.add.image(x, y - 4, 'fx-glint').setTint(0xffe066).setDepth(9.4e5).setScale(0.8 * s), a0 = (i / 3) * Math.PI * 2;
    const o = { k: 0 }; scene.tweens.add({ targets: o, k: 1, duration: 520, onUpdate: () => { const a = a0 + o.k * Math.PI * 2; st.setPosition(x + Math.cos(a) * 9 * s, y - 8 + Math.sin(a) * 3 * s).setAlpha(1 - o.k); }, onComplete: () => st.destroy() });
  }
}
