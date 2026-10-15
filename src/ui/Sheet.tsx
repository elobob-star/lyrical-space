import { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useBackClose } from '../store/ui';
import { Icon } from './icons';

export function Sheet({ title, onClose, children, right }: { title: string; onClose: () => void; children: ComponentChildren; right?: ComponentChildren }) {
  useBackClose(true, onClose);
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <div class="sheet" role="dialog" aria-label={title}>
        <div class="grab" />
        <h3><span>{title}</span><span class="row">{right}<button class="btn small" onClick={onClose} aria-label="Close"><Icon n="close" size={14} /></button></span></h3>
        <div class="body">{children}</div>
      </div>
    </>
  );
}

export function TextSheet({ title, value = '', placeholder, multiline, hand, okLabel = 'SAVE', onSave, onClose, extra }: {
  title: string; value?: string; placeholder?: string; multiline?: boolean; hand?: boolean; okLabel?: string;
  onSave: (v: string) => void; onClose: () => void; extra?: ComponentChildren;
}) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => { ref.current?.focus(); ref.current?.select?.(); }, 120); }, []);
  const save = () => { onSave(v); onClose(); };
  return (
    <Sheet title={title} onClose={onClose}>
      {multiline ? (
        <textarea ref={ref} class={'field' + (hand ? ' hand' : '')} rows={4} value={v} placeholder={placeholder}
          onInput={(e) => setV((e.target as HTMLTextAreaElement).value)} />
      ) : (
        <input ref={ref} class={'field' + (hand ? ' hand' : '')} value={v} placeholder={placeholder} enterKeyHint="done"
          onInput={(e) => setV((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      )}
      <div class="row" style={{ marginTop: '12px' }}>
        {extra}
        <span class="grow" />
        <button class="btn go" onClick={save}>{okLabel}</button>
      </div>
    </Sheet>
  );
}

/** Small row of choices in a sheet. */
export function Choices<T extends string>({ items, onPick }: { items: Array<{ id: T; label: string; hint?: string }>; onPick: (id: T) => void }) {
  return (
    <div class="choices">
      {items.map((i) => (
        <button class="choice" key={i.id} onClick={() => onPick(i.id)}>
          <span>{i.label}</span>{i.hint && <small>{i.hint}</small>}
        </button>
      ))}
    </div>
  );
}
