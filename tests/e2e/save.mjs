// v10/v11 objective + save migration (playwright-core + system Chrome, iPhone 13). node save.mjs [baseUrl]
// A: fresh run clears 131 with real taps -> Power Drive, and the HUD objective moves past the Dust Bunny at once.
// B: a v9-shaped save (131, the Back Field arena, Mobile 377 and the Dunes already won, no v10 rewards) loads with them granted, and loads again idempotently.
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4174/tara-glen/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const errs = []; const R = {};
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const cdp = await ctx.newCDPSession(page); const ev = (f, a) => page.evaluate(f, a);
const tap = async (sel) => { const bb = await page.locator(sel).boundingBox(); const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 3 }] }); await page.waitForTimeout(50); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const obj = () => ev(() => document.getElementById('objective').textContent);
// A
// the room jump skips the intro, so hand over the balloons the intro gives
await page.goto(base + '?give=throw&room=131'); await page.waitForTimeout(4000); await ev(() => tgTest.adv(10));
R.A_before = await obj();
for (let k = 0; k < 60; k++) {
  const left = await ev(() => { const s = tgTest.scene(), p = s.player; tgTest.G.god = true;
    const live = s.enemies.filter((e) => e.active && e.sm.current !== 'dead').sort((a, b) => (a.s.boss ? 1 : 0) - (b.s.boss ? 1 : 0));
    if (!live.length) return 0; const e = live[0]; e.body.reset(p.x, p.y - 14); e.armor = 0; p.facing = 'up'; return live.length; });
  if (!left) break;
  for (let i = 0; i < 3; i++) { await tap('#atk'); await page.waitForTimeout(170); }
  if (k % 3 === 2) await ev(() => tgTest.adv(10));
}
await page.waitForTimeout(300);
R.A_afterClear = { drive: await ev(() => tgTest.G.st.items.drive ?? 0), objective: await obj() };
await ev(() => tgTest.adv(10)); await ev(() => window.room.leave()); await page.waitForTimeout(1500); await ev(() => tgTest.adv(10));
R.A_outside = await obj();
R.A_ok = R.A_afterClear.drive === 1 && !/Dust Bunny/.test(R.A_afterClear.objective) && /brambles/i.test(R.A_outside);
// B
const v9 = { items: { throw: 1, balloons: 3, bucket: 0, coin: 7 }, flags: ['ev:intro', 'visited_z1', 'visited_z2', 'clear:131', 'arena:arena_field', 'clear:m377', 'arena:arena_strand', 'open:gate_g1'],
  got: ['boss131', 'chest131'], defeated: ['boss131'], maxhp: 3, hp: 3, elapsed: 600000, started: true, room: null, pos: [0, 0], hintTier: {}, seenZones: ['z1', 'z2'] };
await page.goto(base + '?fresh'); await page.waitForTimeout(2500);
await ev((s) => { s.pos = [tg.player.x, tg.player.y]; localStorage.setItem('tara-glen-save-v6', JSON.stringify(s)); Storage.prototype.setItem = () => {}; /* v11.2: the running game flushes on pagehide */ location.href = location.pathname; }, v9);
await page.waitForTimeout(4500);
const read = () => ev(() => { const s = tgTest.G.st; return { v: s.v, drive: s.items.drive ?? 0, chip: s.items.chip ?? 0, dashstrike: s.items.dashstrike ?? 0, parry: s.items.parry ?? 0, maxhp: s.maxhp,
  enc: s.got.filter((g) => g.startsWith('enc_')).sort(), banner: document.getElementById('banner').textContent, objective: document.getElementById('objective').textContent }; });
R.B_load1 = await read();
await page.reload(); await page.waitForTimeout(4500); await ev(() => tgTest.adv(10));
R.B_load2 = await read();
const ok = (s) => s.v === 11 && s.drive && s.chip && s.dashstrike && !s.parry && s.maxhp === 4 && !/Dust Bunny|Back Field/.test(s.objective);
R.B_ok = ok(R.B_load1) && ok(R.B_load2) && R.B_load2.enc.length === R.B_load1.enc.length;
R.errors = errs.slice(0, 6); console.log(JSON.stringify(R, null, 1)); await b.close();
process.exit(R.A_ok && R.B_ok && !errs.length ? 0 : 1);
