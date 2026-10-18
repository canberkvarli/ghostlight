import { memo, useMemo } from 'react';
import { Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { type Unit } from '../lib/segments';
import { useTheme } from '../theme/ThemeContext';

/**
 * The page when you are working on it: the same words, drawn unit by unit so a
 * sentence (or a verse line) can be tapped.
 *
 * Two states of one page, and the words must not move between them: this is
 * also the plain page whenever a piece can be cut, so opening the cut changes
 * colour and nothing else. The old plain page broke the text by the server's
 * segments and this one by the website's units, and the lines reflowed under
 * your thumb the moment you tapped cut.
 *
 *   read  — the piece, with everything outside a saved cut struck through in
 *           pencil, the way a marked-up script looks: the kept lines in ink,
 *           the cut ones grey with a line through them in the house colour.
 *   cut   — tap the first unit, then the last. The chosen stretch is lit on a
 *           wash of the house colour; once both ends are down, the rest is
 *           struck the same way, so you see the cut you are about to keep.
 *
 * Nested Text spans rather than a row per unit, so prose stays a paragraph and
 * verse stays verse. Everything here is React state set a few times per
 * minute, never per frame.
 */

export type PageMode = 'read' | 'cut';

interface Props {
  units: Unit[];
  mode: PageMode;
  /** The saved cut, if any. Inclusive indices into `units`. */
  cut: { start: number; end: number } | null;
  /** The cut being chosen, while `mode` is `cut`. */
  pick?: { start: number | null; end: number | null };
  onPick?: (i: number) => void;
  /** Units that are stage directions (src/lib/segments.ts directionUnits). */
  directions?: ReadonlySet<number>;
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
  directions,
  fontSize,
  lineHeight,
}: Props) {
  const { colors: c } = useTheme();
  const ink = c.paperInk;
  const grey = c.paperMuted;
  const wash = `${c.accentText}22`;
  const pencil = c.accentText;

  const spans = useMemo(() => {
    const out: React.ReactNode[] = [];
    const lo = cut ? Math.min(cut.start, cut.end) : null;
    const hi = cut ? Math.max(cut.start, cut.end) : null;
    const pLo = pick && pick.start != null && pick.end != null ? Math.min(pick.start, pick.end) : null;
    const pHi = pick && pick.start != null && pick.end != null ? Math.max(pick.start, pick.end) : null;

    units.forEach((u, i) => {
      const direction = directions?.has(i) ?? false;
      if (i > 0) {
        const g = units[i - 1].gap;
        // A blank line around a direction, as on the plain page.
        const around = direction || (directions?.has(i - 1) ?? false);
        out.push(g === 'paragraph' || around ? '\n\n' : g === 'line' ? '\n' : ' ');
      }

      let color = direction ? grey : ink;
      let background: string | undefined;
      let struck = false;
      if (mode === 'cut') {
        if (pick?.start == null) {
          // nothing chosen yet: the page as it is
        } else if (pick.end == null) {
          const chosen = i === pick.start;
          color = chosen ? ink : grey;
          background = chosen ? wash : undefined;
        } else {
          const within = pLo != null && pHi != null && i >= pLo && i <= pHi;
          color = within && !direction ? ink : grey;
          background = within ? wash : undefined;
          struck = !within;
        }
      } else if (lo != null && hi != null) {
        const within = i >= lo && i <= hi;
        color = within && !direction ? ink : grey;
        struck = !within;
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
          style={{
            color,
            backgroundColor: background,
            fontFamily: direction ? 'CourierPrime_400Regular_Italic' : undefined,
            textDecorationLine: struck ? 'line-through' : 'none',
            textDecorationColor: pencil,
          }}
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
  }, [units, mode, cut, pick, onPick, directions, ink, grey, wash, pencil]);

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
