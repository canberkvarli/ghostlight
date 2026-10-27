import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight, ghostLightMetrics } from '../../../src/components/GhostLight';
import {
  loadSearchHistory,
  pushSearchHistory,
  removeSearchHistory,
  type RecentSearch,
} from '../../../src/lib/searchHistory';
import { StageBackdrop } from '../../../src/components/StageBackdrop';
import { StageDirection } from '../../../src/components/StageDirection';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useStageMotion } from '../../../src/hooks/useStageMotion';
import { MediumToggle } from '../../../src/components/MediumToggle';
import { FilterSheet } from '../../../src/components/FilterSheet';
import { useAuditions } from '../../../src/hooks/useAuditions';
import { useNudge } from '../../../src/hooks/useNudge';
import { useHouseList, useTonight } from '../../../src/hooks/useTonight';
import { trackNudgeOpen, type Nudge } from '../../../src/lib/nudges';
import { isFresh, loadRecents, type RecentPiece } from '../../../src/lib/recents';
import { useFavorites } from '../../../src/hooks/useFavorites';
import { Trending } from '../../../src/components/Trending';
import { track } from '../../../src/lib/analytics';
import { useEntitlement } from '../../../src/hooks/useEntitlement';
import { useSession } from '../../../src/lib/useSession';
import { colors, radius } from '../../../src/theme/tokens';
import { pickPromptIndex, promptAt } from '../../../src/data/prompts';
import {
  FILTER_CHIPS,
  EMPTY_SELECTION,
  advancedCount,
  chipKey,
  chipText,
  selectionToParams,
  type FilterChip,
  type Selection,
} from '../../../src/data/filters';
import { mediumPalette, type Medium } from '../../../src/theme/medium';
import { useTheme } from '../../../src/theme/ThemeContext';
import { useTabBarSpace } from '../../../src/components/TabBar';
import { useHideBarOnScroll } from '../../../src/lib/barScroll';
import { Initial } from '../../../src/components/Initial';
import { UpNext } from '../../../src/components/UpNext';

/**
 * Step 2 — Search is home.
 *
 * No dashboard, no tab bar landing elsewhere. In v2 the screen opens on a
 * question rather than on its own name: the wordmark and the "(every monologue.
 * one stage.)" line are gone, and the brand lives on the launch screen, where
 * you have just seen it. What is left is a greeting, the two houses, the field
 * and the filters — which is the order you would actually think in.
 *
 * The field is a sheet of paper on a block of gel with the ghost light standing
 * over it, and its ink disc is the ONLY submit. The footer button is gone: two
 * buttons for one action, a thumb-width apart, was a choice nobody wanted.
 *
 * Two houses: Theatre (the amber stage, plays) and Film & TV (a violet cinema
 * house, posters). The toggle flashes the house lights over to the new colour
 * and the whole screen — bulb, wash, chips, floor — answers.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The lamp, small — not the standing fixture from the launch screen. It stays on
 * this screen for two reasons: it is the thing the empty-handed search blows
 * out, and a search screen with no ghost light on it is a search screen that
 * could belong to anything.
 *
 * Two sizes, because a subscriber's lamp should be visibly a little more lamp.
 * That distinction predates the redesign and the redesign nearly deleted it by
 * accident; it is a deliberate signal that paying changed something you can see
 * on the first screen.
 *
 * What it is NOT any more is a change of dress. `full` draws a threaded brass
 * base, and GhostLight is explicit that below ~60pt the threads stop reading and
 * turn to smudge — so at v2's scale the dressed lamp would have been a worse
 * drawing, not a richer one. The signal is carried by size and by the light it
 * throws instead. Both dressings are `bare`, which already includes the pole and
 * the foot.
 */
// The lamp as a bitmap, not the SVG: the vector mark rendered as a blank
// square in a release bundle, which left the name floating a step to the
// right of nothing, as if something were missing. Something was.
const MARK = require('../../../assets/ghostlight-lamp.png');
const LAMP_GLASS_PAID = 16;
const LAMP_GLASS_FREE = 14;

