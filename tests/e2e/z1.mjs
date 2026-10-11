// v13 zone one: wake in 127 with the bin bag, read Mam's note, walk the sign route to the skip, drop the bag (friend dialogue),
// punch little kids (they run home), beat the maintenance man in 177 (3 phases, he yields), get the club, cut the briars, enter the Glen.
// Side quests: inspect the bag, football on the frame, the lost cat, bonfire wood. No objective line / arrow. iPhone 13 viewport.
// node z1.mjs [baseUrl]
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4190/tara-glen/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const errs = []; const R = {};
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
const st = () => ev(() => tgTest.state());
const scene = () => ev(() => tgTest.scene().scene.key);
const closeAll = () => ev(() => tgTest.adv(40));
const ok = (k, v) => { R[k] = v; };
await page.goto(base + '?fresh'); await wait(3500);
// 1. wake indoors with the bag; no objective text, no arrow
let s = await st(); ok('wake', { room: s.room, binbag: s.items.binbag ?? 0 });
ok('noObjective', await ev(() => ({ objective: document.getElementById('objective').textContent, arrowVisible: getComputedStyle(document.getElementById('arrow')).display !== 'none', hintBtn: getComputedStyle(document.getElementById('hint-btn')).display })));
await closeAll();
await ev(() => { tgTest.tp('mam_note'); tgTest.use('mam_note'); }); await wait(700);
ok('noteText', await ev(() => document.body.innerText.includes('captain') || !!(tgTest.G.ui?.box)));
await page.screenshot({ path: '/workspace/z1-note.png' });
await closeAll();
// bag inspect (bag panel description)
ok('bagInspect', await ev(() => tgTest.G.w.items.binbag.desc.includes('programme')));
// 2. out the door; the route to the skip passes the signs
await ev(() => window.room.leave()); await wait(1600); await closeAll();
ok('outside', await scene());
ok('signRoute', await ev(async () => {
  const w = tg, W = tgTest.G.w, door = { x: Math.floor(w.player.x / 16), y: Math.floor(w.player.y / 16) };
  const skip = W.decor.find((d) => d.id === 'skip_z1'), signs = W.decor.filter((d) => /^skipsign/.test(d.id ?? ''));
  const path = await w.pather.find(door.x, door.y, skip.x, skip.y + 2); if (!path) return 'no path';
  const near = signs.map((sg) => Math.round(Math.min(...path.map((n) => Math.hypot(n.x - sg.x, n.y - sg.y)))));
  return { pathLen: path.length, signDistTiles: near, allOnRoute: near.every((d) => d <= 5) };
}));
// v13b out of order: 177, briars and the football before talking to {friend}
await ev(() => { const u = tgTest.G.ui, o = u.say.bind(u); window.__said = []; u.say = (m) => { window.__said.push(...(m.lines ?? [])); return o(m); }; });
const said = () => ev(() => { const s = window.__said.slice(); window.__said.length = 0; return s; });
const pushDoor = (room) => ev(async (room) => { const d = tgTest.G.w.doors.find((d) => d.room === room); tg.player.body.reset(d.x, d.y + 6); tg.doorArmed = true;
  tg.player.keys.UP.isDown = true; await new Promise((r) => setTimeout(r, 500)); tg.player.keys.UP.isDown = false; return tgTest.G.st.room; }, room);
const bumpBriars = () => ev(async () => { const o = tg.lockObjs.find((o) => o.l.id === 'glen_brambles'), bb = o.body.getBounds(); tg.player.body.reset(bb.centerX, bb.bottom + 8);
  tg.player.keys.UP.isDown = true; await new Promise((r) => setTimeout(r, 500)); tg.player.keys.UP.isDown = false; tg.player.body.reset(bb.centerX, bb.bottom + 90); await new Promise((r) => setTimeout(r, 200)); return o.open; });
