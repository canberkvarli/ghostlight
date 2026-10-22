// Carried from actorrise lib/rehearsal (commit 9e3414b9). Pure; keep in step with the web,
// the server's line contract and journal are shared.

/**
 * Word matching for rehearsal — deciding whether the actor said the word on the page.
 *
 * This replaces a soundex-based matcher that failed in three specific ways, all of
 * which an actor experiences as "it doesn't hear me":
 *
 *   1. Hyphenated words were stripped to a single token, so the line "Twenty-four."
 *      became `twentyfour` and could never match the `twenty four` a microphone hears.
 *   2. Soundex truncates to four characters, so it both missed real matches on long
 *      words and collided on unrelated ones.
 *   3. Nothing handled speech recognition splitting or joining words, which is
 *      exactly what it does to names it doesn't know: "Anita" arrives as "a nita".
 *
 * Everything here is pure, so the behaviour is pinned by lib/word-match.test.ts
 * rather than by running a rehearsal and listening.
 */

/* ─── Normalizing ────────────────────────────────────────────────────── */

/**
 * Fold text to bare lowercase words.
 *
 * Hyphens and dashes become spaces (they separate spoken words), apostrophes
 * simply vanish (they don't — "I've" is one word), and a missing space after
 * sentence punctuation is repaired so "talk.We" reads as two words.
 */
