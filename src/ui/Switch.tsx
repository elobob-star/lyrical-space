import { feel } from '../engine/feel';

/** A slide switch row: label, one line of help, and a recessed track with a cap that slides over. */
export function SwitchRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button class="sw-row" role="switch" aria-checked={on} onClick={() => { feel('snap', 'light'); onChange(!on); }}>
      <span class="dl"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <span class={'sw' + (on ? ' on' : '')}><i /></span>
    </button>
  );
}
