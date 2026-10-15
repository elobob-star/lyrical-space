import { useEffect, useRef, useState } from 'preact/hooks';
import { addScrap, scraps } from '../store/state';
import { say, slipOpen, useBackClose } from '../store/ui';
import { feel } from '../engine/feel';
import { Icon } from './icons';

export function Slip() {
  const open = slipOpen.value;
  const [text, setText] = useState('');
  const [filed, setFiled] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useBackClose(open, () => { slipOpen.value = false; });
  useEffect(() => { if (open) { setFiled(0); setTimeout(() => ref.current?.focus(), 150); } }, [open]);

  const file = () => {
    const t = text.trim();
    if (!t) return;
    addScrap(t, 'spark');
    feel('chk', 'medium');
    setText('');
    setFiled((n) => n + 1);
    ref.current?.focus();
  };
  const close = () => {
    if (text.trim()) { addScrap(text.trim(), 'spark'); setText(''); say('FILED IN THE SHOEBOX'); }
    else if (filed) say(`FILED ${filed} IN THE SHOEBOX`);
    slipOpen.value = false;
  };

  return (
    <>
      <button class={'slip-tab' + (open ? ' hide' : '')} aria-label="Quick-catch slip" onClick={() => { feel('click'); slipOpen.value = true; }}>
        <span>CATCH</span>
      </button>
      {open && (
        <>
          <div class="slip-scrim" onClick={close} />
          <div class="slip-pop" role="dialog" aria-label="Quick-catch slip">
            <span class="tape-bit" />
            <div class="slip-head"><span>QUICK-CATCH SLIP</span><span class="muted">{scraps.value.filter((s) => s.kind === 'spark').length} IN THE SHOEBOX{filed ? ` · +${filed}` : ''}</span></div>
            <textarea ref={ref} rows={3} value={text} placeholder="catch it before it escapes…" enterkeyhint="send"
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); file(); } }} />
            <div class="slip-acts">
              <button onClick={close}>DONE</button>
              <button class="go" onClick={file}><Icon n="box" size={14} /> FILE IT</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
