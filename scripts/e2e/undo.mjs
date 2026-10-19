// Undo everywhere it matters: notebook (typing, strikes, burning), bench (typing, Enter, line moves, tempo), page menu, LCD gear.
// Usage: npm run dev, then: node scripts/e2e/undo.mjs <screenshot-dir>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.tmp';
const URL = process.env.URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/datamuse|dictionaryapi|Failed to load resource/i.test(m.text())) errors.push('CONSOLE ' + m.text()); });
let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const wait = (ms) => page.waitForTimeout(ms);
const dial = (i) => page.click(`.legend button:nth-child(${i})`);
await page.goto(URL);
await page.waitForSelector('.chassis:not(.boot)');
await wait(1200);

// ---------- notebook ----------
await page.click('.pg-new').catch(() => {});
await wait(200);
const ta = page.locator('.roll-input');
await ta.focus();
await page.keyboard.type('the moon is a nickle ');
await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
await wait(100);
const gh = (await page.locator('.roll-mirror .g').allTextContents()).join('');
ok('three backspaces: the space erases, two letters are struck', gh === 'le' && (await ta.inputValue()) === 'the moon is a nickle', JSON.stringify([gh, await ta.inputValue()]));
await page.locator('.pg-menu').click();
await page.waitForSelector('.sheet');
await page.locator('.sheet .choice:has-text("BURN THE STRIKES")').click();
await wait(200);
ok('burning the strikes removes struck ink for good', (await page.locator('.roll-mirror .g').count()) === 0 && (await ta.inputValue()) === 'the moon is a nick');
await page.locator('.pg-undo[aria-label="Undo"]').click();
await wait(150);
ok('UNDO brings the struck words back', (await ta.inputValue()).startsWith('the moon is a nickle') && (await page.locator('.roll-mirror .g').count()) === 1);
// page menu: copy
await page.locator('.pg-menu').click();
await page.waitForSelector('.sheet');
await page.locator('.sheet .choice:has-text("COPY TEXT")').click();
await wait(300);
ok('COPY TEXT says so on the LCD', /COPIED/.test(await page.locator('.lcd').textContent()));
// to the bench
await page.locator('.pg-menu').click();
await page.waitForSelector('.sheet');
await page.locator('.sheet .choice:has-text("TO THE BENCH")').click();
await wait(700);
const cards0 = 3; // the sample tape: verse, chorus, verse
ok('TO THE BENCH lands on the bench with a new verse', (await page.locator('.mode-view.bench').count()) === 1 && (await page.locator('.card').count()) === cards0 + 1, `${await page.locator('.card').count()} cards`);

// ---------- bench ----------
const lineTexts = () => page.locator('.card textarea.lin').evaluateAll((els) => els.map((e) => e.value));
let before = await lineTexts();
const first = page.locator('.card textarea.lin').first();
await first.click();
await page.keyboard.press('End');
await page.keyboard.type(' zzz');
await wait(120);
ok('typing on the bench works', (await lineTexts())[0].endsWith(' zzz'));
ok('the bench offers UNDO', (await page.locator('.bench .undo-chip').count()) === 1);
await page.locator('.bench .undo-chip').click();
await wait(200);
ok('UNDO takes the typing back', !(await lineTexts())[0].endsWith(' zzz'));
await first.click(); await page.keyboard.press('End');
await page.keyboard.press('Enter');
await wait(200);
const withSplit = await page.locator('.card textarea.lin').count();
ok('Enter makes a new line', withSplit === before.length + 1);
await page.locator('.bench .undo-chip').click();
await wait(200);
ok('UNDO takes the new line back', (await page.locator('.card textarea.lin').count()) === before.length);
// moving a line is not an undo step: it moves back just as easily by hand
const firstText = (await lineTexts())[0];
const depth = () => page.evaluate(() => { const c = document.querySelector('.bench .undo-chip'); return c ? Number(c.querySelector('b')?.textContent || 1) : 0; });
const d0 = await depth();
await page.click('.gut >> nth=0');
await page.locator('.sheet .choice:has-text("MOVE DOWN")').click();
await wait(200);
ok('a line moved down', (await lineTexts())[1] === firstText);
ok('a move adds no UNDO step', (await depth()) === d0, `${d0} -> ${await depth()}`);
await page.click('.gut >> nth=1');
await page.locator('.sheet .choice:has-text("MOVE UP")').click();
await wait(200);
ok('and moves back by hand', (await lineTexts())[0] === firstText);
// delete a line from its menu, then UNDO puts it back (once threw on a revoked immer draft)
{
  const n0 = (await lineTexts()).length;
  const victim = (await lineTexts())[1];
  await page.click('.gut >> nth=1');
  await page.locator('.sheet .choice.danger').click();
  await wait(200);
  ok('DELETE removes the line', (await lineTexts()).length === n0 - 1);
  await page.locator('.bench .undo-chip').click();
  await wait(200);
  ok('UNDO brings the deleted line back', (await lineTexts()).length === n0 && (await lineTexts())[1] === victim);
}
// tempo
const bpm0 = await page.locator('.dchip:has(i:text("BPM")) b').textContent();
await page.locator('.dchip:has(i:text("BPM"))').click();
await page.locator('.sheet .btn:has-text("+5")').click();
await page.locator('.sheet button[aria-label="Close"]').click();
await wait(200);
ok('tempo changed', (await page.locator('.dchip:has(i:text("BPM")) b').textContent()) !== bpm0);
await page.locator('.bench .undo-chip').click();
await wait(200);
ok('UNDO restores the tempo', (await page.locator('.dchip:has(i:text("BPM")) b').textContent()) === bpm0);

// ---------- the gear ----------
await page.click('.lcd-gear');
await page.waitForSelector('.sheet .sw-row');
ok('the LCD gear opens Setup from the bench', (await page.locator('.sheet .set-card').count()) >= 3);
await page.screenshot({ path: `${out}/u1-setup.png` });
await page.click('.lcd-gear');
await wait(300);
ok('the gear closes it again', (await page.locator('.sheet').count()) === 0);

console.log(errors.join('\n') || 'no console errors');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
process.exit(fails ? 1 : 0);
