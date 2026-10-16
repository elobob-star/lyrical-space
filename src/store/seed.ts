import { Line, Scrap, Section, Song, newLine, newSection, newSong, uid } from './models';

const L = (text: string, chords: Array<[number, string]> = []): Line => ({
  id: uid(), text, chords: chords.map(([at, name]) => ({ at, name })),
});

export function seedSong(): Song {
  const song = newSong('SAMPLE TAPE — BORROWED ROOM', 3);
  song.key = 'G';
  song.bpm = 84;
  const verse: Section = newSection('verse', [
    L('Rain on the roof of a borrowed room,', [[0, 'G'], [20, 'Em']]),
    L('something in the window wants to bloom,', [[0, 'C'], [22, 'D']]),
    L('streetlight leaning like a question mark,', [[0, 'G'], [26, 'Em']]),
    L("I'm learning how to read you in the dark.", [[0, 'C'], [29, 'D']]),
  ]);
  const chorus: Section = newSection('chorus', [
    L('Keep the light on low,', [[0, 'C'], [15, 'G']]),
    L('keep the radio,', [[0, 'D'], [9, 'Em']]),
    L('all the ones we used to know', [[0, 'C'], [18, 'G']]),
    L('are a long, long way to go.', [[0, 'D'], [18, 'G']]),
  ]);
  const verse2: Section = newSection('verse', [
    L('Paper boats in a parking lot rain,'),
    L('you said the weather never learns your name,'),
    L('I keep a list of everything we lost'),
    L('and none of it was ever worth the cost.'),
  ]);
  song.sections = [verse, chorus, verse2];
  song.arrangement = [
    { id: uid(), sectionId: verse.id },
    { id: uid(), sectionId: chorus.id },
    { id: uid(), sectionId: verse2.id },
    { id: uid(), sectionId: chorus.id },
  ];
  song.roll.text =
    'This is the Roll — cheap paper, one long scroll. Type fast and keep going. ' +
    'Backspace never erases a finished word here: it strikes it through, so nothing is lost.\n\n' +
    'Flip the LATCH and the carriage only goes forward: no backspace, and the lines behind you fold away so you can\'t reread and judge.\n\n' +
    'Later, pick up the PEN and tap the lines that glow, then PUNCH them out onto the TABLE.\n';
  song.roll.marks = [];
  return song;
}

const CAUGHT = [
  'the moon is a coin I never spent',
  'your name in the steam on the bus window',
  'a bridge that only exists in fog',
  'nobody tells the pigeons about the weather',
  'second-hand sweater, first-hand love',
  'we were all just waiting for the kettle',
  'gravity is the only friend who stays',
  'the last good song on the last bad night',
];

const CUT = ['the jukebox only knows one sad song', 'a key that fits a house we sold'];

export function seedScraps(): Scrap[] {
  const now = Date.now();
  return [
    ...CAUGHT.map((text, i) => ({ id: uid(), text, from: 'catch' as const, createdAt: now - i * 3_600_000, used: 0 })),
    ...CUT.map((text, i) => ({ id: uid(), text, from: 'cut' as const, createdAt: now - (i + 9) * 3_600_000, used: 0 })),
  ];
}

export { newLine };
