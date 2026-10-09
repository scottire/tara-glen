// combat-feel: practice yard + feel smoke test and screenshots. node feel.mjs [baseUrl]
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4174/tara-glen/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [], R = {};
async function open(ctxOpts, q = '') {
  const ctx = await b.newContext(ctxOpts), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(base + '?fresh' + q); await page.waitForTimeout(3500); await page.evaluate(() => tgTest.adv(20));
  if (await page.evaluate(() => !!tgTest.G.st.room)) { await page.evaluate(() => window.room.leave()); await page.waitForTimeout(1500); await page.evaluate(() => tgTest.adv(20)); }
  return page;
}
const near = (page, dx = -14) => page.evaluate((dx) => { const d = tg.enemies.find((e) => e.texture.key === 'fx-dummy'); const p = tg.player;
  p.setPosition(d.x + dx, d.y); p.body.reset(d.x + dx, d.y); p.facing = dx < 0 ? 'right' : 'left'; return { dummies: tg.enemies.filter((e) => e.texture.key === 'fx-dummy').length, bunny: tg.enemies.some((e) => e.s?.name === 'Practice bunny') }; }, dx);
// desktop-ish phone (attack + roll)
let page = await open({ ...devices['iPhone 13'] });
R.yard = await near(page); await page.waitForTimeout(300);
await page.evaluate(() => { tg.time.timeScale = 0.15; tg.tweens.timeScale = 0.15; tg.anims.globalTimeScale = 0.15; }); await page.evaluate(() => tg.combat.press()); await page.waitForTimeout(500);
await page.screenshot({ path: '/workspace/feel-attack.png' }); await page.evaluate(() => { tg.time.timeScale = 1; tg.tweens.timeScale = 1; tg.anims.globalTimeScale = 1; }); 
await page.evaluate(() => tg.combat.release()); await page.waitForTimeout(400);
R.dummyHits = await page.evaluate(() => tg.enemies.find((e) => e.texture.key === 'fx-dummy').hits);
// accel: velocity ramps, not instant
R.accel = await page.evaluate(async () => { const p = tg.player; p.body.setVelocity(0, 0); p.keys.RIGHT.isDown = true; await new Promise((r) => setTimeout(r, 34)); const v1 = p.body.velocity.x;
  await new Promise((r) => setTimeout(r, 250)); const v2 = p.body.velocity.x; p.keys.RIGHT.isDown = false; await new Promise((r) => setTimeout(r, 34)); const v3 = p.body.velocity.x; await new Promise((r) => setTimeout(r, 200)); return { v34ms: Math.round(v1), v284ms: Math.round(v2), afterRelease34ms: Math.round(v3), stopped: Math.round(tg.player.body.velocity.x) }; });
// roll
await near(page, -20); await page.waitForTimeout(200);
await page.evaluate(() => { tg.time.timeScale = 0.15; tg.tweens.timeScale = 0.15; tg.anims.globalTimeScale = 0.15; }); R.roll = await page.evaluate(() => { tg.player.keys.LEFT.isDown = true; const ok = tg.combat.dodge(); return { ok, dashing: tg.player.dashing }; });
await page.waitForTimeout(350); await page.screenshot({ path: '/workspace/feel-roll.png' }); await page.evaluate(() => { tg.time.timeScale = 1; tg.tweens.timeScale = 1; tg.anims.globalTimeScale = 1; }); 
await page.evaluate(() => (tg.player.keys.LEFT.isDown = false)); await page.waitForTimeout(500);
// bunny can hurt you, i-frames block the second hit
R.hurt = await page.evaluate(async () => { const p = tg.player; p.revive(p.x, p.y); await new Promise((r) => setTimeout(r, 50)); const hp0 = p.life.life, bun = tg.enemies.find((e) => e.s?.name === 'Practice bunny'); if (!bun) return 'no bunny';
  p.hurt(bun, 1, 140); const hp1 = p.life.life; p.hurt(bun, 1, 140); const hp2 = p.life.life; return { hp0, hp1, hp2, invuln: p.invuln.invulnerable }; });
// mobile shot with buttons
await page.waitForTimeout(1200); await near(page); await page.waitForTimeout(300);
await page.evaluate(() => { tg.time.timeScale = 0.15; tg.tweens.timeScale = 0.15; tg.anims.globalTimeScale = 0.15; }); await page.evaluate(() => tg.combat.press()); await page.waitForTimeout(500);
await page.screenshot({ path: '/workspace/feel-mobile.png' }); await page.evaluate(() => { tg.time.timeScale = 1; tg.tweens.timeScale = 1; tg.anims.globalTimeScale = 1; }); 
R.buttons = await page.evaluate(() => ['atk', 'dash'].map((id) => { const e = document.getElementById(id), r = e?.getBoundingClientRect(); return { id, visible: !!r && r.width > 0 && getComputedStyle(e).display !== 'none' }; }));

