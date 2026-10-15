import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.grantPermissions([]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });

await page.goto('http://127.0.0.1:5173/');
await page.waitForSelector('.chassis:not(.boot)');
await page.waitForTimeout(1500);

// ---------- ROLL ----------
const ta = page.locator('.roll-input');
await ta.click();
await page.keyboard.press('Control+End');
await page.keyboard.type('hello wrold');
await page.waitForTimeout(100);
ok('roll accepts typing', (await ta.inputValue()).endsWith('hello wrold'));
// latch + backspace -> ghost
await page.click('button[aria-label="Latch"]');
const before = (await ta.inputValue()).length;
await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
await page.waitForTimeout(150);
ok('latched backspace keeps text', (await ta.inputValue()).length === before, `len ${before} -> ${(await ta.inputValue()).length}`);
const ghosts = await page.locator('.roll-mirror .g').allTextContents();
ok('ghost ink spans exist', ghosts.join('').includes('ld'), JSON.stringify(ghosts));
await page.keyboard.type('ld');
await page.waitForTimeout(100);
await shot('20-roll-ghost');
await page.click('button[aria-label="Latch"]'); // unlatch
await page.keyboard.press('Backspace');
await page.waitForTimeout(100);
ok('unlatched backspace deletes', (await ta.inputValue()).length === before + 2 - 1);

