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

import { GhostLight } from '../src/components/GhostLight';
import { loadSearchHistory, pushSearchHistory } from '../src/lib/searchHistory';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { Ionicons } from '@expo/vector-icons';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { WordArrow } from '../src/components/WordArrow';
import { MediumToggle } from '../src/components/MediumToggle';
import { FilterSheet } from '../src/components/FilterSheet';
import { useEntitlement } from '../src/hooks/useEntitlement';
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

export default function Search() {
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Selection>(EMPTY_SELECTION);
  const [medium, setMediumState] = useState<Medium>('theatre');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

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

  // The wordmark, tagline and house toggle fold away while the field is live.
  // `chromeH` is measured once and then never changes, so the height animation
  // has a fixed target and the whole collapse stays on the UI thread.
  // `fieldFocused` is React state only because pointerEvents can't be animated;
  // it changes twice per focus cycle, not per frame.
  const [chromeH, setChromeH] = useState(0);
  const [fieldFocused, setFieldFocused] = useState(false);
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: 1 - focus.value,
    transform: [{ translateY: -12 * focus.value }],
    // Until it's measured, leave height alone so the block can size itself.
    height: chromeH > 0 ? chromeH * (1 - focus.value) : undefined,
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
    bulbBoost.value = withSequence(
      withTiming(1, { duration: 60 }),
      withTiming(-1, { duration: 90 }),
      withTiming(-0.85, { duration: 220 }),
      withTiming(-0.4, { duration: 70 }),
      withTiming(-0.9, { duration: 90 }),
      withTiming(0.4, { duration: 140 }),
      withTiming(0, { duration: 420 }),
    );
    setScolding(true);
    setTimeout(() => setScolding(false), 2600);
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
    void pushSearchHistory(query).then(setHistory);
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
    (term: string) => {
      Haptics.selectionAsync().catch(() => {});
      setQuery(term);
      void pushSearchHistory(term).then(setHistory);
      router.push({ pathname: '/results', params: { q: term, medium } });
    },
    [medium, router],
  );

  // The lamp is the one thing on this screen that always had an answer and no
  // way to be asked. Tapping it skips the query entirely and walks straight out
  // onto the lineup — the ghost light showing you what's on tonight.
  const onLampPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    bulbBoost.value = withSequence(
      withTiming(0.2, { duration: 60 }),
      withTiming(1, { duration: 130 }),
      withTiming(0, { duration: 560 }),
    );
    router.push({ pathname: '/results', params: { medium } });
  }, [bulbBoost, router, medium]);

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} glowColor={pal.glow} background={pal.background} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Tapping any empty area dismisses the keyboard; child buttons still win. */}
        <Pressable onPress={() => Keyboard.dismiss()} accessible={false} style={{ flex: 1, paddingHorizontal: 28 }}>
          <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 22 }}>
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

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8 }}>
            {/* Subscribers get the lamp in full dress — the standing ghost
                light with its neck, base and floor pool — where free actors get
                the bare bulb. Same silhouette, same ratios, so nothing shouts;
                it just reads as the real thing having been wheeled onto the
                stage. Reuses the dressing the brand already has rather than
                inventing a badge, and it's the first thing you see, so paying
                visibly changed something. */}
            <Pressable
              onPress={onLampPress}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="What's on tonight"
              accessibilityHint="Opens the lineup without a search"
            >
              <GhostLight
                size={isPaid ? 60 : 52}
                dress={isPaid ? 'full' : 'bare'}
                boost={bulbBoost}
                glow={pal.glow}
                glassStops={pal.glassStops}
                neck={pal.neck}
              />
            </Pressable>

            {/* Everything between the lamp and the field clears out of the way
                when the field takes focus, so typing happens on a bare stage.
                Height is measured once on layout and then driven from the same
                `focus` shared value as the field itself — the collapse runs on
                the UI thread with no JS per frame, and no re-render. */}
            <Animated.View
              onLayout={(e) => {
                const h = Math.round(e.nativeEvent.layout.height);
                // Only capture the resting height, or the collapse would keep
                // re-measuring itself down to zero on the way in.
                if (h > 0 && chromeH === 0) setChromeH(h);
              }}
              pointerEvents={fieldFocused ? 'none' : 'auto'}
              style={[chromeStyle, { width: '100%', alignItems: 'center', overflow: 'hidden' }]}
            >
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
            </Animated.View>

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
                  focus.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
                }}
                onBlur={() => {
                  setFieldFocused(false);
                  focus.value = withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) });
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
              <View style={{ width: '100%', marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {history.slice(0, 4).map((term) => (
                  <Pressable
                    key={term}
                    onPress={() => runRecent(term)}
                    accessibilityRole="button"
                    accessibilityLabel={`Search again for ${term}`}
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
                    <Ionicons name="time-outline" size={12} color={c.chevron} />
                    <Text
                      numberOfLines={1}
                      style={{
                        maxWidth: 150,
                        fontFamily: 'Montserrat_400Regular',
                        fontSize: 12,
                        color: c.mutedForeground,
                      }}
                    >
                      {term}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Filters: a row of stage-direction chips. Lit = active, in the house colour. */}
            <View
              style={{
                marginTop: 24,
                width: '100%',
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 8,
              }}
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
            </View>

            {/* The premium refinement sheet — locked for free actors. */}
            <Pressable
              onPress={openMoreFilters}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="More filters"
              style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6 }}
            >
              <Ionicons name="options-outline" size={14} color={pal.glow} />
              <Text
                style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 14, letterSpacing: 0.5, color: pal.glow }}
              >
                {advanced > 0 ? `(${advanced} more.)` : '(more filters.)'}
              </Text>
            </Pressable>
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
            <StageDirection style={scolding ? { color: pal.glow } : undefined}>
              {scolding
                ? '(give the light something to find.)'
                : activeCount > 0
                  ? `(${activeCount} filter${activeCount === 1 ? '' : 's'} lit.)`
                  : '(tap the lamp for tonight.)'}
            </StageDirection>
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
        onApply={() => {
          setSheetOpen(false);
          submit();
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
