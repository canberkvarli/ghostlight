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
   * The stage floor. Undefined for theatre so it follows the light/dark theme;
   * screen forces its violet near-black regardless of scheme.
   */
  background?: string;
  /** The lit-card border under the spotlight. */
  litBorder: string;
  /** Lit chip fill. */
  chipFill: string;
}

export const MEDIA: Record<Medium, MediumPalette> = {
  theatre: {
    glow: '#f3821d',
    glowRgb: [243, 130, 29],
    accent: '#cb4b00',
    line: '#362b24',
    litBorder: 'rgba(243, 130, 29, 0.55)',
    chipFill: 'rgba(243, 130, 29, 0.14)',
  },
  screen: {
    glow: '#a15cff',
    glowRgb: [161, 92, 255],
    accent: '#7c3aed',
    line: '#2e2440',
    background: '#0f0a16',
    litBorder: 'rgba(161, 92, 255, 0.55)',
    chipFill: 'rgba(161, 92, 255, 0.16)',
  },
};

export function mediumPalette(medium: Medium | undefined): MediumPalette {
  return MEDIA[medium === 'screen' ? 'screen' : 'theatre'];
}

/** rgba() from a palette's glow at a given alpha — for Skia gradients. */
export function glowRgba([r, g, b]: [number, number, number], a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
