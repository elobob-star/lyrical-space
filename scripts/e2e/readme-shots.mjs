// The screenshots in the README: phone size, sample lyrics only (nothing personal). Usage: node scripts/e2e/readme-shots.mjs <outdir>
// Needs the dev server (npm run dev) or URL=… for a deployed build.
import { chromium } from 'playwright';
import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out = process.argv[2] ?? 'docs/screenshots';
const URL = process.env.URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'light' });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { await wait(700); await page.screenshot({ path: `${out}/${name}.png` }); console.log('wrote', name); };
const slip = async (text) => {
  await page.click('.bezel-bottom button[aria-label="Slip"]'); await wait(300);
  await page.locator('.sheet textarea').first().fill(text);
  await page.locator('.sheet button:has-text("LAY IT DOWN")').first().click(); await wait(350);
};

await page.goto(URL);
await page.waitForSelector('.chassis:not(.boot)');
await wait(1500);

// NOTEBOOK: a fresh page of lyrics, with one struck-out word
await page.click('button[aria-label="New page"]'); await wait(600);
const ta = page.locator('.roll-input');
await ta.click();
await page.keyboard.type('Rain on the roof of a borrowed room,\nsomething in the window wants to bloom,\nthe river takes the light ');
await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
await page.keyboard.type('dark ');
await page.keyboard.type('and a streetlight leaning like a question mark');
await shot('notebook');

// TABLE: a few slips, one picked up so its cut points show
await page.click('.legend button:nth-child(2)'); await wait(700);
await slip('a bridge that only exists in fog');
await slip('second-hand sweater, first-hand love');
await slip('the whole town hums the chorus back');
await slip('keep the light on low');
const strip = page.locator('.strip').filter({ has: page.locator('.gap') }).first();
const p = await strip.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + 24, y: r.top + r.height / 2 }; });
await page.mouse.click(p.x, p.y); await wait(300);
await shot('table');

// BENCH: the sample tape with its chords, verses and choruses (let the LCD's last message clear first)
await wait(12000); // a long LCD message scrolls for ~10 s
await page.click('.legend button:nth-child(3)'); await wait(800);
await shot('bench');

// RACK: the tapes and the shoebox
await page.click('button[aria-label="Tapes"]'); await wait(800);
await shot('rack');
await page.click('button[aria-label="Tapes"]'); await wait(500);

// SETUP: the look
await page.click('button[aria-label="Setup"]'); await wait(700);
await page.locator('.set-card h4:has-text("LOOK")').scrollIntoViewIfNeeded(); await wait(200);
await shot('setup');

// THE HERO: the four surfaces side by side, built from the shots above
const abs = (f) => resolve(out, f);
const cards = [['notebook.png', 'Notebook'], ['table.png', 'Table'], ['bench.png', 'Bench'], ['rack.png', 'Tapes']];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#dfdbd2}
.row{display:flex;gap:28px;justify-content:center;align-items:flex-start;padding:36px 40px}
figure{margin:0;text-align:center;font:600 13px/1.3 "Courier New",monospace;letter-spacing:.14em;color:#4a463e;text-transform:uppercase}
img{display:block;width:250px;height:auto;border-radius:26px;box-shadow:0 1px 1px rgba(0,0,0,.18),0 10px 24px rgba(0,0,0,.22)}
figcaption{margin-top:12px}
</style></head><body><div class="row">
${cards.map(([f, c]) => `<figure><img src="file://${abs(f)}"><figcaption>${c}</figcaption></figure>`).join('\n')}
</div></body></html>`;
const tmp = abs('_hero.html');
writeFileSync(tmp, html);
const hp = await (await browser.newContext({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1.5 })).newPage();
await hp.goto('file://' + tmp);
await hp.waitForFunction(() => [...document.images].every((i) => i.complete));
const box = await hp.locator('.row').boundingBox();
await hp.screenshot({ path: abs('hero.png'), clip: { x: 0, y: 0, width: 1200, height: Math.ceil(box.y + box.height) } });
rmSync(tmp);
console.log('wrote hero');

await browser.close();
