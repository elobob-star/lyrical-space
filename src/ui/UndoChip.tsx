import { Icon } from './icons';
import { feel } from '../engine/feel';
import { Surface, runUndo, undoDepth } from '../store/undo';

/** Shows up only when there is something to take back. */
export function UndoChip({ surface }: { surface: Surface }) {
  const n = undoDepth(surface);
  if (!n) return null;
  return (
    <button class="undo-chip" aria-label="Undo" onMouseDown={(e) => e.preventDefault()} onClick={() => { feel('click', 'light'); runUndo(surface); }}>
      <Icon n="undo" size={15} stroke={2} />{n > 1 && <b>{n}</b>}
    </button>
  );
}
