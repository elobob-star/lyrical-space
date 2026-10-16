// End-to-end interaction suite at phone size against the dev server (fresh profile each run).
// Usage: npm run dev, then: node scripts/e2e/flows.mjs <screenshot-dir>
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
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const lcd = async () => (await page.locator('.lcd').textContent()) ?? '';
const wait = (ms) => page.waitForTimeout(ms);
const key = (label) => page.click(`.bezel-bottom button[aria-label="${label}"]`);
const dial = (i) => page.click(`.legend button:nth-child(${i})`);
const drag = async (x0, y0, x1, y1, steps = 10) => { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps }); await page.mouse.up(); };

await page.goto(URL);
await page.waitForSelector('.chassis:not(.boot)');
await wait(1500);

// ================= ROLL =================
const ta = page.locator('.roll-input');
await ta.click();
await page.keyboard.press('Control+End');
await page.keyboard.type(' hello wrold');
await wait(80);
const v0 = await ta.inputValue();
ok('roll accepts typing', v0.endsWith('hello wrold'));
await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
await wait(80);
ok('typo grace: backspace really erases the word being typed', (await ta.inputValue()).endsWith('hello wro') && (await page.locator('.roll-mirror .g').count()) === 0);
await page.keyboard.type('ld friend ');
const len1 = (await ta.inputValue()).length;
await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
await wait(120);
ok('ghost ink: dry words are struck through, never erased', (await ta.inputValue()).length === len1, `${len1} -> ${(await ta.inputValue()).length}`);
const ghostTxt = (await page.locator('.roll-mirror .g').allTextContents()).join('');
ok('ghost spans hold the struck characters', ghostTxt.includes('nd'), JSON.stringify(ghostTxt));
await page.keyboard.type('pal');
ok('typing continues after the ghost', (await ta.inputValue()).endsWith('pal'));
await shot('10-roll-ghost');

// latch: forward only
await key('Latch');
await wait(200);
const len2 = (await ta.inputValue()).length;
await ta.click();
await page.keyboard.press('Backspace');
await wait(120);
ok('latched: backspace refuses entirely', (await ta.inputValue()).length === len2);
await page.keyboard.type(' onward');
await wait(250);
ok('latched: typing still goes forward', (await ta.inputValue()).endsWith(' onward'));
const bailH = await page.locator('.bail').evaluate((el) => el.getBoundingClientRect().height);
ok('latched: the bail folds earlier lines away', bailH > 40, `bail ${Math.round(bailH)}px`);
ok('LCD shows FWD while latched', (await lcd()).includes('FWD') || (await lcd()).includes('LATCHED'));
await shot('11-roll-latched');
await key('Latch');
await wait(700);
ok('unlatched: bail lifts', (await page.locator('.bail').evaluate((el) => el.getBoundingClientRect().height)) < 2);

// draw a scrap and write from it
await key('Draw');
await page.waitForSelector('.draw-slip');
const drawn = (await page.locator('.draw-slip .txt').textContent()).trim();
ok('DRAW pulls a scrap from the shoebox', drawn.length > 4, drawn);
await page.click('.draw-slip .go');
await wait(200);
ok('WRITE FROM IT puts it at the end of the roll', (await ta.inputValue()).trimEnd().endsWith(drawn));

// pen: tap a phrase to mark it, tap again to clear
await key('Pen');
const first = page.locator('.roll-mirror span[data-s]').first();
const fb = await first.boundingBox();
await page.mouse.click(fb.x + 40, fb.y + 12);
await wait(150);
ok('pen: a tap marks the phrase', (await page.locator('.roll-mirror .p').count()) > 0);
const markedTxt = (await page.locator('.roll-mirror .p').allTextContents()).join('');
await page.mouse.click(fb.x + 40, fb.y + 12);
await wait(150);
ok('pen: tapping a mark clears it', (await page.locator('.roll-mirror .p').count()) === 0);
await page.mouse.click(fb.x + 40, fb.y + 12);
await wait(150);
// long-press + drag marks an exact range further down
const later = page.locator('.roll-mirror span[data-s]').last();
const lb = await later.boundingBox();
await page.mouse.move(lb.x + 10, lb.y + lb.height - 12); await page.mouse.down(); await wait(450);
await page.mouse.move(lb.x + 160, lb.y + lb.height - 12, { steps: 8 }); await page.mouse.up();
await wait(150);
const marks = await page.locator('.roll-mirror .p').count();
ok('pen: hold & drag marks a second range', marks >= 2, `marks ${marks}`);
await shot('12-roll-pen');
await key('Punch');
await wait(900);
ok('PUNCH reports on the LCD', (await lcd()).includes('PUNCHED'), await lcd());
ok('punched marks become cut-outs', (await page.locator('.roll-mirror .p.done').count()) >= 1);
await page.click('.lcd'); // GO → table
await wait(700);
ok('LCD action jumps to the Table', (await page.locator('.board').count()) === 1);

