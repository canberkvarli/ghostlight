import type { Medium } from '../theme/medium';

/**
 * The greeting on Search home.
 *
 * It replaced a wordmark and a tagline, which is a bigger change than it looks:
 * the first thing the app says is now a question rather than its own name. The
 * launch screen does the brand; by the time you are here you know what this is.
 *
 * ## Why it is not a ticker
 *
 * The first version cycled every 3.6s. It was the liveliest thing on a still
 * screen, which meant it was the thing you watched instead of the thing you came
 * to do, and a line that changes while you are reading it is a line you read
 * twice. One is picked when the screen mounts and it does not move again. Across
 * launches it varies, so the app does not feel like it only knows one sentence.
 *
 * ## Why they are segmented
 *
 * The emphasised word is italic and orange, and it is in a different place in
 * every prompt ("what do you NEED tonight" vs "say it the way you would SAY
 * IT"). Markup in a string would mean parsing it at render; two lines of typed
 * segments means the layout can guarantee each line holds together on one line.
 *
 * Keep both lines SHORT. Search sizes the headline from the window width so
 * neither line ever wraps or clips, and the longer these get the smaller the
 * greeting is on every phone.
 */

export interface Piece {
  t: string;
  /** Italic, in the house's glow colour. One per prompt, at most. */
  em?: boolean;
}

/** Exactly two lines. The container reserves room for two and no more. */
export type Prompt = [Piece[], Piece[]];

const THEATRE: Prompt[] = [
  [[{ t: 'What do you' }], [{ t: 'need', em: true }, { t: ' tonight?' }]],
  [[{ t: 'Who are you' }], [{ t: 'reading', em: true }, { t: ' for?' }]],
  [[{ t: 'What is the' }], [{ t: 'audition', em: true }, { t: ' asking?' }]],
  [[{ t: 'Say it the way' }], [{ t: 'you would ' }, { t: 'say it.', em: true }]],
];

const SCREEN: Prompt[] = [
  [[{ t: 'What are you' }], [{ t: 'shooting', em: true }, { t: ' for?' }]],
  [[{ t: 'What does the' }], [{ t: 'tape', em: true }, { t: ' need?' }]],
  [[{ t: 'Whose scene' }], [{ t: 'are you ' }, { t: 'taking?', em: true }]],
  [[{ t: 'Say it to' }], [{ t: 'the ' }, { t: 'camera.', em: true }]],
];

/**
 * How many prompts each house has. The two lists are the same length on purpose:
 * Search picks ONE index for the whole session and reads it out of whichever
 * house you are standing in, so switching to Film & TV changes the words without
 * re-rolling the greeting — the screen stays the screen you opened.
 */
export const PROMPT_COUNT = THEATRE.length;

export function promptAt(medium: Medium, index: number): Prompt {
  const list = medium === 'screen' ? SCREEN : THEATRE;
  return list[index % list.length];
}

/** Rolled once, in a `useState` initialiser. Never on an interval. */
export function pickPromptIndex(): number {
  return Math.floor(Math.random() * PROMPT_COUNT);
}
