/**
 * Step 0 fixture data. Twenty monologues, hardcoded, no network.
 *
 * Shapes deliberately match what `GET /api/monologues/search` returns so that
 * swapping this array for react-query in Step 3 touches the list and nothing else.
 *
 * Every excerpt here is public domain. Real search results will not be.
 */

export type SourceType = 'play' | 'film' | 'tv';
export type Gender = 'female' | 'male' | 'any';
export type Tone = 'dramatic' | 'comedic' | 'seriocomic';

export interface Monologue {
  id: string;
  title: string;
  source: string;
  author: string;
  character: string;
  ageRange: string;
  gender: Gender;
  tone: Tone;
  sourceType: SourceType;
  /** Seconds. The `max_duration` filter reads this. */
  duration: number;
  /** 0–100. Anything over 70 gets the badge; casting directors have heard it. */
  overdoneScore: number;
  /** The first two lines, in Courier. Actors judge a monologue by reading it. */
  excerpt: string;
  /**
   * The whole speech, for the Read screen. Optional in Step 0 — the list only
   * needs the excerpt, and the full text arrives from `GET /api/monologues/{id}`
   * in Step 3. Populated here only for the fixtures worth reading offline.
   */
  fullText?: string;
  /**
   * True when the server withheld the full text because the free reads are
   * spent (spec §7). `fullText` then holds only the teaser; the read screen
   * shows the wall. Server-authoritative — the client can't un-set it.
   */
  paywalled?: boolean;
}

