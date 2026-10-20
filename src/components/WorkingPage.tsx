import { memo, useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

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
 *   read  — the piece. With a saved cut, `view` says how: `cut` has everything
 *           outside the cut struck through in pencil, the way a marked-up
 *           script looks, the kept lines in ink and the cut ones grey with a
 *           line through them in the house colour; `whole` is the full speech
 *           in ink with the kept stretch on a wash of the house colour, so the
 *           cut is still there to see but nothing is crossed out.
 *   cut   — tap the first unit, then the last. The chosen stretch is lit on a
 *           wash of the house colour; once both ends are down, the rest is
 *           struck the same way, so you see the cut you are about to keep.
 *
 * Nothing snaps. The page is two layers of the same words: the plain page in
 * flow and the marked-up page over it on its own paper, and a change of mode
 * or view fades the top layer in or out. The glyphs sit on the same pixels in
 * both layers, so what you see is the pencil arriving on the page, not a page
 * being swapped. A tap inside the cut is the one thing that lands at once:
 * your finger is already there.
 *
 * Nested Text spans rather than a row per unit, so prose stays a paragraph and
 * verse stays verse. Everything here is React state set a few times per
 * minute, never per frame; the only animated value is the top layer's opacity.
 */

export type PageMode = 'read' | 'cut';
export type PageView = 'cut' | 'whole';

interface Props {
  units: Unit[];
  mode: PageMode;
  /** The saved cut, if any. Inclusive indices into `units`. */
  cut: { start: number; end: number } | null;
  /** In read mode with a cut: struck, or the whole speech. */
  view?: PageView;
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

interface Mark {
  color: string;
  background?: string;
  struck: boolean;
}

export const WorkingPage = memo(function WorkingPage({
  units,
  mode,
  cut,
  view = 'cut',
  pick,
  onPick,
  directions,
  fontSize,
  lineHeight,
}: Props) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const ink = c.paperInk;
  const grey = c.paperMuted;
  const wash = `${c.accentText}22`;
  const pencil = c.accentText;

  const lo = cut ? Math.min(cut.start, cut.end) : null;
  const hi = cut ? Math.max(cut.start, cut.end) : null;

  // The top layer is the page with the pencil on it: while you cut, always;
  // while you read, only when there is a cut and you asked to see it struck.
  const marked = mode === 'cut' || (lo != null && view === 'cut');
  const top = useSharedValue(marked ? 1 : 0);
  useEffect(() => {
    top.value = withTiming(marked ? 1 : 0, {
      duration: reduce ? 0 : 420,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [marked, reduce, top]);
  const topStyle = useAnimatedStyle(() => ({ opacity: top.value }));

  const render = (markOf: (i: number, direction: boolean) => Mark, tappable: boolean) => {
    const out: React.ReactNode[] = [];
    units.forEach((u, i) => {
      const direction = directions?.has(i) ?? false;
      if (i > 0) {
        const g = units[i - 1].gap;
        // A blank line around a direction, as on the plain page.
        const around = direction || (directions?.has(i - 1) ?? false);
        out.push(g === 'paragraph' || around ? '\n\n' : g === 'line' ? '\n' : ' ');
      }
      const m = markOf(i, direction);
      // Directions keep their italic grey inside a unit, as on the plain page.
      const parts = u.text.split(DIRECTION).filter(Boolean);
      out.push(
        <Text
          key={i}
          onPress={
            tappable
              ? () => {
                  Haptics.selectionAsync().catch(() => {});
                  onPick?.(i);
                }
              : undefined
          }
          suppressHighlighting
          style={{
            color: m.color,
            backgroundColor: m.background,
            fontFamily: direction ? 'CourierPrime_400Regular_Italic' : undefined,
            textDecorationLine: m.struck ? 'line-through' : 'none',
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
  };

  // The plain page: every word in ink. With a cut, the kept stretch sits on
  // the wash so the whole view still shows what you kept.
  const plain = useMemo(
    () =>
      render(
        (i, direction) => ({
          color: direction ? grey : ink,
          background: lo != null && hi != null && mode === 'read' && i >= lo && i <= hi ? wash : undefined,
          struck: false,
        }),
        false,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, directions, lo, hi, mode, ink, grey, wash, pencil],
  );

  // The marked page: the cut you are choosing, or the one you kept.
  const markedSpans = useMemo(() => {
    const pLo = pick && pick.start != null && pick.end != null ? Math.min(pick.start, pick.end) : null;
    const pHi = pick && pick.start != null && pick.end != null ? Math.max(pick.start, pick.end) : null;
    return render((i, direction) => {
      const base = direction ? grey : ink;
      if (mode === 'cut') {
        if (pick?.start == null) return { color: base, struck: false };
        if (pick.end == null) {
          const chosen = i === pick.start;
          return { color: chosen ? ink : grey, background: chosen ? wash : undefined, struck: false };
        }
        const within = pLo != null && pHi != null && i >= pLo && i <= pHi;
        return { color: within && !direction ? ink : grey, background: within ? wash : undefined, struck: !within };
      }
      if (lo != null && hi != null) {
        const within = i >= lo && i <= hi;
        return { color: within && !direction ? ink : grey, struck: !within };
      }
      return { color: base, struck: false };
    }, mode === 'cut');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, directions, mode, pick, onPick, lo, hi, ink, grey, wash, pencil]);

  const type = {
    fontFamily: 'CourierPrime_400Regular',
    fontSize,
    lineHeight,
    color: ink,
  } as const;

  return (
    <View style={{ width: '100%' }}>
      <Text selectable={!marked} style={type}>
        {plain}
      </Text>
      <Animated.View
        pointerEvents={mode === 'cut' ? 'auto' : 'none'}
        style={[topStyle, { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: c.paper }]}
      >
        <Text style={type}>{markedSpans}</Text>
      </Animated.View>
    </View>
  );
});
