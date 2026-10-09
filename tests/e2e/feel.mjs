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
// buffered combo: 3 presses fast -> 3 swings
const s0 = await page.evaluate(() => tg.combat.stats.swings);
for (let i = 0; i < 3; i++) { await page.evaluate(() => { tg.combat.press(); tg.combat.release(); }); await page.waitForTimeout(90); }
await page.waitForTimeout(700); R.bufferedSwings = (await page.evaluate(() => tg.combat.stats.swings)) - s0;
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
R.errors = errs; console.log(JSON.stringify(R, null, 1)); await b.close();
