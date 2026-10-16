// An MK-I/MK-II install (DB v2, rolls inside songs) opened by the notebook build: rolls become pages, nothing is lost.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) fails++; };
await page.goto(URL + 'manifest.webmanifest'); // same origin, app not running
await page.evaluate(async () => {
  const req = indexedDB.open('portascribe', 2);
  req.onupgradeneeded = () => { for (const s of ['songs', 'scraps', 'blobs', 'kv', 'history']) req.result.createObjectStore(s); };
  const db = await new Promise((r) => { req.onsuccess = () => r(req.result); });
  const day = 86_400_000, now = Date.now();
  const song = (id, title, text, age) => ({ id, title, ink: 1, createdAt: now - age, updatedAt: now - age, bpm: 90, key: null, capo: 0, tuning: 'Standard EADGBE',
    roll: { text, marks: [{ id: 'm1', s: 0, e: 4, kind: 'pencil' }], sprintMs: 0 }, table: [], sections: [], arrangement: [], memos: [] });
  const tx = db.transaction(['songs', 'kv', 'scraps'], 'readwrite');
  tx.objectStore('songs').put(song('a', 'OLD SONG', 'an old freewrite about trains', 3 * day), 'a');
  tx.objectStore('songs').put(song('b', 'NEWER SONG', 'a newer ramble about the sea', 1 * day), 'b');
  tx.objectStore('songs').put(song('c', 'NO ROLL', '', 2 * day), 'c');
  tx.objectStore('scraps').put({ id: 's1', text: 'a legacy bone', kind: 'bone', createdAt: now, used: 0 }, 's1');
  tx.objectStore('kv').put(true, 'seeded');
  await new Promise((r) => { tx.oncomplete = r; });
  db.close();
});
await page.goto(URL);
await page.waitForSelector('.chassis:not(.boot)');
await page.waitForTimeout(1200);
ok('opens on the notebook', (await page.locator('.roll-input').count()) === 1);
ok('a fresh page waits after the old ones', (await page.locator('.pg-n').textContent()) === 'P.3' && (await page.locator('.roll-input').inputValue()) === '');
await page.click('.pg-nav[aria-label="Earlier page"]'); await page.waitForTimeout(500);
ok('page 2 is the newer song roll', (await page.locator('.roll-input').inputValue()).includes('the sea'));
ok('…stamped with the song it came from', (await page.locator('.pg-stamp small').textContent()).includes('NEWER SONG'));
await page.click('.pg-nav[aria-label="Earlier page"]'); await page.waitForTimeout(500);
ok('page 1 is the oldest song roll, marks intact', (await page.locator('.roll-input').inputValue()).includes('trains') && (await page.locator('.roll-mirror .p').count()) === 1);
await page.click('button[aria-label="Tapes"]'); await page.waitForTimeout(300);
ok('all three songs are still in the rack', (await page.locator('.jcard').count()) === 3);
await page.click('.bezel-bottom button[aria-label="Shoebox"]'); await page.waitForTimeout(200);
ok('legacy bones are in the shoebox', (await page.locator('.slip-txt').allTextContents()).some((t) => t.includes('a legacy bone')));
await page.reload(); await page.waitForSelector('.chassis:not(.boot)'); await page.waitForTimeout(1000);
ok('migration runs once (still 3 pages after reload)', (await page.locator('.pg-n').textContent()) === 'P.3');
console.log(errs.join('\n') || 'no page errors'); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
await browser.close(); process.exit(fails ? 1 : 0);
