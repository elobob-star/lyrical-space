import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

// ---------- toast ----------
export interface Toast { id: number; msg: string; action?: { label: string; run: () => void } }
export const toast = signal<Toast | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastId = 0;

export function say(msg: string, action?: Toast['action'], ms = 4200): void {
  clearTimeout(toastTimer);
  toast.value = { id: ++toastId, msg, action };
  toastTimer = setTimeout(() => { toast.value = null; }, ms);
}
export function dismissToast(): void { clearTimeout(toastTimer); toast.value = null; }

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

// ---------- overlays ----------
export type Layer = null | 'rack' | 'settings' | 'export' | 'cadence' | 'card';
export const layer = signal<Layer>(null);
export const slipOpen = signal(false);
export const rackTab = signal<'tapes' | 'shoebox' | 'boneyard' | 'bin'>('tapes');

// ---------- bench trays ----------
export type Tray = null | 'chords' | 'bones' | 'results';
export const tray = signal<Tray>(null);
export const flowOn = signal(false);

// ---------- misc shared ----------
export const keyboardOpen = signal(false);


/** bumps when the dictionary finishes loading so analysis re-renders */
export const cmuTick = signal(0);

// ---------- tool state shared with the bezel readout ----------
export const latch = signal(false);
export const grease = signal(false);
export type TableTool = null | 'snip' | 'tape';
export const tableTool = signal<TableTool>(null);
/** sprint clock (ms) published by the Roll so the bezel readout can show it */
export const rollClock = signal<number | null>(null);

/** throttled line/word counts for the bezel readout (updated by the Roll) */
export const rollStats = signal({ lines: 0, words: 0 });
