import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { BlankPage, GAP, PEEK, PlaybillPage } from '../src/components/Playbill';
import { ShareCard, sharePiece } from '../src/components/ShareCard';
import { StageBackdrop } from '../src/components/StageBackdrop';
import type { Monologue } from '../src/data/monologues';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useHouse, useTonight } from '../src/hooks/useTonight';
import { track } from '../src/lib/analytics';
import { useSession } from '../src/lib/useSession';
import { mediumPalette, type Medium } from '../src/theme/medium';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * The curtain: what a stranger sees first.
 *
 * A playbill. One speech to a page, the poster or the cloth of the play at the
 * head of it fading into the paper the words are printed on, and the next page
 * showing under the edge of this one, so the thumb knows what to do without a
 * line telling it. Tonight's speech is the first page. Tap a page and you are
 * reading it. The two houses are two words in the header; a magnifier opens
 * one line of search over the deck for the person who arrived knowing what
 * they want. Nothing else is on.
 *
 * This is the stage door for anyone without an account. Sign in, and the home
 * with your book and your board takes over.
 */

const HOUSES: { key: Medium; label: string }[] = [
  { key: 'theatre', label: 'Stage' },
  { key: 'screen', label: 'Film & TV' },
];

export default function Curtain() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();

  const [medium, setMedium] = useState<Medium>('theatre');
  const pal = mediumPalette(medium, c.isLight);

  // Sign in from here and the home takes over, with the book and the board.
  const { isAuthenticated } = useSession();
  useEffect(() => {
    if (isAuthenticated) router.replace('/search');
  }, [isAuthenticated, router]);

  const { list, settled, failed, retry } = useHouse(medium);
  const tonight = useTonight(medium);

  // The house, in the order the playbill prints it: tonight's speech, the one
  // the widget on the home screen is showing, then the rest of the shelf
  // after it, wrapping round. Tonight's goes in front even when the shelf
  // does not hold it.
  const house = useMemo(() => {
    const h = list.filter((m) => (medium === 'screen' ? m.sourceType !== 'play' : m.sourceType === 'play'));
    if (!tonight) return h;
    const i = h.findIndex((m) => m.id === tonight.id);
    return i < 0 ? [tonight, ...h] : [...h.slice(i), ...h.slice(0, i)];
  }, [list, medium, tonight]);

  // The deck's geometry comes from the screen, measured once it is laid out.
  const [deckH, setDeckH] = useState(0);
  const cardH = Math.max(0, deckH - insets.bottom - PEEK - GAP);
  const page = cardH + GAP;

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const [at, setAt] = useState(0);
  const listRef = useRef<Animated.FlatList<Monologue>>(null);

  const settle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (page <= 0) return;
      const i = Math.max(0, Math.min(house.length - 1, Math.round(e.nativeEvent.contentOffset.y / page)));
      if (i === at) return;
      setAt(i);
      Haptics.selectionAsync().catch(() => {});
      track('app_curtain', { action: 'swipe' });
    },
    [at, house.length, page],
  );

  // The next two posters are fetched while this page is up, so a swipe lands
  // on a picture and not on a block where one is loading.
  useEffect(() => {
    const urls = [1, 2].map((k) => house[at + k]?.posterUrl).filter((u): u is string => Boolean(u));
    if (urls.length) Image.prefetch(urls).catch(() => {});
  }, [house, at]);

  const changeHouse = useCallback(
    (next: Medium) => {
      if (next === medium) return;
      Haptics.selectionAsync().catch(() => {});
      track('app_curtain', { action: 'house' });
      setMedium(next);
      setAt(0);
      scrollY.value = 0;
    },
    [medium, scrollY],
  );

  const open = useCallback(
    (piece: Monologue) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      track('app_curtain', { action: 'open' });
      router.push({ pathname: '/read/[id]', params: { id: piece.id, medium } });
    },
    [medium, router],
  );

  // The share card is photographed off the edge of the screen. It is drawn for
  // the piece last held, so the capture has something to take.
  const shareRef = useRef<View>(null);
  const [sharing, setSharing] = useState<Monologue | null>(null);
  const share = useCallback((piece: Monologue) => {
    setSharing(piece);
    // One frame for the card to draw the new piece before it is photographed.
    requestAnimationFrame(() => void sharePiece(shareRef, piece, 'curtain'));
  }, []);

  // One line of search, folded under the header until the magnifier is tapped.
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState('');
  const fold = useSharedValue(0);
  useEffect(() => {
    fold.value = withTiming(finding ? 1 : 0, { duration: reduce ? 120 : 280, easing: Easing.out(Easing.cubic) });
  }, [finding, fold, reduce]);
  const foldStyle = useAnimatedStyle(() => ({
    height: fold.value * 52,
    opacity: fold.value,
    marginBottom: fold.value * 10,
  }));
  const toggleFind = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (finding) Keyboard.dismiss();
    setFinding((f) => !f);
  }, [finding]);
  const search = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    track('app_curtain', { action: 'search' });
    router.push({ pathname: '/results', params: { q, medium } });
  }, [query, medium, router]);

  // The blank sheet breathes while the house is still answering.
  const breath = useSharedValue(1);
  useEffect(() => {
    breath.value = reduce ? 0.85 : withRepeat(withTiming(0.55, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [breath, reduce]);
  const breathStyle = useAnimatedStyle(() => ({ opacity: breath.value }));

  const renderItem = useCallback(
    ({ item, index }: { item: Monologue; index: number }) => (
      <PlaybillPage
        item={item}
        index={index}
        scrollY={scrollY}
        page={page}
        height={cardH}
        first={index === 0}
        reduce={reduce}
        onOpen={() => open(item)}
        onShare={() => share(item)}
      />
    ),
    [cardH, open, page, reduce, scrollY, share],
  );

  const houseWord = (h: { key: Medium; label: string }) => {
    const on = h.key === medium;
    return (
      <Pressable key={h.key} onPress={() => changeHouse(h.key)} hitSlop={10} accessibilityRole="tab" accessibilityState={{ selected: on }}>
        <Text
          style={{
            fontFamily: on ? 'CourierPrime_700Bold' : 'CourierPrime_400Regular',
            fontSize: 13,
            letterSpacing: 0.8,
            color: on ? c.foreground : c.mutedForeground,
          }}
        >
          {h.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} glowColor={pal.glow} background={pal.background} />
      {sharing ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: -1000, top: 0 }}>
          <ShareCard ref={shareRef} piece={sharing} />
        </View>
      ) : null}
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* The header: the two houses, the lamp, a magnifier, the way in. */}
        <View style={{ height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>{HOUSES.map(houseWord)}</View>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
            <GhostLight size={18} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Pressable onPress={toggleFind} hitSlop={10} accessibilityRole="button" accessibilityLabel={finding ? 'Close search' : 'Search'}>
              <Ionicons name={finding ? 'close-outline' : 'search-outline'} size={20} color={c.foreground} />
            </Pressable>
            <Pressable
              onPress={() => {
                track('app_curtain', { action: 'sign_in' });
                router.push('/auth');
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>
                sign in
              </Text>
            </Pressable>
          </View>
        </View>

        {/* The line of search, folded away until asked for. */}
        <Animated.View style={[foldStyle, { marginHorizontal: 20, overflow: 'hidden' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: c.mutedForeground, paddingBottom: 8, marginTop: 6 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              returnKeyType="search"
              autoFocus={finding}
              placeholder={medium === 'screen' ? 'a cop on the edge…' : 'a grieving mother…'}
              placeholderTextColor={c.mutedForeground}
              autoCorrect={false}
              accessibilityLabel="Search for a monologue"
              style={{ flex: 1, fontFamily: 'InstrumentSerif_400Regular_Italic', fontSize: 21, paddingVertical: 4, color: c.foreground }}
            />
          </View>
        </Animated.View>

        {/* The deck. */}
        <View style={{ flex: 1, marginTop: 6 }} onLayout={(e) => setDeckH(e.nativeEvent.layout.height)}>
          {deckH > 0 ? (
            <Animated.View key={medium} entering={FadeIn.duration(reduce ? 120 : 360)} exiting={FadeOut.duration(160)} style={{ flex: 1 }}>
              {house.length > 0 ? (
                <Animated.FlatList
                  ref={listRef}
                  data={house}
                  keyExtractor={(m) => m.id}
                  renderItem={renderItem}
                  onScroll={onScroll}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={settle}
                  snapToInterval={page}
                  decelerationRate="fast"
                  disableIntervalMomentum
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={2}
                  windowSize={5}
                  getItemLayout={(_, i) => ({ length: page, offset: page * i, index: i })}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: PEEK + insets.bottom }}
                  keyboardDismissMode="on-drag"
                />
              ) : (
                <View style={{ paddingHorizontal: 20 }}>
                  {!settled ? (
                    <Animated.View style={breathStyle}>
                      <BlankPage height={cardH} />
                    </Animated.View>
                  ) : (
                    <BlankPage
                      height={cardH}
                      line={failed ? '(the house is dark. tap to try again.)' : '(nothing on tonight.)'}
                      onPress={
                        failed
                          ? () => {
                              track('app_curtain', { action: 'retry' });
                              retry();
                            }
                          : undefined
                      }
                    />
                  )}
                </View>
              )}
            </Animated.View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
