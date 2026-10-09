// v11 spine with real touch input (playwright-core + system Chrome, iPhone 13). node v11.mjs [baseUrl]
// Each step starts from a debug state (?give/?flag = a solver snapshot of that point) and then plays the blocker with taps + the joystick.
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4174/tara-glen/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const errs = []; const R = {};
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const cdp = await ctx.newCDPSession(page); const ev = (f, a) => page.evaluate(f, a); const wait = (ms) => page.waitForTimeout(ms);
const ctr = async (sel) => { const bb = await page.locator(sel).boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
const hold = async (sel, ms) => { const p = await ctr(sel); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 3 }] }); await wait(ms); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const tap = (sel) => hold(sel, 50);
// joystick: touch the left half, drag in (dx, dy), hold, release
const walk = async (dx, dy, ms) => { const x = 90, y = 560;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await wait(30);
  for (let i = 1; i <= 4; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * 12 * i, y: y + dy * 12 * i, id: 1 }] }); await wait(16); }
  await wait(ms); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(60); };
const shot = (n) => page.screenshot({ path: `/workspace/tg-v11-${n}.png` });
const zone = () => ev(() => { const p = tg.player, k = +tgTest.G.w.zoneGrid[Math.floor(p.y / 16) * tgTest.G.w.mapW + Math.floor(p.x / 16)]; return tgTest.G.w.zones[k - 1].id; });
const go = async (q) => { await page.goto(base + '?' + q); await wait(3500); await ev(() => tgTest.adv(20));
  if (!/room=/.test(q) && await ev(() => !!tgTest.G.st.room)) { await ev(() => window.room.leave()); await wait(1500); await ev(() => tgTest.adv(20)); } };
// stand on the `from` side of a gate, one tile clear of it; returns the unit step towards the far side
const atLock = (id, back = 1.5) => ev(([id, back]) => {
  const w = tgTest.G.w, l = w.locks.find((l) => l.id === id), W = w.mapW, Z = w.zoneGrid, zi = (z) => w.zones.findIndex((q) => q.id === z) + 1;
  const gate = new Set(l.tiles.map((t) => t[0] + ',' + t[1])), solid = new Set(w.barrierTiles.map((t) => t[0] + ',' + t[1]));
  const zf = l.from ? zi(l.from) : 0, zt = l.to ? zi(l.to) : 0, z = (x, y) => +Z[y * W + x];
  let best = null;
  for (const [tx, ty] of l.tiles) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = tx - dx, ny = ty - dy, fx = tx + dx, fy = ty + dy, k = nx + ',' + ny;
    if (gate.has(k) || solid.has(k) || gate.has(fx + ',' + fy)) continue;
    if ((zf ? z(nx, ny) === zf : true) && (zt ? z(fx, fy) === zt : z(fx, fy) > z(nx, ny))) { best = { tx, ty, dx, dy }; if (l.tiles.length < 3 || (tx === l.tiles[1][0] && ty === l.tiles[1][1])) break; }
  }
  const { tx, ty, dx, dy } = best;
  tg.player.body.reset((tx - dx * back) * 16 + 8, (ty - dy * back) * 16 + 8); tg.player.facing = dy > 0 ? 'down' : dy < 0 ? 'up' : dx > 0 ? 'right' : 'left';
  return [dx, dy];
}, [id, back]);
const kill = async (n = 60) => { for (let k = 0; k < n; k++) {
  const left = await ev(() => { const s = tgTest.scene(), p = s.player; tgTest.G.god = true;
    const live = s.enemies.filter((e) => e.active && e.sm.current !== 'dead').sort((a, b) => (a.s.boss ? 1 : 0) - (b.s.boss ? 1 : 0));
    if (!live.length) return 0; const e = live[0]; e.body.reset(p.x, p.y - 14); e.armor = 0; p.facing = 'up'; return live.length; });
  if (!left) return true;
  for (let i = 0; i < 3; i++) { await tap('#atk'); await wait(170); }
  if (k % 3 === 2) await ev(() => tgTest.adv(10));
} return false; };
const talk = async (id, choice) => { await ev((id) => tgTest.tp(id), id); await wait(400);
  if (await ev(() => document.getElementById('atk').textContent) === '💬') await tap('#atk'); else await ev((id) => tgTest.use(id), id);
  for (let i = 0; i < 12; i++) { await wait(250); const st = await ev(() => tgTest.adv(1)); if (st === 'choice' && choice) { await ev((c) => tgTest.choose(c), choice); choice = null; } else if (st === 'closed' && !choice) break; }
  await wait(250); await ev(() => tgTest.adv(30)); await wait(300); };
