// Compacts cmu-pronouncing-dictionary into src/data/cmu.txt
// Format per line:  word|PHONES   (one char per phone; see src/engine/phones.ts)
// Vowels are U+0100 + vowelIndex*3 + stress; consonants are ASCII letters.
import { dictionary } from 'cmu-pronouncing-dictionary';
import { writeFileSync, mkdirSync } from 'node:fs';

const VOWELS = ['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW'];
const CONS = { B:'b',CH:'c',D:'d',DH:'D',F:'f',G:'g',HH:'h',JH:'j',K:'k',L:'l',M:'m',N:'n',NG:'N',P:'p',R:'r',S:'s',SH:'S',T:'t',TH:'T',V:'v',W:'w',Y:'y',Z:'z',ZH:'Z' };

function enc(pron) {
  let out = '';
  for (const tok of pron.split(' ')) {
    const m = /^([A-Z]+)([012])?$/.exec(tok);
    if (!m) return null;
    const vi = VOWELS.indexOf(m[1]);
    if (vi >= 0) out += String.fromCharCode(0x100 + vi * 3 + Number(m[2] ?? 0));
    else if (CONS[m[1]]) out += CONS[m[1]];
    else return null;
  }
  return out;
}

const words = [];
for (const [w, p] of Object.entries(dictionary)) {
  if (/\(\d+\)$/.test(w)) continue;            // keep first pronunciation only
  if (!/^[a-z][a-z']*$/.test(w)) continue;     // plain words only
  const e = enc(p);
  if (e) words.push([w, e]);
}
words.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/cmu.txt', words.map(([w, e]) => `${w}|${e}`).join('\n'), 'utf8');
console.log('words', words.length);

// ---- common-word ranking (SUBTLEX-US via subtlex-word-frequencies, ISC) ----
import { readFileSync } from 'node:fs';
const freq = JSON.parse(readFileSync('node_modules/subtlex-word-frequencies/index.json', 'utf8'));
const seen = new Set();
const common = [];
for (const { word } of freq) {
  const w = String(word).toLowerCase();
  if (!/^[a-z][a-z']*$/.test(w) || seen.has(w)) continue;
  if (w.length < 2 && w !== 'a' && w !== 'i') continue;
  seen.add(w);
  common.push(w);
  if (common.length >= 25000) break;
}
writeFileSync('src/data/common.txt', common.join('\n'), 'utf8');
console.log('common', common.length);
