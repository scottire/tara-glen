// Playwright (playwright-core + system Chrome; WebKit via 'node freeze.mjs webkit' where supported). Run against 'npx vite preview' at /tara-glen/.
import { chromium, webkit, devices } from 'playwright-core';
const which = process.argv[2] || 'chromium', base = process.argv[3] || 'http://localhost:4174/tara-glen/';
const L = which === 'webkit' ? webkit : chromium;
const b = await L.launch(which === 'webkit' ? {} : { executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const errs = [];
const tap = async () => { const bb = await page.locator('#atk').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
page.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(0, 4).join(' | '))); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const hang = setTimeout(() => { console.log(JSON.stringify({ FROZE: true })); process.exit(1); }, 140000);
await page.goto(base + '?fresh&room=' + (process.argv[4] || '131')); await page.waitForTimeout(4000);
// kill with the real combo: teleport each enemy in front of the player, then hit Attack until it dies (boss last)
for (let k = 0; k < 60; k++) {
  const left = await page.evaluate(() => { const s = tgTest.scene(), p = s.player; tgTest.G.god = true;
    const live = s.enemies.filter((e) => e.active && e.sm.current !== 'dead').sort((a, b) => (a.s.boss ? 1 : 0) - (b.s.boss ? 1 : 0));
    if (!live.length) return 0; const e = live[0]; e.body.reset(p.x, p.y - 14); e.armor = 0; p.facing = 'up'; return live.length; });
  if (!left) break;  
  for (let i = 0; i < 3; i++) { await tap(); await page.waitForTimeout(170); }
  await page.evaluate(() => tgTest.adv(10));
}
await page.waitForTimeout(1500);
const t1 = await page.evaluate(() => tgTest.scene().time.now); await page.waitForTimeout(1000);
const st = await page.evaluate(() => ({ t: tgTest.scene().time.now, paused: tgTest.G.paused, box: !!tgTest.G.ui.box, cur: tgTest.G.ui.cur?.lines, locked: tgTest.scene().locked }));
// regression: empty dialogue never opens; a tap still works; an exception inside a frame is survived
const reg = {};
reg.emptySay = await page.evaluate(() => { tgTest.say([]); tgTest.say(['', '  ']); return { box: !!tgTest.G.ui.box, paused: tgTest.G.paused }; });
await tap(); await page.waitForTimeout(300);
const n0 = errs.length;
if (which !== 'webkit') { await page.evaluate(() => tgTest.throwOnce()); await page.waitForTimeout(600);
const a0 = await page.evaluate(() => tgTest.scene().time.now); await page.waitForTimeout(500);
reg.afterThrow = { advancing: (await page.evaluate(() => tgTest.scene().time.now)) - a0 > 300, logged: errs.length > n0 }; }
reg.physicsRunning = await page.evaluate(() => !tgTest.scene().physics.world.isPaused);
clearTimeout(hang);
console.log(JSON.stringify({ reg, advanced: st.t - t1, ...st, errs: errs.slice(0, 5) }));
await page.screenshot({ path: '/tmp/freeze-repro.png' }); await b.close();
