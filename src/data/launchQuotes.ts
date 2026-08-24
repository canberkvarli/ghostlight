/**
 * A line from the repertoire, picked fresh each launch — the thing you read
 * while the lamp comes up.
 *
 * Deliberately public domain. Short quotation of a modern film would very
 * likely be fair use, but "very likely" is not a thing worth arguing on a
 * commercial app's launch screen, and the classical canon is closer to what the
 * app is for anyway. Add film lines here if you decide the risk is worth it.
 *
 * Keep them SHORT. This renders centred over the lamp at 15px and is clamped to
 * two lines; anything much past 60 characters starts to look like a paragraph
 * and fights the stillness the launch sequence is going for.
 */

export type LaunchQuote = { line: string; source: string };

export const LAUNCH_QUOTES: LaunchQuote[] = [
  { line: 'The play’s the thing.', source: 'Hamlet' },
  { line: 'All the world’s a stage.', source: 'As You Like It' },
  { line: 'We know what we are, but know not what we may be.', source: 'Hamlet' },
  { line: 'Nothing will come of nothing.', source: 'King Lear' },
  { line: 'I am not what I am.', source: 'Othello' },
  { line: 'Action is eloquence.', source: 'Coriolanus' },
  { line: 'The rest is silence.', source: 'Hamlet' },
  { line: 'The truth is rarely pure and never simple.', source: 'The Importance of Being Earnest' },
  { line: 'We must live, Uncle Vanya.', source: 'Uncle Vanya' },
  { line: 'I am a seagull. No, that’s not it.', source: 'The Seagull' },
  { line: 'Nothing to be done.', source: 'Waiting for Godot' },
  { line: 'Attention must be paid.', source: 'Death of a Salesman' },
  { line: 'The night is young, and we are not.', source: 'The Seagull' },
  { line: 'Give me my robe, put on my crown.', source: 'Antony and Cleopatra' },
];

/** One line per launch. Not stable across launches — that's the point. */
export function pickLaunchQuote(): LaunchQuote {
  return LAUNCH_QUOTES[Math.floor(Math.random() * LAUNCH_QUOTES.length)];
}
