// v11.1 runtime border probe (playwright-core + system Chrome, iPhone 13). node borders.mjs [baseUrl] [step]
// Fresh save, every gate shut, bike in the bag. At many points along every zone border the bot stands on the lower-zone
// side and tries to get across: straight at it, at 45 degrees, and pushing in then sliding along it (wall-slides find
// strips beside caravans), by walking, dodge-rolling and biking. Input goes through the real update loop (readInput is
// fed a vector), so it is the same physics the phone runs. Any body-centre tile of a higher zone = leak.
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4174/tara-glen/'; const STEP = +(process.argv[3] || 7);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ ...devices['iPhone 13'] })).newPage(); const ev = (f, a) => page.evaluate(f, a); const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(base + '?fresh&give=bike,throw'); await page.waitForTimeout(4000); await ev(() => tgTest.adv(20));
if (await ev(() => !!tgTest.G.st.room)) { await ev(() => window.room.leave()); await page.waitForTimeout(1500); await ev(() => tgTest.adv(20)); }
await ev(() => { const p = tg.player; tgTest.G.god = true; window.__in = null; const orig = p.readInput.bind(p);
  p.readInput = () => (window.__in ? new (tg.player.body.velocity.constructor)(window.__in[0], window.__in[1]) : orig());
  const w = tgTest.G.w, z = (px, py) => +w.zoneGrid[Math.floor(py / 16) * w.mapW + Math.floor(px / 16)] || 0;
  // legs: [[dx, dy, ms], ...]; returns the highest zone the body centre touched
  window.probe = (x, y, legs, mode) => new Promise((res) => {
    if ((mode === 'bike') !== tg.riding) tg.toggleBike();
    p.body.reset(x, y); p.setVelocity(0, 0); const z0 = z(p.x, p.y + 4); let zmax = z0, at = null, i = 0, dist = 0;
    const next = () => { if (i >= legs.length) { clearInterval(iv); window.__in = null; p.setVelocity(0, 0); return res({ z0, zmax, at, dist }); }
      const [dx, dy, ms] = legs[i++], l = Math.hypot(dx, dy); window.__in = [dx / l, dy / l]; setTimeout(next, ms); };
    const iv = setInterval(() => { if (tgTest.G.paused) tgTest.adv(5); dist = Math.max(dist, Math.hypot(p.x - x, p.y - y)); const zz = z(p.x, p.y + 4); if (zz > zmax) { zmax = zz; at = [Math.floor(p.x / 16), Math.floor((p.y + 4) / 16)]; }
      if (mode === 'dodge' && !p.dashing && window.__in) p.dodge(Math.atan2(window.__in[1], window.__in[0])); }, 16);
    next(); }); });
// sample points: every zone-outline edge (lower zone a | higher zone b), whether or not a border tile sits there (a leak is
// exactly a place the border missed). Stand 1.6 tiles back on the a side where the body fits; skip gate surroundings.
const pts = await ev((STEP) => { const w = tgTest.G.w, W = w.mapW, H = w.zoneGrid.length / W, Z = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : +w.zoneGrid[y * W + x] || 0);
  const [ground, objects] = tg.walls;
  const fits = (x, y) => !tg.physics.overlapRect(x - 5, y, 10, 8, false, true).length && ![[x - 5, y], [x + 5, y], [x - 5, y + 8], [x + 5, y + 8]].some(([a, c]) => objects.getTileAtWorldXY(a, c)?.collides || ground.getTileAtWorldXY(a, c)?.collides);
  const near = (x, y) => w.locks.some((l) => l.tiles.some(([tx, ty]) => Math.abs(tx - x) <= 3 && Math.abs(ty - y) <= 3)) || w.doors.some((d) => d.room === 'glen' && Math.abs(d.x / 16 - x) <= 2 && Math.abs(d.y / 16 - y) <= 2);
  const out = []; let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = Z(x, y); if (!a) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const hb = Z(x + dx, y + dy); if (hb <= a || near(x, y)) continue;
      if (n++ % STEP) continue;
      for (const back of [0.6, 1.6, 2.6]) { const sx = (x - dx * (back - 0.5)) * 16 + 8 - dx * 8, sy = (y - dy * (back - 0.5)) * 16 + 4 - dy * 8;
        if (Z(Math.floor(sx / 16), Math.floor((sy + 4) / 16)) === a && fits(sx, sy)) { out.push({ x: sx, y: sy, dx, dy, a, hi: hb }); break; } } } }
  return out; }, STEP);
const leaks = []; let tries = 0, stuck = 0; const t0 = Date.now();
for (const q of pts) for (const mode of ['walk', 'dodge', 'bike']) {
  const ms = mode === 'walk' ? 900 : 500, px = -q.dy, py = q.dx; // perpendicular
  for (const legs of [[[q.dx, q.dy, ms]], [[q.dx + px, q.dy + py, ms]], [[q.dx - px, q.dy - py, ms]], [[q.dx, q.dy, 250], [px, py, ms]], [[q.dx, q.dy, 250], [-px, -py, ms]]]) {
    tries++; const r = await ev(([x, y, legs, mode]) => probe(x, y, legs, mode), [q.x, q.y, legs, mode]);
    if (r.dist < 4) stuck++;
    if (r.zmax > r.z0) leaks.push({ mode, from: [Math.floor(q.x / 16), Math.floor(q.y / 16)], z0: r.z0, to: r.zmax, at: r.at, legs: legs.map((l) => l.slice(0, 2)) });
  } }
// the edges of the map: run along all four bounds (the world is clamped; nothing may cross there either)
const extra = await ev(async () => { const w = tgTest.G.w, H = w.zoneGrid.length / w.mapW, out = [];
  for (const [x, y, dx, dy] of [[24, 4, -1, -1], [w.mapW * 16 - 24, 4, 1, -1], [24, H * 16 - 8, -1, 1]]) out.push(await probe(x, y, [[dx, dy, 600], [-dx, 0, 600]], 'walk'));
  return out.filter((r) => r.zmax > r.z0 && r.z0); });
const res = { points: pts.length, tries, stuck, leaks: leaks.length, sample: leaks.slice(0, 12), edgeLeaks: extra, minutes: +((Date.now() - t0) / 60000).toFixed(1), errors: errs.slice(0, 4) };
console.log(JSON.stringify(res, null, 1)); await b.close(); process.exit(leaks.length || extra.length || errs.length || stuck > tries / 4 ? 1 : 0);
