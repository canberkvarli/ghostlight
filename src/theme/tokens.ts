/**
 * Ghost Light tokens for consumers that cannot read Tailwind classes — Skia
 * shaders, Reanimated interpolations, native bars.
 *
 * Mirror of src/global.css. Change one, change the other.
 */

export const colors = {
  /** oklch(0.72 0.17 55) — the warm orange bulb */
  stageGlow: '#f3821d',
  /** oklch(0.30 0.02 55) — the stand below the bulb */
  stageLine: '#362b24',
  /** oklch(0.58 0.18 45) — brand orange */
  primary: '#cb4b00',
  primaryHover: '#b03000',

  dark: {
    /** oklch(0.16 0.015 50) — warm near-black. Never flat black. */
    background: '#130b08',
    card: '#1d140f',
    /** Warm, but near-white. Cards dim their contents, so body text needs the
     *  headroom — #f3eee6 was already faint before the unlit multiplier. */
    foreground: '#fbf8f3',
    mutedForeground: '#c2bab1',
    /** Field / input border. */
    border: '#302721',
    /** Card border — quieter than the field border. */
    cardBorder: '#2b211b',
    /** Hairline dividers between rows. */
    divider: '#241b16',
    /** The unlit segment of a progress / filament meter. */
    inactiveMeter: '#3a2c24',
    /** Chevrons and fine print — dimmer than mutedForeground. */
    chevron: '#8a8078',
  },

  light: {
    /** oklch(0.97 0.007 70) — the reading page */
    background: '#f8f4f0',
    card: '#fefbf8',
    foreground: '#15110f',
    mutedForeground: '#5a5450',
    border: '#dbd6d2',
    /** Light needs these too. Every `colors.dark.*` call site was theme-blind
     *  by construction while they were missing, which put dark-mode hairlines
     *  and chevrons on paper. */
    cardBorder: '#e4dfda',
    divider: '#ece7e2',
    inactiveMeter: '#dbd6d2',
    chevron: '#8a8480',
  },
} as const;

export const radius = {
  stage: 16,
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
