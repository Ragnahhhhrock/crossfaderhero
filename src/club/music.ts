/** The broad style of what's playing: decides how the floor dances and what the podium dancers wear. */
export type Music = 'house' | 'techno' | 'trance' | 'dnb' | 'hiphop' | 'disco' | 'chill';

export const MUSICS: Music[] = ['house', 'techno', 'trance', 'dnb', 'hiphop', 'disco', 'chill'];

// first match wins, so the more specific families come first
const RULES: [RegExp, Music][] = [
  [/drum.?(and|n|&|'n'|’n’).?bass|\bd.?n.?b\b|jungle|liquid|neuro|footwork|juke/i, 'dnb'],
  [/trance|psy|goa|hard.?style|euro.?dance|happy.?hardcore|uplifting/i, 'trance'],
  [/hip.?hop|\brap\b|trap|r\s*&\s*b|\brnb\b|r'n'b|boom.?bap|drill|grime|urban/i, 'hiphop'],
  [/techno|industrial|\bebm\b|minimal|schranz|dubstep|riddim|hardcore|gabber/i, 'techno'],
  [/disco|funk|soul|boogie|motown|\bpop\b|dance.?pop|70s|80s/i, 'disco'],
  [/house|garage|\bukg\b|2.?step|afro|amapiano|electro|\bedm\b|big.?room|progressive|dance/i, 'house'],
  [/chill|ambient|downtempo|lo.?fi|trip.?hop|balearic|lounge|jazz|reggae|\bdub\b|acoustic/i, 'chill'],
];

/** The style for a track: its genre tag if we recognise it, otherwise a guess from the tempo. */
export function musicStyle(genre: string | undefined, bpm: number): Music {
  const g = (genre ?? '').trim();
  if (g) for (const [re, m] of RULES) if (re.test(g)) return m;
  if (!(bpm > 0)) return 'house';
  if (bpm < 88) return 'chill';
  if (bpm < 102) return 'hiphop';
  if (bpm < 118) return 'disco';
  if (bpm < 129) return 'house';
  if (bpm < 136) return 'techno';
  if (bpm < 160) return 'trance';
  return 'dnb';
}
