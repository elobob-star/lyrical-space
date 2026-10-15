/**
 * Map a screen point to a character offset inside a "mirror" element whose text lives in
 * spans carrying `data-s` (the offset of the span's first char). Uses real glyph rectangles,
 * so it works with wrapped text and doesn't depend on hit-testing or pointer-events.
 */
export function indexAtPoint(root: HTMLElement, x: number, y: number, textLength: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let best = textLength, bestScore = Infinity;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const host = node.parentElement;
    if (!host || host.closest('.stamp')) continue;
    const piece = host.closest('[data-s]') as HTMLElement | null;
    if (!piece) continue;
    const base = Number(piece.dataset.s);
    for (let i = 0; i < node.length; i++) {
      if (node.data[i] === '​') continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getClientRects()[0];
      if (!r || (r.width === 0 && r.height === 0)) continue;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const cx = r.left + r.width / 2;
      const score = dy * 1000 + Math.abs(x - cx);
      if (score < bestScore) {
        bestScore = score;
        best = x < cx ? base + i : base + i + 1;
      }
    }
  }
  return Math.max(0, Math.min(best, textLength));
}
