// v12.2 menu reset: wipes main/backup/before-link/scratch saves, keeps mute, starts fresh in 127, survives reload + tab hide.
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4174/tara-glen/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const errs = []; const R = {};
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text()));
page.on('dialog', (d) => d.accept());
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
const hide = () => ev(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
const prog = () => ev(() => ({ got: tgTest.G.st.got.length, flags: tgTest.G.st.flags.length, coin: tgTest.G.st.items.coin ?? 0, room: tgTest.G.st.room ?? null,
  keys: Object.keys(localStorage).filter((k) => k.startsWith('tara-glen-save')), mute: Object.entries(localStorage).filter(([k]) => /mute/i.test(k)).length }));
const doReset = async () => { await ev(() => document.getElementById('menu-reset').click()); await page.waitForLoadState('load'); await wait(4500); };
// 1: real progress (from a snap link, so a before-link slot exists too) + backup + old scratch + mute set
await page.goto(base); await wait(4500); await ev(() => { tgTest.G.st.items.coin = 5; tgTest.G.st.flags.push('m'); tgTest.G.st.got.push('a'); }); await hide();
await page.goto(base + '?snap=everything'); await wait(4500);
await ev(() => { tgFlush(); const v = localStorage.getItem('tara-glen-save-v6'); localStorage.setItem('tara-glen-save-v6-bak', v); localStorage.setItem('tara-glen-save-v6-debug', v);
  document.getElementById('menu-sound').click(); localStorage.setItem('tg-mute-probe', '1'); });
R.before = await prog();
const muteKeys = await ev(() => Object.keys(localStorage).filter((k) => !k.startsWith('tara-glen-save')));
await doReset(); R.afterReset = await prog();
await hide(); await page.reload(); await wait(4500); R.afterReload = await prog();
await page.goto(base); await wait(4500); R.afterRevisit = await prog();
R.bakFresh = await ev(() => { const b = JSON.parse(localStorage.getItem('tara-glen-save-v6-bak') ?? '{"got":[]}'); return b.got.length === 0; });
R.otherKeysKept = await ev((ks) => ks.every((k) => localStorage.getItem(k) !== null), muteKeys);
const fresh = (p) => p.got === 0 && p.coin === 0 && p.room === '127';
R.ok = R.before.got > 0 && fresh(R.afterReset) && fresh(R.afterReload) && fresh(R.afterRevisit) && R.otherKeysKept && !R.afterReload.keys.some((k) => /before|debug/.test(k)) && R.bakFresh;
R.errors = errs.slice(0, 6); console.log(JSON.stringify(R, null, 1)); await b.close();
process.exit(R.ok && !errs.length ? 0 : 1);
