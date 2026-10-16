// Generative "lyric card" poster rendered on a canvas. Seeded by title + text so the same song always gets the same art.

export interface CardOpts {
  title: string;
  lines: string[];
  ink: string;
  stock: 'paper' | 'night' | 'ink';
  seed: string;
  footer: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STOCKS = {
  paper: { bg: '#e9e0cb', fg: '#26221c', soft: 'rgba(38,34,28,.45)', grain: '90,70,30' },
  night: { bg: '#29251f', fg: '#eee4cd', soft: 'rgba(238,228,205,.5)', grain: '255,240,200' },
  ink: { bg: '#17181b', fg: '#f2eee2', soft: 'rgba(242,238,226,.5)', grain: '255,255,255' },
};

export async function renderCard(o: CardOpts): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  try {
    await Promise.all([
      document.fonts.load('56px "Courier Prime"'), document.fonts.load('700 56px "Courier Prime"'),
      document.fonts.load('700 22px "Space Grotesk"'),
    ]);
  } catch { /* fall back to system fonts */ }
  const st = STOCKS[o.stock];
  const r = rng(hash(o.seed));

  g.fillStyle = st.bg; g.fillRect(0, 0, W, H);

  // generative shapes in the song's ink colour
  g.save();
  for (let i = 0; i < 6; i++) {
    const x = r() * W, y = r() * H, rad = 120 + r() * 380;
    g.globalAlpha = 0.07 + r() * 0.1;
    g.fillStyle = o.ink;
    g.beginPath();
    if (r() < 0.5) g.arc(x, y, rad, 0, Math.PI * 2); else g.rect(x - rad / 2, y - rad / 2, rad, rad * (0.4 + r()));
    g.fill();
  }
  g.globalAlpha = 0.5;
  g.strokeStyle = o.ink; g.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(r() * W, r() * H, 80 + r() * 300, r() * 6, r() * 6 + 1.3 + r() * 2);
    g.stroke();
  }
  g.restore();

  // dot grid
  g.fillStyle = st.soft; g.globalAlpha = 0.35;
  for (let x = 54; x < W; x += 54) for (let y = 54; y < H; y += 54) g.fillRect(x, y, 3, 3);
  g.globalAlpha = 1;

  // frame
  g.strokeStyle = st.soft; g.lineWidth = 3;
  g.strokeRect(44, 44, W - 88, H - 88);
  g.fillStyle = st.fg; g.font = '700 22px "Space Grotesk", sans-serif';
  g.textBaseline = 'alphabetic';
  (g as any).letterSpacing = '8px';
  g.fillText('PORTASCRIBE  MK-II', 80, 96);
  g.textAlign = 'right'; g.fillStyle = o.ink; g.fillText('●', W - 80, 96); g.textAlign = 'left';
  (g as any).letterSpacing = '0px';

  // lyric block
  const lines = o.lines.filter((l) => l.trim()).slice(0, 12);
  const maxLen = Math.max(8, ...lines.map((l) => l.length));
  const size = Math.max(34, Math.min(66, Math.floor(880 / (maxLen * 0.6))));
  const lh = size * 1.55;
  g.font = `${size}px "Courier Prime", "Courier New", monospace`;
  g.fillStyle = st.fg;
  const blockH = lines.length * lh;
  let y = Math.max(240, (H - blockH) / 2 - 20);
  // marker stripe behind the first line
  g.fillStyle = o.ink; g.globalAlpha = 0.9; g.fillRect(80, y - size * 1.05, 14, blockH + size * 0.3); g.globalAlpha = 1;
  g.fillStyle = st.fg;
  for (const l of lines) { g.fillText(l, 124, y); y += lh; }

  // title + footer
  g.font = '700 44px "Courier Prime", "Courier New", monospace';
  g.fillStyle = st.fg;
  g.fillText(o.title.length > 28 ? o.title.slice(0, 27) + '…' : o.title, 80, H - 150);
  g.font = '700 20px "Space Grotesk", sans-serif'; g.fillStyle = st.soft;
  (g as any).letterSpacing = '6px';
  g.fillText(o.footer.toUpperCase(), 80, H - 100);
  (g as any).letterSpacing = '0px';

  // grain
  for (let i = 0; i < 38000; i++) {
    g.fillStyle = `rgba(${st.grain},${(r() * 0.06).toFixed(3)})`;
    g.fillRect(r() * W, r() * H, 2, 2);
  }
  return c;
}
