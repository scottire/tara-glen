// v11.2 save persistence (playwright-core + system Chrome, iPhone 13). node persist.mjs [baseUrl]
// A: a session opened from a ?snap link: play (pick up, move), hide the tab (visibilitychange + pagehide), reload as iOS does
//    after evicting the tab: progress and position must survive, the snapshot must not re-apply, the URL is stripped.
// B: a real save + a corrupt main slot recovers from the backup. C: an old v11 scratch-key session is adopted on load.
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4174/tara-glen/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const errs = []; const R = {};
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
const st = () => ev(() => ({ url: location.search, coin: tgTest.G.st.items.coin ?? 0, marker: tgTest.G.st.flags.includes('test_marker'), room: tgTest.G.st.room ?? null,
  pos: tgTest.G.st.room ? null : [Math.round(tg.player.x), Math.round(tg.player.y)], got: tgTest.G.st.got.length }));
// A
await page.goto(base + '?snap=s03-links'); await wait(4500); await ev(() => tgTest.adv(20));
R.A_start = await st();
await ev(() => { tgTest.G.st.items.coin = (tgTest.G.st.items.coin ?? 0) + 7; tgTest.give('golf_ball'); tgTest.G.st.flags.push('test_marker'); tg.player.body.reset(tg.player.x + 40, tg.player.y + 24); });
await wait(300);
const moved = await st();
await ev(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
await page.reload(); await wait(4500); await ev(() => tgTest.adv(20));
R.A_after = await st();
R.A_ok = R.A_start.url === '' && R.A_after.url === '' && R.A_after.coin === moved.coin && R.A_after.marker && Math.hypot(R.A_after.pos[0] - moved.pos[0], R.A_after.pos[1] - moved.pos[1]) < 20;
// also a hard reload of the original link (iOS restores the tab's URL as typed): must not re-apply
await page.goto(base + '?snap=s03-links', { waitUntil: 'load' }).catch(() => {}); // this IS a fresh navigation: it applies (intent) and backs up
R.A_backup = await ev(() => !!localStorage.getItem('tara-glen-save-v6-before-link'));
// B: corrupt main slot -> backup
await ev(() => { const good = localStorage.getItem('tara-glen-save-v6'); localStorage.setItem('tara-glen-save-v6-bak', good); localStorage.setItem('tara-glen-save-v6', '{"items":{"coin":'); });
await page.goto(base); await wait(4500); await ev(() => tgTest.adv(20));
R.B = await st(); R.B_ok = R.B.got > 0;
// C: old scratch key with more progress than the real save is adopted
await ev(() => { const s = JSON.parse(localStorage.getItem('tara-glen-save-v6')); s.flags.push('scratch_marker'); localStorage.setItem('tara-glen-save-v6-debug', JSON.stringify(s));
  localStorage.setItem('tara-glen-save-v6', JSON.stringify({ items: {}, flags: [], got: [], defeated: [], maxhp: 3, hp: 3, elapsed: 0, hintTier: {}, seenZones: [], v: 11 })); });
await page.goto(base); await wait(4500); await ev(() => tgTest.adv(20));
R.C = await ev(() => ({ adopted: tgTest.G.st.flags.includes('scratch_marker'), scratchGone: !localStorage.getItem('tara-glen-save-v6-debug') })); R.C_ok = R.C.adopted && R.C.scratchGone;
R.errors = errs.slice(0, 6); console.log(JSON.stringify(R, null, 1)); await b.close();
process.exit(R.A_ok && R.A_backup && R.B_ok && R.C_ok && !errs.length ? 0 : 1);