// Both measured up front, so the layout holds the taller one's room and keeps
// the glass at a fixed height whichever is showing. Without this, entitlement
// resolving a beat after mount swaps one lamp for the other and shoves the whole
// screen down — which is exactly the bug this arithmetic was written to fix.
const LAMP_PAID = ghostLightMetrics(LAMP_GLASS_PAID, 'bare');
const LAMP_FREE = ghostLightMetrics(LAMP_GLASS_FREE, 'bare');
const LAMP_BOX = Math.max(LAMP_PAID.canvasH, LAMP_FREE.canvasH);
const LAMP_GLASS = Math.max(LAMP_PAID.glassCy, LAMP_FREE.glassCy);

/**
 * The top row: the book at its left, the lamp in the middle, Account at its
 * right. The lamp lives here now, small and still, the way a mark lives in a
 * masthead; it stood over the headline before, and a screen that scrolls kept
 * cutting it off at the edge. It is still the thing the empty-handed search
 * blows out.
 */
const HEADER_H = 44;

/*
 * There was a `LampStand` here — a dashed stem and an ellipse of floor drawn
 * under the bulb. It was a mistake born of reading the handoff without reading
 * the component: `GhostLight` in `bare` dress ALREADY draws a pole and a foot,
 * so the screen had two stands under one lamp, the real one and a sketch of one
 * hanging off its bottom. Removed. The bulb stands on its own.
 */