export function normWords(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―−-]+/g, ' ') // hyphens and dashes separate words
    .replace(/([.!?;:,])([a-z0-9])/gi, '$1 $2') // "talk.We" → "talk. We"
    .replace(/['‘’`]/g, '') // apostrophes never separate
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Normalized words of a line, in order. */
export function tokenize(s: string): string[] {
  const n = normWords(s);
  return n ? n.split(' ').filter(Boolean) : [];
}

/* ─── Canonical forms ────────────────────────────────────────────────── */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Spell a number the way it is said, with no separators: 24 → "twentyfour". */
function spellNumber(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ONES[n % 10] : '');
  if (n < 1000) {
    const rest = n % 100;
    return ONES[Math.floor(n / 100)] + 'hundred' + (rest ? spellNumber(rest) : '');
  }
  const rest = n % 1000;
  return spellNumber(Math.floor(n / 1000)) + 'thousand' + (rest ? spellNumber(rest) : '');
}

/**
 * Contractions, mapped to their expansion with the space removed.
 *
 * A script writes "I've" but an actor may well say "I have", and either is a
 * correct delivery of the line. Joining without a space lets the span matcher
 * line "ive" up against the two tokens "i have".
 */
const CONTRACTIONS: Record<string, string> = {
  im: 'iam', ive: 'ihave', ill: 'iwill', id: 'iwould',
  youre: 'youare', youve: 'youhave', youll: 'youwill', youd: 'youwould',
  hes: 'heis', shes: 'sheis', its: 'itis', thats: 'thatis', whats: 'whatis',
  theres: 'thereis', heres: 'hereis', whos: 'whois', lets: 'letus',
  were: 'weare', weve: 'wehave', well: 'wewill', wed: 'wewould',
  theyre: 'theyare', theyve: 'theyhave', theyll: 'theywill', theyd: 'theywould',
  dont: 'donot', doesnt: 'doesnot', didnt: 'didnot',
  cant: 'cannot', couldnt: 'couldnot', wont: 'willnot', wouldnt: 'wouldnot',
  shouldnt: 'shouldnot', isnt: 'isnot', arent: 'arenot', wasnt: 'wasnot',
  werent: 'werenot', hasnt: 'hasnot', havent: 'havenot', hadnt: 'hadnot',
  aint: 'amnot',
};

/** The form a word is compared in: numerals spelled out, contractions expanded. */
function canonical(w: string): string {
  if (/^\d+$/.test(w)) {
    const n = parseInt(w, 10);
    if (n >= 0 && n < 1_000_000) return spellNumber(n);
  }
  return CONTRACTIONS[w] ?? w;
}

/* ─── Phonetics ──────────────────────────────────────────────────────── */

/**
 * A rough sound-alike key: consonant skeleton with common digraphs folded.
 *
 * Unlike soundex this doesn't truncate, so long words stay distinguishable
 * ("ferguson" and "fergusen" agree; "ferguson" and "forgiveness" don't).
 */
function phoneticKey(w: string): string {
  let key = PHONETIC_KEYS.get(w);
  if (key === undefined) {
    // Seventeen regex passes a word, on every delta, for words the line
    // repeats: worth remembering. Bounded so a long session cannot grow it.
    if (PHONETIC_KEYS.size >= PHONETIC_CACHE_LIMIT) PHONETIC_KEYS.clear();
    key = computePhoneticKey(w);
    PHONETIC_KEYS.set(w, key);
  }
  return key;
}

const PHONETIC_KEYS = new Map<string, string>();
const PHONETIC_CACHE_LIMIT = 5000;

function computePhoneticKey(w: string): string {
  let s = w
    .replace(/^(kn|gn|wr)/, 'n')
    .replace(/^ps/, 's')
    .replace(/ough/g, 'o')
    .replace(/ph/g, 'f')
    .replace(/gh/g, '')
    .replace(/ck/g, 'k')
    .replace(/qu?/g, 'k')
    .replace(/[cs]h/g, 'x')
    .replace(/th/g, '0')
    .replace(/ti(on|al)/g, 'xn')
    .replace(/c([eiy])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/z/g, 's')
    .replace(/mb$/, 'm');

  // Keep the first character even if it's a vowel — word openings carry a lot of
  // identity — then drop vowels from the rest.
  const head = s.slice(0, 1);
  const tail = s.slice(1).replace(/[aeiouyh]/g, '');
  s = head + tail;

  return s.replace(/(.)\1+/g, '$1'); // collapse doubles
}

/** Levenshtein distance, iterative single-row. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Shortest word that may be compared by sound rather than spelling. */
export const PHONETIC_MIN_LENGTH = 4;
/** How alike two words must look to count as the same word misheard. */
const SIMILARITY_FLOOR = 0.8;

/**
 * Are these two normalized words the same word?
 *
 * Exact first, then canonical (numeral or contraction), then — for words long
 * enough that a coincidence is unlikely — by sound or by spelling distance.
 * Short words are held to exact matching only: under any phonetic scheme "be"
 * and "by" collapse together, and half a line lighting up on one syllable is
 * far worse than a missed highlight.
 */
export function wordsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const ca = canonical(a);
  const cb = canonical(b);
  if (ca === cb) return true;

  if (ca.length < PHONETIC_MIN_LENGTH || cb.length < PHONETIC_MIN_LENGTH) return false;

  if (phoneticKey(ca) === phoneticKey(cb)) return true;

  // The distance is at least the difference in length, so a pair that far
  // apart cannot reach the floor: skip the table.
  const longest = Math.max(ca.length, cb.length);
  if (1 - Math.abs(ca.length - cb.length) / longest < SIMILARITY_FLOOR) return false;

  const distance = levenshtein(ca, cb);
  const similarity = 1 - distance / Math.max(ca.length, cb.length);
  return similarity >= SIMILARITY_FLOOR;
}

/* ─── Alignment ──────────────────────────────────────────────────────── */

/**
 * How far past the reading position a single heard word may land.
 *
 * This is the guard against the leap. The old walk was greedy: for each
 * written word it took the FIRST matching word anywhere in the rest of the
 * transcript. A common word not yet said ("I", "you", "the") would find its
 * twin far down the transcript, the cursor would jump there, and every word in
 * between was stranded. On a long line that read as the highlight hopping
 * ahead, falling back on the next delta, hopping again: Canberk, rehearsing,
 * "it would jump lines, flicker a lot, like it was jumping onto other words".
 *
 * Five words is roughly what a streaming transcriber drops or garbles in a
 * row before it recovers, so a real skip of a misheard phrase still lines up,
 * while a "you" twelve words ahead cannot be reached on its own.
 */
export const LOOKAHEAD = 5;

