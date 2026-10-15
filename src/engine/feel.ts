// Synthesised mechanical sounds + haptics. No audio assets.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { settings } from '../store/state';

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

export function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function burst(c: AudioContext, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number): void {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t, Math.random() * 0.3, dur + 0.02);
}

function thump(c: AudioContext, t: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export type Sound = 'click' | 'thock' | 'clunk' | 'chk' | 'snip' | 'ratchet' | 'ding' | 'key' | 'tick' | 'tock' | 'rec';

export function sound(kind: Sound): void {
  const st = settings.peek();
  if (kind === 'tick' || kind === 'tock') { /* metronome ignores the click switch */ }
  else if (kind === 'key') { if (!st.keys) return; }
  else if (!st.clicks) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  switch (kind) {
    case 'click': burst(c, t, 0.012, 'bandpass', 3200, 2, 0.5); thump(c, t, 220, 90, 0.04, 0.25); break;
    case 'thock': thump(c, t, 170, 55, 0.07, 0.5); burst(c, t, 0.02, 'lowpass', 1100, 0.7, 0.35); break;
    case 'clunk':
      thump(c, t, 120, 42, 0.14, 0.7); burst(c, t, 0.03, 'bandpass', 700, 1.5, 0.5);
      burst(c, t + 0.07, 0.015, 'bandpass', 2400, 3, 0.35); break;
    case 'chk': burst(c, t, 0.02, 'highpass', 2200, 0.8, 0.55); thump(c, t, 320, 110, 0.05, 0.4, 'triangle'); break;
    case 'snip': burst(c, t, 0.018, 'highpass', 4500, 1, 0.5); burst(c, t + 0.035, 0.022, 'highpass', 5200, 1, 0.55); break;
    case 'ratchet': for (let i = 0; i < 7; i++) burst(c, t + i * 0.032, 0.01, 'bandpass', 2600 + i * 80, 4, 0.35); thump(c, t + 0.24, 140, 60, 0.08, 0.5); break;
    case 'ding': thump(c, t, 2300, 2280, 1.0, 0.22); thump(c, t, 3450, 3420, 0.6, 0.1); break;
    case 'key': burst(c, t, 0.008, 'bandpass', 2800 + Math.random() * 500, 3, 0.16); thump(c, t, 190, 80, 0.03, 0.12); break;
    case 'tick': thump(c, t, 1500, 1500, 0.035, 0.35, 'square'); break;
    case 'tock': thump(c, t, 900, 900, 0.03, 0.22, 'square'); break;
    case 'rec': thump(c, t, 880, 880, 0.08, 0.2); break;
  }
}

const native = Capacitor.isNativePlatform();

export type Buzz = 'light' | 'medium' | 'heavy';
export function haptic(kind: Buzz = 'light'): void {
  if (!settings.peek().haptics) return;
  try {
    if (native) {
      void Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy });
    } else if (navigator.vibrate) {
      navigator.vibrate(kind === 'light' ? 8 : kind === 'medium' ? 16 : 30);
    }
  } catch { /* ignore */ }
}

/** Sound + haptic together — the standard "something mechanical happened". */
export function feel(s: Sound, h: Buzz | null = 'light'): void {
  sound(s);
  if (h) haptic(h);
}

// ---- metronome (look-ahead scheduler) ----
let metroTimer: ReturnType<typeof setInterval> | null = null;
let nextBeat = 0;
let beatNo = 0;
let beatCb: ((n: number) => void) | null = null;

export function startMetronome(bpm: () => number, onBeat?: (n: number) => void, countIn = 0): void {
  stopMetronome();
  const c = audio();
  if (!c) return;
  nextBeat = c.currentTime + 0.06;
  beatNo = -countIn;
  beatCb = onBeat ?? null;
  const schedule = () => {
    while (nextBeat < c.currentTime + 0.12) {
      const accent = ((beatNo % 4) + 4) % 4 === 0;
      const t = nextBeat;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = accent ? 1500 : 1000;
      const g = c.createGain();
      g.gain.setValueAtTime(accent ? 0.28 : 0.17, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 0.05);
      const n = beatNo;
      setTimeout(() => beatCb?.(n), Math.max(0, (t - c.currentTime) * 1000));
      beatNo++;
      nextBeat += 60 / Math.max(30, Math.min(260, bpm()));
    }
  };
  schedule();
  metroTimer = setInterval(schedule, 25);
}

export function stopMetronome(): void {
  if (metroTimer) clearInterval(metroTimer);
  metroTimer = null;
  beatCb = null;
}
export const metronomeOn = (): boolean => metroTimer !== null;
