import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { currentSong } from '../store/state';
import { INKS, activeTake, sectionNames } from '../store/models';
import { layer, say } from '../store/ui';
import { songToChordPro, songToMarkdown, songToText, roughSlug } from '../engine/export';
import { copyText, shareFile, shareText } from '../engine/share';
import { renderCard } from '../engine/cardart';
import { feel } from '../engine/feel';
import { Sheet } from './Sheet';
import { Icon } from './icons';

type Fmt = 'text' | 'over' | 'pro' | 'md';
const FMTS: Array<[Fmt, string, string]> = [
  ['text', 'LYRICS', 'txt'], ['over', 'CHORDS OVER', 'txt'], ['pro', 'CHORDPRO', 'cho'], ['md', 'MARKDOWN', 'md'],
];

export function ExportSheet() {
  const song = currentSong.value;
  const [fmt, setFmt] = useState<Fmt>('text');
  const [expand, setExpand] = useState(true);
  const [headers, setHeaders] = useState(true);
  const [card, setCard] = useState(false);
  const close = () => { layer.value = null; };
  const text = useMemo(() => {
    if (!song) return '';
    if (fmt === 'pro') return songToChordPro(song);
    if (fmt === 'md') return songToMarkdown(song, 'over');
    return songToText(song, { chords: fmt === 'over' ? 'over' : 'none', expand, headers });
  }, [song, fmt, expand, headers]);
  if (!song) return null;
  if (card) return <CardSheet onClose={() => setCard(false)} />;
  const ext = FMTS.find((f) => f[0] === fmt)![2];
  const name = `${roughSlug(song.title)}.${ext}`;
  return (
    <Sheet title="EXPORT" onClose={close}>
      <div class="seg" style={{ flexWrap: 'wrap' }}>
        {FMTS.map(([id, label]) => <button key={id} class={fmt === id ? 'on' : ''} onClick={() => { feel('click'); setFmt(id); }}>{label}</button>)}
      </div>
      {(fmt === 'text' || fmt === 'over') && (
        <div class="row wrap" style={{ marginBottom: '8px' }}>
          <button class={'tog' + (expand ? ' on' : '')} onClick={() => setExpand(!expand)}>EXPAND REPEATS</button>
          <button class={'tog' + (headers ? ' on' : '')} onClick={() => setHeaders(!headers)}>SECTION HEADERS</button>
        </div>
      )}
      <pre class="preview">{text}</pre>
      <div class="row wrap" style={{ marginTop: '10px' }}>
        <button class="btn" onClick={async () => { say((await copyText(text)) ? 'COPIED' : 'COPY FAILED'); }}><Icon n="copy" size={15} /> COPY</button>
        <button class="btn" onClick={() => void shareFile(name, new Blob([text], { type: 'text/plain' }), song.title)}><Icon n="export" size={15} /> FILE</button>
        <button class="btn go" onClick={() => void shareText(song.title, text)}><Icon n="send" size={15} /> SHARE</button>
        <button class="btn" onClick={() => setCard(true)}><Icon n="card" size={15} /> LYRIC CARD</button>
      </div>
    </Sheet>
  );
}

function CardSheet({ onClose }: { onClose: () => void }) {
  const song = currentSong.value!;
  const names = sectionNames(song);
  const firstChorus = song.sections.find((s) => s.kind === 'chorus') ?? song.sections[0];
  const [sid, setSid] = useState(firstChorus?.id ?? '');
  const [stock, setStock] = useState<'paper' | 'night' | 'ink'>('paper');
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const sec = song.sections.find((s) => s.id === sid);
  const lines = sec ? activeTake(sec).lines.map((l) => l.text) : song.roll.text.split('\n').slice(0, 8);

  useEffect(() => {
    let live = true;
    void renderCard({ title: song.title, lines, ink: INKS[song.ink], stock, seed: song.title + lines.join('|'), footer: sec ? names.get(sec.id) ?? '' : 'FREEWRITE' })
      .then((c) => { if (live) setCanvas(c); });
    return () => { live = false; };
  }, [sid, stock, song.ink, song.title]);
  useEffect(() => {
    if (!canvas || !host.current) return;
    canvas.style.cssText = 'width:100%;height:auto;border-radius:6px;display:block';
    host.current.replaceChildren(canvas);
  }, [canvas]);

  const blob = () => new Promise<Blob | null>((res) => canvas!.toBlob((b) => res(b), 'image/png'));
  return (
    <Sheet title="LYRIC CARD" onClose={onClose}>
      <div class="kinds" style={{ marginBottom: '8px' }}>
        {song.sections.map((s) => <button key={s.id} class={'kind' + (sid === s.id ? ' on' : '')} onClick={() => setSid(s.id)}>{names.get(s.id)}</button>)}
      </div>
      <div class="seg">
        {(['paper', 'night', 'ink'] as const).map((s) => <button key={s} class={stock === s ? 'on' : ''} onClick={() => setStock(s)}>{s.toUpperCase()}</button>)}
      </div>
      <div class="card-prev" ref={host}><span class="tray-note">DEVELOPING…</span></div>
      <div class="row" style={{ marginTop: '10px' }}>
        <span class="grow" />
        <button class="btn go" disabled={!canvas} onClick={async () => { const b = await blob(); if (b) void shareFile(`${song.title.toLowerCase().replace(/\W+/g, '-')}-card.png`, b, song.title); }}><Icon n="send" size={15} /> SHARE PNG</button>
      </div>
    </Sheet>
  );
}
