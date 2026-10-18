import { useEffect, useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Canvas, DashPathEffect, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { colors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

/**
 * The line sketches, drawn stroke by stroke.
 *
 * The lamp is for launch and for Search home — the two places the app is
 * standing still and wants to be looked at. Everywhere else the app is *doing*
 * something (hunting, failing, asking), and a pulsing bulb on all of them made
 * one object mean five different things. So every other empty, loading and
 * dead-end state gets a drawing instead, lifted from the web app's
 * `components/brand/sketches.tsx` so the site and the app share one hand.
 *
 * They draw themselves in: each stroke trims from nothing to its full length
 * over 900ms, 180ms after the one before it. That is Skia's path trim
 * (`start`/`end` on `<Path>`) — the same mechanism as the web's
 * stroke-dashoffset and, like it, free of JavaScript per frame.
 *
 * Authored in a 64×64 box and scaled to `size`, stroke weight included: 1.6 in
 * the box is 2.8pt at 112, which is what keeps the line looking drawn rather
 * than turning hairline as these grow.
 */

type Ink = 'line' | 'accent' | 'dim';

interface Stroke {
  d: string;
  ink?: Ink;
  /** Lights that are OUT: dashed, faded up to this opacity, never drawn in. */
  fade?: number;
}

const SKETCHES: Record<string, Stroke[]> = {
  /**
   * A script, open, with a page behind it — rifling the prompt book. The ruled
   * lines of text draw last, so it reads as writing appearing on the page.
   */
  scriptPages: [
    { d: 'M13 14 L13 51 C13 53 14 54 16 54 L43 54' },
    {
      d: 'M21 7 L46 7 L52 13 L52 46 C52 47.5 51 48.5 49.5 48.5 L21 48.5 C19.5 48.5 18.5 47.5 18.5 46 L18.5 9.5 C18.5 8 19.5 7 21 7 Z',
    },
    { d: 'M46 7 L46 13 L52 13' },
    { d: 'M25 22 L45 22 M25 29 L45 29 M25 36 L38 36' },
  ],
  /**
   * The stage door, ajar, light spilling through. For "we don't have this yet,
   * ask and we'll go looking" — a door you can knock on, not a dead end.
   */
  stageDoor: [
    { d: 'M16 58 L16 8 L48 8 L48 58' },
    { d: 'M22 58 L22 14 L40 20 L40 58' },
    { d: 'M36 38 A1.6 1.6 0 1 1 36 34.8' },
    { d: 'M44 24 L54 20 M44 32 L56 30 M44 40 L54 42', ink: 'accent' },
  ],
  /**
   * Footlights with the beams gone out. The lip and the hoods draw normally;
   * the beams are dashed, faded to 40% and left there — lights out, not lights
   * missing. That difference is the whole message of the failed state.
   */
  footlights: [
    { d: 'M4 50 L60 50 M4 55 L60 55' },
    { d: 'M9 50 A5 5 0 0 1 19 50 Z M27 50 A5 5 0 0 1 37 50 Z M45 50 A5 5 0 0 1 55 50 Z' },
    {
      d: 'M14 43 L7 21 M14 43 L21 21 M32 43 L25 21 M32 43 L39 21 M50 43 L43 21 M50 43 L57 21',
      ink: 'dim',
      fade: 0.4,
    },
  ],
  /**
   * A clapperboard — the Film & TV stand-in, and only ever a stand-in. A screen
   * piece with a `posterUrl` shows the poster; this is the fallback for a row
   * without one, so it has to read as drawn art rather than a missing image.
   */
  clapper: [
    { d: 'M8 26 L56 26 L56 54 C56 55.5 55 56.5 53.5 56.5 L10.5 56.5 C9 56.5 8 55.5 8 54 Z' },
    { d: 'M8.5 25 L11 13 L57.5 6 L55 18 Z' },
    { d: 'M19 11.7 L16.6 24 M30 10.1 L27.6 22.4 M41 8.5 L38.6 20.8 M52 6.9 L49.6 19.2' },
    { d: 'M18 38 L46 38 M18 46 L36 46', ink: 'accent' },
  ],

  /*
   * The theme sketches. A play has no poster, so the reading page and the
   * saved shelf give it one of these instead, picked from the piece's themes
   * by `sketchFor` (src/lib/sketchFor.ts). Paths are the web's, unchanged; web
   * strokes that share a draw order are merged into one stroke here so the
   * stagger matches the site. Each one carries a single gel stroke.
   */

  /** Yorick. Death, grief, mortality. The eye sockets take the gel. */
  skull: [
    {
      d: 'M32 6 C17 6 10 17 10 28 C10 36 14 41 18 44 L18 52 C18 55 20 57 23 57 L41 57 C44 57 46 55 46 52 L46 44 C50 41 54 36 54 28 C54 17 47 6 32 6 Z',
    },
    {
      d: 'M20 28 C20 24 23 22 26 22 C29 22 31 25 30 29 C29 32 26 33 24 33 C21 33 20 31 20 28 Z M44 28 C44 24 41 22 38 22 C35 22 33 25 34 29 C35 32 38 33 40 33 C43 33 44 31 44 28 Z',
      ink: 'accent',
    },
    { d: 'M32 36 L29 42 L35 42 Z' },
    { d: 'M26 50 L26 56 M32 50 L32 56 M38 50 L38 56' },
  ],
  /** Macbeth's dagger. Revenge, violence. The fuller catches the light. */
  dagger: [
    { d: 'M32 5 L28.6 26 L28.6 30 L35.4 30 L35.4 26 Z' },
    { d: 'M32 11 L32 27', ink: 'accent' },
    { d: 'M21 29.5 C25 31.4 39 31.4 43 29.5' },
    { d: 'M29.6 32 L30.4 45 L33.6 45 L34.4 32' },
    { d: 'M28.4 49 A3.6 3.6 0 1 1 35.6 49 A3.6 3.6 0 1 1 28.4 49 Z' },
  ],
  /** Uneasy lies the head. Power, ambition. The jewels are the gel. */
  crown: [
    { d: 'M12 46 L9 22 L21 32 L32 16 L43 32 L55 22 L52 46 Z' },
    { d: 'M12 52 L52 52' },
    {
      d: 'M9 19 A1.8 1.8 0 1 1 9 15.4 A1.8 1.8 0 1 1 9 19 M32 13 A1.8 1.8 0 1 1 32 9.4 A1.8 1.8 0 1 1 32 13 M55 19 A1.8 1.8 0 1 1 55 15.4 A1.8 1.8 0 1 1 55 19',
      ink: 'accent',
    },
  ],
  /** Comedy and tragedy. The default, when no theme speaks up. */
  masks: [
    { d: 'M8 12 C16 10 24 10 32 12 L32 34 C32 44 26 50 20 50 C14 50 8 44 8 34 Z' },
    { d: 'M14 24 C15 22 17 22 18 24 M24 24 C25 22 27 22 28 24 M14 34 C17 39 23 39 26 34' },
    { d: 'M32 16 C40 14 48 14 56 16 L56 38 C56 48 50 54 44 54 C38 54 32 48 32 38 Z' },
    { d: 'M38 28 C39 26 41 26 42 28 M48 28 C49 26 51 26 52 28 M38 44 C41 39 47 39 50 44', ink: 'accent' },
  ],
};

export type SketchName = keyof typeof SKETCHES;

const BOX = 64;
const DRAW_MS = 900;
const STAGGER_MS = 180;

export function Sketch({
  name,
  size = 104,
  /** The main line colour. Defaults to the stage's muted foreground. */
  stroke,
  /** The highlight strokes — the spill, the slate lines. Gel yellow. */
  accent,
  /** Weight in 64-box units; scales with the sketch. */
  weight = 1.6,
  style,
}: {
  name: SketchName;
  size?: number;
  stroke?: string;
  accent?: string;
  weight?: number;
  style?: ViewStyle;
}) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const strokes = SKETCHES[name];

  // Gel yellow is a light on the dark stage and a near-invisible hairline on
  // cream (tokens.ts: roughly 1.2:1). On the light scheme every yellow stroke
  // is redrawn in the deep accent, so callers can keep asking for "the gel".
  const ink = (colour: string) =>
    c.isLight && colour.toLowerCase() === colors.yellow ? c.accentText : colour;

  const palette = useMemo(
    () => ({
      line: ink(stroke ?? c.mutedForeground),
      accent: ink(accent ?? colors.yellow),
      dim: c.stageLine,
    }),
    [stroke, accent, c.mutedForeground, c.stageLine, c.isLight, c.accentText],
  );

  const scale = size / BOX;

  const paths = useMemo<SkPath[]>(
    () =>
      strokes
        .map((s) => Skia.Path.MakeFromSVGString(s.d))
        .filter((p): p is SkPath => p !== null),
    [strokes],
  );

  // One progress value for the whole sketch; each stroke reads its own window
  // out of it. Cheaper than n shared values and it keeps the stagger in one
  // place. Reduced motion renders the drawing already drawn — the point of a
  // sketch is the picture, not the performance of making it.
  const draw = useSharedValue(reduce ? 1 : 0);
  const total = DRAW_MS + STAGGER_MS * (strokes.length - 1);

  useEffect(() => {
    if (reduce) {
      draw.value = 1;
      return;
    }
    draw.value = 0;
    draw.value = withDelay(60, withTiming(1, { duration: total, easing: Easing.inOut(Easing.quad) }));
  }, [reduce, draw, total, name]);

  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Canvas style={{ width: size, height: size }}>
        <Group transform={[{ scale }]}>
          {paths.map((p, i) => (
            <SketchStroke
              key={`${name}:${i}`}
              path={p}
              draw={draw}
              from={(STAGGER_MS * i) / total}
              to={(STAGGER_MS * i + DRAW_MS) / total}
              spec={strokes[i]}
              palette={palette}
              width={weight}
            />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

function SketchStroke({
  path,
  draw,
  from,
  to,
  spec,
  palette,
  width,
}: {
  path: SkPath;
  draw: SharedValue<number>;
  from: number;
  to: number;
  spec: Stroke;
  palette: Record<Ink, string>;
  width: number;
}) {
  const peak = spec.fade ?? 1;

  // `draw` remapped onto this stroke's window and clamped. With a 900ms draw
  // and a 180ms stagger the windows overlap, which is what makes the sketch
  // read as one hand moving rather than a queue of separate animations.
  //
  // Both derived values are built unconditionally — one drives length, the
  // other opacity, and which one the stroke actually uses is decided in the
  // markup below. A hook behind an `if` is a hook that changes order the first
  // time these specs are edited.
  const window = useDerivedValue(() => {
    const t = (draw.value - from) / (to - from);
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }, [from, to]);
  const fade = useDerivedValue(() => window.value * peak, [peak]);

  const colour = palette[spec.ink ?? 'line'];

  // A light that is OUT does not get drawn in: it fades up dashed and stays
  // dim. Trimming it would animate it into existence, which says "loading".
  if (spec.fade != null) {
    return (
      <Group opacity={fade}>
        <Path
          path={path}
          style="stroke"
          strokeWidth={width}
          strokeCap="round"
          strokeJoin="round"
          color={colour}
        >
          <DashPathEffect intervals={[3, 5]} />
        </Path>
      </Group>
    );
  }

  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={width}
      strokeCap="round"
      strokeJoin="round"
      color={colour}
      start={0}
      end={window}
    />
  );
}
