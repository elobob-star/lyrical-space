import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x); if (!c) fails++; };
const URL = 'http://127.0.0.1:4173/';
await page.goto(URL); await page.waitForSelector('.chassis:not(.boot)'); await page.waitForTimeout(1500);
// offline dictionary works in the production bundle: bench syllable gutter + flow
await page.click('.legend button:nth-child(3)'); await page.waitForTimeout(500);
const gut = await page.locator('.gut').first().textContent();
ok('production bundle loads CMU (syllable count)', /^\d+/.test(gut), 'first gutter = ' + gut);
// persistence: edit title + roll text, reload
await page.click('.legend button:nth-child(1)');
await page.locator('.roll-input').click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' PERSIST-ME-123');
await page.waitForTimeout(900);
await page.click('.legend button:nth-child(3)'); await page.waitForTimeout(500);
await page.click('.bench-title'); await page.keyboard.press('Control+A'); await page.keyboard.type('MY RENAMED TAPE'); await page.keyboard.press('Enter');
// shoebox persists too
await page.click('.slip-tab'); await page.fill('.slip-pop textarea', 'SHOEBOX-PERSIST'); await page.press('.slip-pop textarea', 'Enter'); await page.click('.slip-acts button:first-child');
await page.waitForTimeout(900);
await page.reload(); await page.waitForSelector('.chassis:not(.boot)'); await page.waitForTimeout(1200);
ok('notebook page survives reload', (await page.locator('.roll-input').inputValue()).includes('PERSIST-ME-123'));
await page.click('.legend button:nth-child(3)'); await page.waitForTimeout(500);
const tt = await page.locator('.bench-title .t').textContent(); ok('title survives reload', tt.includes('MY RENAMED TAPE'), JSON.stringify(tt));
await page.click('button[aria-label="Tapes"]'); await page.waitForTimeout(300);
await page.click('.bezel-bottom button[aria-label="Shoebox"]'); await page.waitForTimeout(200);
ok('shoebox survives reload', (await page.locator('.slip-txt').allTextContents()).some((t) => t.includes('SHOEBOX-PERSIST')));
// new tape + switch back via rack
await page.click('.bezel-bottom button[aria-label="New"]'); await page.waitForTimeout(400);
ok('a new tape opens on an empty bench', (await page.locator('.empty-bench').count()) === 1);
await page.click('button[aria-label="Tapes"]'); await page.waitForTimeout(300);
await page.click('.bezel-bottom button[aria-label="Tapes"]'); await page.waitForTimeout(200);
ok('rack lists two tapes', (await page.locator('.jcard').count()) === 2);
// history snapshots exist for the edited tape after more edits
await page.click('.jcard >> nth=1 >> .jc-main'); await page.waitForTimeout(400);
console.log(errs.join('\n') || 'no console errors'); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
await browser.close();
