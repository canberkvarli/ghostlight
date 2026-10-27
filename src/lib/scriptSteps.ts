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

/** The map, in order, in the phone's words. */
export const SCRIPT_STEPS = [
  'opening the script.',
  'reading every page.',
  'finding the scenes.',
  'learning who the characters are.',
  'mapping the acts and scenes.',
  'pulling every line of dialogue.',
  'setting the rehearsal scenes.',
  'naming the script.',
  'reading the tone of it.',
  'cleaning up the dialogue.',
];

/** Which step a raw server line belongs to, or null when it names none. */
export function stepOf(raw: string): number | null {
  for (const g of GROUPS) if (raw.includes(g.match)) return g.step;
  return null;
}

/** How long is left, as a person would say it: never a countdown, always an "about". */
export function aboutLeft(left: number | null): string {
  if (left === null) return 'a minute or two.';
  if (left <= 15) return 'nearly there.';
  if (left < 60) return 'under a minute.';
  const m = Math.round(left / 60);
  return m <= 1 ? 'about a minute.' : `about ${m} minutes.`;
}
