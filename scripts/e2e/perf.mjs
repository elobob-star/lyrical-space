// Measures JS cost per input event for the hot interactions (budget at 120 Hz = 8.3 ms/frame).
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const URL = process.env.URL || 'http://127.0.0.1:5173/';
await page.goto(URL); await page.waitForSelector('.chassis:not(.boot)'); await page.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE || 4) }); // ~mid-range phone
async function measure(name, fn) {
  await page.evaluate(() => { window.__long = []; window.__po?.disconnect(); window.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))); window.__po.observe({ entryTypes: ['longtask'] }); });
  const m0 = await cdp.send('Performance.getMetrics').catch(() => null);
  await cdp.send('Performance.enable');
  const a = await cdp.send('Performance.getMetrics');
  const get = (r, n) => r.metrics.find((x) => x.name === n)?.value ?? 0;
  const t0 = Date.now();
  const n = await fn();
  const t1 = Date.now();
  const b = await cdp.send('Performance.getMetrics');
  const script = (get(b, 'ScriptDuration') - get(a, 'ScriptDuration')) * 1000;
  const layout = (get(b, 'LayoutDuration') - get(a, 'LayoutDuration')) * 1000;
  const style = (get(b, 'RecalcStyleDuration') - get(a, 'RecalcStyleDuration')) * 1000;
  const task = (get(b, 'TaskDuration') - get(a, 'TaskDuration')) * 1000;
  const long = await page.evaluate(() => window.__long.length);
  console.log(`${name.padEnd(28)} events=${n}  script/ev=${(script / n).toFixed(2)}ms  style/ev=${(style / n).toFixed(2)}ms  layout/ev=${(layout / n).toFixed(2)}ms  task/ev=${(task / n).toFixed(2)}ms  longtasks=${long}`);
}
// 1) typing in a long roll
await page.locator('.roll-input').click(); await page.keyboard.press('Control+End');
const para = ' the quick brown fox jumps over the lazy dog and keeps on running through the night';
await page.evaluate((p) => { const ta = document.querySelector('.roll-input'); ta.value = (ta.value + p.repeat(60)); ta.dispatchEvent(new Event('input', { bubbles: true })); }, para);
await page.waitForTimeout(500);
await measure('type 120 chars (long roll)', async () => { await page.keyboard.type('abcdefghij'.repeat(12), { delay: 0 }); return 120; });
// 2) table drag
await page.click('.legend button:nth-child(2)'); await page.waitForTimeout(400);
for (let i = 0; i < 3; i++) { const k = page.locator('.lever-knob'); const b = await k.boundingBox(); await page.mouse.move(b.x + 15, b.y + 15); await page.mouse.down(); await page.mouse.move(b.x + 15, b.y + 170, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300); }
const s = page.locator('.strip').first(); const sb = await s.boundingBox();
await measure('drag strip (200 moves)', async () => { await page.mouse.move(sb.x + 20, sb.y + 15); await page.mouse.down(); await page.mouse.move(sb.x + 200, sb.y + 400, { steps: 200 }); await page.mouse.up(); return 200; });
// 3) dial drag
await page.waitForTimeout(300);
const d = await page.locator('.dial').boundingBox();
await measure('dial drag (120 moves)', async () => { await page.mouse.move(d.x + 31, d.y + 31); await page.mouse.down(); await page.mouse.move(d.x + 60, d.y + 20, { steps: 60 }); await page.mouse.move(d.x + 5, d.y + 20, { steps: 60 }); await page.mouse.up(); return 120; });
// 4) bench scroll + typing a line
await page.click('.legend button:nth-child(3)'); await page.waitForTimeout(500);
const bs = await page.locator('.bench-scroll').boundingBox();
await measure('bench scroll (60 wheel ev)', async () => { await page.mouse.move(bs.x + 100, bs.y + 200); for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, i < 30 ? 40 : -40); } return 60; });
await page.locator('.card textarea.lin').first().click();
await measure('type in bench line (60)', async () => { await page.keyboard.type('x'.repeat(60), { delay: 0 }); return 60; });
await browser.close();
