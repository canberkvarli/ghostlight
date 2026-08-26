import { memo } from 'react';
import { Image, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { CARD_HEIGHT, FALLOFF, FOCUS_POINT, cardTop } from '../theme/layout';
import { colors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { OVERDONE_THRESHOLD, formatDuration, type Monologue } from '../data/monologues';

/**
 * One monologue under the scroll spotlight.
 *
 * `lit` is derived from scroll offset alone — no measurement, no state, no JS
 * per frame. The card knows where it sits because every row is the same height
 * (see theme/layout.ts), so its distance from the light is arithmetic.
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
  /** rgba() lit-card border for the current medium. */
  litBorder?: string;
}

/**
 * How dim an unlit card sits. The spotlight is the point of the list, so cards
 * outside it must recede — but 0.42 took the title to roughly 2.4:1 on paper,
 * which is below the floor for readable text and is what "the titles are black,
 * I can't see them" actually was. The light still falls off; it just no longer
 * falls off past legibility.
 */
const DARK = 0.66;

function MonologueCardImpl({
  item,
  index,
  scrollY,
  viewportHeight,
  reduceMotion,
  accent = colors.stageGlow,
  litBorder = 'rgba(243, 130, 29, 0.55)',
}: Props) {
  const { colors: c } = useTheme();
  const hasPoster = Boolean(item.posterUrl);
  const lit = useDerivedValue(() => {
    if (reduceMotion) return 1;
    const centre = cardTop(index) + CARD_HEIGHT / 2 - scrollY.value;
    const distance = Math.abs(centre - viewportHeight * FOCUS_POINT);
    return interpolate(
      distance,
      [0, viewportHeight * FALLOFF],
      [1, 0],
      Extrapolation.CLAMP,
    );
  });

  // `colors.dark.cardBorder` was hardcoded here, so a dark-stage hairline was
  // drawn around cards sitting on paper. Follow the theme instead.
  const unlitBorder = c.cardBorder;
  const containerStyle = useAnimatedStyle(() => ({
    opacity: DARK + lit.value * (1 - DARK),
    transform: [{ scale: 0.968 + lit.value * 0.032 }],
    borderColor: interpolateColor(lit.value, [0, 1], [unlitBorder, litBorder]),
    shadowOpacity: lit.value * 0.5,
  }));

  const overdone = item.overdoneScore >= OVERDONE_THRESHOLD;

  return (
    <Animated.View
      style={[
        containerStyle,
        {
          height: CARD_HEIGHT,
          borderRadius: 18,
          borderWidth: 1,
          backgroundColor: c.card,
          shadowColor: accent,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 0 },
          flexDirection: 'row',
          overflow: 'hidden',
        },
      ]}
    >
      {/* Film & TV: the poster stands the piece up in the aisle. */}
      {hasPoster ? (
        <View style={{ width: 108, height: '100%', backgroundColor: '#000' }}>
          <Image
            source={{ uri: item.posterUrl }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>
      ) : null}

      <View style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: hasPoster ? 16 : 20, paddingVertical: 16 }}>
        <View>
          <Text
            numberOfLines={1}
            className="text-[19px] leading-[24px] text-foreground"
            style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
          >
            {hasPoster ? item.character : item.title}
          </Text>
          <Text
            numberOfLines={1}
            className="mt-1 text-[12px] uppercase tracking-[1.4px] text-muted-foreground"
            style={{ fontFamily: 'Montserrat_500Medium' }}
          >
            {hasPoster
              ? `${item.source}${item.year ? ` · ${item.year}` : ''}`
              : `${item.character} · ${item.source}`}
          </Text>
        </View>

        {/* The first two lines. This is what an actor actually reads. */}
        <Text
          numberOfLines={2}
          className="text-[13px] leading-[19px] text-foreground/90"
          style={{ fontFamily: 'CourierPrime_400Regular' }}
        >
          {item.excerpt}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8 }}>
          <Meta>{item.ageRange}</Meta>
          <Dot />
          <Meta>{item.gender === 'any' ? 'any' : item.gender}</Meta>
          <Dot />
          <Meta>{formatDuration(item.duration)}</Meta>
          {overdone ? (
            <View
              style={{
                marginLeft: 'auto',
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: 'rgba(203, 75, 0, 0.18)',
              }}
            >
              <Text
                className="text-[10px] uppercase tracking-[1.2px]"
                style={{ fontFamily: 'Montserrat_600SemiBold', color: accent }}
              >
                overdone
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="text-[11px] text-muted-foreground"
      style={{ fontFamily: 'Montserrat_400Regular' }}
    >
      {children}
    </Text>
  );
}

function Dot() {
  return <Text className="text-[11px] text-muted-foreground/50">·</Text>;
}

export const MonologueCard = memo(MonologueCardImpl);
