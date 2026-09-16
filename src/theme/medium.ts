/**
 * Two houses under one roof.
 *
 * Ghost Light's home is the warm amber stage — the theatre. Toggle to Film & TV
 * and the whole house shifts to a cool marquee violet: a different auditorium,
 * a cinema after hours rather than a playhouse. Same ghost light, different bulb.
 *
 * The palette here overrides the *glow* (bulb, halo, spotlight, lit accents) and,
 * for screen, the stage floor itself. Everything else — the warm reading paper,
 * the typography — is constant, because the medium is a mood, not a rebrand.
 */

export type Medium = 'theatre' | 'screen';

export interface MediumPalette {
  /** The bulb and every glow, as hex. */
  glow: string;
  /** Same, pre-split so Skia/rgba callers don't parse hex on the UI thread. */
  glowRgb: [number, number, number];
  /** Accent / primary — badges, the paid slab, destructive echoes. */
  accent: string;
  /**
   * The house colour as TEXT on the current stage, and the one to reach for
   * whenever the answer would otherwise be "the glow".
   *
   * The glow is tuned to be a light — it has to read against warm near-black, so
   * it is bright, and #e0731f on the cream stage comes out at 2.9:1. That is
   * under the floor for a 40pt headline and nowhere near it for a 14pt row
   * value, which is how "the italic word is orange" quietly became "the italic
   * word is unreadable in light mode". Resolved per scheme: the glow on the dark
   * stage, the deep accent on the paper one.
   */
  accentText: string;
  /** The stand under the bulb. */
  line: string;
  /**
   * The stage floor. Undefined for theatre so it follows the light/dark theme.
   *
   * Screen used to force a violet near-black in BOTH schemes, which is why Film
   * & TV was unreadable in light mode: the floor went near-black while every
   * text class still resolved light (foreground #15110f on #0f0a16). The violet
   * is a mood, and a mood must not win an argument with legibility, so light
   * mode now gets a pale violet paper instead.
   */
  background?: string;
  /** The lit-card border under the spotlight. */
  litBorder: string;
  /** Lit chip fill. */
  chipFill: string;
  /**
   * The five radial stops of the bulb glass, inner → outer. Retinting these is
   * what turns the amber bulb violet for Film & TV without touching the brass.
   */
  glassStops: [string, string, string, string, string];
  /** The top of the tapered neck gradient (full dress only). */
  neck: string;
  /**
   * The colour of the hard offset block behind a lit card.
   *
   * Gel yellow in the theatre and violet in the cinema, which is the one place
   * the two houses disagree about the gel: yellow on a violet floor reads as a
   * third colour that belongs to neither, so Film & TV prints in its own ink.
   */
  hardShadow: string;
  /**
   * Source-tag / mark ink for something drawn ON PAPER. `accent` is tuned to
   * glow on the stage; this is the same idea at a value that survives cream.
   */
  tagInk: string;
}

export const MEDIA: Record<Medium, MediumPalette> = {
  theatre: {
    glow: '#e0731f',
    glowRgb: [224, 115, 31],
    accent: '#c24e10',
    line: '#4a4038',
    litBorder: 'rgba(224, 115, 31, 0.55)',
    chipFill: 'rgba(224, 115, 31, 0.14)',
    // The glass keeps its own five stops. The bulb is the mark and the mark did
    // not change — only the light it throws did, and 4° of hue between the two
    // is not a thing the eye finds on a 22pt lamp.
    glassStops: ['#fff6e4', '#ffd08c', '#f9a441', '#f3821d', '#f3821d'],
    neck: '#e0821f',
    hardShadow: '#f2e22b',
    tagInk: '#a8400c',
    // Overwritten per scheme by mediumPalette; this is the dark-stage value.
    accentText: '#e0731f',
  },
  screen: {
    glow: '#a15cff',
    glowRgb: [161, 92, 255],
    // Deep accent 120,52,214 — badges, the paid slab, destructive echoes.
    accent: '#7834d6',
    line: '#3a3050',
    background: '#0f0a16',
    litBorder: 'rgba(161, 92, 255, 0.55)',
    chipFill: 'rgba(161, 92, 255, 0.16)',
    glassStops: ['#fbf7ff', '#e2ccff', '#bd8bff', '#a15cff', '#a15cff'],
    neck: '#8f52e0',
    hardShadow: '#8451c9',
    tagInk: '#65389f',
    accentText: '#a15cff',
  },
};

/** Light-scheme overrides. Only what must change for the text to be readable. */
const LIGHT_OVERRIDES: Partial<Record<Medium, Partial<MediumPalette>>> = {
  screen: {
    // Pale violet paper — still unmistakably the other house, still legible
    // under #15110f text.
    background: '#f3f0f8',
    // The bulb violet is bright enough to glow on near-black and too pale to
    // read on paper, so lit accents darken in light mode.
    accent: '#5b21b6',
    litBorder: 'rgba(91, 33, 182, 0.45)',
    chipFill: 'rgba(91, 33, 182, 0.12)',
    tagInk: '#5b21b6',
  },
};

/**
 * @param isLight pass `useTheme().isLight`. Omitting it keeps the dark palette,
 * which is the correct default for the launch overlay and any Skia canvas that
 * paints its own dark field regardless of scheme.
 */
export function mediumPalette(medium: Medium | undefined, isLight = false): MediumPalette {
  const key: Medium = medium === 'screen' ? 'screen' : 'theatre';
  const base = MEDIA[key];
  if (!isLight) return base;
  const over = LIGHT_OVERRIDES[key];
  const resolved = over ? { ...base, ...over } : base;
  // On paper the house colour has to be the deep one to be readable, and that is
  // true of the theatre as well as the cinema — the theatre simply had no
  // LIGHT_OVERRIDES entry to hang it on, because its `accent` never needed to
  // change for anything else. Its `accent` is also a hair under the small-text
  // floor on cream (4.14:1 against 4.5), so it takes `tagInk` — the deeper
  // orange these tags already print in — rather than a fourth orange.
  return { ...resolved, accentText: key === 'theatre' ? resolved.tagInk : resolved.accent };
}

/** rgba() from a palette's glow at a given alpha — for Skia gradients. */
export function glowRgba([r, g, b]: [number, number, number], a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
