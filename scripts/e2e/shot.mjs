// Usage: node scripts/e2e/shot.mjs <outdir>   — quick visual smoke at phone size
import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto('http://127.0.0.1:5173/');
await page.waitForSelector('.chassis:not(.boot)');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/01-roll.png` });
await page.click('.legend button:nth-child(2)');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/02-table-empty.png` });
console.log(errors.join('\n') || 'no errors');
await browser.close();
