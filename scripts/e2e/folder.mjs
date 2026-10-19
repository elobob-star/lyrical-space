// The folder survives the app: link a folder, write, wipe the app's own storage (a reinstall), pick the folder up again.
// The folder is simulated with the browser's private file system behind a stand-in showDirectoryPicker.
// Usage: npm run dev, then: node scripts/e2e/folder.mjs <screenshot-dir>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.tmp';
const URL = process.env.URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => {
  window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Picked', { create: true });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/datamuse|dictionaryapi|Failed to load resource/i.test(m.text())) errors.push('CONSOLE ' + m.text()); });
let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const files = () => page.evaluate(async () => {
  const out = {};
  const walk = async (d, pre) => { for await (const [n, h] of d.entries()) { if (h.kind === 'directory') await walk(h, pre + n + '/'); else out[pre + n] = await (await h.getFile()).text(); } };
  await walk(await (await navigator.storage.getDirectory()).getDirectoryHandle('Picked', { create: true }), '');
  return out;
});
const boot = async () => { await page.waitForSelector('.chassis:not(.boot)'); await wait(1200); };

await page.goto(URL);
await boot();
ok('a fresh install offers to pick up an old folder', await page.locator('.draw-slip.pickup').isVisible());
await shot('f1-pickup-slip');
const ta = page.locator('.roll-input');
await ta.click();
await page.keyboard.press('Control+End');
await page.keyboard.type('\nremember the river ');
await wait(600);
ok('writing makes it no longer a fresh install (the slip goes)', !(await page.locator('.draw-slip.pickup').count()));

// link a folder from Setup
await page.click('button[aria-label="Setup"]'); await wait(400);
await page.locator('.folder-box button:has-text("CHOOSE A FOLDER")').click();
await wait(1500);
await shot('f2-setup-linked');
ok('Setup shows the folder as kept', (await page.locator('.folder-box.linked').count()) === 1);
let f = await files();
const names = Object.keys(f).sort();
ok('the library is written', !!f['foolscap-library.json'] && f['foolscap-library.json'].includes('remember the river'), names.join(', '));
ok('a dated copy is kept', names.some((n) => /^Copies\/foolscap-library-\d{4}-\d\d-\d\d\.json$/.test(n)));
ok('every page is a readable text file', names.some((n) => /^Notebook\/p0001 .*\.txt$/.test(n) && f[n].includes('remember the river')));
ok('every song is a readable text file', names.some((n) => n.startsWith('Songs/') && f[n].includes('Rain on the roof')));
ok('the shoebox and a README are there', !!f['Shoebox.txt'] && !!f['README.txt']);
await page.keyboard.press('Escape');
await page.click('button[aria-label="Setup"]').catch(() => {});
await wait(300);

// keep writing: the folder follows
await ta.click();
await page.keyboard.press('Control+End');
await page.keyboard.type('and the bridge we burned ');
await wait(4500);
f = await files();
ok('the folder follows new writing within seconds', f['foolscap-library.json'].includes('bridge we burned'));

// delete the app (its storage), install it again
await page.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('portascribe'); r.onsuccess = r.onerror = r.onblocked = () => res(); setTimeout(res, 300); }));
await page.reload();
await boot();
ok('after a reinstall the notebook starts over', !(await ta.inputValue()).includes('remember the river'));
ok('and offers to pick up the folder', await page.locator('.draw-slip.pickup').isVisible());
await page.locator('.draw-slip.pickup button.go').click();
await wait(1800);
await shot('f3-picked-up');
const v = await ta.inputValue();
ok('choosing the folder brings the notebook back', v.includes('remember the river') && v.includes('bridge we burned'), JSON.stringify(v.slice(-60)));
ok('the LCD says what came back', /PICKED UP/.test((await page.locator('.lcd').textContent()) ?? ''));
await page.click('button[aria-label="Tapes"]'); await wait(500);
const tapes = await page.locator('.jcard, .tape-card, .rack .card').count();
ok('the sample tape is not doubled', tapes <= 1, String(tapes));
await page.click('button[aria-label="Tapes"]').catch(() => {});

// a second pickup of the same folder never doubles anything
await page.click('button[aria-label="Setup"]'); await wait(400);
const before = await page.locator('.stats b').allTextContents();
await page.locator('.folder-box button:has-text("CHANGE")').click();
await wait(1500);
const after = await page.locator('.stats b').allTextContents();
ok('picking up the same folder again changes nothing', JSON.stringify(before) === JSON.stringify(after), before + ' → ' + after);

console.log(errors.join('\n') || 'no errors');
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