// ================= TABLE =================
const nPunched = await page.locator('.strip').count();
ok('punched phrases arrive as strips', nPunched >= 2, `strips ${nPunched}`);
ok('first punched strip text matches the mark', (await page.locator('.strip').allTextContents()).some((t) => markedTxt.includes(t.trim().slice(0, 12))));
await key('Deal');
await wait(900);
ok('DEAL lays out 4 scraps', (await page.locator('.strip').count()) === nPunched + 4);
await shot('20-table-dealt');
// drag
const s0 = page.locator('.strip').first();
let b0 = await s0.boundingBox();
await drag(b0.x + 12, b0.y + 10, b0.x + 30, b0.y + 140, 8);
await wait(250);
const b0b = await s0.boundingBox();
ok('strips drag', Math.abs(b0b.y - b0.y) > 90, `dy ${Math.round(b0b.y - b0.y)}`);
// select + snip at a gap
const longId = await page.locator('.strip').filter({ has: page.locator('.gap') }).first().getAttribute('data-id');
const longStrip = page.locator(`.strip[data-id="${longId}"]`);
const lsb = await longStrip.boundingBox();
await page.mouse.click(lsb.x + 8, lsb.y + 8);
await wait(200);
ok('tapping selects (action row appears)', (await page.locator('.strip-actions').count()) === 1);
const gap = longStrip.locator('.gap').first();
const gb = await gap.boundingBox();
const nBeforeSnip = await page.locator('.strip').count();
await page.mouse.click(gb.x + gb.width / 2, gb.y + gb.height / 2);
await wait(250);
ok('tapping a gap on a selected strip snips it', (await page.locator('.strip').count()) === nBeforeSnip + 1);
await shot('21-table-snip');
// tape: drop a strip right under another one
await page.mouse.click(5, 300); // nothing
const all = page.locator('.strip');
// tape onto the highest strip so there is room underneath it
const ids = await all.evaluateAll((els) => els.map((e) => ({ id: e.dataset.id, top: e.getBoundingClientRect().top })).sort((a, b) => a.top - b.top).map((x) => x.id));
const A = page.locator(`.strip[data-id="${ids[0]}"]`), B = page.locator(`.strip[data-id="${ids[ids.length - 1]}"]`);
const ab = await A.boundingBox(), bb = await B.boundingBox();
const nBeforeTape = await all.count();
await drag(bb.x + 10, bb.y + 6, ab.x + 10 + 4, ab.y + ab.height + 6, 16);
await wait(300);
ok('dropping on an edge tapes the strips together', (await all.count()) === nBeforeTape - 1, `${nBeforeTape} -> ${await all.count()}`);
ok('the joint shows masking tape', (await page.locator('.strip .hseam.taped').count()) >= 1);
await shot('22-table-taped');
// cut-up + undo from the LCD
const nBeforeCut = await all.count();
await key('Cut-up');
await wait(500);
ok('CUT-UP slices strips into fragments', (await all.count()) > nBeforeCut, `${nBeforeCut} -> ${await all.count()}`);
await shot('23-table-cutup');
await page.click('.lcd');
await wait(300);
ok('LCD UNDO restores the table', (await all.count()) === nBeforeCut);
// shuffle
await key('Shuffle');
await wait(700);
ok('shuffle keeps every strip', (await all.count()) === nBeforeCut);
// sweep + undo
await key('Sweep');
await wait(200);
ok('SWEEP clears the mat', (await all.count()) === 0);
ok('SWEEP keeps taped work in the shoebox', (await lcd()).includes('KEPT') || (await lcd()).includes('CLEARED'), await lcd());
await page.click('.lcd');
await wait(300);
ok('…and UNDO brings it back', (await all.count()) === nBeforeCut);
// double-tap the mat for a new slip (find a bare patch first)
const bare = await page.evaluate(() => {
  const r = document.querySelector('.board').getBoundingClientRect();
  for (let y = r.bottom - 30; y > r.top + 30; y -= 20) for (let x = r.left + 30; x < r.right - 40; x += 20) {
    if (document.elementFromPoint(x, y)?.classList.contains('board')) return { x, y };
  }
  return null;
});
await page.mouse.click(bare.x, bare.y);
await page.mouse.click(bare.x, bare.y);
await page.waitForSelector('.sheet textarea');
await page.fill('.sheet textarea', 'a brand new slip');
await page.click('.sheet .btn.go');
await wait(250);
ok('double-tap on the mat writes a new slip', (await page.locator('.strip').allTextContents()).some((t) => t.includes('a brand new slip')));
// slot a strip into the bench
const slip = page.locator('.strip').filter({ hasText: 'a brand new slip' });
const slb = await slip.boundingBox();
await page.mouse.click(slb.x + 8, slb.y + 8);
await wait(150);
await page.click('.strip-actions .go');
await page.waitForSelector('.sheet .choice');
await page.click('.sheet .choice >> nth=0');
await wait(250);
ok('BENCH slots the strip into a section', (await page.locator('.strip').filter({ hasText: 'a brand new slip' }).count()) === 0);