const unblock = async () => { await ev(() => tgTest.adv(30)); await wait(300); };
// Gerry: parry his shots for real (tap as one arrives), hit him while he's stunned; after 25s fall back to a scripted stun
const gerryFight = async () => { const t0 = Date.now(); let parried = 0;
  await ev(() => tgTest.G.god = true);
  while (Date.now() - t0 < 110000) {
    const st = await ev(() => { const s = tgTest.scene(), p = s.player, g = s.enemies.find((e) => e.s.boss && e.active && e.sm.current !== 'dead');
      if (!g) return { done: true }; if (tgTest.G.paused) { tgTest.adv(5); return { paused: true }; } const shot = (s.shots ?? []).find((b) => b.active && !b.reflected && Math.hypot(b.x - p.x, b.y - p.y) < 24);
      if (Math.hypot(g.x - p.x, g.y - p.y) > 110) p.body.reset(g.x, g.y + 70); // stay in his range (test positioning only)
      return { shot: !!shot, stunned: s.time.now < g.stunUntil }; });
    if (st.paused) { await wait(200); continue; }
    if (st.done) return { won: true, parried, scriptedStuns: await ev(() => window.__scripted ?? 0), ms: Date.now() - t0 };
    if (st.shot) { const before = await ev(() => tgTest.scene().enemies.find((e) => e.s.boss).stunUntil); await tap('#atk'); await wait(120); if (await ev((b) => tgTest.scene().enemies.find((e) => e.s.boss)?.stunUntil > b, before)) parried++; continue; }
    if (st.stunned || Date.now() - t0 > 40000) {
      await ev(() => { const s = tgTest.scene(), p = s.player, g = s.enemies.find((e) => e.s.boss && e.active); if (s.time.now >= g.stunUntil && g.ai === 'spitter') { g.stun(1800); window.__scripted = (window.__scripted ?? 0) + 1; } g.body.reset(p.x, p.y - 16); p.facing = 'up'; });
      for (let i = 0; i < 3; i++) { await tap('#atk'); await wait(160); } await ev(() => tgTest.adv(5)); continue; }
    await wait(60);
  } return { won: false, parried }; };
const fps = async (ms = 3000) => { const s = []; for (let t = 0; t < ms; t += 500) { await wait(500); s.push(await ev(() => Math.round(tgTest.scene().game.loop.actualFps))); } return { min: Math.min(...s), avg: Math.round(s.reduce((a, b) => a + b) / s.length) }; };

