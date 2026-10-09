// v10 abilities on the v11 map. Playwright (playwright-core + system Chrome; WebKit via 'node v10.mjs webkit' where supported). Run against 'npx vite preview' at /tara-glen/.
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4174/tara-glen/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const errs = []; const R = {};
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const cdp = await ctx.newCDPSession(page); const ev = (f, a) => page.evaluate(f, a);
const ctr = async (sel) => { const bb = await page.locator(sel).boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
const hold = async (sel, ms) => { const p = await ctr(sel); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 3 }] }); await page.waitForTimeout(ms); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const tap = (sel) => hold(sel, 50);
const shot = (n) => page.screenshot({ path: `/workspace/tg-v10-${n}.png` });
// 1. clear 131 with real taps -> boss drops Power Drive
await page.goto(base + '?fresh&room=131'); await page.waitForTimeout(4000); await ev(() => tgTest.adv(10));
for (let k = 0; k < 60; k++) {
  const left = await ev(() => { const s = tgTest.scene(), p = s.player; tgTest.G.god = true;
    const live = s.enemies.filter((e) => e.active && e.sm.current !== 'dead').sort((a, b) => (a.s.boss ? 1 : 0) - (b.s.boss ? 1 : 0));
    if (!live.length) return 0; const e = live[0]; e.body.reset(p.x, p.y - 14); e.armor = 0; p.facing = 'up'; return live.length; });
  if (!left) break;
  for (let i = 0; i < 3; i++) { await tap('#atk'); await page.waitForTimeout(170); }
  if (k % 3 === 2) await ev(() => tgTest.adv(10));
}
await page.waitForTimeout(500); await shot('unlock-drive');
R.clear131 = await ev(() => ({ drive: tgTest.G.st.items.drive, locked: tgTest.scene().locked, flag: tgTest.G.st.flags.includes('clear:131'), banner: document.getElementById('banner').textContent }));
await ev(() => tgTest.adv(10)); await ev(() => tgTest.G.god = false);
// 2. use it: charged drive breaks the Glen brambles behind 127, then walk through
await ev(() => { window.room.leave(); }); await page.waitForTimeout(1500); await ev(() => tgTest.adv(10));
await ev(() => { const l = tg.lockObjs.find((o) => o.l.id === 'glen_brambles'), r = l.body.getBounds(); const v = r.width > r.height; tg.player.body.reset(v ? r.centerX : r.left - 12, v ? r.bottom + 12 : r.centerY); tg.player.facing = v ? 'up' : 'right'; });
R.gateBefore = await ev(() => tg.lockObjs.find((o) => o.l.id === 'glen_brambles').open);
await page.waitForTimeout(300);
await hold('#atk', 300); await page.waitForTimeout(400); // a tap-length press does not break it
R.gateAfterTap = await ev(() => tg.lockObjs.find((o) => o.l.id === 'glen_brambles').open);
const p = await ctr('#atk'); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 4 }] }); await page.waitForTimeout(900);
await shot('charge'); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(150); await shot('drive-spin'); await page.waitForTimeout(700);
R.gateAfterDrive = await ev(() => ({ open: tg.lockObjs.find((o) => o.l.id === 'glen_brambles').open, flag: tgTest.G.st.flags.includes('open:glen_brambles') }));
const pos0 = await ev(() => [tg.player.x, tg.player.y]);
const key = await ev(() => { const r = tg.lockObjs.find((o) => o.l.id === 'glen_brambles').body.getBounds(); return r.width > r.height ? 'ArrowUp' : 'ArrowRight'; });
await page.keyboard.down(key); await page.waitForTimeout(900); await page.keyboard.up(key);
R.walkedThrough = await ev((p0) => { const r = tg.lockObjs.find((o) => o.l.id === 'glen_brambles').body.getBounds(); return r.width > r.height ? tg.player.y < r.top : tg.player.x > r.right; }, pos0);
await shot('gate-open');
// 3. Chip Shot knocks the golf ball out of the whin bush on the Links
await ev(() => { tgTest.give('chip'); const t = tg.ents.things.find((t) => t.e.id === 'links_ball'); tg.player.body.reset(t.obj.x, t.obj.y - 40); tg.player.facing = 'down'; /* v11: the whin sits on a bank, open from the north */ });
await page.waitForTimeout(1500); await ev(() => tgTest.adv(10)); await page.waitForTimeout(300);
await tap('#fire'); await page.waitForTimeout(800);
R.chip = await ev(() => ({ ball: tgTest.G.st.items.golf_ball ?? 0, chips: tg.combat.stats.chips, icon: document.getElementById('fire').textContent }));
await ev(() => tgTest.adv(10));
// 4. Dash Strike through a low gap (room m134 secret chamber)
await page.goto(base + '?fresh&give=dashstrike&room=m134'); await page.waitForTimeout(4000); await ev(() => tgTest.adv(10));
const ds = await ev(() => { const s = tgTest.scene(); tgTest.G.god = true; for (const e of s.enemies) e.destroy(); s.enemies.length = 0; s.locked = false; s.bars.forEach((b) => b.destroy());
  const o = s.inner.find((o) => o.l.kind === 'dash'); if (!o) return null; const [tx, ty] = o.l.tiles[0]; s.player.body.reset(tx * 16 + 8, ty * 16 + 30); s.player.facing = 'up'; return ty * 16; });
if (ds !== null) { await page.keyboard.down('ArrowUp'); await page.waitForTimeout(120); await tap('#dash'); await page.waitForTimeout(60); await tap('#atk'); await page.waitForTimeout(400); await page.keyboard.up('ArrowUp');
  R.dashStrike = await ev((row) => ({ through: tgTest.scene().player.y < row, strikes: tgTest.scene().combat.stats.dashStrikes }), ds); await shot('dashstrike'); } else R.dashStrike = 'no dash lock in m134';
// 5. Putt Parry: return a spitter's shot
await page.goto(base + '?fresh&give=parry&room=m389'); await page.waitForTimeout(4000); await ev(() => tgTest.adv(10));
await ev(() => { tgTest.G.god = true; });
let par = 0; for (let i = 0; i < 80 && !par; i++) { await page.waitForTimeout(80);
  const near = await ev(() => { const s = tgTest.scene(); return (s.shots ?? []).some((b) => b.active && !b.reflected && Math.hypot(b.x - s.player.x, b.y - s.player.y) < 24); });
  if (near) { await tap('#atk'); par = await ev(() => tgTest.scene().combat.stats.parries); } }
await page.waitForTimeout(200); await shot('parry');
R.parry = par;
// 6. guarded boss: club does nothing until stunned by a returned shot
R.guard = await ev(() => { const s = tgTest.scene(); const e = s.enemies.find((e) => e.active); if (!e) return null; e.e.stats = { ...e.e.stats, guard: true }; const h0 = e.life.life; e.invuln.invulnerable = false;
  e.hitBy(null, 1, 10, false, s.player); const h1 = e.life.life; e.stun(500); e.invuln.invulnerable = false; e.hitBy(null, 1, 10, false, s.player); return { blocked: h1 === h0, hitWhenStunned: e.life.life < h1 }; });
R.errors = errs.slice(0, 6); console.log(JSON.stringify(R, null, 1)); await b.close();
