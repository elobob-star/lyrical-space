import { useEffect, useRef } from 'preact/hooks';

const POS = [-50, 0, 50];

/** Three-position rotary switch. Rotation is written straight to the DOM (no re-render per pointer move). */
export function Dial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const rot = useRef<HTMLDivElement>(null);
  const st = useRef({ x: 0, y: 0, t: 0, moved: false, idx: value, active: false });

  const setAngle = (a: number) => { if (rot.current) rot.current.style.transform = `rotate(${a}deg)`; };
  useEffect(() => { if (!st.current.active) setAngle(POS[value]); st.current.idx = value; }, [value]);

  const down = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    st.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false, idx: value, active: true };
    root.current?.classList.add('drag');
  };
  const move = (e: PointerEvent) => {
    const s = st.current;
    if (!s.active) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 5) s.moved = true;
    if (!s.moved) return;
    const r = root.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const a = Math.max(-62, Math.min(62, (Math.atan2(dx, -dy) * 180) / Math.PI));
    setAngle(a);
    const idx = POS.reduce((best, p, i) => (Math.abs(p - a) < Math.abs(POS[best] - a) ? i : best), 0);
    if (idx !== s.idx) { s.idx = idx; onChange(idx); }
  };
  const up = () => {
    const s = st.current;
    if (!s.active) return;
    s.active = false;
    root.current?.classList.remove('drag');
    if (!s.moved && Date.now() - s.t < 400) {
      const next = (value + 1) % 3;
      onChange(next);
      setAngle(POS[next]);
    } else setAngle(POS[s.idx]); // springs into the detent
  };

  return (
    <div class="dial" ref={root} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      role="slider" aria-label="Mode dial" aria-valuemin={0} aria-valuemax={2} aria-valuenow={value}>
      <div class="d-well" />
      <svg class="d-ticks" viewBox="-33 -33 66 66" aria-hidden="true">
        {POS.map((p, i) => (
          <line x1="0" y1="-32.5" x2="0" y2="-29" class={i === value ? 'tk on' : 'tk'} stroke-width="2" stroke-linecap="round" transform={`rotate(${p})`} />
        ))}
      </svg>
      <div class="d-metal" />
      <div class="d-rot" ref={rot} style={{ transform: `rotate(${POS[value]}deg)` }}>
        <div class="d-cap" />
        <div class="d-ind" />
      </div>
      <div class="d-gloss" />
    </div>
  );
}
