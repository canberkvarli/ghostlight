import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { Ionicons } from '@expo/vector-icons';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { WordArrow } from '../src/components/WordArrow';
import { MediumToggle } from '../src/components/MediumToggle';
import { FilterSheet } from '../src/components/FilterSheet';
import { useQuery } from '@tanstack/react-query';
import { getReadState } from '../src/api/client';
import {
  FILTER_CHIPS,
  EMPTY_SELECTION,
  advancedCount,
  chipKey,
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
  const pal = mediumPalette(medium);

  // Everyone can open the sheet and use the free identity/length filters; the
  // craft filters inside (tone, emotion, freshness) route to the paywall for
  // free actors. isPaid comes from the server read counter.
  const { data: wall } = useQuery({
    queryKey: ['read-wall'],
    queryFn: ({ signal }) => getReadState(signal),
    retry: false,
    staleTime: 15_000,
  });
  const isPaid = wall?.is_paid === true;
  const advanced = advancedCount(selected);

  const openMoreFilters = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setSheetOpen(true);
  }, []);

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
    },
    [medium, flash],
  );

  // The bulb answers the search: it flares as the actor types and flares harder
  // on submit, then settles to a gentle idle while there's a query.
  const bulbBoost = useSharedValue(0);
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

  const submit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    bulbBoost.value = withSequence(
      withTiming(0.95, { duration: 90 }),
      withTiming(0, { duration: 520 }),
    );
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
  }, [query, selected, medium, router, bulbBoost]);

  const activeCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} glowColor={pal.glow} background={pal.background} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, paddingHorizontal: 28 }}>
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
            <GhostLight
              size={52}
              boost={bulbBoost}
              glow={pal.glow}
              glassStops={pal.glassStops}
              neck={pal.neck}
            />

            <Text
              className="mt-5 text-center text-foreground"
              style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 15, letterSpacing: 7, textTransform: 'uppercase' }}
            >
              Ghost Light
            </Text>
            <StageDirection className="mt-3">
              {medium === 'screen'
                ? '(14,000+ speeches. screen and stage.)'
                : '(14,000+ monologues. one stage.)'}
            </StageDirection>

            <View style={{ marginTop: 24 }}>
              <MediumToggle medium={medium} onChange={setMedium} />
            </View>

            <Animated.View
              style={[
                fieldStyle,
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
                onFocus={() => (focus.value = withTiming(1, { duration: 260 }))}
                onBlur={() => (focus.value = withTiming(0, { duration: 320 }))}
                returnKeyType="search"
                placeholder="a grieving mother, something funny…"
                placeholderTextColor={c.mutedForeground}
                selectionColor={pal.glow}
                className="text-[16px] text-foreground"
                style={{ flex: 1, paddingVertical: 0, textAlignVertical: 'center', fontFamily: 'Montserrat_400Regular' }}
              />
            </Animated.View>

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
                      {chip.label}
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
            <StageDirection>
              {activeCount > 0
                ? `(${activeCount} filter${activeCount === 1 ? '' : 's'} lit.)`
                : '(the whole stage.)'}
            </StageDirection>
            <WordArrow label="Search" onPress={submit} tint={pal.glow} haptic="none" />
          </View>
        </View>
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
