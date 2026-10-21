import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Keyboard, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { MediumToggle } from '../src/components/MediumToggle';
import { PaperCard } from '../src/components/PaperCard';
import { PieceCover } from '../src/components/PieceCover';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { WordArrow } from '../src/components/WordArrow';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { pickTonight, useHouseList } from '../src/hooks/useTonight';
import { track } from '../src/lib/analytics';
import { clock } from '../src/lib/segments';
import { mediumPalette, type Medium } from '../src/theme/medium';
import { useTheme } from '../src/theme/ThemeContext';
import { useSession } from '../src/lib/useSession';

/**
 * The curtain: what a stranger sees first.
 *
 * Not a tour and not an empty field. A monologue, lit, on paper, in the middle
 * of the dark stage. Tonight's speech first, the rest of the house behind it
 * one swipe at a time. Tap the page and you are reading it. One line of search
 * above, the two houses under it, and nothing else. The app is the thing it
 * sells, so the thing it sells is the first thing on.
 *
 * This is the stage door for anyone without an account. Sign in, and the home
 * with your book and your board takes over.
 */

export default function Curtain() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();

  const [medium, setMedium] = useState<Medium>('theatre');
  const pal = mediumPalette(medium, c.isLight);

  // Sign in from here and the home takes over, with the book and the board.
  const { isAuthenticated } = useSession();
  useEffect(() => {
    if (isAuthenticated) router.replace('/search');
  }, [isAuthenticated, router]);
  const list = useHouseList(medium);

  // The house, in the order the curtain shows it: tonight's speech, then the
  // rest of the list after it, wrapping round.
  const house = useMemo(() => {
    const h = list.filter((m) => (medium === 'screen' ? m.sourceType !== 'play' : m.sourceType === 'play'));
    const t = pickTonight(list, medium);
    const i = t ? h.findIndex((m) => m.id === t.id) : -1;
    return i < 0 ? h : [...h.slice(i), ...h.slice(0, i)];
  }, [list, medium]);
  const [at, setAt] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const piece = house.length ? house[((at % house.length) + house.length) % house.length] : null;

  const [query, setQuery] = useState('');

  // The next two posters are fetched while this page is up, so a swipe lands
  // on a cover and not on a blank where one is loading.
  useEffect(() => {
    if (house.length < 2) return;
    for (const k of [1, 2]) {
      const m = house[(((at + k) % house.length) + house.length) % house.length];
      if (m?.posterUrl) Image.prefetch(m.posterUrl).catch(() => {});
    }
  }, [house, at]);

  const changeHouse = useCallback((next: Medium) => {
    Haptics.selectionAsync().catch(() => {});
    setMedium(next);
    setAt(0);
  }, []);

  // The page: it arrives with a breath, follows the thumb sideways, and when
  // let go past the edge it leaves the way it was going while the next one
  // comes in from the other side.
  const x = useSharedValue(0);
  const shown = useSharedValue(0);
  const pressed = useSharedValue(0);
  useEffect(() => {
    const from = x.value === 0 ? 0 : -Math.sign(x.value) * 56;
    x.value = from;
    shown.value = 0;
    x.value = withSpring(0, { damping: 24, stiffness: 180, mass: 0.9 });
    shown.value = withTiming(1, { duration: reduce ? 160 : 520, easing: Easing.out(Easing.cubic) });
  }, [piece?.id, reduce, shown, x]);

  const step = useCallback(
    (dir: 1 | -1) => {
      setSwiped(true);
      setAt((i) => i + dir);
      track('app_curtain', { action: 'swipe' });
    },
    [],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      const gone = Math.abs(x.value) > width * 0.28 || Math.abs(e.velocityX) > 800;
      if (gone && house.length > 1) {
        const dir = x.value < 0 || e.velocityX < 0 ? -1 : 1;
        x.value = withTiming(dir * width, { duration: 220, easing: Easing.in(Easing.quad) }, (done) => {
          if (done) runOnJS(step)(dir === -1 ? 1 : -1);
        });
      } else {
        x.value = withSpring(0, { damping: 22, stiffness: 240, mass: 0.8 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: shown.value * (1 - Math.min(1, Math.abs(x.value) / width) * 0.6),
    transform: [
      { translateX: x.value },
      { translateY: reduce ? 0 : (1 - shown.value) * 22 },
      { rotate: `${(x.value / width) * 5}deg` },
      { scale: 1 - pressed.value * 0.015 },
    ],
  }));

  const hint = useSharedValue(1);
  useEffect(() => {
    hint.value = withTiming(swiped ? 0 : 1, { duration: 320 });
  }, [swiped, hint]);
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value * 0.9 }));

  const open = useCallback(() => {
    if (!piece) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    track('app_curtain', { action: 'open' });
    router.push({ pathname: '/read/[id]', params: { id: piece.id, medium } });
  }, [piece, medium, router]);

  const search = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    track('app_curtain', { action: 'search' });
    router.push({ pathname: '/results', params: { q, medium } });
  }, [query, medium, router]);

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} glowColor={pal.glow} background={pal.background} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <Pressable onPress={() => Keyboard.dismiss()} accessible={false} style={{ flex: 1, paddingHorizontal: 24 }}>
          {/* The lamp in the middle, the way in for people who already have a seat on the right. */}
          <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
              <GhostLight size={18} />
            </View>
            <Pressable
              onPress={() => {
                track('app_curtain', { action: 'sign_in' });
                router.push('/auth');
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              style={{ paddingVertical: 8 }}
            >
              <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>
                sign in
              </Text>
            </Pressable>
          </View>

          {/* One line to look for something, with the two houses under it. */}
          <View
            style={{
              marginTop: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderBottomWidth: 1,
              borderBottomColor: c.mutedForeground,
              paddingBottom: 8,
            }}
          >
            <Ionicons name="search-outline" size={18} color={c.mutedForeground} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              returnKeyType="search"
              placeholder={medium === 'screen' ? 'a cop on the edge…' : 'a grieving mother…'}
              placeholderTextColor={c.mutedForeground}
              autoCorrect={false}
              accessibilityLabel="Search for a monologue"
              style={{
                flex: 1,
                fontFamily: 'InstrumentSerif_400Regular_Italic',
                fontSize: 21,
                paddingVertical: 4,
                color: c.foreground,
              }}
            />
          </View>
          <View style={{ marginTop: 16, alignItems: 'center' }}>
            <MediumToggle medium={medium} onChange={changeHouse} />
          </View>

          {/* The page, in the middle of the stage. */}
          <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 12 }}>
            {piece ? (
              <GestureDetector gesture={pan}>
                <Animated.View style={cardStyle}>
                  <Pressable
                    onPress={open}
                    onPressIn={() => {
                      pressed.value = withTiming(1, { duration: 90 });
                    }}
                    onPressOut={() => {
                      pressed.value = withTiming(0, { duration: 180 });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${piece.character}, from ${piece.source}. Read it`}
                    accessibilityHint="Swipe sideways for another"
                  >
                    <PaperCard rotate={-0.6} shadow={8} pressed={pressed} style={{ padding: 22 }}>
                      {/* The head of the page: the cover of the thing the speech
                          came out of, the poster for a film or a series and the
                          cloth cover for a play, with the name and the source
                          beside it. */}
                      <View style={{ flexDirection: 'row', gap: 16 }}>
                        <View style={{ transform: [{ rotate: '-2deg' }], marginTop: 2 }}>
                          <PieceCover item={piece} width={68} height={98} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                          <StageDirection on="paper">{at === 0 && !swiped ? '(tonight.)' : '(another.)'}</StageDirection>
                          <Text
                            numberOfLines={2}
                            style={{
                              marginTop: 6,
                              fontFamily: 'InstrumentSerif_400Regular',
                              fontSize: 28,
                              lineHeight: 31,
                              letterSpacing: -0.4,
                              color: c.paperInk,
                            }}
                          >
                            {piece.character}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={{
                              marginTop: 4,
                              fontFamily: 'CourierPrime_400Regular_Italic',
                              fontSize: 13,
                              lineHeight: 17,
                              letterSpacing: 0.4,
                              color: c.paperMuted,
                            }}
                          >
                            {`from ${piece.source}`}
                          </Text>
                        </View>
                      </View>
                      <View style={{ marginTop: 16, height: 1.5, backgroundColor: c.ink }} />
                      <Text
                        numberOfLines={6}
                        style={{
                          marginTop: 14,
                          fontFamily: 'CourierPrime_400Regular',
                          fontSize: 14.5,
                          lineHeight: 22,
                          color: c.paperBody,
                        }}
                      >
                        {piece.excerpt}
                      </Text>
                      <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontFamily: 'CourierPrime_400Regular', fontSize: 12, letterSpacing: 0.6, color: c.paperMuted }}>
                          {piece.duration ? clock(piece.duration) : ''}
                        </Text>
                        <WordArrow label="read" onPress={open} tint={pal.accentText} />
                      </View>
                    </PaperCard>
                  </Pressable>
                </Animated.View>
              </GestureDetector>
            ) : null}
            {house.length > 1 ? (
              <Animated.View pointerEvents="none" style={[hintStyle, { alignItems: 'center', marginTop: 22 }]}>
                <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 12, letterSpacing: 0.8, color: c.mutedForeground }}>
                  (swipe for another.)
                </Text>
              </Animated.View>
            ) : null}
          </View>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
