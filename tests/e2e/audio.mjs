// v12 audio: locked until the first tap, running after it, zone bus follows the player, mute toggle persists across reload.
import { chromium, devices } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:4174/tara-glen/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const errs = []; const R = {};
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const ev = (f) => page.evaluate(f);
await page.goto(base + '?snap=s03-links&tp=z4'); await page.waitForTimeout(4500);
R.before = await ev(() => tgAudio.state);
await page.touchscreen.tap(40, 420); await page.waitForTimeout(1500); await ev(() => tgTest.adv(20)); await page.waitForTimeout(1500);
R.after = await ev(() => ({ state: tgAudio.state, zone: tgAudio.cur }));
await page.click('#menu-btn'); await page.click('#menu-sound');
R.mutedLabel = await ev(() => document.getElementById('menu-sound').textContent);
await page.reload(); await page.waitForTimeout(4000);
R.reload = await ev(() => ({ muted: tgAudio.muted, label: document.getElementById('menu-sound').textContent }));
R.ok = R.before === 'locked' && R.after.state === 'running' && R.after.zone === 'z4' && /off/.test(R.mutedLabel) && R.reload.muted && /off/.test(R.reload.label);
R.errors = errs.slice(0, 5); console.log(JSON.stringify(R)); await b.close(); process.exit(R.ok && !errs.length ? 0 : 1);
