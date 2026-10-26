import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { Deck, DECK_DOCK, DECK_PEEK } from '../src/components/Deck';
import { BlankPage, PlaybillCard } from '../src/components/Playbill';
import { ShareCard, sharePiece } from '../src/components/ShareCard';
import { StageBackdrop } from '../src/components/StageBackdrop';
import type { Monologue } from '../src/data/monologues';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useHouse, useTonight } from '../src/hooks/useTonight';
import { track } from '../src/lib/analytics';
import { PENDING_KEEP } from '../src/lib/keep';
import { useSession } from '../src/lib/useSession';
import { mediumPalette, type Medium } from '../src/theme/medium';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * The curtain: what a stranger sees first.
 *
 * A deck of playbills you throw. One speech to a card, the poster or the cover
 * of the play at the head of it fading into the paper the words are printed
 * on, the next two waiting behind with their heads showing. Swipe right to
 * keep it (which asks for the account it will be kept in, and keeps it the
 * moment that exists), left for another, tap to read it. Tonight's speech is
 * the first card. The two houses are two words in the header; a magnifier
 * opens one line of search over the deck for the person who arrived knowing
 * what they want. Nothing else is on.
 *
 * This is the stage door for anyone without an account. Sign in, and the home
 * with your book and your board takes over.
 */

const HOUSES: { key: Medium; label: string }[] = [
  { key: 'theatre', label: 'Plays' },
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
  // Only while this is the room on top: the sign-in page sits over the
  // curtain, and the moment the session arrived this used to replace the
  // page on top, the sign-in page itself, with the home; the page's own
  // "back" then popped the home away and left the actor signed in on the
  // curtain, with nothing left to move them on.
  const { isAuthenticated } = useSession();
  useFocusEffect(useCallback(() => {
    if (!isAuthenticated) return;
    try { router.dismissAll(); } catch { /* the curtain is the root */ }
    router.replace('/search');
  }, [isAuthenticated, router]));

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

  // The deck's height comes from the screen, measured once it is laid out, and
  // capped: a card is a page of sides, not a poster, and sits in the middle of the room.
  const [deckH, setDeckH] = useState(0);
  // The deck fills the room down to the home indicator; the buttons sit at its
  // foot and the card takes the rest, no taller than a playbill needs.
  const deckSpace = Math.max(0, deckH - insets.bottom - 6);
  const cardH = Math.max(0, Math.min(deckSpace - DECK_DOCK - DECK_PEEK, 420));
  const [at, setAt] = useState(0);
  // The next two posters are fetched while this card is up, so a throw lands
  // on a picture and not on a block where one is loading.
  useEffect(() => {
    const urls = [1, 2].map((k) => house[(at + k) % Math.max(1, house.length)]?.posterUrl).filter((u): u is string => Boolean(u));
    if (urls.length) Image.prefetch(urls).catch(() => {});
  }, [house, at]);
  // Keep: the card is kept in the book, which needs the account the book is
  // in. The piece is remembered on the phone and saved the moment they sign in
  // (app/_layout.tsx), so the throw is not a promise the app forgets.
  const keep = useCallback(
    (piece: Monologue) => {
      track('app_curtain', { action: 'keep' });
      setAt((n) => n + 1);
      void AsyncStorage.setItem(PENDING_KEEP, piece.id).catch(() => {});
      router.push('/auth');
    },
    [router],
  );
  const pass = useCallback(() => {
    track('app_curtain', { action: 'pass' });
    setAt((n) => n + 1);
  }, []);
  const changeHouse = useCallback(
    (next: Medium) => {
      if (next === medium) return;
      Haptics.selectionAsync().catch(() => {});
      track('app_curtain', { action: 'house' });
      setMedium(next);
      setAt(0);
    },
    [medium],
  );

  const open = useCallback(
    (piece: Monologue) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      track('app_curtain', { action: 'open' });
      router.push({ pathname: '/peek/[id]', params: { id: piece.id, medium, from: 'curtain' } });
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

  const houseWord = (h: { key: Medium; label: string }) => {
    const on = h.key === medium;
    return (
      <Pressable key={h.key} onPress={() => changeHouse(h.key)} hitSlop={10} accessibilityRole="tab" accessibilityState={{ selected: on }}
        style={{ paddingBottom: 2, borderBottomWidth: 1.5, borderBottomColor: on ? c.foreground : 'transparent' }}>
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
        {/* The header: the lamp in the middle, a magnifier and the way in at the sides. */}
        <View style={{ height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={toggleFind} hitSlop={10} accessibilityRole="button" accessibilityLabel={finding ? 'Close search' : 'Search'} style={{ width: 36, alignItems: 'flex-start' }}>
            <Ionicons name={finding ? 'close-outline' : 'search-outline'} size={20} color={c.foreground} />
          </Pressable>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
            <GhostLight size={18} />
          </View>
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

        {/* The bill: the two houses on one line, the door to the first scenes on the next, a rule under each. */}
        <View style={{ marginHorizontal: 20, marginTop: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 18, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: c.divider }}>{HOUSES.map(houseWord)}</View>
          <Pressable onPress={() => { track('app_curtain', { action: 'demo' }); router.push('/demo'); }} hitSlop={6} accessibilityRole="button" accessibilityLabel="Run a scene with a partner"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider }}>
            <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, letterSpacing: 0.5, color: c.accentText }}>or run a scene with a partner</Text>
            <Ionicons name="arrow-forward" size={13} color={c.accentText} />
          </Pressable>
        </View>

        {/* The deck. */}
        <View style={{ flex: 1, marginTop: 6 }} onLayout={(e) => setDeckH(e.nativeEvent.layout.height)}>
          {deckH > 0 ? (
            <Animated.View key={medium} entering={FadeIn.duration(reduce ? 120 : 360)} exiting={FadeOut.duration(160)} style={{ flex: 1, justifyContent: 'center' }}>
              {house.length > 0 ? (
                <View style={{ paddingHorizontal: 20 }}>
                  <Deck
                    items={house}
                    keyOf={(m) => m.id}
                    deckKey={medium}
                    height={deckSpace}
                    cardHeight={cardH}
                    reduce={reduce}
                    onKeep={keep}
                    onPass={pass}
                    onOpen={open}
                    onHold={share}
                    renderCard={(item, first) => (
                      <PlaybillCard item={item} height={cardH} first={first} onOpen={() => open(item)} />
                    )}
                  />
                </View>
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