try {
// 1. fence + blocked road hold (every ability, no gate open): push at the choke road, the z1|z3 fence and the forest
await go('give=drive,chip,dashstrike,parry,skateboard,bike,throw');
R.fps_world = await fps();
const choke = await ev(() => { const b = tgTest.G.w.borders.filter((b) => b[2] === 'choke'); const t = b[Math.floor(b.length / 2)]; tg.player.body.reset(t[0] * 16 + 8, t[1] * 16 - 20); return t; });
await walk(0, 1, 1500); R.choke = { tile: choke, zone: await zone() }; await walk(-1, 1, 1200); R.choke.zone2 = await zone();
await ev(() => { const s = tgTest.scene(); s.cameras.main.setZoom(2); }); await shot('blocker-roadworks'); await ev(() => tgTest.scene().cameras.main.setZoom(3));
const fence = await ev(() => { const b = tgTest.G.w.borders.filter((b) => b[2] === 'fence'); const t = b[Math.floor(b.length / 3)]; tg.player.body.reset(t[0] * 16 + 8, t[1] * 16 - 20); return t; });
await walk(0, 1, 1000); await walk(1, 0, 600); await walk(-1, 0, 600); R.fence = { tile: fence, zone: await zone() };
await ev(() => { const d = tgTest.G.w.doors.find((d) => d.side === 'top'); tg.player.body.reset(d.x + 40, d.y + 6); });
await walk(0, -1, 1500); R.forestWall = { zone: await zone(), y: await ev(() => Math.round(tg.player.y)) };
R.hold_ok = R.choke.zone === 'z1' && R.choke.zone2 === 'z1' && R.fence.zone === 'z1' && R.forestWall.zone === 'z1';

// 2. forest shortcut: drive the brambles, walk into the gap, slide the slope, clear the Glen, swing the stream, out to Playground Row
await go('give=drive,throw');
await ev(() => { const l = tgTest.G.w.locks.find((l) => l.id === 'glen_brambles'), [tx, ty] = l.tiles[0]; tg.player.body.reset(tx * 16 + 8, ty * 16 + 30); tg.player.facing = 'up'; });
await ev(() => tgTest.scene().cameras.main.setZoom(3)); await wait(300); await shot('blocker-brambles');
await hold('#atk', 300); R.brambles_tap = await ev(() => tg.lockObjs.find((o) => o.l.id === 'glen_brambles').open);
await hold('#atk', 1100); await wait(500); R.brambles_drive = await ev(() => tg.lockObjs.find((o) => o.l.id === 'glen_brambles').open);
await walk(0, -1, 1400); await wait(1500);
R.glen_in = await ev(() => ({ room: tgTest.G.st.room, y: Math.round(window.room?.player.y ?? -1) }));
await ev(() => tgTest.adv(10)); await wait(400); await shot('forest-top');
// try to walk back up the slope from its middle: you slide down instead
await ev(() => { const r = window.room, s = [...r.slope][Math.floor(r.slope.size / 2)], w = r.def.w; r.player.body.reset((s % w) * 16 + 8, Math.floor(s / w) * 16 + 8); });
const y0 = await ev(() => window.room.player.y); await walk(0, -1, 700); const y1 = await ev(() => window.room.player.y);
R.slope = { y0: Math.round(y0), y1: Math.round(y1), slid: await ev(() => tgTest.G.st.flags.includes('slid:glen')) };
await shot('forest-slope');
R.glen_clear = await kill(); await wait(600); await ev(() => tgTest.adv(10)); await ev(() => tgTest.G.god = false);
await ev(() => { const r = window.room, p = r.swingPts[0]; r.player.body.reset(p.x, p.y - 4); r.player.facing = 'down'; }); await wait(400);
R.swing_icon = await ev(() => document.getElementById('atk').textContent);
await tap('#atk'); await wait(550); await shot('forest-swing'); await wait(900);
R.swing = await ev(() => { const r = window.room; return { y: Math.round(r.player.y), south: r.swingPts[1].y, swung: tgTest.G.st.flags.includes('swung:glen') }; });
await ev(() => { const r = window.room, [ex, ey] = r.def.exit; r.player.body.reset(ex * 16 + 8, ey * 16 - 14); }); await walk(0, 1, 900); await wait(1400);
R.glen_out = { room: await ev(() => tgTest.G.st.room), zone: await zone() };
R.forest_ok = !R.brambles_tap && R.brambles_drive && R.glen_in.room === 'glen' && R.slope.y1 > R.slope.y0 && R.slope.slid && R.glen_clear && R.swing.swung && R.swing.y >= R.swing.south - 8 && R.glen_out.zone === 'z2';

// 3. road 70: slide under the ROAD CLOSED pole on the skateboard
await go('snap=s02-crescent');
let d = await atLock('road70'); await wait(300); await shot('blocker-road70');
await walk(d[0], d[1], 500); R.pole_walk = await zone();
await atLock('road70', 1.2); await walk(d[0], d[1], 120); await tap('#dash'); await wait(250); await walk(d[0], d[1], 500);
R.road70 = await zone(); R.road70_ok = R.pole_walk === 'z2' && R.road70 === 'z3';

// 4. bike chasm jump into the Links
await go('snap=s03-links');
d = await atLock('chasm', 2.5); await wait(300); await shot('blocker-chasm');
await walk(d[0], d[1], 600); R.chasm_walk = await zone();
await atLock('chasm', 2.5); await tap('#bike'); await wait(200); await walk(d[0], d[1], 1400); await wait(400);
R.chasm = await zone(); R.chasm_ok = R.chasm_walk === 'z3' && R.chasm === 'z4';

// 5. golf balls -> Sully's fiver -> den fee -> the match opens Eighteen
await go('snap=s04-sully&give=golf_ball:3');
await talk('sully');
R.fiver = await ev(() => tgTest.G.st.items.fiver ?? 0);
d = await atLock('match', 1.6); await wait(300); await shot('blocker-match');
await walk(d[0], d[1], 600); R.match_before = await zone(); await unblock();
await talk('shauna', 'Pay the den fee');
R.match_flag = await ev(() => tgTest.G.st.flags.includes('match_joined'));
await atLock('match', 1.6); await walk(d[0], d[1], 900);
R.match = await zone(); R.match_ok = R.fiver === 1 && R.match_before === 'z4' && R.match_flag && R.match === 'z5';

// 6. cans from the shed (Dash Strike door), bribe Tadhg, night falls, into the clubhouse grounds
await go('give=drive,chip,dashstrike,parry,skateboard,bike,throw,torch&flag=visited_z1,visited_z2,visited_z3,visited_z4,match_joined');
d = await atLock('guard', 1.6); await wait(300); await walk(d[0], d[1], 700); R.guard_before = await zone(); await shot('blocker-guard'); await unblock();
await ev(() => { const dd = tgTest.G.w.doors.find((x) => x.room === 'shed'); tg.player.body.reset(dd.x, dd.y + 12); tg.player.facing = 'up'; });
await walk(0, -1, 600); await wait(1500); R.shed_room = await ev(() => tgTest.G.st.room);
await ev(() => tgTest.tp('shed_can1')); await wait(300); await ev(() => tgTest.adv(10)); await ev(() => tgTest.tp('shed_can2')); await wait(300); await ev(() => tgTest.adv(10));
R.cans = await ev(() => tgTest.G.st.items.can ?? 0); await ev(() => window.room.leave()); await wait(1500);
await talk('tadhg', 'Give him the cans'); await wait(500); await ev(() => tgTest.adv(30)); await wait(400); await ev(() => tgTest.adv(30));
R.night = await ev(() => ({ bribed: tgTest.G.st.flags.includes('bribed'), evening: tgTest.G.st.flags.includes('evening'), dark: tg.night.visible }));
d = await atLock('guard', 1.6); await walk(d[0], d[1], 900); R.guard = await zone(); await shot('night-z6');
R.night_ok = R.guard_before === 'z5' && R.shed_room === 'shed' && R.cans >= 2 && R.night.bribed && R.night.evening && R.night.dark && R.guard === 'z6';

// 7. Big Gerry in the clubhouse, the terrace gate, the bonfire on the strand
await go('give=drive,chip,dashstrike,parry,skateboard,bike,throw,torch&flag=visited_z1,visited_z2,visited_z3,visited_z4,visited_z5,match_joined,bribed,evening&room=clubhouse');
R.fps_room = await fps(2000);
R.gerryFight = await gerryFight(); R.gerry = R.gerryFight.won; await wait(800); await ev(() => tgTest.adv(30)); await wait(300); await ev(() => tgTest.adv(30));
R.flag = await ev(() => ({ flag_tg: tgTest.G.st.items.flag_tg ?? 0, beaten: tgTest.G.st.flags.includes('gerry_beaten') }));
await ev(() => tgTest.G.god = false); await ev(() => window.room.leave()); await wait(1500); await ev(() => tgTest.adv(10));
d = await atLock('terrace', 1.5); await walk(d[0], d[1], 500); await unblock(); await walk(d[0], d[1], 900);
R.terrace = await zone();
await ev(() => tgTest.tp('mam')); await wait(500); await shot('bonfire'); await talk('mam'); await wait(500);
R.ending = await ev(() => tgTest.G.st.flags.includes('ending'));
R.boss_ok = R.gerry && R.flag.flag_tg && R.flag.beaten && R.terrace === 'z7' && R.ending;

} catch (e) { R.crash = String(e).slice(0, 300); }
R.errors = errs.slice(0, 8); console.log(JSON.stringify(R, null, 1)); await b.close();
const all = R.hold_ok && R.forest_ok && R.road70_ok && R.chasm_ok && R.match_ok && R.night_ok && R.boss_ok && !errs.length;
process.exit(all ? 0 : 1);
