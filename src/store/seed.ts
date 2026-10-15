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
    'This is the roll. Type fast, don\'t fix anything. Flip the amber LATCH and backspace turns into ghost ink — ' +
    'nothing you write is ever lost.\n\nWhen you\'re done, switch to the GREASE pencil, press-and-drag over the lines that glow, ' +
    'then hit PUNCH. They land on the TABLE as strips you can cut up and re-shuffle, and from there they slot into the BENCH.\n';
  song.roll.marks = [];
  return song;
}

const SPARKS = [
  'the moon is a coin I never spent',
  'your name in the steam on the bus window',
  'a bridge that only exists in fog',
  'nobody tells the pigeons about the weather',
  'second-hand sweater, first-hand love',
  'we were all just waiting for the kettle',
  'gravity is the only friend who stays',
  'the last good song on the last bad night',
];

export function seedScraps(): Scrap[] {
  const now = Date.now();
  return SPARKS.map((text, i) => ({ id: uid(), text, kind: 'spark' as const, createdAt: now - i * 1000, used: 0 }));
}

export { newLine };
