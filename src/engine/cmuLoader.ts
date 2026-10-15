import cmuUrl from '../data/cmu.txt?url';
import commonUrl from '../data/common.txt?url';
import { setCmuText, cmuReady } from './cmu';
import { setCommonText } from './common';

let pending: Promise<void> | null = null;

/** Fetches the bundled dictionary once. Safe to call repeatedly. */
export function loadCmu(): Promise<void> {
  if (cmuReady()) return Promise.resolve();
  pending ??= Promise.all([
    fetch(commonUrl).then((r) => r.text()).then(setCommonText),
    fetch(cmuUrl).then((r) => r.text()).then(setCmuText),
  ])
    .then(() => undefined)
    .catch(() => { pending = null; });
  return pending;
}
