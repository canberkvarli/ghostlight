import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import type { Monologue } from '../data/monologues';
import { clock } from '../lib/segments';
import { useTheme } from '../theme/ThemeContext';
import { PaperCard } from './PaperCard';
import { Cover } from './Cover';
import { SCREEN_BLOCK } from './PieceCover';
import { sharpPoster } from '../lib/posters';
import { StageDirection } from './StageDirection';
import { WordArrow } from './WordArrow';

/**
 * One card of the playbill. The poster, or the cover of the play's edition,
 * fills the top of the card and fades down into the paper the words are
 * printed on, so the picture and the speech are one sheet, not a thumbnail
 * beside a caption. The deck throws these; the card itself only knows how to
 * be tapped (read it) and held (share it).
 */
/** The dark between two sheets, where sheets stack. */
export const GAP = 14;

export function PlaybillCard({
  item,
  height,
  first,
  onOpen,
  onShare,
}: {
  item: Monologue;
  /** The card's height. */
  height: number;
  first: boolean;
  onOpen: () => void;
  onShare: () => void;
}) {
  const { colors: c } = useTheme();
  const pressed = useSharedValue(0);
  const screen = item.sourceType === 'film' || item.sourceType === 'tv';
  const pictureH = Math.round(height * 0.55);
  // However many lines of the speech fit between the name and the foot of the
  // page, so a tall phone shows more of it and a short one is not crowded.
  const lines = Math.max(3, Math.min(6, Math.floor((height - pictureH - 200) / 22)));
  return (
    <View style={{ height }}>
      <Pressable
        onPress={onOpen}
        onLongPress={onShare}
        onPressIn={() => {
          pressed.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, { duration: 180 });
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.character}, from ${item.source}. Read it`}
        accessibilityHint="Swipe right to keep it, left for another. Press and hold to share it as a picture"
        style={{ flex: 1 }}
      >
        <PaperCard shadow={8} pressed={pressed} wrapperStyle={{ flex: 1 }} style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
          {/* The picture. The poster for the screen, the cover of the edition for a play. */}
          <View style={{ height: pictureH, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
              {screen && item.posterUrl ? (
                <Image
                  source={{ uri: sharpPoster(item.posterUrl) }}
                  style={{ width: '100%', height: '100%', backgroundColor: SCREEN_BLOCK }}
                  contentFit="cover"
                  contentPosition="top"
                  cachePolicy="memory-disk"
                  transition={240}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Cover item={item} height={pictureH} screen={screen} />
              )}
            </View>
            {/* The picture fades into the paper. */}
            <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(pictureH * 0.55) }}>
              <Rect x={0} y={0} width={2000} height={Math.round(pictureH * 0.55)}>
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(0, Math.round(pictureH * 0.55))}
                  colors={[`${c.paper}00`, `${c.paper}cc`, c.paper]}
                  positions={[0, 0.62, 1]}
                />
              </Rect>
            </Canvas>
          </View>

          {/* The words, printed on the paper the picture faded into. */}
          <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 18, marginTop: -8, justifyContent: 'space-between' }}>
            <View>
              <StageDirection on="paper">{first ? '(tonight.)' : '(another.)'}</StageDirection>
              <Text
                numberOfLines={2}
                style={{
                  marginTop: 6,
                  fontFamily: 'InstrumentSerif_400Regular',
                  fontSize: 34,
                  lineHeight: 37,
                  letterSpacing: -0.5,
                  color: c.paperInk,
                }}
              >
                {item.character}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 4,
                  fontFamily: 'CourierPrime_400Regular_Italic',
                  fontSize: 13,
                  lineHeight: 17,
                  letterSpacing: 0.4,
                  color: c.paperMuted,
                }}
              >
                {`from ${item.source}`}
              </Text>
              <Text
                numberOfLines={lines}
                style={{
                  marginTop: 12,
                  fontFamily: 'CourierPrime_400Regular',
                  fontSize: 14.5,
                  lineHeight: 22,
                  color: c.paperBody,
                }}
              >
                {item.excerpt}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'CourierPrime_400Regular', fontSize: 12, letterSpacing: 0.6, color: c.paperMuted }}>
                {item.duration ? clock(item.duration) : ''}
              </Text>
              <WordArrow label="read" onPress={onOpen} tint={c.accentText} />
            </View>
          </View>
        </PaperCard>
      </Pressable>
    </View>
  );
}

/**
 * A blank sheet in the same frame: what the deck shows while the house is
 * still answering, or the one line it has to say when it did not.
 */
export function BlankPage({ height, line, onPress }: { height: number; line?: string; onPress?: () => void }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ height, marginBottom: GAP }}>
      <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1 }}>
        <PaperCard shadow={onPress ? 8 : 0} wrapperStyle={{ flex: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {line ? (
            <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, letterSpacing: 0.8, color: c.paperMuted }}>{line}</Text>
          ) : null}
        </PaperCard>
      </Pressable>
    </View>
  );
}
