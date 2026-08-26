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
  // Fixed across schemes — the light itself.
  stageGlow: string;
  stageLine: string;
  primary: string;
  primaryHover: string;
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
    stageGlow: tokens.stageGlow,
    stageLine: tokens.stageLine,
    primary: tokens.primary,
    primaryHover: tokens.primaryHover,
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
  mode: 'system',
  scheme: 'dark',
  colors: resolve('dark'),
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
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
