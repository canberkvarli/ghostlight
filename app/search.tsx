import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight, ghostLightMetrics } from '../src/components/GhostLight';
import { loadSearchHistory, pushSearchHistory, type RecentSearch } from '../src/lib/searchHistory';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { Ionicons } from '@expo/vector-icons';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { WordArrow } from '../src/components/WordArrow';
import { MediumToggle } from '../src/components/MediumToggle';
import { FilterSheet } from '../src/components/FilterSheet';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { useSession } from '../src/lib/useSession';
import { colors } from '../src/theme/tokens';
import {
  FILTER_CHIPS,
  EMPTY_SELECTION,
  advancedCount,
  chipKey,
  chipText,
  selectionToParams,
  type FilterChip,
  type Selection,
} from '../src/data/filters';
import { mediumPalette, type Medium } from '../src/theme/medium';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * Step 2 — Search is home.
 *
 * No dashboard, no tab bar landing elsewhere. The dark stage, the flickering
 * bulb, one line of Playfair, and the search field as the hero. Filters are a
 * row of lit/unlit stage-direction chips, not dropdowns. Submitting carries the
 * query and the chosen filters to the results list.
 *
 * Two houses: Theatre (the amber stage, plays) and Film & TV (a violet cinema
 * house, posters). The toggle flashes the house lights over to the new colour
 * and the whole screen — bulb, spotlight, chips, floor — answers.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// One place, because these numbers are used twice: once to measure the lamps up
// front and once to draw them. When they were written inline at the call site
// they could drift from the metrics computed here, and the glass-alignment maths
// below silently depends on the two agreeing.
//
// Down from 60/52. At that size the lamp was the loudest thing on a screen whose
// job is a search field, and on a small phone it pushed the field itself toward
// the fold. The ratio between dressed and bare is kept so the paid lamp still
// reads as the same object wheeled on properly, not a different one.
const LAMP_SIZE_PAID = 42;
const LAMP_SIZE_FREE = 36;

// Both lamps measured up front, so the layout can hold the taller one's room
// and keep the glass at a fixed height whichever is showing.
const LAMP_PAID = ghostLightMetrics(LAMP_SIZE_PAID, 'full');
const LAMP_FREE = ghostLightMetrics(LAMP_SIZE_FREE, 'bare');
const LAMP_BOX = Math.max(LAMP_PAID.canvasH, LAMP_FREE.canvasH);
const LAMP_GLASS = Math.max(LAMP_PAID.glassCy, LAMP_FREE.glassCy);

/**
 * Where you stand, in the corner that was empty.
 *
 * This was a bordered pill with a lit filament, sitting top-right beside the
 * bookmark and settings icons — three things crowded into one corner while the
 * opposite one sat bare. It is status: read once, does nothing. It was styled
 * like a control and placed like a priority. Bare text on the left balances the
 * row and stops it competing with the two buttons that actually act.
 *
 * "sign in" is a verb because that state wants an action; the other two are
 * facts. The words match Account's Subscription row, so nothing has two names.
 */
function StandingChip({
  isPaid,
  isAuthenticated,
  loading,
  onPress,
}: {
  isPaid: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  // The session resolves a beat after mount, and until it does every signed-in
  // actor is indistinguishable from a guest. Showing this early would tell a
  // subscriber they were a guest on every single launch, so it waits.
  if (loading) return null;

  const label = isPaid ? 'subscribed' : isAuthenticated ? 'free' : 'sign in';

  return (
    <Pressable
      onPress={onPress}
      hitSlop={14}
      accessibilityRole="button"
      accessibilityLabel={
        isPaid ? 'Subscribed. Open account' : isAuthenticated ? 'Free account. Open account' : 'Sign in'
      }
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4 }}
    >
      <Text
        style={{
          fontFamily: 'CourierPrime_400Regular_Italic',
          fontSize: 13,
          letterSpacing: 0.4,
          color: isPaid ? colors.stageGlow : c.mutedForeground,
        }}
      >
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={11} color={isPaid ? colors.stageGlow : c.chevron} />
    </Pressable>
  );
}

