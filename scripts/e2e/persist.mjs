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
await page.click('.title-tape'); await page.keyboard.press('Control+A'); await page.keyboard.type('MY RENAMED TAPE'); await page.keyboard.press('Enter');
await page.waitForTimeout(900);
await page.reload(); await page.waitForSelector('.chassis:not(.boot)'); await page.waitForTimeout(1200);
ok('roll text survives reload', (await page.locator('.roll-input').inputValue()).includes('PERSIST-ME-123'));
const tt = await page.locator('.title-tape .t').textContent(); ok('title survives reload', tt.includes('MY RENAMED TAPE'), JSON.stringify(tt));
// new tape + switch back via rack
await page.click('.reel-btn'); await page.waitForTimeout(300);
await page.click('.rack-head .btn.go'); await page.waitForTimeout(400);
ok('new tape starts blank', (await page.locator('.roll-input').inputValue()) === '');
await page.click('.reel-btn'); await page.waitForTimeout(300);
ok('rack lists two tapes', (await page.locator('.cassette').count()) === 2);
console.log(errs.join('\n') || 'no console errors'); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
await browser.close();