// ---------- v2 checks ----------
const slow = (k) => page.evaluate((k) => { tg.time.timeScale = k; tg.tweens.timeScale = k; tg.anims.globalTimeScale = k; }, k);
// buffer x3: mash 3 presses 90ms apart -> full 3-hit combo, finisher on hit 3
await page.evaluate(() => { const p = tg.player; p.revive(p.x, p.y); tgTest.G.god = true; }); await near(page); await page.waitForTimeout(800);
const b0 = await page.evaluate(() => ({ s: tg.combat.stats.swings, f: tg.combat.stats.finishers ?? 0 }));
for (let i = 0; i < 3; i++) { await page.evaluate(() => { tg.combat.press(); tg.combat.release(); }); await page.waitForTimeout(90); }
await page.waitForTimeout(900); R.buffer3 = await page.evaluate((b0) => ({ swings: tg.combat.stats.swings - b0.s, finishers: (tg.combat.stats.finishers ?? 0) - b0.f }), b0);
// combo screenshot: finisher with trail (slow-mo)
await near(page); await page.waitForTimeout(700);
await page.evaluate(() => { tg.combat.step = 2; tg.combat.chainUntil = tg.time.now + 1000; }); await slow(0.15);
await page.evaluate(() => { tg.combat.press(); tg.combat.release(); }); await page.waitForTimeout(450);
await page.screenshot({ path: '/workspace/feel2-combo.png' }); await slow(1); await page.waitForTimeout(600);
// roll-cancel: roll during swing recovery
await page.waitForTimeout(500);
R.rollCancel = await page.evaluate(async () => { const c = tg.combat; c.dodgeReady = 0; const r0 = c.stats.rollCancels ?? 0; c.press(); c.release();
  await new Promise((r) => setTimeout(r, 30)); const early = c.dodge(); await new Promise((r) => setTimeout(r, 70)); const late = c.dodge();
  return { earlyBlocked: !early, cancelled: late && (c.stats.rollCancels ?? 0) - r0 === 1, dashing: tg.player.dashing }; });
await page.waitForTimeout(700);
// i-frame blink: alpha flickers during invulnerability, solid after
await page.evaluate(() => { tgTest.G.god = false; const p = tg.player; p.revive(p.x, p.y); }); await page.waitForTimeout(100);
R.blink = await page.evaluate(async () => { const p = tg.player; p.hurt({ x: p.x + 10, y: p.y }, 1, 140); const a = new Set(); const t0 = performance.now();
  while (performance.now() - t0 < 600) { a.add(p.alpha < 0.5 ? 'lo' : 'hi'); await new Promise((r) => setTimeout(r, 16)); }
  await new Promise((r) => setTimeout(r, 600)); return { flicker: a.has('lo') && a.has('hi'), solidAfter: p.alpha === 1 && !p.invuln.invulnerable }; });
await page.evaluate(() => { const p = tg.player; p.revive(p.x, p.y); }); await page.waitForTimeout(100); await slow(0.15);
await page.evaluate(() => { const p = tg.player; p.hurt({ x: p.x + 10, y: p.y }, 1, 140); });
for (let i = 0; i < 12; i++) { await page.waitForTimeout(60); if (await page.evaluate(() => tg.player.alpha < 0.5)) break; }
await page.screenshot({ path: '/workspace/feel2-hurt.png' }); await slow(1); await page.waitForTimeout(1200);
await page.evaluate(() => { tgTest.G.god = true; const p = tg.player; p.revive(p.x, p.y); });
// corner correction: body clips a solid tile's corner by 3px while walking along it; with correction it slides past
R.corner = await page.evaluate(async () => {
  const L = tg.walls.filter((w) => w?.getTileAt), col = (tx, ty) => L.some((l) => l.getTileAt(tx, ty)?.collides) || tgTest.G.w.barrierTiles.some((t) => t[0] === tx && t[1] === ty);
  const p = tg.player, cx = Math.floor(p.x / 16), cy = Math.floor(p.y / 16); let spot = null;
  for (let r = 1; r < 40 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (let dy = -r; dy <= r && !spot; dy++) { const tx = cx + dx, ty = cy + dy;
    if (col(tx, ty) && !col(tx, ty - 1) && !col(tx - 1, ty) && !col(tx - 1, ty - 1) && !col(tx - 2, ty) && !col(tx - 2, ty - 1) && !col(tx + 1, ty - 1) && !col(tx + 2, ty - 1) && !col(tx - 1, ty - 2) && !col(tx, ty - 2) && !col(tx + 1, ty - 2)) spot = [tx, ty]; }
  if (!spot) return 'no spot';
  const run = async (px) => { tgFeel.cornerPx = px; const top = spot[1] * 16, x0 = spot[0] * 16 - 14;
    p.setPosition(x0, top); p.body.reset(x0, top); await new Promise((r) => setTimeout(r, 50)); const off = top + 3 - p.body.bottom; p.setPosition(x0, p.y + off); p.body.reset(x0, p.y);
    p.keys.RIGHT.isDown = true; await new Promise((r) => setTimeout(r, 700)); p.keys.RIGHT.isDown = false; return Math.round(p.x - x0); };
  const without = await run(0), withC = await run(5); return { spot, movedWithout: without, movedWith: withC, ok: withC > without + 8 };
});
// camera look-ahead
await near(page, -60); await page.waitForTimeout(400);
R.camera = await page.evaluate(async () => { const c = tg.cameras.main, y0 = c.followOffset.x; tg.player.keys.LEFT.isDown = true; await new Promise((r) => setTimeout(r, 900));
  const x1 = c.followOffset.x; return { offsetX_before: Math.round(y0), offsetX_walkingLeft: Math.round(x1), leads: x1 > 5 }; });
await page.screenshot({ path: '/workspace/feel2-camera.png' }); await page.evaluate(() => (tg.player.keys.LEFT.isDown = false));
R.rustles = await page.evaluate(() => tg.player.rustles ?? 0);
R.errors = errs; console.log(JSON.stringify(R, null, 1)); await b.close();
