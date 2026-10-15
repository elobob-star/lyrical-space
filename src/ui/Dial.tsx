import { useEffect, useRef, useState } from 'preact/hooks';
import { feel } from '../engine/feel';

const POS = [-50, 0, 50];

export function Dial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef({ x: 0, y: 0, t: 0, moved: false, idx: value, active: false });
  const [angle, setAngle] = useState(POS[value]);
  const [drag, setDrag] = useState(false);

  useEffect(() => { if (!st.current.active) setAngle(POS[value]); st.current.idx = value; }, [value]);

  const down = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    st.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false, idx: value, active: true };
    setDrag(true);
  };
  const move = (e: PointerEvent) => {
    const s = st.current;
    if (!s.active) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 5) s.moved = true;
    if (!s.moved) return;
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    a = Math.max(-62, Math.min(62, a));
    setAngle(a);
    const idx = POS.reduce((best, p, i) => (Math.abs(p - a) < Math.abs(POS[best] - a) ? i : best), 0);
    if (idx !== s.idx) { s.idx = idx; feel('click', 'light'); onChange(idx); }
  };
  const up = () => {
    const s = st.current;
    if (!s.active) return;
    s.active = false;
    setDrag(false);
    if (!s.moved && Date.now() - s.t < 400) {
      const next = (value + 1) % 3;
      feel('click', 'light');
      onChange(next);
      setAngle(POS[next]);
    } else setAngle(POS[s.idx]);
  };

  const knurl = Array.from({ length: 28 }, (_, i) => i * (360 / 28));
  return (
    <div class={'dial' + (drag ? ' drag' : '')} ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      role="slider" aria-label="Mode dial" aria-valuemin={0} aria-valuemax={2} aria-valuenow={value}>
      <svg viewBox="-30 -30 60 60">
        <defs>
          <radialGradient id="dg-base" cx="35%" cy="30%"><stop offset="0" style={{ stopColor: 'var(--knob-a)' }} /><stop offset="1" style={{ stopColor: 'var(--knob-b)' }} /></radialGradient>
          <radialGradient id="dg-cap" cx="38%" cy="30%"><stop offset="0" stop-color="#ff9a63" /><stop offset="1" stop-color="#e2470f" /></radialGradient>
        </defs>
        <circle r="29" style={{ fill: 'var(--well)' }} />
        <circle r="28.2" fill="none" stroke="rgba(255,255,255,.12)" />
        {POS.map((p) => (
          <line x1="0" y1="-26.5" x2="0" y2="-29" stroke={Math.abs(p - POS[value]) < 1 ? '#ff5b1f' : '#8d8f96'} stroke-width="1.6" stroke-linecap="round" transform={`rotate(${p})`} />
        ))}
        <g class="knob" style={{ transform: `rotate(${angle}deg)` }}>
          <circle r="23" fill="url(#dg-base)" style={{ stroke: 'var(--knob-ring)' }} stroke-width="1" />
          {knurl.map((a) => <line x1="0" y1="-23" x2="0" y2="-19.8" stroke="rgba(0,0,0,.28)" stroke-width="1" transform={`rotate(${a})`} />)}
          <circle r="15.5" fill="url(#dg-cap)" stroke="rgba(0,0,0,.35)" stroke-width=".8" />
          <circle r="15.5" fill="none" stroke="rgba(255,255,255,.35)" stroke-width=".8" transform="translate(0 -.6)" />
          <path d="M0 -20 L0 -5" stroke="#fff" stroke-width="3" stroke-linecap="round" />
        </g>
      </svg>
    </div>
  );
}