/**
 * How many words in a row must agree before the alignment believes a jump
 * further than LOOKAHEAD.
 *
 * Actors do skip: a phrase dropped, a half line cut on the night. When they
 * pick the line up again the next few words all agree with the page, and
 * that agreement is what tells a real skip apart from one common word that
 * happens to recur. One word is a coincidence; three in a row is the actor.
 */
export const ANCHOR_RUN = 3;

/** One stretch of the line matched against one stretch of what was heard. */
export interface WordMatch {
  /** Written words `expectedStart` up to, not including, `expectedEnd`. */
  expectedStart: number;
  expectedEnd: number;
  /** Heard words `transcriptStart` up to, not including, `transcriptEnd`. */
  transcriptStart: number;
  transcriptEnd: number;
}

export interface AlignOptions {
  /**
   * Where the actor is believed to be reading already (an index into
   * `expected`). The look-ahead window is also measured from here, so a
   * transcript whose opening words were revised away does not lose its place.
   */
  from?: number;
  lookahead?: number;
}

/*
 * The objective. Each matched written word is worth MATCH_WEIGHT; among
 * alignments with the same number of matched words, the one whose matches sit
 * EARLIEST in the line wins (the sum of their start indices is subtracted).
 * That makes "no no no" heard as "no" light the first "no", not the third,
 * and, more to the point, keeps a tie from ever being broken by leaping ahead.
 * The weight only has to exceed the largest possible index sum.
 */
const MATCH_WEIGHT = 1e7;

/* The shapes a match can take, for walking the best path back. */
const ONE_ONE = 1; // one written word, one heard word
const ONE_TWO = 2; // one written word heard as two: "Anita" → "a nita"
const TWO_ONE = 3; // two written words heard as one: "twenty four" → "twentyfour"

/**
 * Line up what was said against what was written: the alignment with the most
 * written words matched, in order, that never leaps.
 *
 * It is monotonic in both directions, so a word that appears twice in a line
 * is matched where it was actually said, and it is OPTIMAL rather than greedy,
 * so an early word the actor has not reached can never claim a later twin at
 * the expense of the words in between: "swear I never" against the page's "I
 * swear I never" matches swear, I, never, not the first "I" alone.
 *
 * Two bounds keep it honest about where the actor is:
 *
 *   - a match may start at most LOOKAHEAD written words past the end of the
 *     match before it (or past `from`), and
 *   - a longer jump is allowed only where ANCHOR_RUN words in a row agree,
 *     which is what a real skipped phrase looks like and a stray "you" does
 *     not.
 *
 * Spans in both directions are tried because recognition splits and joins
 * words constantly: "Anita" comes back as "a nita", "twenty four" as
 * "twentyfour". Heard words that match nothing (an ad lib, a filler, a
 * transcriber's guess) are passed over freely.
 *
 * The programme is kept over match ENDS: best[i][j] is the best alignment
 * whose last match finishes at written word i and heard word j. A match
 * starting at (i, j) extends the best of the cells it may follow: any row
 * from i - LOOKAHEAD to i, at any column up to j, read off a running maximum
 * along each row; or, for a far jump, any row at all, read off a running
 * maximum down the rows. That makes it O(line × transcript × LOOKAHEAD) with
 * small constants: a 200-word line against a 200-word transcript, far longer
 * than any speech, aligns in about a millisecond, on every delta.
 *
 * @returns the matches in line order.
 */