export const MONOLOGUES: Monologue[] = [
  {
    id: 'm-001',
    title: 'To be, or not to be',
    source: 'Hamlet',
    author: 'William Shakespeare',
    character: 'Hamlet',
    ageRange: '20s–30s',
    gender: 'male',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 210,
    overdoneScore: 99,
    excerpt:
      'To be, or not to be, that is the question:\nWhether ’tis nobler in the mind to suffer',
    fullText: `To be, or not to be, that is the question:
Whether ’tis nobler in the mind to suffer
The slings and arrows of outrageous fortune,
Or to take arms against a sea of troubles
And by opposing end them. To die—to sleep,
No more; and by a sleep to say we end
The heart-ache and the thousand natural shocks
That flesh is heir to: ’tis a consummation
Devoutly to be wish’d. To die, to sleep;
To sleep, perchance to dream—ay, there’s the rub:
For in that sleep of death what dreams may come,
When we have shuffled off this mortal coil,
Must give us pause—there’s the respect
That makes calamity of so long life.

For who would bear the whips and scorns of time,
Th’oppressor’s wrong, the proud man’s contumely,
The pangs of dispriz’d love, the law’s delay,
The insolence of office, and the spurns
That patient merit of th’unworthy takes,
When he himself might his quietus make
With a bare bodkin? Who would fardels bear,
To grunt and sweat under a weary life,
But that the dread of something after death,
The undiscover’d country, from whose bourn
No traveller returns, puzzles the will,
And makes us rather bear those ills we have
Than fly to others that we know not of?

Thus conscience does make cowards of us all,
And thus the native hue of resolution
Is sicklied o’er with the pale cast of thought,
And enterprises of great pith and moment
With this regard their currents turn awry
And lose the name of action.`,
  },
  {
    id: 'm-002',
    title: 'The quality of mercy',
    source: 'The Merchant of Venice',
    author: 'William Shakespeare',
    character: 'Portia',
    ageRange: '20s–30s',
    gender: 'female',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 105,
    overdoneScore: 88,
    excerpt:
      'The quality of mercy is not strain’d,\nIt droppeth as the gentle rain from heaven',
  },
  {
    id: 'm-003',
    title: 'I have been a doll-wife',
    source: "A Doll's House",
    author: 'Henrik Ibsen',
    character: 'Nora',
    ageRange: '20s–30s',
    gender: 'female',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 150,
    overdoneScore: 72,
    excerpt:
      'I have been your doll-wife, just as at home I was papa’s doll-child.\nAnd the children have been my dolls in their turn.',
  },
  {
    id: 'm-004',
    title: 'I am twenty-nine years old',
    source: 'Uncle Vanya',
    author: 'Anton Chekhov',
    character: 'Sonya',
    ageRange: '18–25',
    gender: 'female',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 135,
    overdoneScore: 41,
    excerpt:
      'We shall go on living, Uncle Vanya. We shall live through a long, long\nsuccession of days and tedious evenings.',
  },
  {
    id: 'm-005',
    title: 'A handbag?',
    source: 'The Importance of Being Earnest',
    author: 'Oscar Wilde',
    character: 'Lady Bracknell',
    ageRange: '50s+',
    gender: 'female',
    tone: 'comedic',
    sourceType: 'play',
    duration: 95,
    overdoneScore: 84,
    excerpt:
      'To lose one parent, Mr. Worthing, may be regarded as a misfortune;\nto lose both looks like carelessness.',
  },
  {
    id: 'm-006',
    title: 'Now is the winter of our discontent',
    source: 'Richard III',
    author: 'William Shakespeare',
    character: 'Richard',
    ageRange: '30s–40s',
    gender: 'male',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 165,
    overdoneScore: 79,
    excerpt:
      'Now is the winter of our discontent\nMade glorious summer by this sun of York;',
  },
  {
    id: 'm-007',
    title: 'Was this the face',
    source: 'Doctor Faustus',
    author: 'Christopher Marlowe',
    character: 'Faustus',
    ageRange: '30s–50s',
    gender: 'male',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 90,
    overdoneScore: 52,
    excerpt:
      'Was this the face that launch’d a thousand ships,\nAnd burnt the topless towers of Ilium?',
  },
  {
    id: 'm-008',
    title: 'I am a woman, and I have wept',
    source: 'Medea',
    author: 'Euripides',
    character: 'Medea',
    ageRange: '30s–40s',
    gender: 'female',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 180,
    overdoneScore: 63,
    excerpt:
      'Of all things which are living and can form a judgment\nwe women are the most unfortunate creatures.',
  },
  {
    id: 'm-009',
    title: 'All the world’s a stage',
    source: 'As You Like It',
    author: 'William Shakespeare',
    character: 'Jaques',
    ageRange: '40s+',
    gender: 'any',
    tone: 'seriocomic',
    sourceType: 'play',
    duration: 120,
    overdoneScore: 91,
    excerpt:
      'All the world’s a stage,\nAnd all the men and women merely players;',
  },
  {
    id: 'm-010',
    title: 'The seagull, the lake, the girl',
    source: 'The Seagull',
    author: 'Anton Chekhov',
    character: 'Nina',
    ageRange: '18–25',
    gender: 'female',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 145,
    overdoneScore: 58,
    excerpt:
      'I am a seagull. No, that’s not it. Do you remember you shot a seagull?\nA man came by chance, saw it, and destroyed it — a little subject for a story.',
  },
  {
    id: 'm-011',
    title: 'Hath not a Jew eyes?',
    source: 'The Merchant of Venice',
    author: 'William Shakespeare',
    character: 'Shylock',
    ageRange: '40s+',
    gender: 'male',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 110,
    overdoneScore: 74,
    excerpt:
      'Hath not a Jew eyes? Hath not a Jew hands, organs,\ndimensions, senses, affections, passions?',
  },
  {
    id: 'm-012',
    title: 'I am Duchess of Malfi still',
    source: 'The Duchess of Malfi',
    author: 'John Webster',
    character: 'The Duchess',
    ageRange: '30s–40s',
    gender: 'female',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 85,
    overdoneScore: 24,
    excerpt:
      'I am Duchess of Malfi still.\nAm I not thy duchess?',
  },
  {
    id: 'm-013',
    title: 'The miser’s casket',
    source: 'The Miser',
    author: 'Molière',
    character: 'Harpagon',
    ageRange: '50s+',
    gender: 'male',
    tone: 'comedic',
    sourceType: 'play',
    duration: 130,
    overdoneScore: 31,
    excerpt:
      'Thieves! Thieves! Assassins! Murderers! Justice, just heavens!\nI am undone, I am murdered, they have cut my throat, they have stolen my money!',
  },
  {
    id: 'm-014',
    title: 'What a piece of work is a man',
    source: 'Hamlet',
    author: 'William Shakespeare',
    character: 'Hamlet',
    ageRange: '20s–30s',
    gender: 'male',
    tone: 'seriocomic',
    sourceType: 'play',
    duration: 100,
    overdoneScore: 69,
    excerpt:
      'What a piece of work is a man! How noble in reason,\nhow infinite in faculty! In form and moving how express and admirable!',
  },
  {
    id: 'm-015',
    title: 'Out, damned spot',
    source: 'Macbeth',
    author: 'William Shakespeare',
    character: 'Lady Macbeth',
    ageRange: '30s–40s',
    gender: 'female',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 75,
    overdoneScore: 93,
    excerpt:
      'Out, damned spot! Out, I say! One — two — why then ’tis time to do’t.\nHell is murky. Fie, my lord, fie, a soldier and afeard?',
  },
  {
    id: 'm-016',
    title: 'I would not be a queen',
    source: 'Henry VIII',
    author: 'William Shakespeare',
    character: 'Anne Bullen',
    ageRange: '20s',
    gender: 'female',
    tone: 'seriocomic',
    sourceType: 'play',
    duration: 65,
    overdoneScore: 12,
    excerpt:
      'By my troth and maidenhead,\nI would not be a queen.',
  },
  {
    id: 'm-017',
    title: 'The cherry orchard is sold',
    source: 'The Cherry Orchard',
    author: 'Anton Chekhov',
    character: 'Lopakhin',
    ageRange: '30s–40s',
    gender: 'male',
    tone: 'seriocomic',
    sourceType: 'play',
    duration: 155,
    overdoneScore: 37,
    excerpt:
      'I bought it! Wait a moment, ladies and gentlemen, please, my head is\nswimming, I can’t speak. The cherry orchard is mine!',
  },
  {
    id: 'm-018',
    title: 'A room of one’s own',
    source: 'Hedda Gabler',
    author: 'Henrik Ibsen',
    character: 'Hedda',
    ageRange: '20s–30s',
    gender: 'female',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 115,
    overdoneScore: 46,
    excerpt:
      'I often think there is only one thing in the world I have any turn for,\nand that is boring myself to death.',
  },
  {
    id: 'm-019',
    title: 'Tomorrow, and tomorrow',
    source: 'Macbeth',
    author: 'William Shakespeare',
    character: 'Macbeth',
    ageRange: '30s–50s',
    gender: 'male',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 70,
    overdoneScore: 95,
    excerpt:
      'Tomorrow, and tomorrow, and tomorrow,\nCreeps in this petty pace from day to day,',
  },
  {
    id: 'm-020',
    title: 'I have no mockings now',
    source: 'Antigone',
    author: 'Sophocles',
    character: 'Antigone',
    ageRange: '18–25',
    gender: 'female',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 125,
    overdoneScore: 55,
    excerpt:
      'Tomb, bridal chamber, prison forever dug in rock,\nit is to you I am going, to join my people.',
  },
];

/** Overdone badge threshold. Above this, casting has heard it today already. */
export const OVERDONE_THRESHOLD = 70;

export function getMonologueById(id: string): Monologue | undefined {
  return MONOLOGUES.find((m) => m.id === id);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}
