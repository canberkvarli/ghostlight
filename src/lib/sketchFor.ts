import type { Monologue } from '../data/monologues';

export type ThemeSketch = 'skull' | 'rose' | 'dagger' | 'crown' | 'jester' | 'masks';

/**
 * Which drawing a piece gets, from what the catalogue says it is about.
 *
 * Pure and deterministic: the same piece gets the same sketch on the reading
 * page and on the shelf, every launch. Reads the theme tags and the primary
 * emotion, case-insensitively. Each pattern matches at the start of a word, so
 * "rage" finds "rage" and "enraged" but not "courage", and "wit" is a whole
 * word so it never fires on "with".
 *
 * Order is the priority when a piece is tagged with more than one. Violence
 * first, because a revenge speech is nearly always also about death or love
 * and the dagger is the more specific picture. Then death, power, love, and
 * comedy last: comedy is the broadest tag and the tone fallback below.
 */
const RULES: [ThemeSketch, RegExp][] = [
  ['dagger', /\b(reveng|vengean|violen|rage|enrage|fury|furious|wrath|murder|kill|betray|treach|blood)/i],
  ['skull', /\b(death|dead|dying|die\b|grief|griev|mourn|mortal|despair|suicid|loss\b|bereave)/i],
  ['crown', /\b(power|ambiti|authorit|pride|proud|king|queen|throne|crown|tyran|status|control)/i],
  ['rose', /\b(love|lover|desire|longing|romanc|romantic|passion|heartbreak|infatuat|devotion)/i],
  ['jester', /\b(comed|comic|humou?r|absurd|wit\b|witty|farce|satir|fool)/i],
];

export function sketchFor(piece: Pick<Monologue, 'themes' | 'emotion' | 'tone'>): ThemeSketch {
  const tags = [...(piece.themes ?? []), piece.emotion ?? ''].join(' | ');
  if (tags.trim()) {
    for (const [sketch, pattern] of RULES) {
      if (pattern.test(tags)) return sketch;
    }
  }
  // No theme spoke up. A comedic piece still gets the Fool.
  if (piece.tone === 'comedic') return 'jester';
  return 'masks';
}