await said();
const early = {};
early.room177 = await pushDoor('177'); early.doorLine = (await said()).join(' | '); await closeAll();
await ev(() => { tgTest.tp('maint_out'); tgTest.use('maint_out'); }); await wait(300); early.maintLine = (await said()).join(' | ');
early.noBossYet = await ev(() => !tg.enemies.some((e) => e.s?.type === 'maint'));
await page.screenshot({ path: '/workspace/z1c-shed-outside.png' }); await closeAll();
await bumpBriars(); early.briars = (await said()).join(' | '); await closeAll();
await ev(() => { tgTest.tp('oisin'); tgTest.use('oisin'); }); await wait(300); early.oisin = (await said()).join(' | '); await closeAll();
await ev(() => { tgTest.tp('frame_ball'); tgTest.use('frame_ball'); }); await wait(300); early.ballNoClub = !(await st()).items.football; await closeAll();
await ev(() => { const d = tgTest.G.w.decor.find((d) => d.id === 'slide_z1'); tg.player.body.reset(d.x * 16 - 8, d.y * 16 + 40); }); await wait(500); await page.screenshot({ path: '/workspace/z1c-playground.png' });
ok('kidsSeen', await ev(() => { const k = tg.enemies.filter((e) => e.active && e.s?.type === 'kid'); if (!k.length) return 0; tg.player.body.reset(k[0].x - 40, k[0].y + 10); return k.length; })); await wait(600); await page.screenshot({ path: '/workspace/z1c-kids.png' });
await ev(() => { const o = tg.lockObjs.find((o) => o.l.id === 'glen_brambles'); const p = tgTest.G.w.doors.find((d) => d.room === '177'); tg.player.body.reset(p.x + 70, p.y - 30); }); await wait(500);
await page.screenshot({ path: '/workspace/z1b-border.png' });
ok('early', early);
// 3. the skip: drop the bag -> friend's story
await ev(() => { tgTest.tp('skip_drop'); tgTest.use('skip_drop'); }); await wait(900);
await page.screenshot({ path: '/workspace/z1c-skip-ciara.png' });
await closeAll(); s = await st(); ok('skip', { bag_dropped: s.flags.includes('bag_dropped'), binbag: s.items.binbag ?? 0 });
await ev(() => { tgTest.tp('friend'); tgTest.use('friend'); }); await wait(300); await closeAll();
ok('briarsAfterCiara', (await bumpBriars(), (await said()).join(' | '))); await closeAll();
// briars still shut without the club
ok('briarsShutBefore', await ev(() => !tg.lockObjs.find((o) => o.l.id === 'glen_brambles').open));
// 4. little kids: punch until they run home
await ev(() => { tgTest.G.god = true; });
ok('kids', await ev(async () => {
  const kids = tg.enemies.filter((e) => e.active && e.e?.etype === 'kid'); const out = { n: kids.length, fled: 0, punches0: tg.combat.stats.punches ?? 0 };
  for (const k of kids.slice(0, 2)) {
    for (let i = 0; i < 30 && k.active && k.sm.current !== 'dead'; i++) { tg.player.body.reset(k.x - 12, k.y); tg.player.facing = 'right'; k.body.reset(k.x, k.y); tg.combat.press(); tg.combat.release(); await new Promise((r) => setTimeout(r, 260)); }
    if (k.sm.current === 'dead') out.fled++;
  }
  out.punches = (tg.combat.stats.punches ?? 0) - out.punches0; return out;
}));
// 5. boss in 177
ok('door177AfterCiara', await pushDoor('177')); await wait(1800); await closeAll(); ok('bossBark', (await said()).join(' | '));
ok('bossRoom', await scene());
const boss = async () => ev(() => { const e = room.enemies.find((e) => e.s?.type === 'maint'); return e ? { hp: e.life.life, phase: e.phase, ai: e.ai, mode: e.mode, dead: e.sm.current === 'dead' } : null; });
ok('bossStart', await boss());
await wait(1200); await closeAll(); await page.screenshot({ path: '/workspace/z1c-shed-inside.png' });
const phases = new Set(); let shot = false;
for (let i = 0; i < 160; i++) {
  const r = await ev(() => { const s = room, e = s.enemies.find((e) => e.s?.type === 'maint'); if (!e || e.sm.current === 'dead') return 'done';
    tgTest.adv(40);
    // stand behind him (opposite his facing) and swing
    const B = s.physics.world.bounds, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const bx = cl(e.x - Math.cos(e.dir) * 14, B.x + 24, B.right - 24), by = cl(e.y - Math.sin(e.dir) * 14, B.y + 40, B.bottom - 24); s.player.body.reset(bx, by);
    const hp = e.life.life; s.combat.press(); s.combat.release(); return { ai: e.ai, hp };
  });
  if (r === 'done') break; phases.add(r.ai); await wait(230);
  if (r.ai === 'blower' && !shot) { // mid-fight shot: let him wind up and blow, slowed down
    shot = true; await ev(() => { const cl0 = (v, a, b) => Math.max(a, Math.min(b, v)); const s = room, e = s.enemies.find((e) => e.s?.type === 'maint'); const B = s.physics.world.bounds; const px = cl0(B.centerX, B.x + 90, B.right - 30), py = cl0(B.centerY, B.y + 50, B.bottom - 30); e.body.reset(px - 34, py - 4); s.player.body.reset(px, py); e.dir = Math.atan2(4, 34); e.mode = 'attack'; e.mt = 1500; });
    await wait(120); await ev(() => { room.time.timeScale = 0.2; room.tweens.timeScale = 0.2; }); await page.screenshot({ path: '/workspace/z1c-boss.png' }); await ev(() => { room.time.timeScale = 1; room.tweens.timeScale = 1; });
  }
}
await wait(500);
ok('bossPhases', [...phases]); ok('bossEnd', await boss());
await ev(() => tgTest.adv(3)); await wait(400); await page.screenshot({ path: '/workspace/z1-club.png' }); // 'Go on. Just don't tell them...' over the club banner
await closeAll(); s = await st(); ok('club', { club: s.items.club ?? 0, maint_beaten: s.flags.includes('maint_beaten') });
await closeAll();
// 6. briars: swing the club at them, then walk into the Glen
await ev(() => room.leave()); await wait(1600); await closeAll();
ok('briars', await ev(async () => { const o = tg.lockObjs.find((o) => o.l.id === 'glen_brambles'), bb = o.body.getBounds();
  tg.player.body.reset(bb.centerX, bb.bottom + 10); tg.player.facing = 'up'; tg.player.keys.UP.isDown = true; await new Promise((r) => setTimeout(r, 60)); tg.combat.press(); tg.combat.release(); tg.player.keys.UP.isDown = false;
  await new Promise((r) => setTimeout(r, 600)); return { open: o.open }; }));
