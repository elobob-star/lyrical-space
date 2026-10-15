import { signal } from '@preact/signals';
import { audio } from './feel';

export const recording = signal(false);
export const recLevel = signal(0);

export interface RecResult { blob: Blob; durMs: number; peaks: number[]; mime: string }

let rec: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let peaks: number[] = [];
let raf = 0;
let started = 0;
let sampleTimer: ReturnType<typeof setInterval> | null = null;

function pickMime(): string {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if ((window as any).MediaRecorder?.isTypeSupported?.(m)) return m;
  }
  return '';
}

export async function startRecording(): Promise<void> {
  if (recording.value) return;
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const mime = pickMime();
  rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  chunks = [];
  peaks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const c = audio();
  if (c) {
    const src = c.createMediaStreamSource(stream);
    const an = c.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    sampleTimer = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let max = 0;
      for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i] - 128));
      const v = Math.min(1, max / 90);
      recLevel.value = v;
      peaks.push(v);
    }, 60);
  }
  rec.start(250);
  started = Date.now();
  recording.value = true;
}

export function stopRecording(): Promise<RecResult | null> {
  return new Promise((resolve) => {
    if (!rec) { resolve(null); return; }
    const r = rec;
    r.onstop = () => {
      const durMs = Date.now() - started;
      const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
      stream?.getTracks().forEach((t) => t.stop());
      if (sampleTimer) clearInterval(sampleTimer);
      cancelAnimationFrame(raf);
      recording.value = false;
      recLevel.value = 0;
      rec = null; stream = null;
      // resample peaks to <= 96 bars
      const bars = 96;
      const out: number[] = [];
      const step = Math.max(1, peaks.length / bars);
      for (let i = 0; i < Math.min(bars, peaks.length); i++) {
        let m = 0;
        for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step) && j < peaks.length; j++) m = Math.max(m, peaks[j]);
        out.push(Math.round(m * 100) / 100);
      }
      resolve({ blob, durMs, peaks: out, mime: blob.type });
    };
    try { r.stop(); } catch { resolve(null); }
  });
}

export function cancelRecording(): void {
  if (rec) { rec.onstop = null; try { rec.stop(); } catch { /* */ } }
  stream?.getTracks().forEach((t) => t.stop());
  if (sampleTimer) clearInterval(sampleTimer);
  rec = null; stream = null; recording.value = false; recLevel.value = 0;
}
