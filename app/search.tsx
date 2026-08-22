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
import { StageButton } from '../src/components/StageButton';
import { MediumToggle } from '../src/components/MediumToggle';
import {
  FILTER_CHIPS,
  chipKey,
  selectionToParams,
  type FilterChip,
  type FilterGroup,
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

type Selection = Record<FilterGroup, string | undefined>;

const EMPTY: Selection = {
  gender: undefined,
  age_range: undefined,
  tone: undefined,
  max_duration: undefined,
};

export default function Search() {
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Selection>(EMPTY);
  const [medium, setMediumState] = useState<Medium>('theatre');
  const pal = mediumPalette(medium);

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
            <GhostLight size={22} boost={bulbBoost} stem stemHeight={44} glow={pal.glow} line={pal.line} />

            <Text
              className="mt-8 text-center text-[44px] leading-[52px] text-foreground"
              style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
            >
              What are you{'\n'}looking for?
            </Text>

            <View style={{ marginTop: 26 }}>
              <MediumToggle medium={medium} onChange={setMedium} />
            </View>

            <Animated.View
              style={[
                fieldStyle,
                {
                  marginTop: 24,
                  width: '100%',
                  height: 58,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 16,
                  borderWidth: 1,
                  paddingHorizontal: 18,
                  backgroundColor: c.card,
                },
              ]}
            >
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
                      borderRadius: 999,
                      borderWidth: 1,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderColor: active ? pal.glow : c.border,
                      backgroundColor: active ? pal.chipFill : 'transparent',
                    }}
                  >
                    <Text
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
          </View>

          <View style={{ paddingBottom: 20 }}>
            <StageButton label="Search" onPress={submit} glow={pal.glow} />

            <View style={{ marginTop: 18, alignItems: 'center' }}>
              <StageDirection>
                {activeCount > 0
                  ? `(${activeCount} filter${activeCount === 1 ? '' : 's'} lit.)`
                  : '(the whole stage.)'}
              </StageDirection>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* The house-lights flash, over everything, on a medium change. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, flashStyle, { backgroundColor: pal.glow }]}
      />
    </View>
  );
}