export default function Search() {
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const onBarScroll = useHideBarOnScroll();
  const tabSpace = useTabBarSpace();
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const { loading: sessionLoading, isAuthenticated } = useSession();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Selection>(EMPTY_SELECTION);
  const [medium, setMediumState] = useState<Medium>('theatre');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [history, setHistory] = useState<RecentSearch[]>([]);
  const [recents, setRecents] = useState<RecentPiece[]>([]);

  // One greeting per open, rolled in the initialiser — not an interval, not an
  // effect (see src/data/prompts.ts). Switching house re-reads the same index
  // out of the other list, so Film & TV changes the words without re-rolling.
  const [promptIndex] = useState(pickPromptIndex);
  const prompt = promptAt(medium, promptIndex);

  // On focus, not on mount: Search stays mounted under Results, so a list read
  // once at mount never learned about anything searched since.
  useFocusEffect(
    useCallback(() => {
      void loadSearchHistory().then(setHistory);
      void loadRecents().then(setRecents);
    }, []),
  );
  // Each house keeps its own past. Hamlet belongs to the plays; switching to
  // Film & TV shows what you looked for there, and switching back finds it again.
  const houseHistory = useMemo(() => history.filter((h) => h.medium === medium), [history, medium]);
  const forget = useCallback((item: RecentSearch) => {
    Haptics.selectionAsync().catch(() => {});
    void removeSearchHistory(item).then(setHistory);
  }, []);
  const pal = mediumPalette(medium, c.isLight);

  /**
   * The headline is sized from the window rather than fixed at 42.
   *
   * Both of its lines are one-line by design — the italic word has to stay on
   * the line it was written for — so a fixed size means the longest prompt
   * ("Say it the way / you would say it.") clips on a small phone. Scaling one
   * number keeps BOTH lines matched, where `adjustsFontSizeToFit` shrinks them
   * independently and leaves line two visibly smaller than line one.
   *
   * 8.2 is Instrument Serif's rough advance per character at 1pt, taken off the
   * longest prompt with the gutters removed.
   */
  const headline = Math.max(30, Math.min(40, Math.floor((width - 56) / 8.2)));

  /**
   * And the line box has to be TALLER than the type, not shorter.
   *
   * The design calls for 0.95 leading and that is what CSS does happily: the
   * glyphs simply overflow a short line box and nothing is lost. React Native
   * clips to the line box instead, so `lineHeight: fontSize * 0.98` cut the
   * descenders off "Say it the way / you would say it." and the ascenders off
   * the line beneath — the same thing that was wrong with the marquee on the
   * site, arrived at the same way.
   *
   * Instrument Serif is a high-contrast display face with long descenders, so it
   * wants about 1.12. The headline is a touch smaller to pay for the extra
   * leading, and the block reserves two full line boxes so a short second line
   * still cannot let the field slide up the screen.
   */
  const headlineLine = Math.round(headline * 1.12);

  // Everyone can open the sheet and use the free identity/length filters; the
  // craft filters inside (tone, emotion, freshness) route to the paywall for
  // free actors. isPaid comes from the server read counter.
  const { isPaid, settled: entitlementSettled } = useEntitlement();

  const advanced = advancedCount(selected);


  const openMoreFilters = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setSheetOpen(true);
  }, []);

  // The bulb answers the search: it flares as the actor types and flares harder
  // on submit, then settles to a gentle idle while there's a query.
  // Declared above `setMedium` because that callback's dependency array reads
  // it, and a `const` further down would be in the temporal dead zone.
  const bulbBoost = useSharedValue(0);

  // While the session or the entitlement is unsettled (first launch, and the
  // teardown after a sign-out) the lamp goes OUT rather than away. The size it
  // comes back at depends on isPaid, and swapping sizes on a lit lamp made it
  // vanish and reappear; swapped in the dark, nobody sees the fixture change.
  const unsettled = sessionLoading || !entitlementSettled;
  useEffect(() => {
    bulbBoost.value = withTiming(unsettled ? -1 : 0, {
      duration: unsettled ? 160 : 620,
      easing: unsettled ? Easing.in(Easing.quad) : Easing.out(Easing.cubic),
    });
  }, [unsettled, bulbBoost]);

  // The house-lights flash: a wash of the new colour that blooms and fades as
  // the medium changes, so the switch feels like a lighting cue, not a repaint.
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.28 }));

  const setMedium = useCallback(
    (next: Medium) => {
      if (next === medium) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
      setMediumState(next);
      flash.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 520 }));
      // Changing house is a lighting change, so the lamp restrikes: a hard dip,
      // two stutters, then settle. The colour wash alone read as a repaint.
      bulbBoost.value = withSequence(
        withTiming(0, { duration: 60 }),
        withTiming(0.9, { duration: 90 }),
        withTiming(0.15, { duration: 70 }),
        withTiming(0.75, { duration: 110 }),
        withTiming(0, { duration: 460 }),
      );
    },
    [medium, flash, bulbBoost],
  );

  const onChangeQuery = useCallback(
    (text: string) => {
      setQuery(text);
      bulbBoost.value = withSequence(
        withTiming(0.5, { duration: 70 }),
        withTiming(text.trim() ? 0.18 : 0, { duration: 420 }),
      );
    },
    [bulbBoost],
  );

  /**
   * Focus, in one value.
   *
   * The paper lifts: the gel block behind it grows from 6 to 10 and the sheet
   * straightens out of its −0.6° tilt over 180ms, which reads as picking the
   * page up rather than as a border changing colour. The field itself never
   * MOVES — that is the one moment on this screen that has to be dead steady —
   * so what clears is everything below it: the chips and the recents fade and
   * drop away rather than sit half-covered by a keyboard. They come straight
   * back on blur with the choices intact.
   */
  const focus = useSharedValue(0);
  // React state only because pointerEvents can't be animated; twice per focus
  // cycle, never per frame.
  const [fieldFocused, setFieldFocused] = useState(false);

  const belowStyle = useAnimatedStyle(() => ({
    opacity: 1 - focus.value,
    transform: [{ translateY: 18 * focus.value }, { scale: 1 - 0.04 * focus.value }],
  }));
  const fieldStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-0.6 * (1 - focus.value)}deg` }],
  }));
  const fieldBlockStyle = useAnimatedStyle(() => {
    const d = 6 + 4 * focus.value;
    return { transform: [{ translateX: d }, { translateY: d }] };
  });

  const toggle = useCallback((chip: FilterChip) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => ({
      ...prev,
      // Tap a lit chip to clear its group; tap an unlit one to replace the group.
      [chip.group]: prev[chip.group] === chip.value ? undefined : chip.value,
    }));
  }, []);

  // The empty-handed search. A query with nothing in it and no chips lit used to
  // sail through and land on a results screen that had no idea what it was
  // showing — so the lamp blows instead: a hard blackout, two failed strikes,
  // then it catches again, while the field shivers. The stage direction below
  // says what to do about it and then goes quiet on its own.
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const [scolding, setScolding] = useState(false);

  const blow = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    shake.value = withSequence(
      withTiming(-9, { duration: 55 }),
      withTiming(8, { duration: 55 }),
      withTiming(-6, { duration: 50 }),
      withTiming(4, { duration: 50 }),
      withTiming(0, { duration: 60 }),
    );
    // A filament failing, in the order a filament actually fails: it surges
    // bright for an instant, snaps out, sits properly dark long enough that you
    // register the room went black, then gropes back — two weak strikes that
    // don't take, a third that catches too hard, and a settle. The dark beat in
    // the middle is what sells it; the first pass cycled too fast to read as
    // anything but a flicker.
    bulbBoost.value = withSequence(
      withTiming(1, { duration: 55, easing: Easing.out(Easing.quad) }),
      withTiming(-1, { duration: 70, easing: Easing.in(Easing.quad) }),
      withTiming(-1, { duration: 260 }),
      withTiming(-0.55, { duration: 45 }),
      withTiming(-1, { duration: 80 }),
      withTiming(-0.3, { duration: 55 }),
      withTiming(-0.95, { duration: 90 }),
      withTiming(0.75, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(-0.15, { duration: 90 }),
      withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) }),
    );
    setScolding(true);
    setTimeout(() => setScolding(false), 3200);
  }, [shake, bulbBoost]);

  const activeCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

  const submit = useCallback(() => {
    if (!query.trim() && activeCount === 0) {
      blow();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    bulbBoost.value = withSequence(
      withTiming(0.95, { duration: 90 }),
      withTiming(0, { duration: 520 }),
    );
    // Local only, and only the text — see src/lib/searchHistory.ts on why the
    // filters deliberately don't come along for the ride.
    void pushSearchHistory(query, medium).then(setHistory);
    const params = selectionToParams(selected);
    router.push({
      pathname: '/results',
      params: {
        q: query.trim(),
        medium,
        ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      },
    });
  }, [query, selected, medium, router, bulbBoost, activeCount, blow]);

  const runRecent = useCallback(
    (item: RecentSearch) => {
      Haptics.selectionAsync().catch(() => {});
      setQuery(item.q);
      // Back to the house the search was made in, not the one you happen to be
      // standing in. Tapping a remembered theatre search from inside Film & TV
      // used to search the wrong catalogue in the wrong colour — you tapped
      // something you had already seen and got something else.
      if (item.medium !== medium) setMediumState(item.medium);
      void pushSearchHistory(item.q, item.medium).then(setHistory);
      router.push({ pathname: '/results', params: { q: item.q, medium: item.medium } });
    },
    [medium, router],
  );

  // Tapping the lamp does not go anywhere. It's the ghost light: you touch it,
  // it answers, that's all. Making it a shortcut into the lineup gave the one
  // decorative thing on the screen a hidden destination, which is worse than
  // leaving it decorative — nothing else here navigates without saying so.
  const onLampPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    bulbBoost.value = withSequence(
      withTiming(0.15, { duration: 70 }),
      withTiming(0.95, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(0.35, { duration: 130 }),
      withTiming(0.7, { duration: 90 }),
      withTiming(0, { duration: 640, easing: Easing.out(Easing.cubic) }),
    );
  }, [bulbBoost]);

  /**
   * The gel is a fill behind ink and never type — so "more", which the design
   * draws in yellow, cannot stay yellow once the stage itself becomes paper. It
   * takes the house's deep accent there instead: same job, same dashed outline,
   * a colour that can be read on cream.
   */
  const dashedInk = c.isLight ? pal.accent : c.yellow;

  // The book's count, for the corner. Signed out, nothing of the last
  // account's is shown, whatever the cache still holds.
  const { data: keptData } = useFavorites(isAuthenticated);
  const keptCount = isAuthenticated ? (keptData?.length ?? 0) : 0;

  // The ticket and the knocks. The board card above already says the next
  // audition and the empty board, so the ticket keeps to the two things the
  // page has no other voice for: the piece you left in this house, and
  // tonight's speech. The auditions still feed the knocks, which leave the
  // audition days to the reminders that own them.
  const { data: auditionData } = useAuditions(isAuthenticated);
  const trendingList = useHouseList(medium);
  const tonight = useTonight(medium);
  const lastPiece = useMemo(() => recents.find((r) => r.medium === medium && isFresh(r)), [recents, medium]);
  const { nudge, dismiss: dismissNudge } = useNudge(
    { next: undefined, lastPiece, tonight, medium, isAuthenticated: false },
    isAuthenticated ? auditionData : undefined,
    trendingList,
  );
  const openNudge = useCallback(
    (n: Nudge) => {
      Haptics.selectionAsync().catch(() => {});
      void trackNudgeOpen(n);
      router.push(n.route);
    },
    [router],
  );

  // A stranger who chose to look around is let in: the room works on the
  // anonymous session, and the deck is no longer anyone's way in.
  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} glowColor={pal.glow} background={pal.background} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Tapping any empty area dismisses the keyboard; child buttons still win. */}
        <Pressable
          onPress={() => Keyboard.dismiss()}
          accessible={false}
          style={{ flex: 1 }}
        >
          {/* The top row: the mark and the name on the left, your initial on the right. */}
          <View style={{ height: HEADER_H, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={onLampPress} hitSlop={12} accessibilityRole="image" accessibilityLabel="Ghost Light" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ shadowColor: pal.glow, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }}>
                <Image source={MARK} style={{ width: 22, height: 22 }} contentFit="contain" accessibilityIgnoresInvertColors />
              </View>
              <Text style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 11, letterSpacing: 2.6, color: c.foreground }}>GHOST LIGHT</Text>
            </Pressable>
            <Initial />
          </View>

          {/* A scroll, under the row. On a tall phone nothing moves; on a short
              one the board and the shelves under the field are reachable. */}
          <Animated.ScrollView
            alwaysBounceVertical={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={onBarScroll}
            scrollEventThrottle={16}
            style={{ flex: 1 }}
            // The side padding is the content's, not the frame's: a field shaking
            // at an empty search used to push its right edge past the frame and lose it.
            contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 24, paddingBottom: tabSpace }}
          >

            {/* The greeting. Two lines, each held to one line on purpose, in a
                box tall enough for both — so a prompt whose second line is
                shorter cannot let the field slide up the screen. */}
            <View
              style={{
                width: '100%',
                marginTop: 14,
                minHeight: headlineLine * 2,
                justifyContent: 'center',
              }}
            >
              {prompt.map((line, li) => (
                <Text
                  key={li}
                  numberOfLines={1}
                  style={{
                    textAlign: 'center',
                    fontFamily: 'InstrumentSerif_400Regular',
                    fontSize: headline,
                    lineHeight: headlineLine,
                    letterSpacing: -0.6,
                    color: c.foreground,
                  }}
                >
                  {line.map((piece, pi) =>
                    piece.em ? (
                      <Text
                        key={pi}
                        style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: pal.accentText }}
                      >
                        {piece.t}
                      </Text>
                    ) : (
                      piece.t
                    ),
                  )}
                </Text>
              ))}
            </View>

            <View style={{ marginTop: 18 }}>
              <MediumToggle medium={medium} onChange={setMedium} />
            </View>

            {/* The field: paper on a block of gel, tilted off square until you
                touch it. Its ink disc is the only submit on the screen. */}
            <Animated.View style={[shakeStyle, { width: '100%', marginTop: 24 }]}>
              <Animated.View style={fieldStyle}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    fieldBlockStyle,
                    {
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: radius.field,
                      backgroundColor: c.yellow,
                    },
                  ]}
                />
                <View
                  style={{
                    height: 62,
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: radius.field,
                    borderWidth: 1.5,
                    borderColor: c.ink,
                    backgroundColor: c.paper,
                    paddingLeft: 18,
                    paddingRight: 10,
                  }}
                >
                  <Ionicons name="search-outline" size={19} color={c.paperMuted} />
                  <TextInput
                    value={query}
                    onChangeText={onChangeQuery}
                    onSubmitEditing={submit}
                    onFocus={() => {
                      setFieldFocused(true);
                      focus.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
                    }}
                    onBlur={() => {
                      setFieldFocused(false);
                      focus.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
                    }}
                    returnKeyType="search"
                    // Short on purpose: it has to sit inside the field at 15pt on
                    // the narrowest phone without ever reaching the ellipsis.
                    placeholder={medium === 'screen' ? 'a cop on the edge…' : 'a grieving mother…'}
                    placeholderTextColor={c.paperMuted}
                    selectionColor={pal.accent}
                    style={{
                      flex: 1,
                      marginLeft: 12,
                      paddingVertical: 0,
                      fontSize: 15,
                      color: c.paperInk,
                      textAlignVertical: 'center',
                      fontFamily: 'BricolageGrotesque_500Medium',
                    }}
                  />
                  <Pressable
                    onPress={submit}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Search"
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 999,
                      backgroundColor: colors.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="arrow-forward" size={17} color={c.yellow} />
                  </Pressable>
                </View>
              </Animated.View>
            </Animated.View>

            {/* Filters: a row of stage-direction chips. Lit = gel behind ink. */}
            <Animated.View
              pointerEvents={fieldFocused ? 'none' : 'auto'}
              style={[
                belowStyle,
                {
                  marginTop: 22,
                  width: '100%',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: 8,
                },
              ]}
            >
              {FILTER_CHIPS.map((chip) => {
                const active = selected[chip.group] === chip.value;
                return (
                  <Pressable
                    key={chipKey(chip)}
                    onPress={() => toggle(chip)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={{
                      flexShrink: 0,
                      height: 36,
                      justifyContent: 'center',
                      borderRadius: 999,
                      borderWidth: 1.5,
                      paddingHorizontal: 14,
                      borderColor: active ? c.ink : c.border,
                      backgroundColor: active ? c.yellow : 'transparent',
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: 'CourierPrime_400Regular_Italic',
                        fontSize: 13,
                        letterSpacing: 0.5,
                        textTransform: 'lowercase',
                        color: active ? c.ink : c.mutedForeground,
                      }}
                    >
                      {chipText(chip.label)}
                    </Text>
                  </Pressable>
                );
              })}

              {/* The premium refinement sheet — dashed, because it opens
                  something rather than setting something. */}
              <AnimatedPressable
                onPress={openMoreFilters}
                accessibilityRole="button"
                accessibilityLabel="More filters"
                style={{
                  flexShrink: 0,
                  height: 36,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: c.border,
                  paddingHorizontal: 12,
                }}
              >
                <Ionicons name="options-outline" size={13} color={dashedInk} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'CourierPrime_400Regular_Italic',
                    fontSize: 13,
                    letterSpacing: 0.5,
                    color: dashedInk,
                  }}
                >
                  {advanced > 0 ? `${advanced} more` : 'more'}
                </Text>
              </AnimatedPressable>
            </Animated.View>

            {/* What the chips add up to, right under them where the eye already
                is: how many are lit, with a way to put them all out, or that
                nothing was asked for. It used to sit at the foot of the page,
                under the tab bar. */}
            {scolding || activeCount > 0 ? (
              <Animated.View
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(140)}
                style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <StageDirection numberOfLines={1} style={scolding ? { color: pal.accent } : undefined}>
                  {scolding
                    ? '(nothing to find.)'
                    : `(${activeCount} filter${activeCount === 1 ? '' : 's'} lit.)`}
                </StageDirection>
                {!scolding ? (
                  <Pressable
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelected(EMPTY_SELECTION); }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Clear the filters"
                    style={{ marginLeft: 12 }}
                  >
                    <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, color: pal.accentText }}>Clear</Text>
                  </Pressable>
                ) : null}
              </Animated.View>
            ) : null}

            {/* Up next: the next audition and the scene you left, one card, gone when both are empty. */}
            <Animated.View pointerEvents={fieldFocused ? 'none' : 'auto'} style={[belowStyle, { width: '100%', marginTop: 26 }]}>
              <UpNext isAuthenticated={isAuthenticated} />
            </Animated.View>

            {/* Recent searches: hairline rows, this house's only, each with a
                way to forget it. They used to be pills, which made four of them
                look like four more filters. Hidden only while you type: the
                query you just ran is still in the field when you come back from
                Results, and hiding the list then made it look as if the search
                had never been remembered.

                Before there is a past, what other actors are working on takes the
                room instead. */}
            {houseHistory.length === 0 && !(fieldFocused && query.trim()) ? (
              <Animated.View
                pointerEvents={fieldFocused ? 'none' : 'auto'}
                style={[belowStyle, { width: '100%', marginTop: 22 }]}
              >
                <Trending medium={medium} accent={pal.accentText} rows={3} />
              </Animated.View>
            ) : null}
            {houseHistory.length > 0 && !(fieldFocused && query.trim()) ? (
              <Animated.View
                pointerEvents={fieldFocused ? 'none' : 'auto'}
                style={[belowStyle, { width: '100%', marginTop: 22 }]}
              >
                <StageDirection style={{ marginBottom: 2 }}>(last time.)</StageDirection>
                {houseHistory.slice(0, 4).map((item) => (
                  <Animated.View
                    key={`${item.medium}:${item.q}`}
                    entering={FadeIn.duration(180)}
                    exiting={FadeOut.duration(160)}
                    layout={LinearTransition.duration(200)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderBottomWidth: 1,
                      borderBottomColor: c.divider,
                    }}
                  >
                    <Pressable
                      onPress={() => runRecent(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Search again for ${item.q}`}
                      style={{ flex: 1, paddingVertical: 9 }}
                    >
                      {/* Two lines, because a remembered search is a whole
                          sentence: "angry woman in her twenties, under two
                          minutes, not shakespeare" is a real query and one line
                          of it ends at "under two". */}
                      <Text
                        numberOfLines={2}
                        style={{
                          fontFamily: 'BricolageGrotesque_500Medium',
                          fontSize: 14,
                          lineHeight: 19,
                          color: c.foreground,
                        }}
                      >
                        {item.q}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => forget(item)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Forget ${item.q}`}
                      style={{
                        width: 32,
                        height: 32,
                        marginLeft: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="close" size={15} color={c.mutedForeground} />
                    </Pressable>
                  </Animated.View>
                ))}
              </Animated.View>
            ) : null}
          </Animated.ScrollView>

        </Pressable>
      </SafeAreaView>

      {/* The house-lights flash, over everything, on a medium change. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, flashStyle, { backgroundColor: pal.glow }]}
      />

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        // Done applies, and applying means searching — that's what the sheet is
        // for, and closing it back onto an unchanged screen would make the
        // filters you just set look like they hadn't taken. The exception is
        // Done with nothing chosen and nothing typed: that used to close the
        // sheet and immediately blow the lamp out at you, which is a scolding
        // for tapping the only button available. It just closes.
        onApply={() => {
          setSheetOpen(false);
          if (query.trim() || Object.values(selected).some(Boolean)) submit();
        }}
        onClear={() => setSelected(EMPTY_SELECTION)}
        selected={selected}
        onToggle={toggle}
        onUnlock={() => {
          setSheetOpen(false);
          router.push('/paywall');
        }}
        isPaid={isPaid}
        glow={pal.accentText}
        chipFill={pal.chipFill}
      />
    </View>
  );
}