await closeAll();
ok('enterGlen', await ev(async () => { const o = tg.lockObjs.find((o) => o.l.id === 'glen_brambles'), bb = o.body.getBounds(); tg.player.body.reset(bb.centerX, bb.bottom + 6);
  tg.player.keys.UP.isDown = true; for (let i = 0; i < 40 && !tgTest.G.st.room; i++) await new Promise((r) => setTimeout(r, 100)); tg.player.keys.UP.isDown = false; return tgTest.G.st.room; }));
await wait(1500); await closeAll();
if (await ev(() => !!tgTest.G.st.room)) { await ev(() => room.leave()); await wait(1600); await closeAll(); }
// side quests
ok('football', await ev(async () => { tgTest.tp('frame_ball'); tgTest.use('frame_ball'); tgTest.adv(40); tgTest.tp('oisin'); tgTest.use('oisin'); tgTest.adv(40); const s = tgTest.state(); return { ball_back: s.flags.includes('ball_back'), wood: s.items.wood ?? 0 }; }));
ok('cat', await ev(async () => { const hp0 = tgTest.G.st.maxhp;
  tgTest.tp('neighbour'); tgTest.use('neighbour'); tgTest.adv(40); tgTest.tp('treats_pick'); await new Promise((r) => setTimeout(r, 400)); tgTest.adv(40);
  tgTest.tp('cat'); tgTest.use('cat'); tgTest.adv(40); tgTest.tp('neighbour'); tgTest.use('neighbour'); tgTest.adv(40);
  const s = tgTest.state(); return { cat_found: s.flags.includes('cat_found'), thanked: s.flags.includes('cat_thanked'), maxhpGain: tgTest.G.st.maxhp - hp0 }; }));
ok('wood', await ev(async () => {
  for (let i = 1; i <= 6; i++) { if (tgTest.G.st.got.includes('wood_z1_' + i)) continue; tgTest.tp('wood_z1_' + i); await new Promise((r) => setTimeout(r, 350)); tgTest.adv(10); }
  return { gained: [1, 2, 3, 4, 5, 6].filter((i) => tgTest.G.st.got.includes('wood_z1_' + i)).length, total: tgTest.G.st.items.wood, hud: document.getElementById('shells').textContent }; }));
// overview
{ const p2 = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage(); p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(base + '?fresh'); await p2.waitForTimeout(3500); await p2.evaluate(() => tgTest.adv(40)); await p2.evaluate(() => room.leave()); await p2.waitForTimeout(1600); await p2.evaluate(() => tgTest.adv(40));
  await p2.evaluate(() => { const c = tg.cameras.main; c.stopFollow(); c.setZoom(0.85); c.centerOn(82 * 16, 40 * 16); document.querySelectorAll('#hud,#controls,.rbtn,#joy,#btns').forEach((e) => (e.style.visibility = 'hidden')); });
  await p2.waitForTimeout(800); await p2.screenshot({ path: '/workspace/z1-overview.png' }); }
ok('errors', errs);
const E = R.early; const pass = E.room177 === null && /STAFF ONLY/.test(E.doorLine) && /busy/.test(E.maintLine) && E.noBossYet && /Nothing's getting through/.test(E.briars) && /can't reach/.test(E.oisin) && E.ballNoClub && /hack through/.test(R.briarsAfterCiara) && R.door177AfterCiara === '177' && /not getting it/.test(R.bossBark) && R.wake.binbag === 1 && R.noObjective.objective === '' && !R.noObjective.arrowVisible && R.signRoute.allOnRoute && R.skip.bag_dropped && R.kids.fled >= 1 &&
  R.bossEnd?.dead && R.bossPhases.length === 3 && R.club.club && R.briars.open && R.enterGlen === 'glen' && R.football.ball_back && R.cat.maxhpGain === 1 && R.wood.gained === 6 && !errs.length;
R.PASS = pass; console.log(JSON.stringify(R, null, 1)); await b.close(); process.exit(pass ? 0 : 1);
