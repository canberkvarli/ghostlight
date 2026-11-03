import { pick } from '../i18n/pick';

/**
 * The server reads a script aloud as it goes, one short line at a time
 * ("Found 2 characters", "Mapping acts"); the phone folds those into the
 * same few steps the website shows, in the same order, so the map is one map
 * on both. A raw line that matches nothing keeps the step it is on.
 */
const GROUPS: { match: string; step: number }[] = [
  { match: 'Opening', step: 0 },
  { match: 'Read ', step: 1 },
  { match: 'Stripped', step: 1 },
  { match: 'Found cached', step: 1 },
  { match: 'Analyzing', step: 2 },
  { match: 'Learning', step: 3 },
  { match: 'Found ', step: 5 },
  { match: 'Mapping', step: 4 },
  { match: 'Detected', step: 4 },
  { match: 'No act', step: 4 },
  { match: 'Pulling', step: 5 },
  { match: 'Regex parsed', step: 5 },
  { match: 'Skipped', step: 5 },
  { match: 'No scenes', step: 5 },
  { match: 'Extracting', step: 5 },
  { match: 'Filtered', step: 6 },
  { match: 'Set aside', step: 6 },
  { match: 'Folded', step: 6 },
  { match: 'Extracted', step: 6 },
  { match: 'rehearsal-ready', step: 6 },
  { match: 'No title page', step: 7 },
  { match: 'Figuring', step: 8 },
  { match: 'Analyzed', step: 8 },
  { match: 'Cleaning', step: 9 },
  { match: 'AI cleanup', step: 9 },
];

/** The map, in order, in the phone's words, in the app's language. */
export function scriptSteps(): string[] {
  return [
    pick('opening the script.', 'metin açılıyor.'),
    pick('reading every page.', 'her sayfa okunuyor.'),
    pick('finding the scenes.', 'sahneler bulunuyor.'),
    pick('learning who the characters are.', 'karakterler tanınıyor.'),
    pick('mapping the acts and scenes.', 'perdeler ve sahneler çıkarılıyor.'),
    pick('pulling every line of dialogue.', 'her replik ayıklanıyor.'),
    pick('setting the rehearsal scenes.', 'prova sahneleri hazırlanıyor.'),
    pick('naming the script.', 'metne ad veriliyor.'),
    pick('reading the tone of it.', 'havası okunuyor.'),
    pick('cleaning up the dialogue.', 'replikler temizleniyor.'),
  ];
}

/** How many steps the map has (the same in every language). */
export const SCRIPT_STEP_COUNT = 10;

/** Which step a raw server line belongs to, or null when it names none. */
export function stepOf(raw: string): number | null {
  for (const g of GROUPS) if (raw.includes(g.match)) return g.step;
  return null;
}

/** How long is left, as a person would say it: never a countdown, always an "about". */
export function aboutLeft(left: number | null): string {
  if (left === null) return pick('a minute or two.', 'bir iki dakika.');
  if (left <= 15) return pick('nearly there.', 'az kaldı.');
  if (left < 60) return pick('under a minute.', 'bir dakikadan az.');
  const m = Math.round(left / 60);
  return m <= 1 ? pick('about a minute.', 'aşağı yukarı bir dakika.') : pick(`about ${m} minutes.`, `aşağı yukarı ${m} dakika.`);
}
