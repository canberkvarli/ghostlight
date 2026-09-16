import { memo } from 'react';
import { Image, Text, View } from 'react-native';
import {
  Extrapolation,
  interpolate,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  CARD_HEIGHT,
  FALLOFF,
  FOCUS_POINT,
  MARGIN_COL,
  MARGIN_COL_POSTER,
  cardTop,
} from '../theme/layout';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { PaperCard } from './PaperCard';
import { MarkRow, marksFor } from './Marks';
import { formatDuration, type Monologue } from '../data/monologues';

/**
 * One monologue, printed on a page of sides, under the scroll spotlight.
 *
 * `lit` is derived from scroll offset alone — no measurement, no state, no JS
 * per frame. The card knows where it sits because every row is the same height
 * (see theme/layout.ts), so its distance from the light is arithmetic.
 *
 * ## What the light does now
 *
 * It used to be a coloured glow bleeding off the card's edges. In v2 it is a
 * hard block of gel yellow sliding out from behind the paper, plus the card
 * squaring up out of its tilt — a print effect rather than a lighting effect,
 * which is the whole move of this system. PaperCard owns all three (block,
 * rotation, dim); this component only decides where the light is.
 *
 * The card is never fully dark. Actors judge a monologue by reading it, so even
 * an unlit card keeps its text legible; the light is emphasis, not a gate.
 */

interface Props {
  item: Monologue;
  index: number;
  scrollY: SharedValue<number>;
  viewportHeight: number;
  reduceMotion: boolean;
  /** The glow colour, as hex — amber on the stage, violet in Film & TV. */
  accent?: string;
  /** Already in their book — marked so a scan of the list shows it. */
  saved?: boolean;
  /** The gel block's colour for this house. Yellow on stage, violet on screen. */
  blockColor?: string;
  /** Press value from the wrapping Pressable; squares the tilt under a thumb. */
  pressed?: SharedValue<number>;
}

/**
 * How dim an unlit card sits. The spotlight is the point of the list, so cards
 * outside it must recede — but 0.42 took the title to roughly 2.4:1 on paper,
 * which is below the floor for readable text and is what "the titles are black,
 * I can't see them" actually was. The light still falls off; it just no longer
 * falls off past legibility.
 */
const DARK = 0.66;

/** Alternating tilt, so a column of these reads as paper rather than a table. */
const TILTS = [-0.6, 0.5, -0.4];

const ROMAN: [number, string][] = [
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

/**
 * The numeral in the margin, lowercase, the way a script numbers its sides.
 *
 * Only to 39 — past that the numeral is wider than the margin column and stops
 * being a glance-able position, so the list falls back to arabic. Nobody is
 * scrolling to result forty and counting in roman anyway.
 */
export function roman(n: number): string {
  if (n > 39 || n < 1) return String(n);
  let rest = n;
  let out = '';
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

function MonologueCardImpl({
  item,
  index,
  scrollY,
  viewportHeight,
  reduceMotion,
  accent = colors.stageGlow,
  saved = false,
  blockColor,
  pressed,
}: Props) {
  const { colors: c } = useTheme();
  const hasPoster = Boolean(item.posterUrl);
  const lit = useDerivedValue(() => {
    if (reduceMotion) return 1;
    const centre = cardTop(index) + CARD_HEIGHT / 2 - scrollY.value;
    const distance = Math.abs(centre - viewportHeight * FOCUS_POINT);
    return interpolate(distance, [0, viewportHeight * FALLOFF], [1, 0], Extrapolation.CLAMP);
  });

  const marks = marksFor(item, { first: index === 0 });
  const marginWidth = hasPoster ? MARGIN_COL_POSTER : MARGIN_COL;

  return (
    <PaperCard
      lit={lit}
      pressed={pressed}
      rotate={TILTS[index % TILTS.length]}
      shadow={8}
      shadowColor={blockColor}
      dimTo={DARK}
      style={{
        height: CARD_HEIGHT,
        flexDirection: 'row',
        paddingTop: 16,
        paddingBottom: 14,
        paddingLeft: 12,
        paddingRight: 16,
        overflow: 'hidden',
      }}
    >
      {/* The margin: what a reader writes in. A poster stands in the same
          column for Film & TV, with the numeral under it. */}
      <View
        style={{
          width: marginWidth,
          alignItems: hasPoster ? 'flex-start' : 'flex-end',
          paddingRight: 10,
          marginRight: 12,
          borderRightWidth: 1,
          borderRightColor: c.paperRule,
        }}
      >
        {hasPoster ? (
          <View
            style={{
              width: MARGIN_COL_POSTER - 10,
              height: Math.round((MARGIN_COL_POSTER - 10) * 1.5),
              borderRadius: 3,
              borderWidth: 1.5,
              borderColor: c.ink,
              backgroundColor: '#1f1332',
              overflow: 'hidden',
              marginBottom: 8,
            }}
          >
            <Image
              source={{ uri: item.posterUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            alignSelf: hasPoster ? 'flex-start' : 'flex-end',
          }}
        >
          <Text
            style={{
              fontFamily: 'InstrumentSerif_400Regular_Italic',
              fontSize: 22,
              lineHeight: 24,
              color: c.paperFaint,
            }}
          >
            {roman(index + 1)}
          </Text>
          {/* The bookmark rides in the margin beside the numeral rather than
              floating in a corner, so scanning the list you see what you have
              already kept without having to look for it. */}
          {saved ? <Ionicons name="bookmark" size={12} color={colors.primary} /> : null}
        </View>
      </View>

      {/* `space-between` is what absorbs the slack when the marks take one row
          instead of two — see the note on CARD_HEIGHT in theme/layout.ts. */}
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: 'CourierPrime_700Bold',
                fontSize: 19,
                lineHeight: 21,
                color: c.paperInk,
              }}
            >
              {item.character}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'BricolageGrotesque_600SemiBold',
                fontSize: 11,
                color: c.paperMuted,
              }}
            >
              {formatDuration(item.duration)}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              fontFamily: 'CourierPrime_400Regular',
              fontSize: 12,
              lineHeight: 17,
              color: c.paperMuted,
            }}
          >
            {item.source}
            {item.year ? ` · ${item.year}` : item.author ? ` · ${item.author}` : ''}
          </Text>
        </View>

        {/* The first two lines. This is what an actor actually reads. */}
        <Text
          numberOfLines={2}
          style={{
            fontFamily: 'CourierPrime_400Regular',
            fontSize: 13,
            lineHeight: 20,
            color: c.paperBody,
          }}
        >
          {`“${item.excerpt}”`}
        </Text>

        <MarkRow marks={marks} />
      </View>
    </PaperCard>
  );
}

export const MonologueCard = memo(MonologueCardImpl);