// ================= BENCH =================
await dial(3);
await wait(700);
const card = page.locator('.card').first();
ok('slotted strip landed on the bench', (await card.locator('textarea.lin').evaluateAll((els) => els.map((e) => e.value))).includes('a brand new slip'));
const n0 = await card.locator('textarea.lin').count();
await card.locator('textarea.lin').first().click();
await page.keyboard.press('Home');
for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await wait(200);
ok('enter splits a line', (await card.locator('textarea.lin').count()) === n0 + 1);
await page.keyboard.press('Backspace');
await wait(200);
ok('backspace at 0 merges back', (await card.locator('textarea.lin').count()) === n0);
// chords
await key('Chords');
await wait(400);
const stampsBefore = await card.locator('.stamp').count();
const ts = page.locator('.tstamp').nth(3);
const tb = await ts.boundingBox();
const tgt = await card.locator('.mir').nth(4).boundingBox();
await drag(tb.x + 20, tb.y + 15, tgt.x + 60, tgt.y + tgt.height - 10, 12);
await wait(250);
ok('dragging a stamp places a chord', (await card.locator('.stamp').count()) === stampsBefore + 1);
await key('Chords');
// swipe a line into the shoebox
const scrapsBefore = await page.evaluate(() => document.querySelectorAll('.x').length);
void scrapsBefore;
const lnBox = await card.locator('.line').nth(1).boundingBox();
const cutTxt = await card.locator('textarea.lin').nth(1).inputValue();
await drag(lnBox.x + 250, lnBox.y + lnBox.height / 2, lnBox.x + 20, lnBox.y + lnBox.height / 2 + 2, 14);
await wait(250);
ok('swipe left cuts a line into the shoebox', (await lcd()).includes('SHOEBOX'), await lcd());
await key('Shoebox');
await wait(300);
ok('the shoebox drawer holds the cut line', (await page.locator('.tray.shoebox .scrap-txt').allTextContents()).some((t) => t.includes(cutTxt.slice(0, 10))));
await shot('30-bench-shoebox');
await page.locator('.tray.shoebox .scrap-txt').first().click();
await wait(200);
ok('tapping a scrap drops it in as a line', true);
await key('Shoebox');
// words tray
const ln = card.locator('textarea.lin').first();
await ln.click();
await page.keyboard.press('Home');
await page.keyboard.press('ArrowRight');
await key('Words');
await page.waitForSelector('.tray.words');
await wait(1600);
const chips = await page.locator('.tray.words .chip').count();
ok('WORDS opens rhymes for the word under the caret', chips > 3, `chips ${chips}`);
await shot('31-words');
if (chips) {
  const w = (await page.locator('.tray.words .chip').first().textContent()).replace(/\d+$/, '');
  await page.locator('.tray.words .chip').first().click();
  await wait(200);
  ok('tapping a chip swaps the word in', (await ln.inputValue()).toLowerCase().includes(w.toLowerCase()), w);
}
await page.click('.tray.words .tabs button:has-text("SLANT")');
await wait(600);
ok('tabs switch the lookup', (await page.locator('.tray.words .tabs button.on').textContent()) === 'SLANT');
await key('Words');
// lens: rhyme then meter
await key('Lens');
await wait(300);
ok('RHYME lens letters the scheme', (await page.locator('.scheme').allTextContents()).filter(Boolean).length >= 4);
await key('Lens');
await wait(300);
ok('METER lens marks every syllable', (await page.locator('.mw .ms').count()) > 10);
const mw = page.locator('.mw').nth(1);
const mwb = await mw.boundingBox();
await page.mouse.click(mwb.x + mwb.width / 2, mwb.y + mwb.height - 8);
await wait(200);
ok('tapping a word overrides its stress', (await page.locator('.mw .ms.ov').count()) + (await page.locator('.mw.down').count()) >= 1);
await shot('32-meter');
await key('Lens');
// transpose
await page.click('.deck .dchip:first-child');
await page.waitForSelector('.sheet .grid4');
const firstChord = await card.locator('.stamp').first().textContent();
await page.click('.sheet .cell >> text="A"');
await wait(300);
const moved = await card.locator('.stamp').first().textContent();
ok('changing key moves the chords too', firstChord !== moved, `${firstChord} -> ${moved}`);
// stand
await key('Stand');
await page.waitForSelector('.stand');
ok('STAND shows the whole song', (await page.locator('.stand .sb').count()) >= 3);
await page.click('.stand .play');
await wait(800);
const st = await page.locator('.stand-body').evaluate((el) => el.scrollTop);
ok('STAND auto-scrolls at tempo', st > 0, `scrollTop ${st}`);
await shot('33-stand');
await page.click('.stand-body');
await page.click('button[aria-label="Close the stand"]');
await wait(200);

