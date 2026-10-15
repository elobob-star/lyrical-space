import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function ctxFor(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('.chassis:not(.boot)'); await page.waitForTimeout(1200);
  return page;
}
let page = await ctxFor(390, 800);
// legal + charcoal via settings
await page.click('.nameplate'); await page.waitForSelector('.sheet');
await page.click('.sheet button:has-text("CHARCOAL")');
await page.click('.sheet button:has-text("LEGAL")');
await page.click('.sheet button[aria-label="Close"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/40-charcoal-legal-roll.png` });
await page.click('.legend button:nth-child(3)'); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/41-charcoal-legal-bench.png` });
// cadence sheet
await page.click('button[aria-label="Cadence"] >> nth=1'); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/42-cadence.png` });
await page.click('.sheet button[aria-label="Close"]');
// export
await page.click('button[aria-label="Export"]'); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/43-export.png` });
await page.click('.sheet .btn:has-text("LYRIC CARD")'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/44-card.png` });
await page.context().close();
// small phone, midnight
page = await ctxFor(360, 640);
await page.click('.nameplate'); await page.waitForSelector('.sheet');
await page.click('.sheet button:has-text("MIDNIGHT")');
await page.click('.sheet button[aria-label="Close"]'); await page.waitForTimeout(300);
await page.click('.legend button:nth-child(3)'); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/45-small-midnight-bench.png` });
await browser.close();
