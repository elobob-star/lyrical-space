import { useEffect, useRef, useState } from 'preact/hooks';
import { addScrap, currentSong, scraps } from '../store/state';
import { say, slipOpen, useBackClose } from '../store/ui';
import { feel } from '../engine/feel';
import { Icon } from './icons';
import { Overlay } from './Sheet';

/** CATCH: a slip of paper always peeking out of the right edge. One line in, straight into the Shoebox. */
export function Slip() {
  const open = slipOpen.value;
  const [text, setText] = useState('');
  const [filed, setFiled] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useBackClose(open, () => close());
  useEffect(() => { if (open) { setFiled(0); setTimeout(() => ref.current?.focus(), 160); } }, [open]);

  const file = () => {
    const t = text.trim();
    if (!t) return;
    addScrap(t, 'catch', currentSong.peek()?.id);
    feel('chk', 'medium');
    setText('');
    setFiled((n) => n + 1);
    ref.current?.focus();
  };
  const close = () => {
    let n = filed;
    if (text.trim()) { addScrap(text.trim(), 'catch', currentSong.peek()?.id); setText(''); n++; feel('chk', 'light'); }
    if (n) say(n === 1 ? 'CAUGHT → SHOEBOX' : `CAUGHT ${n} → SHOEBOX`);
    slipOpen.value = false;
  };

  return (
    <>
      <button class={'slip-tab' + (open ? ' hide' : '')} aria-label="Catch a line" onClick={() => { feel('click'); slipOpen.value = true; }}>
        <span>CATCH</span>
      </button>
      {open && (
        <Overlay>
          <div class="slip-scrim" onClick={close} />
          <div class="slip-pop" role="dialog" aria-label="Catch a line">
            <span class="tape-bit" />
            <div class="slip-head"><span>CATCH IT BEFORE IT ESCAPES</span><span class="muted">{scraps.value.length} IN THE BOX{filed ? ` · +${filed}` : ''}</span></div>
            <textarea ref={ref} rows={3} autoFocus value={text} placeholder="a line, an image, something overheard…" enterkeyhint="send"
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); file(); } }} />
            <div class="slip-acts">
              <button onClick={close}>DONE</button>
              <button class="go" onClick={file}><Icon n="box" size={14} /> INTO THE BOX</button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
