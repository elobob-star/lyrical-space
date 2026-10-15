export function Odometer({ value, digits = 3 }: { value: number; digits?: number }) {
  const s = String(Math.min(value, 10 ** digits - 1)).padStart(digits, '0');
  return (
    <span class="odo" aria-label={String(value)}>
      {[...s].map((d, i) => (
        <span class="odo-d" key={i}>
          <span class="odo-col" style={{ transform: `translateY(${-Number(d) * 10}%)` }}>
            {'0123456789'.split('').map((n) => <i>{n}</i>)}
          </span>
        </span>
      ))}
    </span>
  );
}
