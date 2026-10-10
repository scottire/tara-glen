// v12.1 tour links (?tour=z1..z7): each lands in its zone with the intended grade (z1-5 day, z6 night, z7 sunset),
// survives a reload as the same tour, and leaves an existing real save byte-for-byte untouched. node tour.mjs [baseUrl] [shotsDir]
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4174/tara-glen/', shots = process.argv[3];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const errs = []; const R = { zones: {} };
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text()));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
const real = JSON.stringify({ items: { coin: 3 }, flags: ['evening', 'real_marker'], got: ['x'], defeated: [], maxhp: 3, hp: 3, elapsed: 5, hintTier: {}, seenZones: [], v: 11, started: true, room: null, pos: [200, 200] });
await page.goto(base + 'world.json'); await ev((r) => localStorage.setItem('tara-glen-save-v6', r), real);
const look = () => ev(() => { const v = tg.vibe, g = v?.grade;
  return { url: location.search, zone: v?.zone, eve: tgTest.G.st.flags.includes('evening'), room: tgTest.G.st.room ?? null, fill: g ? g.fillColor.toString(16) : null, alpha: g ? +g.fillAlpha.toFixed(2) : null }; });
let ok = true;
for (let i = 1; i <= 7; i++) {
  const z = 'z' + i; await page.goto(base + '?tour=' + z); await wait(4500); await ev(() => tgTest.adv(60)); await wait(1500);
  const a = await look(); await ev(() => { window.dispatchEvent(new Event('pagehide')); }); await page.reload(); await wait(4500); await ev(() => tgTest.adv(60)); await wait(800);
  const r = await look(); if (shots) await page.screenshot({ path: `${shots}/tour-${z}.png` });
  const wantEve = i >= 6; const good = a.zone === z && r.zone === z && a.eve === wantEve && !a.room && r.url.includes('tour=' + z) && a.alpha > 0;
  R.zones[z] = { ...a, reloadZone: r.zone, good }; ok &&= good;
}
R.fills = new Set(Object.values(R.zones).map((z) => z.fill)).size; // grades really differ
await page.goto(base + 'world.json'); R.realUntouched = (await ev(() => localStorage.getItem('tara-glen-save-v6'))) === real;
await page.goto(base); await wait(4500); R.realLoads = await ev(() => tgTest.G.st.flags.includes('real_marker'));
R.errors = errs.slice(0, 6); console.log(JSON.stringify(R, null, 1)); await b.close();
process.exit(ok && R.fills >= 6 && R.realUntouched && R.realLoads && !errs.length ? 0 : 1);
