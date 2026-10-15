// Renders assets/*.svg → PNGs (Chromium via Playwright). Then: npx capacitor-assets generate --android
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

const jobs = [
  ['assets/icon.svg', 'assets/icon-only.png', 1024, false],
  ['assets/icon-foreground.svg', 'assets/icon-foreground.png', 1024, true],
  ['assets/icon-background.svg', 'assets/icon-background.png', 1024, false],
  ['assets/icon.svg', 'public/icon-512.png', 512, false],
  ['assets/icon.svg', 'public/icon-192.png', 192, false],
];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
for (const [src, dst, size, transparent] of jobs) {
  const svg = readFileSync(src, 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: dst, omitBackground: transparent });
  console.log('wrote', dst);
}
await browser.close();
mkdirSync('public', { recursive: true });
copyFileSync('assets/icon.svg', 'public/icon.svg');