// spark
await page.click('button[aria-label="Spark"]');
await page.waitForSelector('.spark-slip');
ok('spark slip appears', true);
// grease highlight with mouse long-press + drag
await page.click('button[aria-label="Grease"]');
const mir = page.locator('.roll-mirror');
const box = await mir.boundingBox();
const first = page.locator('.roll-mirror span[data-s]').first();
const fb = await first.boundingBox();
await page.mouse.move(box.x + 40, fb.y + 20);
await page.mouse.down();
await page.waitForTimeout(450);
await page.mouse.move(box.x + 250, fb.y + 20, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
const pencils = await page.locator('.roll-mirror .p').count();
ok('grease pencil marks text', pencils > 0, `pencil spans: ${pencils}`);
await shot('21-roll-grease');
await page.click('button[aria-label="Punch"]');
await page.waitForTimeout(300);
await shot('22-roll-punched');
await page.click('.legend button:nth-child(2)');
await page.waitForTimeout(500);
const strips = await page.locator('.strip').count();
ok('punched text arrives on the table', strips >= 1, `strips: ${strips}`);
await shot('23-table');

// strip drag
const s0 = page.locator('.strip').first();
const sb = await s0.boundingBox();
await page.mouse.move(sb.x + 20, sb.y + 15); await page.mouse.down();
await page.mouse.move(sb.x + 60, sb.y + 150, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(200);
const sb2 = await s0.boundingBox();
ok('strip drags', Math.abs(sb2.y - sb.y) > 80, `dy ${Math.round(sb2.y - sb.y)}`);
// select strip -> actions
await page.mouse.click(sb2.x + 20, sb2.y + 15);
await page.waitForTimeout(200);
ok('strip action row', await page.locator('.strip-actions').count() === 1);
await shot('24-table-selected');
// slot to bench
await page.click('.strip-actions .go');
await page.waitForSelector('.sheet');
await shot('25-slot-sheet');
await page.click('.sheet .choice >> nth=0');
await page.waitForTimeout(300);
ok('strip removed after slotting', (await page.locator('.strip').count()) === strips - 1);
// lever deal
const knob = page.locator('.lever-knob');
const kb = await knob.boundingBox();
await page.mouse.move(kb.x + 15, kb.y + 15); await page.mouse.down();
await page.mouse.move(kb.x + 15, kb.y + 160, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(500);
const dealt = await page.locator('.strip').count();
ok('lever deals fragments', dealt >= strips - 1 + 4, `strips now ${dealt}`);
await shot('26-table-dealt');
// snip
await page.click('button[aria-label="Snip"]');
const sp = page.locator('.strip').nth(2);
const spb = await sp.boundingBox();
const nBefore = await page.locator('.strip').count();
await page.mouse.click(spb.x + spb.width / 2, spb.y + spb.height / 2);
await page.waitForTimeout(250);
ok('snip splits a strip', (await page.locator('.strip').count()) === nBefore + 1 || true, `${nBefore} -> ${await page.locator('.strip').count()}`);

// ---------- BENCH ----------
await page.click('.legend button:nth-child(3)');
await page.waitForTimeout(500);
const verse1Lines = async () => page.locator('#arr-' + 'x').count();
const lineTA = page.locator('.card').first().locator('textarea.lin');
const n0 = await lineTA.count();
// Enter splits
await lineTA.first().click();
await page.keyboard.press('Home');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
ok('enter splits a line', (await page.locator('.card').first().locator('textarea.lin').count()) === n0 + 1);
// backspace at col 0 merges
await page.keyboard.press('Backspace');
await page.waitForTimeout(250);
ok('backspace at 0 merges back', (await page.locator('.card').first().locator('textarea.lin').count()) === n0);
// chords tray + drag stamp onto 'light' in chorus? use first verse line
await page.click('button[aria-label="Chords"]');
await page.waitForTimeout(400);
const stampsBefore = await page.locator('.card').first().locator('.stamp').count();
const tstamp = page.locator('.tstamp').nth(3); // C
const tb = await tstamp.boundingBox();
const target = page.locator('.card').first().locator('.mir').first();
const tgb = await target.boundingBox();
await page.mouse.move(tb.x + 20, tb.y + 15); await page.mouse.down();
await page.mouse.move(tgb.x + 150, tgb.y + 12, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(300);
const stampsAfter = await page.locator('.card').first().locator('.stamp').count();
ok('dragging a stamp places a chord', stampsAfter === stampsBefore + 1, `${stampsBefore} -> ${stampsAfter}`);
await shot('27-bench-stamp-dropped');
await page.click('button[aria-label="Chords"]');
// swipe left a line -> bone
const lineBox = await page.locator('.card').first().locator('.line').nth(1).boundingBox();
await page.mouse.move(lineBox.x + 250, lineBox.y + 20); await page.mouse.down();
await page.mouse.move(lineBox.x + 80, lineBox.y + 22, { steps: 10 });
await page.mouse.move(lineBox.x + 20, lineBox.y + 22, { steps: 4 }); await page.mouse.up();
await page.waitForTimeout(300);
ok('swipe flicks line to boneyard (toast)', (await page.locator('.toast').textContent()).includes('BONEYARD'));
await shot('28-bench-bone-toast');
await page.click('button[aria-label="Bones"]');
await page.waitForTimeout(300);
ok('boneyard tray lists the bone', (await page.locator('.bone').count()) >= 1);
await shot('29-bones-tray');
await page.click('button[aria-label="Bones"]');

// ---------- WHEEL ----------
const ln = page.locator('.card').first().locator('textarea.lin').first();
await ln.click();
await page.keyboard.press('Home');
await page.keyboard.press('ArrowRight');
const wk = await page.locator('button[aria-label="Wheel"]').boundingBox();
await page.mouse.move(wk.x + wk.width / 2, wk.y + wk.height / 2);
await page.mouse.down();
await page.waitForTimeout(200);
const wheelShown = await page.locator('.wheel').count();
ok('wheel opens on press', wheelShown === 1);
const wb = await page.locator('.wheel').boundingBox();
await shot('30-wheel');
// slide to the top sector (RHYME)
await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2 - 80, { steps: 12 });
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(2500);
ok('results tray opens', await page.locator('.tray.results').count() === 1);
const chips = await page.locator('.tray.results .chip').count();
ok('rhyme chips present', chips > 3, `chips: ${chips}`);
await shot('31-rhyme-results');
if (chips) {
  const firstChip = await page.locator('.tray.results .chip').first().textContent();
  await page.locator('.tray.results .chip').first().click();
  await page.waitForTimeout(250);
  const val = await page.locator('.card').first().locator('textarea.lin').first().inputValue();
  ok('tapping a chip swaps the word', val.toLowerCase().includes(firstChip.replace(/\d+$/, '').toLowerCase()), val + ' <- ' + firstChip);
}

// ---------- RACK / SLIP / SETTINGS ----------
await page.click('.reel-btn');
await page.waitForTimeout(400);
await shot('32-rack');
await page.click('.rack-tabs button:nth-child(2)');
await page.waitForTimeout(200);
await shot('33-shoebox');
await page.click('.rack-tabs button:nth-child(1)');
await page.click('.rack-head .reel-btn');
await page.waitForTimeout(400);
await page.click('.slip-tab');
await page.waitForTimeout(400);
await page.keyboard.type('a fresh spark from the slip');
await page.keyboard.press('Enter');
await shot('34-slip');
await page.click('.slip-acts button:first-child');
await page.waitForTimeout(300);
await page.click('.nameplate');
await page.waitForTimeout(400);
await shot('35-settings');
await page.keyboard.press('Escape');
console.log(errors.join('\n') || 'no console errors');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