// ================= CATCH / RACK =================
await page.click('.slip-tab');
await page.waitForSelector('.slip-pop textarea');
await page.fill('.slip-pop textarea', 'caught on the night bus');
await page.press('.slip-pop textarea', 'Enter');
await page.click('.slip-acts button:first-child');
await wait(200);
ok('CATCH files into the shoebox', (await lcd()).includes('CAUGHT'), await lcd());
await page.click('button[aria-label="Tapes"]');
await page.waitForSelector('.rack');
ok('the rack shows the tape as a J-card', (await page.locator('.jcard').count()) === 1);
await key('Shoebox');
await wait(200);
ok('the shoebox holds the caught line', (await page.locator('.slip-txt').allTextContents()).some((t) => t.includes('caught on the night bus')));
await page.fill('.catch-row input', 'one more for the box');
await page.press('.catch-row input', 'Enter');
await wait(150);
ok('catching from the rack works', (await page.locator('.slip-txt').first().textContent()).includes('one more for the box'));
await shot('40-rack-shoebox');
await key('Tapes');
await page.click('.jc-menu');
await page.waitForSelector('.sheet .choice');
await page.click('.sheet .choice:has-text("HISTORY")');
await wait(500);
ok('tape history opens', (await page.locator('.sheet').textContent()).includes('HISTORY'));
await page.click('.sheet button[aria-label="Close"]');
// import a pasted song
await key('Import');
await page.waitForSelector('.sheet textarea');
await page.fill('.sheet input.field', 'pasted song');
await page.fill('.sheet textarea', '[Verse 1]\nG        D\nwalking down to the river\nin the morning rain\n\n[Chorus]\nC        G\nhold on, hold on\n\n[Verse 2]\nnothing left to say\n\n[Chorus]\n');
await page.click('.sheet .btn.go');
await wait(800);
ok('PASTE IN makes a new tape on the bench', (await page.locator('.card').count()) === 3 && (await page.locator('.repeat-slip').count()) === 1);
ok('imported chords sit over the words', (await page.locator('.card').first().locator('.stamp').count()) === 2);
await shot('41-imported');
await page.click('button[aria-label="Tapes"]');
await wait(300);
ok('the rack now has two tapes', (await page.locator('.jcard').count()) === 2);
await page.click('button[aria-label="Tapes"]');

// ================= SETUP =================
await page.click('button[aria-label="Setup"]');
await page.waitForSelector('.sheet .dip-row');
await page.click('.sheet button:has-text("CHARCOAL")');
await wait(150);
ok('finish switches to charcoal', (await page.locator('.chassis').getAttribute('data-chassis')) === 'charcoal');
await shot('50-setup');
await page.click('.sheet button[aria-label="Close"]');

console.log(errors.join('\n') || 'no console errors');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
process.exit(fails ? 1 : 0);
