// Two people, one link: each phone keeps its own notebook, and nothing written ever leaves the phone.
// Usage: npm run dev (or a deployed URL in URL=…), then: node scripts/e2e/two-phones.mjs
import { chromium } from 'playwright';
const BASE = process.env.URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const open = async (ctx) => {
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.waitForSelector('.chassis:not(.boot)');
  await p.waitForTimeout(1200);
  return p;
};
const type = async (p, text) => { const ta = p.locator('.roll-input'); await ta.click(); await p.keyboard.press('Control+End'); await p.keyboard.type(text); await p.waitForTimeout(700); };
const notebook = (p) => p.locator('.roll-input').inputValue();

const A = await phone(), B = await phone();
const a = await open(A);
const sent = [];
a.on('request', (r) => sent.push({ url: r.url(), body: r.postData() ?? '' }));
await type(a, '\nmy secret verse about the harbour ');
const b = await open(B);
ok('a second phone opens its own fresh notebook', !(await notebook(b)).includes('harbour'));
await type(b, '\nhis own line about a train ');
await a.reload(); await a.waitForSelector('.chassis:not(.boot)'); await a.waitForTimeout(1000);
const av = await notebook(a);
ok("the first phone keeps its words and never sees the other's", av.includes('harbour') && !av.includes('train'));
const leaks = sent.filter((r) => /harbour/.test(decodeURIComponent(r.url) + r.body));
ok('nothing written is sent over the network', !leaks.length, leaks.map((l) => l.url).join(' '));
const offsite = [...new Set(sent.map((r) => new URL(r.url).origin))].filter((o) => o !== new URL(BASE).origin);
ok('the notebook talks to no other server', !offsite.length, offsite.join(' '));
const persisted = await a.evaluate(async () => (await navigator.storage?.persisted?.()) ?? 'n/a');
console.log('INFO storage persisted:', persisted);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
