import { ComponentChildren } from 'preact';
import { Icon } from './icons';
import { feel, Sound } from '../engine/feel';

export interface KeyProps {
  icon: string;
  label: string;
  /** toggled on: LED lit, cap sits a hair lower */
  on?: boolean;
  /** shows an LED (lit when `on`) */
  led?: boolean | 'amber' | 'green' | 'red';
  /** LED breathes: "press me next" */
  pulse?: boolean;
  tone?: 'dark' | 'hot';
  badge?: number | string | null;
  disabled?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  sound?: Sound | null;
  aria?: string;
  children?: ComponentChildren;
}

export function Key(p: KeyProps) {
  // feedback fires on touch-DOWN (not after release) so a key feels instantaneous
  const down = (e: PointerEvent) => {
    if (p.disabled) return;
    if (p.onClick && p.sound !== null) feel(p.sound ?? 'thock', 'light');
    p.onPointerDown?.(e);
  };
  const ledColor = typeof p.led === 'string' ? ' ' + p.led : '';
  return (
    <div class="keyslot">
      <button
        class={'key' + (p.tone ? ' ' + p.tone : '') + (p.on ? ' on' : '') + (p.pulse ? ' pulse' : '')}
        aria-label={p.aria ?? p.label} aria-pressed={p.led ? !!p.on : undefined} disabled={p.disabled}
        onClick={() => p.onClick?.()} onContextMenu={p.onContextMenu}
        onPointerDown={down} onPointerMove={p.onPointerMove} onPointerUp={p.onPointerUp} onPointerCancel={p.onPointerUp}
      >
        <span class="ke" />
        <span class="kc">
          {p.led && <i class={'led kled' + ledColor + (p.on ? ' on' : '')} />}
          <Icon n={p.icon} size={16} stroke={1.5} class="ksym" />
          <b class="klab">{p.label}</b>
          {p.badge ? <span class="badge">{p.badge}</span> : null}
          {p.children}
        </span>
      </button>
    </div>
  );
}

export function Keys({ children }: { children: ComponentChildren }) {
  return <div class="keys">{children}</div>;
}