export function alignMatches(expected: string[], transcript: string[], options: AlignOptions = {}): WordMatch[] {
  const N = expected.length;
  const T = transcript.length;
  if (!N || !T) return [];

  /* The common case first: an actor reading accurately produces a transcript
     that IS the start of the line, word for word. Words that agree exactly
     from the top are the best reading of themselves (nothing sits earlier,
     and a span could only light a written word on a heard word that is
     exactly the word before it, which is wrong), so they are taken as they
     stand and only the rest goes through the programme, which then starts
     with its last match at the end of that run. This is the usual diff
     prefix trim, and it keeps a long, cleanly read speech cheap. */
  let agree = 0;
  while (agree < N && agree < T && expected[agree] === transcript[agree]) agree++;
  if (agree > 0) {
    const head: WordMatch[] = Array.from({ length: agree }, (_, k) => (
      { expectedStart: k, expectedEnd: k + 1, transcriptStart: k, transcriptEnd: k + 1 }));
    const rest = alignMatches(expected.slice(agree), transcript.slice(agree), {
      ...options, from: Math.max(0, (options.from ?? 0) - agree),
    });
    return head.concat(rest.map(m => ({
      expectedStart: m.expectedStart + agree, expectedEnd: m.expectedEnd + agree,
      transcriptStart: m.transcriptStart + agree, transcriptEnd: m.transcriptEnd + agree,
    })));
  }

  const window = options.lookahead ?? LOOKAHEAD;
  const reach = (options.from ?? 0) + window; // a match starting at or before this is always in reach

  /* wordsMatch is the expensive part, and a line and its transcript repeat
     their words, so each distinct pair is compared once. Every string either
     side can offer (a word, or two words joined for the spans) is given a
     number, and the answers live in a flat table indexed by the two numbers. */
  const writtenIds = new Map<string, number>();
  const heardIds = new Map<string, number>();
  const intern = (ids: Map<string, number>, s: string) => {
    let id = ids.get(s);
    if (id === undefined) { id = ids.size; ids.set(s, id); }
    return id;
  };
  const written1 = expected.map(w => intern(writtenIds, w));
  const written2 = expected.map((w, i) => {
    if (i + 1 >= N) return -1;
    const joined = w + expected[i + 1];
    return joined.length >= PHONETIC_MIN_LENGTH ? intern(writtenIds, joined) : -1;
  });
  const heard1 = transcript.map(w => intern(heardIds, w));
  const heard2 = transcript.map((w, j) => (j + 1 < T ? intern(heardIds, w + transcript[j + 1]) : -1));
  const writtenList = [...writtenIds.keys()];
  const heardList = [...heardIds.keys()];
  const H = heardList.length;
  const answers = new Uint8Array(writtenList.length * H); // 0 unknown, 1 same, 2 different
  const same = (w: number, h: number) => {
    if (w < 0 || h < 0) return false;
    const k = w * H + h;
    if (!answers[k]) answers[k] = wordsMatch(writtenList[w], heardList[h]) ? 1 : 2;
    return answers[k] === 1;
  };

  // Cells are (written i, heard j), 0..N by 0..T, flattened row by row.
  const W1 = T + 1;
  const cells = (N + 1) * W1;

  // One-to-one agreement, and how many words in a row agree from each pair.
  const oneOne = new Uint8Array(cells);
  for (let i = 0; i < N; i++) for (let j = 0; j < T; j++) oneOne[i * W1 + j] = same(written1[i], heard1[j]) ? 1 : 0;
  const run = new Uint16Array(cells);
  for (let i = N - 1; i >= 0; i--) {
    for (let j = T - 1; j >= 0; j--) {
      if (oneOne[i * W1 + j]) run[i * W1 + j] = 1 + run[(i + 1) * W1 + j + 1];
    }
  }

  const best = new Float64Array(cells).fill(-1); // an alignment whose last match ends exactly here
  const prev = new Int32Array(cells).fill(-1); // the cell its previous match ended at
  const shape = new Uint8Array(cells); // and the shape of the match that ends here
  const rowMax = new Float64Array(cells); // best along this row, at or left of j
  const rowArg = new Int32Array(cells);
  const allMax = new Float64Array(cells); // rowMax over this row and every row above it
  const allArg = new Int32Array(cells);
  best[0] = 0; // nothing matched yet: the start

  const extend = (to: number, v: number, from: number, kind: number) => {
    if (v > best[to]) { best[to] = v; prev[to] = from; shape[to] = kind; }
  };

  // A match only ever ends on a later row than it starts, so by the time row i
  // is reached every match that can end on it has been tried.
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= T; j++) {
      const c = i * W1 + j;
      if (j > 0 && rowMax[c - 1] >= best[c]) { rowMax[c] = rowMax[c - 1]; rowArg[c] = rowArg[c - 1]; }
      else { rowMax[c] = best[c]; rowArg[c] = c; }
      if (i > 0 && allMax[c - W1] > rowMax[c]) { allMax[c] = allMax[c - W1]; allArg[c] = allArg[c - W1]; }
      else { allMax[c] = rowMax[c]; allArg[c] = rowArg[c]; }

      if (i >= N || j >= T) continue;
      /* A span is for a word split or joined, and only then: if either word
         on its own already matches, the span is not taken. Without this the
         optimiser would happily read "swear" as "I swear" (the two joined are
         one letter off), lighting an "I" nobody said, because a span that
         gains a word always beats a match that does not. */
      const can11 = oneOne[c] === 1;
      const can12 = j + 1 < T && !can11 && !oneOne[c + 1] && same(written1[i], heard2[j]);
      const can21 = i + 1 < N && !can11 && !oneOne[c + W1] && same(written2[i], heard1[j]);
      if (!can11 && !can12 && !can21) continue;

      // What a match starting here may follow: the best within the window
      // above, or anything at all when the actor was already believed to be
      // near here (`from`)...
      let near = -1;
      let nearFrom = -1;
      if (i <= reach) { near = allMax[c]; nearFrom = allArg[c]; }
      else {
        for (let r = Math.max(0, i - window); r <= i; r++) {
          const k = r * W1 + j;
          if (rowMax[k] > near) { near = rowMax[k]; nearFrom = rowArg[k]; }
        }
      }
      // ...or, for a word that starts ANCHOR_RUN in a row agreeing, anything
      // at all: the actor skipped and picked the line up again. Only a 1:1 run
      // can anchor a jump; a span is too loose to be trusted that far.
      let v11 = near;
      let from11 = nearFrom;
      if (can11 && run[c] >= ANCHOR_RUN && allMax[c] > v11) { v11 = allMax[c]; from11 = allArg[c]; }
      if (can11 && v11 >= 0) extend(c + W1 + 1, v11 + MATCH_WEIGHT - i, from11, ONE_ONE);
      if (near < 0) continue;
      if (can12) extend(c + W1 + 2, near + MATCH_WEIGHT - i, nearFrom, ONE_TWO);
      if (can21) extend(c + 2 * W1 + 1, near + 2 * MATCH_WEIGHT - 2 * i - 1, nearFrom, TWO_ONE);
    }
  }

  // The best alignment overall. Heard words after its last match are passed
  // over, so any cell can end it; of equals, the lowest row (the fewest
  // written words consumed) wins, so the reading position it implies is the
  // most cautious one.
  let end = 0;
  let endValue = -1;
  for (let i = 0; i <= N; i++) {
    const c = i * W1 + T;
    if (rowMax[c] > endValue) { endValue = rowMax[c]; end = rowArg[c]; }
  }

  const matches: WordMatch[] = [];
  for (let c = end; c !== 0; c = prev[c]) {
    const i = Math.floor(c / W1);
    const j = c - i * W1;
    const dw = shape[c] === TWO_ONE ? 2 : 1;
    const dh = shape[c] === ONE_TWO ? 2 : 1;
    matches.push({ expectedStart: i - dw, expectedEnd: i, transcriptStart: j - dh, transcriptEnd: j });
  }
  return matches.reverse();
}

/**
 * Which written words the alignment reached.
 *
 * @returns indices into `expected` that were matched.
 */
export function alignWords(expected: string[], transcript: string[], options: AlignOptions = {}): Set<number> {
  const matched = new Set<number>();
  for (const m of alignMatches(expected, transcript, options)) {
    for (let e = m.expectedStart; e < m.expectedEnd; e++) matched.add(e);
  }
  return matched;
}

/** Fraction of the written line the actor actually reached (0–1). */
export function wordMatchScore(expected: string, transcript: string): number {
  const expectedWords = tokenize(expected);
  if (!expectedWords.length) return 1;
  return alignWords(expectedWords, tokenize(transcript)).size / expectedWords.length;
}
