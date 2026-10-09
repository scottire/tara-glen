// Playwright (playwright-core + system Chrome; WebKit via 'node v9.mjs webkit' where supported). Run against 'npx vite preview' at /tara-glen/.
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4174/tara-glen/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage(); const errs = []; const R = {};
page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message));
const cdp = await ctx.newCDPSession(page);
const ev = (f, a) => page.evaluate(f, a);
const center = async (sel) => { const bb = await page.locator(sel).boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
const touch = async (sel, ms = 60) => { const p = await center(sel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 7 }] }); await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const shot = (n) => page.screenshot({ path: `/workspace/tg-v9-${n}.png` });
const S = () => 'tgTest.scene()';

// telegraph + archetypes: a z4 room (spitter/tank/charger); wait for wind-ups and a projectile
await page.goto(base + '?fresh&room=m370'); await page.waitForTimeout(4000);
await ev(() => { tgTest.G.god = true; });
const seen = {}; let proj = 0;
for (let i = 0; i < 50 && Object.keys(seen).length < 3; i++) { await page.waitForTimeout(120);
  const r = await ev(() => ({ w: tgTest.scene().enemies.filter((e) => e.active && e.windup).map((e) => e.ai), orbs: tgTest.scene().children.list.filter((o) => o.texture?.key === 'fx-orb').length }));
  for (const a of r.w) if (!seen[a]) { seen[a] = 1; await shot('telegraph-' + a); } proj = Math.max(proj, r.orbs); }
R.telegraph = { windups: Object.keys(seen), projectilesSeen: proj, armor: await ev(() => tgTest.scene().enemies.filter((e) => e.armor).map((e) => e.ai + ':' + e.armor)) };
await ev(() => { tgTest.G.god = false; });
await page.goto(base + '?fresh&give=drive&room=m123'); await page.waitForTimeout(4500);
R.room = await ev(() => ({ room: tgTest.G.st.room, locked: tgTest.scene().locked, enemies: tgTest.scene().enemies.length, objective: document.getElementById('objective').textContent, atk: document.getElementById('atk').textContent }));
// put an enemy 45deg off the player's facing (auto-aim cone) and freeze its AI so the combo lands
const setup = () => ev(() => { const s = tgTest.scene(), p = s.player, e = s.enemies.find((e) => e.active && e.sm.current !== 'dead');
  p.facing = 'right'; e.body.reset(p.x + 12, p.y + 12); e.mode = 'recover'; e.mt = 2500; return { hp: e.life.life, id: e.e.id, ai: e.ai }; });
R.before = await setup();
await page.waitForTimeout(100);
for (let i = 0; i < 3; i++) { await touch('#atk', 50); await page.waitForTimeout(140); }
await page.waitForTimeout(300);
R.combo = await ev(() => { const s = tgTest.scene(); return { ...s.combat.stats, hp: s.enemies.map((e) => e.active ? e.life.life : 'dead') }; });
await shot('combo');
// charge: hold 900ms -> ring -> release spin
await setup();
const p = await center('#atk');
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 8 }] }); await page.waitForTimeout(850);
R.chargeRing = await ev(() => ({ charged: tgTest.scene().combat.charged, cls: document.getElementById('atk').className })); await shot('charge');
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(200);
R.spin = await ev(() => tgTest.scene().combat.stats.spins);
// dodge + i-frames
const hp0 = await ev(() => tgTest.G.st.hp);
await touch('#dash', 40);
R.dodge = await ev(() => { const s = tgTest.scene(); const d = s.player.dashing; s.player.hurt({ x: s.player.x + 5, y: s.player.y }, 1); return { dashing: d, dodges: s.combat.stats.dodges, hp: tgTest.G.st.hp }; });
R.dodge.iframesOk = R.dodge.hp === hp0;
// clear the room -> unlock + persistence flag
await ev(() => { tgTest.G.god = false; for (const e of tgTest.scene().enemies) if (e.active && e.sm.current !== 'dead') { e.armor = 0; e.life.life = 1; e.hitBy(null, 5, 100, true, tgTest.scene().player); } });
await page.waitForTimeout(800);
R.cleared = await ev(() => ({ locked: tgTest.scene().locked, flag: tgTest.G.st.flags.includes('clear:m123') })); await shot('cleared');
// walk out the door -> World, checkpoint at the door
await ev(() => { const s = tgTest.scene(); const [ex, ey] = s.def.exit; s.player.body.reset(ex * 16 + 8, ey * 16 - 10); });
await page.keyboard.down('ArrowDown'); await page.waitForTimeout(900); await page.keyboard.up('ArrowDown'); await page.waitForTimeout(800);
R.outside = await ev(() => ({ room: tgTest.G.st.room, cp: tgTest.G.st.cp, pos: [Math.round(tg.player.x), Math.round(tg.player.y)] }));
// faint far away -> respawn at checkpoint
await ev(() => { tg.player.body.reset(tg.player.x + 200, tg.player.y + 150); tg.player.invuln.invulnerable = false; tg.player.hurt({ x: tg.player.x, y: tg.player.y - 5 }, 99); });
await page.waitForTimeout(1800);
R.respawn = await ev(() => ({ pos: [Math.round(tg.player.x), Math.round(tg.player.y)], cp: tgTest.G.st.cp, hp: tgTest.G.st.hp }));
R.respawn.ok = Math.hypot(R.respawn.pos[0] - R.respawn.cp[0], R.respawn.pos[1] - R.respawn.cp[1]) < 4;
// re-enter cleared room: no enemies, door open
await ev(() => tg.enterRoom('m123')); await page.waitForTimeout(1500);
R.reenter = await ev(() => ({ enemies: tgTest.scene().enemies.length, locked: tgTest.scene().locked }));
// arena
await page.goto(base + '?fresh'); await page.waitForTimeout(4500);
await ev(() => { if (window.room?.sys?.isActive()) window.room.leave(); }); await page.waitForTimeout(1200);
await ev(() => { const a = tgTest.G.w.arenas[0]; tg.player.body.reset((a.rect[0] + a.rect[2]) / 2, (a.rect[1] + a.rect[3]) / 2); });
await page.waitForTimeout(1500);
R.arena = await ev(() => ({ active: !!tg.arenas.active, posts: tg.arenas.active?.posts.length, enemies: tg.enemies.filter((e) => e.active).length, objective: document.getElementById('objective').textContent }));
await page.waitForTimeout(1500); await shot('arena');
for (let w = 0; w < 3; w++) { await ev(() => { for (const e of tg.enemies) if (e.active && e.sm.current !== 'dead') { e.armor = 0; e.life.life = 1; e.hitBy(null, 5, 100, true, tg.player); } }); await page.waitForTimeout(1800); }
R.arenaDone = await ev(() => ({ active: !!tg.arenas.active, flag: tgTest.G.st.flags.filter((f) => f.startsWith('arena:')) }));
await ev(() => tgTest.adv(10));
// attention: caravan with door glow + NPC bubble
await ev(() => { const d = tgTest.G.w.doors.find((d) => d.room === '131'); tg.player.body.reset(d.out[0], d.out[1] + 30); }); await page.waitForTimeout(2500); await shot('attention');
R.errors = errs.slice(0, 8);
console.log(JSON.stringify(R, null, 1)); await b.close();
