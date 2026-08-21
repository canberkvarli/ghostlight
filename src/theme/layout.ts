/**
 * The results list is laid out on a fixed grid on purpose.
 *
 * The scroll spotlight needs to know where every card sits in order to decide
 * which one is under the light, and it needs to know it on the UI thread with
 * no measurement and no JavaScript. Fixed row heights turn that into a
 * multiplication. Every card therefore clamps its own text (title one line,
 * excerpt two) so the height is a promise the card can keep.
 */

export const CARD_HEIGHT = 172;
export const CARD_GAP = 14;
export const ROW_HEIGHT = CARD_HEIGHT + CARD_GAP;

export const LIST_PADDING_TOP = 8;
export const HEADER_HEIGHT = 196;

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
