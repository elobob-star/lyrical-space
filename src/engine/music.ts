const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

export const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export interface Key { root: string; minor: boolean }

export function parseKey(k: string | null | undefined): Key | null {
  if (!k) return null;
  const m = /^([A-G][#b]?)(m)?$/.exec(k);
  return m ? { root: m[1], minor: !!m[2] } : null;
}
export const keyName = (k: Key): string => k.root + (k.minor ? 'm' : '');

export function semitone(root: string): number {
  const i = SHARP.indexOf(root);
  if (i >= 0) return i;
  return FLAT.indexOf(root);
}

export function noteName(semi: number, preferFlat: boolean): string {
  const n = ((semi % 12) + 12) % 12;
  return (preferFlat ? FLAT : SHARP)[n];
}

export interface ChordStamp { name: string; roman: string }

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_QUAL = ['', 'm', 'm', '', '', 'm', 'dim'];
const MAJOR_ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const MINOR_QUAL = ['m', 'dim', '', 'm', 'm', '', ''];
const MINOR_ROMAN = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

/** Diatonic chord stamps for a key (plus the borrowed V in minor). */
export function diatonic(key: Key | null): ChordStamp[] {
  if (!key) {
    return ['C', 'G', 'Am', 'F', 'Dm', 'Em', 'D', 'A', 'E'].map((n) => ({ name: n, roman: '' }));
  }
  const root = semitone(key.root);
  const flat = FLAT_KEYS.has(keyName(key));
  const scale = key.minor ? MINOR_SCALE : MAJOR_SCALE;
  const qual = key.minor ? MINOR_QUAL : MAJOR_QUAL;
  const roman = key.minor ? MINOR_ROMAN : MAJOR_ROMAN;
  const out = scale.map((s, i) => ({ name: noteName(root + s, flat) + qual[i], roman: roman[i] }));
  if (key.minor) out.push({ name: noteName(root + 7, flat), roman: 'V' });
  return out;
}

export const MODIFIERS = ['m', '7', 'maj7', 'sus4', 'sus2', 'add9', 'dim', '6', 'm7', '5'];

/** Apply a modifier to a chord name, replacing a previous quality where it makes sense. */
export function modifyChord(name: string, mod: string): string {
  const m = /^([A-G][#b]?)(.*)$/.exec(name);
  if (!m) return name;
  const [, root, rest] = m;
  const slash = rest.includes('/') ? rest.slice(rest.indexOf('/')) : '';
  const qual = slash ? rest.slice(0, rest.indexOf('/')) : rest;
  if (mod === 'm') return root + (qual.startsWith('m') && !qual.startsWith('maj') ? qual.slice(1) : 'm' + qual) + slash;
  return root + mod + slash;
}

export function transposeChord(name: string, semis: number, preferFlat = false): string {
  return name.replace(/[A-G][#b]?/g, (n) => noteName(semitone(n) + semis, preferFlat));
}

export const TUNINGS = [
  'Standard EADGBE', 'Drop D', 'DADGAD', 'Open G', 'Open D', 'Half-step down', 'Full step down', 'CGCFCE', 'Open E', 'Ukulele GCEA',
];

export const CHORD_RE = /^[A-G][#b]?(m|maj|min|dim|aug|sus|add|M)?[0-9]*(sus[24]|add[0-9]+|maj[0-9]+|dim|aug)?(\/[A-G][#b]?)?$/;

export const isFlatKey = (k: Key | null): boolean => !!k && FLAT_KEYS.has(keyName(k));

/** Shortest move (−5…+6 semitones) from one key's root to another's. */
export function semisBetween(from: Key, to: Key): number {
  const d = (((semitone(to.root) - semitone(from.root)) % 12) + 12) % 12;
  return d > 6 ? d - 12 : d;
}
