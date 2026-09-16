import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Uniwind, useUniwind } from 'uniwind';

import { colors as tokens } from './tokens';

/**
 * Theme. Ghost Light is a dark stage by conviction, but the actor can choose:
 * follow the system, or pin dark / light. Only the *surfaces* change with the
 * scheme — the bulb, the brand orange, and the warm reading paper are constant,
 * because those are the identity, not the mode.
 *
 * One source of truth: `Uniwind.setTheme` drives the Tailwind className colours
 * (bg-background, text-foreground, …) AND we read the resolved scheme back from
 * `useUniwind()` to build the matching palette for Skia and inline styles — so
 * classes and inline colours can never disagree.
 */

export type ThemeMode = 'system' | 'dark' | 'light';
export type Scheme = 'dark' | 'light';

export interface ThemeColors {
  background: string;
  /**
   * The card face. Paper on BOTH schemes in v2 — a card is a page of sides, not
   * a tinted panel, so this is cream even on the dark stage. Anything drawn
   * inside one must therefore use `paperInk` / `paperMuted`, never `foreground`.
   */
  card: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  // Chrome. These used to exist only on the dark palette, so every call site
  // reached for `colors.dark.*` directly and was theme-blind by construction —
  // dark-stage hairlines and chevrons drawn on paper. Resolved per scheme now.
  cardBorder: string;
  divider: string;
  inactiveMeter: string;
  chevron: string;
  /** A surface that is stage, not paper — stat tiles, the identity card. */
  panel: string;
  // The paper a card is printed on. Constant across schemes; see tokens.ts.
  paper: string;
  paperInk: string;
  paperBody: string;
  paperMuted: string;
  paperFaint: string;
  paperRule: string;
  // Fixed across schemes — the light itself.
  stageGlow: string;
  stageLine: string;
  primary: string;
  primaryHover: string;
  /**
   * The brand orange as TEXT on the current stage. `stageGlow` is a light and is
   * tuned to read against warm near-black; on the cream stage it comes out at
   * 2.9:1, which is under the floor for a headline and far under it for a 14pt
   * value. Use this for any orange WORD; keep `stageGlow` for lamps, halos and
   * anything that is actually emitting.
   */
  accentText: string;
  /** Gel yellow. A fill behind ink, never text. */
  yellow: string;
  ink: string;
  isLight: boolean;
}

function resolve(scheme: Scheme): ThemeColors {
  const p = tokens[scheme];
  return {
    background: p.background,
    card: p.card,
    foreground: p.foreground,
    mutedForeground: p.mutedForeground,
    border: p.border,
    cardBorder: p.cardBorder,
    divider: p.divider,
    inactiveMeter: p.inactiveMeter,
    chevron: p.chevron,
    panel: p.panel,
    // The light scheme's card is the brighter cream, so the paper token follows
    // the scheme here even though everything printed ON it does not.
    paper: scheme === 'light' ? tokens.paper.backgroundLight : tokens.paper.background,
    paperInk: tokens.paper.ink,
    paperBody: tokens.paper.body,
    paperMuted: tokens.paper.muted,
    paperFaint: tokens.paper.faint,
    paperRule: tokens.paper.rule,
    stageGlow: tokens.stageGlow,
    stageLine: tokens.stageLine,
    primary: tokens.primary,
    primaryHover: tokens.primaryHover,
    accentText: scheme === 'light' ? tokens.primaryDeep : tokens.stageGlow,
    yellow: tokens.yellow,
    ink: tokens.ink,
    isLight: scheme === 'light',
  };
}

interface ThemeValue {
  mode: ThemeMode;
  scheme: Scheme;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'ghostlight.theme.v1';

const ThemeContext = createContext<ThemeValue>({
  mode: 'dark',
  scheme: 'dark',
  colors: resolve('dark'),
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Dark until the actor says otherwise. 'system' meant a phone set to Light
  // opened Ghost Light on cream paper, and the whole design — the warm near-black
  // stage, the lamp, the spotlight on the cards — is built for the dark. Light is
  // a supported choice, not a default anyone should arrive at by accident.
  // 'system' is still selectable in Appearance for people who want it.
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const uniwind = useUniwind();

  // Load the saved preference once.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'system' || v === 'dark' || v === 'light') setModeState(v);
      })
      .catch(() => {});
  }, []);

  // Drive Uniwind from the mode — including the initial 'system', which is what
  // turns on adaptive (follow-the-OS) resolution. Runs on mount and every change.
  useEffect(() => {
    Uniwind.setTheme(mode);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  }, []);

  // The scheme Uniwind actually resolved to (handles 'system' for us).
  const scheme: Scheme = uniwind.theme === 'light' ? 'light' : 'dark';

  const value = useMemo<ThemeValue>(
    () => ({ mode, scheme, colors: resolve(scheme), setMode }),
    [mode, scheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
