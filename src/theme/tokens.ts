/**
 * Ghost Light tokens for consumers that cannot read Tailwind classes — Skia
 * shaders, Reanimated interpolations, native bars.
 *
 * Mirror of src/global.css. Change one, change the other.
 *
 * The v2 system has two surfaces rather than one theme:
 *
 *   - the STAGE, which flips with the scheme (warm near-black, or warm paper);
 *   - the PAPER a card is made of, which does NOT. A card is a page of sides in
 *     both schemes, so its ink, its rule and its hairline are constants and live
 *     under `paper` below rather than under `dark` / `light`.
 *
 * That split is the whole reason the scheme's `card` is paper on both sides now:
 * reaching for a dark card colour to draw a card was correct when cards were
 * dark-on-dark and would now be precisely the bug — stage-black behind ink.
 */

export const colors = {
  /** Glow orange — every halo, every lit accent, the bulb itself. */
  stageGlow: '#e0731f',
  /** The stand below the bulb; also the outline on the stage. */
  stageLine: '#4a4038',
  /** Brand orange, deeper than the glow: headline italics, source tags, marks. */
  primary: '#c24e10',
  primaryHover: '#a63f08',
  /**
   * The same orange, one step down, for the two places `primary` is a hair under
   * the line:
   *
   *  - as 13–14pt TEXT on the cream stage, where #c24e10 measures 4.14:1 against
   *    the 4.5 small text needs;
   *  - as the fill behind the cream "best pick" mark, where it measures 4.48:1.
   *
   * Both are rounding-error misses rather than design mistakes, and both are
   * fixed by the same value — which is also the ink the source tags already
   * print in, so the marks on a card now share one orange instead of two that
   * are almost the same.
   */
  primaryDeep: '#a8400c',
  /**
   * Gel yellow. ONLY ever a fill behind ink — chips, hard shadows, the arrow
   * disc. Never yellow text on paper: at this chroma it sits at roughly 1.2:1
   * against cream, which is not a contrast ratio, it is a rumour.
   */
  yellow: '#f2e22b',
  /** Near-black ink. The pill fill, the card border, every mark drawn on paper. */
  ink: '#15110f',
  /**
   * The one red in the app: the block that comes out from under a row you
   * slide aside to take out of the book. Warm, a shade under the system red,
   * so it sits with the amber and the cream instead of arriving from iOS.
   * Never text; always a fill under white.
   */
  remove: '#c7392a',

  /**
   * The page a card is printed on. Constant across schemes — see the note above.
   */
  paper: {
    /** Card face on the dark stage. */
    background: '#f3eee6',
    /** Card face on the paper stage, a shade brighter so it still lifts off it. */
    backgroundLight: '#fdfbf7',
    /** Body ink — titles, the words of the play. */
    ink: '#15110f',
    /** The speech in an excerpt: a touch softer than a title, still full contrast. */
    body: '#221c19',
    /** Meta, source lines, stage directions on paper. */
    muted: '#5a5450',
    /** The quietest thing on a card — roman numerals, a year on a cover. */
    faint: '#897e74',
    /** Hairline INSIDE a card (the margin rule, a meta pill's edge). */
    rule: '#dad3c8',
  },

  dark: {
    /** Warm near-black. Never flat black. */
    background: '#130b08',
    /** Cards are paper on both schemes. */
    card: '#f3eee6',
    foreground: '#f7f3ec',
    mutedForeground: '#b5ada3',
    /** Field / chip / outline border on the stage. */
    border: '#4a4038',
    /** A card is drawn, not tinted, so its border is ink in both schemes. */
    cardBorder: '#15110f',
    /** Hairline dividers between rows on the stage. */
    divider: '#31281f',
    /** The unlit segment of a progress / filament meter. */
    inactiveMeter: '#3a2c24',
    /** Chevrons and fine print. */
    chevron: '#b5ada3',
    /** Panels that are stage, not paper — stat tiles, the identity card. */
    panel: '#1b1310',
  },

  light: {
    /** The paper stage. */
    background: '#f3eee6',
    card: '#fdfbf7',
    foreground: '#15110f',
    mutedForeground: '#5a5450',
    border: '#dad3c8',
    cardBorder: '#15110f',
    divider: '#e2dbd0',
    inactiveMeter: '#dad3c8',
    /**
     * Chevrons AND fine print — which is why this had to move. At #7d746b it
     * measured 3.97:1 on the cream stage, and the words it prints are 12–14pt:
     * `(back.)`, "Restore purchases", the quiet way-in row. Those are small text
     * and need 4.5, not the 3.0 a glyph needs. #6f665d clears it at 4.87 and is
     * still a clear step lighter than `mutedForeground` (6.45), so the three
     * levels of quiet on the light stage stay three levels.
     */
    chevron: '#6f665d',
    panel: '#faf6ef',
  },
} as const;

export const radius = {
  /** Paper is cut, not rounded. The v2 card radius. */
  card: 6,
  /** Pills and discs. */
  pill: 999,
  /** The search field — the one generous curve on the stage. */
  field: 32,
} as const;

/**
 * The hard offset shadow that marks the lit card: a yellow block sitting behind
 * the paper with no blur at all, the way a two-colour print misregisters.
 *
 * RN's `shadow*` props cannot draw this — `shadowRadius: 0` still renders a soft
 * alpha edge on iOS and nothing at all on Android — so it is drawn as a real
 * offset View behind the card. See `PaperCard`.
 */
export const hardShadow = {
  offset: 8,
  /** The field and the undo bar sit a little lighter on the page. */
  offsetSmall: 6,
} as const;

/**
 * Alpha stops for the spotlight gradient, straight off the web app's
 * `.stage-spotlight`: glow@16% at the centre, glow@7% at 32%, transparent at 68%.
 */
export const spotlight = {
  innerAlpha: 0.16,
  midAlpha: 0.07,
  midStop: 0.32,
  outerStop: 0.68,
  /** 42rem at the web's 16px root. */
  radius: 672,
} as const;

/** `.stage-wash` — the glow hanging above the top edge of the stage. */
export const wash = {
  alpha: 0.11,
} as const;
