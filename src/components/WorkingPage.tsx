import { memo, useMemo } from 'react';
import { Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { maskFirstLetters, type Unit } from '../lib/segments';
import { useTheme } from '../theme/ThemeContext';

/**
 * The page when you are working on it: the same words, drawn unit by unit so a
 * sentence (or a verse line) can be tapped.
 *
 * Three jobs, one component, because they are three states of one page and the
 * words must not move between them:
 *
 *   read  — the piece, with everything outside a saved cut set back in grey.
 *   cut   — tap the first unit, then the last. The chosen stretch is lit on a
 *           wash of the house colour; the rest is grey.
 *   run   — rehearsing. `words` shows the piece; `hints` keeps the first letter
 *           of every word and dots the rest; `dark` leaves only a ghost of the
 *           line. A tap on a line brings it back in full, another tap puts it
 *           away. With a cut set, only the cut is on the page: that is what you
 *           are learning.
 *
 * Nested Text spans rather than a row per unit, so prose stays a paragraph and
 * verse stays verse. Everything here is React state set a few times per
 * minute, never per frame.
 */

export type PageMode = 'read' | 'cut' | 'run';
export type RunLevel = 'words' | 'hints' | 'dark';

interface Props {
  units: Unit[];
  mode: PageMode;
  /** The saved cut, if any. Inclusive indices into `units`. */
  cut: { start: number; end: number } | null;
  /** The cut being chosen, while `mode` is `cut`. */
  pick?: { start: number | null; end: number | null };
  onPick?: (i: number) => void;
  level?: RunLevel;
  /** Units brought back in full while running. */
  revealed?: ReadonlySet<number>;
  onReveal?: (i: number) => void;
  fontSize: number;
  lineHeight: number;
}

/** A short bracketed direction inside a unit: `(beat)`, `(to Mary)`. */
const DIRECTION = /(\([^()]{1,45}\))/g;
const IS_DIRECTION = /^\([^()]{1,45}\)$/;

export const WorkingPage = memo(function WorkingPage({
  units,
  mode,
  cut,
  pick,
  onPick,
  level = 'hints',
  revealed,
  onReveal,
  fontSize,
  lineHeight,
}: Props) {
  const { colors: c } = useTheme();
  const ink = c.paperInk;
  const grey = c.paperMuted;
  const ghost = `${c.paperInk}14`;
  const wash = `${c.accentText}22`;

  const spans = useMemo(() => {
    const out: React.ReactNode[] = [];
    const lo = cut ? Math.min(cut.start, cut.end) : null;
    const hi = cut ? Math.max(cut.start, cut.end) : null;
    const pLo = pick && pick.start != null && pick.end != null ? Math.min(pick.start, pick.end) : null;
    const pHi = pick && pick.start != null && pick.end != null ? Math.max(pick.start, pick.end) : null;

    const inRun = (i: number) => mode === 'run' && (lo == null || hi == null || (i >= lo && i <= hi));
    let lastShown = -1;

    units.forEach((u, i) => {
      if (mode === 'run' && !inRun(i)) return;

      // The gap belongs to the unit before, so it is added when the next one is
      // actually drawn: a run over a cut must not open with a blank line.
      if (lastShown >= 0) {
        const g = units[lastShown].gap;
        out.push(g === 'paragraph' ? '\n\n' : g === 'line' ? '\n' : ' ');
      }
      lastShown = i;

      if (mode === 'run') {
        const open = level === 'words' || revealed?.has(i);
        const text = open ? u.text : level === 'hints' ? maskFirstLetters(u.text) : u.text;
        out.push(
          <Text
            key={i}
            onPress={
              level === 'words'
                ? undefined
                : () => {
                    Haptics.selectionAsync().catch(() => {});
                    onReveal?.(i);
                  }
            }
            suppressHighlighting
            style={{ color: open ? ink : level === 'dark' ? ghost : grey }}
          >
            {text}
          </Text>,
        );
        return;
      }

      let color = ink;
      let background: string | undefined;
      if (mode === 'cut') {
        if (pick?.start == null) {
          color = ink;
        } else if (pick.end == null) {
          const chosen = i === pick.start;
          color = chosen ? ink : grey;
          background = chosen ? wash : undefined;
        } else {
          const within = pLo != null && pHi != null && i >= pLo && i <= pHi;
          color = within ? ink : grey;
          background = within ? wash : undefined;
        }
      } else if (lo != null && hi != null) {
        color = i >= lo && i <= hi ? ink : grey;
      }

      // Directions keep their italic grey inside a unit, as on the plain page.
      const parts = u.text.split(DIRECTION).filter(Boolean);
      out.push(
        <Text
          key={i}
          onPress={
            mode === 'cut'
              ? () => {
                  Haptics.selectionAsync().catch(() => {});
                  onPick?.(i);
                }
              : undefined
          }
          suppressHighlighting
          style={{ color, backgroundColor: background }}
        >
          {parts.map((p, k) =>
            IS_DIRECTION.test(p) ? (
              <Text key={k} style={{ fontFamily: 'CourierPrime_400Regular_Italic', color: grey }}>
                {p}
              </Text>
            ) : (
              p
            ),
          )}
        </Text>,
      );
    });
    return out;
  }, [units, mode, cut, pick, level, revealed, onPick, onReveal, ink, grey, ghost, wash]);

  return (
    <Text
      selectable={mode === 'read'}
      style={{
        fontFamily: 'CourierPrime_400Regular',
        fontSize,
        lineHeight,
        color: ink,
      }}
    >
      {spans}
    </Text>
  );
});
