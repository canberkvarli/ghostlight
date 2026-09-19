/**
 * The results list is laid out on a fixed grid on purpose.
 *
 * The scroll spotlight needs to know where every card sits in order to decide
 * which one is under the light, and it needs to know it on the UI thread with
 * no measurement and no JavaScript. Fixed row heights turn that into a
 * multiplication. Every card therefore clamps its own text (name one line,
 * excerpt two) so the height is a promise the card can keep.
 */

/**
 * Raised from 172 for the v2 card, which carries more: a margin column with a
 * roman numeral, and a row of marks under the excerpt.
 *
 * The marks are the reason this is 196 rather than the ~178 the content adds up
 * to. "everyone brings this" and a source tag fit on one line on a 402pt phone
 * and need two on a 375pt one, and a mark that falls off the paper is worse than
 * a card with some air in it — so the card reserves both rows and the text
 * column distributes the slack with `space-between`. On the common one-row case
 * the extra sits between the excerpt and the marks, where it reads as margin.
 */
export const CARD_HEIGHT = 196;
export const CARD_GAP = 14;
export const ROW_HEIGHT = CARD_HEIGHT + CARD_GAP;

export const LIST_PADDING_TOP = 8;
/**
 * The header block, and NOT a cosmetic constant: `cardTop` and the
 * scroll-spotlight reaction both offset by it, so it must match StageHeader's
 * actual rendered height.
 *
 * It lost the lamp in v2 (the light belongs on Search and on the launch screen;
 * a third one here made it decoration) and gained the query echo. The 48 at the
 * top is clearance for the back row, which is absolutely positioned OVER the
 * list rather than above it — keeping it out of the list is what lets the
 * spotlight arithmetic stay in list-viewport coordinates.
 *
 *   48  back row clearance
 *   38  stage direction, two lines reserved
 *    8  +
 *   46  the count, Instrument Serif 40
 *   10  +
 *   38  the query echo, two lines reserved
 *   18  air before the first card
 */
export const HEADER_HEIGHT = 206;

/** Top of a card in content coordinates. */
export function cardTop(index: number): number {
  'worklet';
  return HEADER_HEIGHT + LIST_PADDING_TOP + index * ROW_HEIGHT;
}

/**
 * Where the light hangs, as a fraction of viewport height. Slightly above true
 * centre — a lit card reads better with more room beneath it than above.
 */
export const FOCUS_POINT = 0.42;

/** Distance from the focus point at which a card has fallen to full stage dark. */
export const FALLOFF = 0.4;

/** The margin column: wide enough for a roman numeral, or for a poster. */
export const MARGIN_COL = 34;
export const MARGIN_COL_POSTER = 72;
