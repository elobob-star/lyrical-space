import { ComponentChildren } from 'preact';
import { Icon } from './icons';
import { feel, Sound } from '../engine/feel';

export interface KeyProps {
  icon: string;
  label: string;
  on?: boolean;
  hot?: boolean;
  pulse?: boolean;
  led?: 'green' | 'red' | 'amber' | 'yellow' | 'orange';
  badge?: number | string | null;
  onClick?: () => void;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
  sound?: Sound | null;
  children?: ComponentChildren;
  keyRef?: (el: HTMLButtonElement | null) => void;
}

export function Key(p: KeyProps) {
  const press = () => { if (p.sound !== null) feel(p.sound ?? 'thock', 'light'); };
  return (
    <div class="keyslot">
      {p.led && <span class={`led ${p.led}` + (p.on ? ' on' : '')} />}
      <button
        ref={p.keyRef}
        class={'key' + (p.on ? ' on' : '') + (p.hot ? ' hot' : '') + (p.pulse ? ' pulse' : '')}
        aria-label={p.label} aria-pressed={p.on}
        onClick={() => { if (p.onClick) { press(); p.onClick(); } }}
        onPointerDown={p.onPointerDown} onPointerMove={p.onPointerMove} onPointerUp={p.onPointerUp} onPointerCancel={p.onPointerUp}
      >
        <Icon n={p.icon} size={21} />
        {p.badge ? <span class="badge">{p.badge}</span> : null}
      </button>
      <span class="legend-s">{p.label}</span>
    </div>
  );
}

export function Keys({ children }: { children: ComponentChildren }) {
  return <div class="keys">{children}</div>;
}