export default function Search() {
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const { isAuthenticated, loading: sessionLoading } = useSession();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Selection>(EMPTY_SELECTION);
  const [medium, setMediumState] = useState<Medium>('theatre');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [history, setHistory] = useState<RecentSearch[]>([]);

  useEffect(() => {
    void loadSearchHistory().then(setHistory);
  }, []);
  const pal = mediumPalette(medium, c.isLight);

  // Everyone can open the sheet and use the free identity/length filters; the
  // craft filters inside (tone, emotion, freshness) route to the paywall for
  // free actors. isPaid comes from the server read counter.
  const { isPaid } = useEntitlement();
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

  // The house-lights flash: a wash of the new colour that blooms and fades as
  // the medium changes, so the switch feels like a lighting cue, not a repaint.
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.28 }));

  const setMedium = useCallback(
    (next: Medium) => {
      if (next === medium) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
      setMediumState(next);
      flash.value = withSequence(
        withTiming(1, { duration: 140 }),
        withTiming(0, { duration: 520 }),
      );
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

  const onChangeQuery = useCallback((text: string) => {
    setQuery(text);
    bulbBoost.value = withSequence(
      withTiming(0.5, { duration: 70 }),
      withTiming(text.trim() ? 0.18 : 0, { duration: 420 }),
    );
  }, [bulbBoost]);

  // The search field catches the light when you touch it — the border warms to
  // the house colour and a soft glow rises, like stepping into the spot.
  const focus = useSharedValue(0);
  // React state only because pointerEvents can't be animated; twice per focus
  // cycle, never per frame.
  const [fieldFocused, setFieldFocused] = useState(false);

  // Focus used to collapse the block ABOVE the field, which slid the field up
  // the screen the instant you touched it — the one moment here that has to be
  // dead steady. So the field itself never moves now. What clears instead is
  // everything BELOW it: the chips and the refine link fade and drop away, since
  // half a row of filters disappearing under a keyboard is worse than no row at
  // all. They come straight back on blur with the choices intact.
  // Opacity alone at 130ms was too subtle to register as a transition at all —
  // things simply weren't there any more. A short drop and a slight shrink read
  // as the row stepping back out of the light, and stay quick.
  const belowStyle = useAnimatedStyle(() => ({
    opacity: 1 - focus.value,
    transform: [{ translateY: 18 * focus.value }, { scale: 1 - 0.04 * focus.value }],
  }));
  const fieldStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [c.border, pal.glow]),
    shadowColor: pal.glow,
    shadowOpacity: focus.value * 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  }));

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

  const activeCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  );

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
        ...Object.fromEntries(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        ),
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

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} glowColor={pal.glow} background={pal.background} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Tapping any empty area dismisses the keyboard; child buttons still win. */}
        <Pressable onPress={() => Keyboard.dismiss()} accessible={false} style={{ flex: 1, paddingHorizontal: 28 }}>
          <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <StandingChip
              isPaid={isPaid}
              isAuthenticated={isAuthenticated}
              loading={sessionLoading}
              onPress={() => router.push(isAuthenticated ? '/account' : '/auth')}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 }}>
            <Pressable
              onPress={() => router.push('/saves')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Saved monologues"
            >
              <Ionicons name="bookmark-outline" size={22} color={c.mutedForeground} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/account')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Account"
            >
              <Ionicons name="settings-outline" size={22} color={c.mutedForeground} />
            </Pressable>
            </View>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8 }}>
            {/* Subscribers get the lamp in full dress — the standing ghost
                light with its neck, base and floor pool — where free actors get
                the bare bulb. Same silhouette, same ratios, so nothing shouts;
                it just reads as the real thing having been wheeled onto the
                stage. Reuses the dressing the brand already has rather than
                inventing a badge, and it's the first thing you see, so paying
                visibly changed something. */}
            {/* The taller of the two lamps is reserved always, and the shorter
                one is nudged down so its glass lands at the same height. Without
                this, entitlement resolving swapped a 52pt bare bulb for a 60pt
                standing lamp — 39.5pt taller, glass 10.7pt lower — so signing in
                or out shoved the whole screen down and slid the bulb with it,
                a beat or two after the screen had already settled. */}
            <View style={{ height: LAMP_BOX, alignItems: 'center' }}>
              <Pressable
                onPress={onLampPress}
                hitSlop={14}
                accessibilityRole="image"
                accessibilityLabel="The ghost light"
                style={{ marginTop: LAMP_GLASS - (isPaid ? LAMP_PAID : LAMP_FREE).glassCy }}
              >
                <GhostLight
                  size={isPaid ? LAMP_SIZE_PAID : LAMP_SIZE_FREE}
                  dress={isPaid ? 'full' : 'bare'}
                  boost={bulbBoost}
                  glow={pal.glow}
                  glassStops={pal.glassStops}
                  neck={pal.neck}
                />
              </Pressable>
            </View>

            {/* Everything between the lamp and the field clears out of the way
                when the field takes focus, so typing happens on a bare stage.
                Height is measured once on layout and then driven from the same
                `focus` shared value as the field itself — the collapse runs on
                the UI thread with no JS per frame, and no re-render. */}
            <View style={{ width: '100%', alignItems: 'center' }}>
              <Text
                className="mt-8 text-center text-foreground"
                style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 15, letterSpacing: 7, textTransform: 'uppercase' }}
              >
                Ghost Light
              </Text>
              {/* Kept short on purpose: both variants must hold one line at the
                  widest letter-spacing, and a count here would only ever describe
                  the toggle you're standing in, never the whole library. */}
              <StageDirection className="mt-8" numberOfLines={1}>
                {medium === 'screen' ? '(film & tv, off the page.)' : '(every monologue. one stage.)'}
              </StageDirection>

              <View style={{ marginTop: 24 }}>
                <MediumToggle medium={medium} onChange={setMedium} />
              </View>
            </View>

            <Animated.View
              style={[
                fieldStyle,
                shakeStyle,
                {
                  marginTop: 22,
                  width: '100%',
                  height: 60,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: 17,
                  borderWidth: 1,
                  paddingHorizontal: 18,
                  backgroundColor: c.card,
                },
              ]}
            >
              <Ionicons name="search-outline" size={18} color={c.mutedForeground} style={{ marginRight: 12 }} />
              <TextInput
                value={query}
                onChangeText={onChangeQuery}
                onSubmitEditing={submit}
                onFocus={() => {
                  setFieldFocused(true);
                  focus.value = withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) });
                }}
                onBlur={() => {
                  setFieldFocused(false);
                  focus.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) });
                }}
                returnKeyType="search"
                placeholder="a grieving mother, something funny…"
                placeholderTextColor={c.mutedForeground}
                selectionColor={pal.glow}
                className="text-[16px] text-foreground"
                style={{ flex: 1, paddingVertical: 0, textAlignVertical: 'center', fontFamily: 'Montserrat_400Regular' }}
              />
            </Animated.View>

            {/* Recent searches. On device, free, text only. Hidden once there's
                a query, since re-running what you're already typing is noise. */}
            {history.length > 0 && !query.trim() ? (
              <Animated.View
                pointerEvents={fieldFocused ? 'none' : 'auto'}
                style={[
                  belowStyle,
                  { width: '100%', marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
                ]}
              >
                {history.slice(0, 4).map((item) => (
                  <Pressable
                    key={`${item.medium}:${item.q}`}
                    onPress={() => runRecent(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Search again for ${item.q} in ${item.medium === 'screen' ? 'film and TV' : 'theatre'}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      backgroundColor: c.card,
                      borderWidth: 1,
                      borderColor: c.cardBorder,
                    }}
                  >
                    <Ionicons
                      name={item.medium === 'screen' ? 'film-outline' : 'time-outline'}
                      size={12}
                      color={mediumPalette(item.medium, c.isLight).glow}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        maxWidth: 150,
                        fontFamily: 'Montserrat_400Regular',
                        fontSize: 12,
                        color: c.mutedForeground,
                      }}
                    >
                      {item.q}
                    </Text>
                  </Pressable>
                ))}
              </Animated.View>
            ) : null}

            {/* Filters: a row of stage-direction chips. Lit = active, in the house colour. */}
            <Animated.View
              pointerEvents={fieldFocused ? 'none' : 'auto'}
              style={[
                belowStyle,
                {
                  marginTop: 24,
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
                      borderRadius: 999,
                      borderWidth: 1,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderColor: active ? pal.glow : c.border,
                      backgroundColor: active ? pal.chipFill : 'transparent',
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      className="text-[13px] lowercase"
                      style={{
                        fontFamily: 'CourierPrime_400Regular_Italic',
                        letterSpacing: 0.5,
                        color: active ? pal.glow : c.mutedForeground,
                      }}
                    >
                      {chipText(chip.label)}
                    </Text>
                  </Pressable>
                );
              })}
            </Animated.View>

            {/* The premium refinement sheet — locked for free actors. */}
            <AnimatedPressable
              onPress={openMoreFilters}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="More filters"
              pointerEvents={fieldFocused ? 'none' : 'auto'}
              style={[
                belowStyle,
                { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6 },
              ]}
            >
              <Ionicons name="options-outline" size={14} color={pal.glow} />
              <Text
                style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 14, letterSpacing: 0.5, color: pal.glow }}
              >
                {advanced > 0 ? `(${advanced} more.)` : '(more filters.)'}
              </Text>
            </AnimatedPressable>
          </View>

          {/* Footer: the state on the left, the action on the right. No slab. */}
          <View
            style={{
              paddingBottom: 22,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* The row is space-between, so an unbounded line on the left took
                the width it wanted and shoved Search off the right edge —
                exactly when you'd been told to try again and needed the button.
                Clipping it instead only traded one ugly failure for another, so
                the copy is now short enough to fit beside the button on the
                narrowest phone. `flex: 1` is the backstop, not the plan. */}
            {/* Says nothing when there is nothing to say. The other two states
                report something you cannot see anywhere else — that a search
                came back empty, or how many filters are on. "(the whole stage.)"
                reported the absence of filters, which is the default and is
                already obvious from the filter row above being unlit, so it read
                as decoration sitting where information goes. The wrapper keeps
                its flex either way, so Search does not move when this appears. */}
            <View style={{ flex: 1, marginRight: 14 }}>
              {scolding || activeCount > 0 ? (
                <StageDirection numberOfLines={1} style={scolding ? { color: pal.glow } : undefined}>
                  {scolding
                    ? '(nothing to find.)'
                    : `(${activeCount} filter${activeCount === 1 ? '' : 's'} lit.)`}
                </StageDirection>
              ) : null}
            </View>
            <WordArrow label="Search" onPress={submit} tint={pal.glow} haptic="none" />
          </View>
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
        glow={pal.glow}
        chipFill={pal.chipFill}
      />
    </View>
  );
}
