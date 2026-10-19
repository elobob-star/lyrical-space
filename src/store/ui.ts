import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { kvGet, kvSet } from './db';

// ---------- the LCD is the machine's only voice (no floating toasts) ----------
export interface Msg { id: number; text: string; action?: { label: string; run: () => void }; ms: number }
export const lcdMsg = signal<Msg | null>(null);
let msgTimer: ReturnType<typeof setTimeout> | undefined;
let msgId = 0;

export function say(text: string, action?: Msg['action'], ms = 3800): void {
  clearTimeout(msgTimer);
  // long lines scroll past, so give them time to be read
  const t = Math.max(ms, 1600 + text.length * 95 + (action ? 1800 : 0));
  lcdMsg.value = { id: ++msgId, text, action, ms: t };
  msgTimer = setTimeout(() => { lcdMsg.value = null; }, t);
}
export function dismissMsg(): void { clearTimeout(msgTimer); lcdMsg.value = null; }

/** One-time orientation line per surface, shown on the LCD the first time it's opened. */
const seen = new Set<string>();
let seenLoaded: Promise<void> | null = null;
export function hintOnce(key: string, text: string): void {
  seenLoaded ??= kvGet<string[]>('hints').then((h) => { (h ?? []).forEach((k) => seen.add(k)); });
  void seenLoaded.then(() => {
    if (seen.has(key)) return;
    seen.add(key);
    void kvSet('hints', [...seen]);
    setTimeout(() => { if (!lcdMsg.peek()) say(text, undefined, 6000); }, 500);
  });
}

// ---------- back-stack (hardware back button closes the top-most layer) ----------
const stack: Array<() => void> = [];

/** Returns true if a layer handled the back press. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function useBackClose(active: boolean, close: () => void): void {
  useEffect(() => {
    if (!active) return;
    const fn = () => close();
    stack.push(fn);
    return () => {
      const i = stack.lastIndexOf(fn);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

// ---------- layers ----------
export type Layer = null | 'rack' | 'settings' | 'export' | 'stand';
export const layer = signal<Layer>(null);
export const slipOpen = signal(false);
export const rackTab = signal<'tapes' | 'shoebox' | 'bin'>('tapes');

// ---------- bench ----------
export type Tray = null | 'chords' | 'shoebox' | 'words';
export const tray = signal<Tray>(null);
export type Lens = 'off' | 'rhyme' | 'meter';
export const lens = signal<Lens>('off');

// ---------- misc shared ----------
export const keyboardOpen = signal(false);
/** bumps when the dictionary finishes loading so analysis re-renders */
export const cmuTick = signal(0);

// ---------- roll tools (shared with the LCD) ----------
export const latch = signal(false);
export const pen = signal(false);
/** a running freewrite sprint: when it ends and how long it was */
export const sprint = signal<{ end: number; min: number } | null>(null);
/** throttled counts for the readout (updated by the Roll) */
export const rollStats = signal({ lines: 0, words: 0 });
