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
}

export const MEDIA: Record<Medium, MediumPalette> = {
  theatre: {
    glow: '#f3821d',
    glowRgb: [243, 130, 29],
    accent: '#cb4b00',
    line: '#362b24',
    litBorder: 'rgba(243, 130, 29, 0.55)',
    chipFill: 'rgba(243, 130, 29, 0.14)',
    glassStops: ['#fff6e4', '#ffd08c', '#f9a441', '#f3821d', '#f3821d'],
    neck: '#e0821f',
  },
  screen: {
    glow: '#a15cff',
    glowRgb: [161, 92, 255],
    // Deep accent 120,52,214 — badges, the paid slab, destructive echoes.
    accent: '#7834d6',
    line: '#2e2440',
    background: '#0f0a16',
    litBorder: 'rgba(161, 92, 255, 0.55)',
    chipFill: 'rgba(161, 92, 255, 0.16)',
    glassStops: ['#fbf7ff', '#e2ccff', '#bd8bff', '#a15cff', '#a15cff'],
    neck: '#8f52e0',
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
  return over ? { ...base, ...over } : base;
}

/** rgba() from a palette's glow at a given alpha — for Skia gradients. */
export function glowRgba([r, g, b]: [number, number, number], a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
