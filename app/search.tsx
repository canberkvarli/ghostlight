import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useBreathingGlow } from '../src/hooks/useBreathingGlow';
import {
  FILTER_CHIPS,
  chipKey,
  selectionToParams,
  type FilterChip,
  type FilterGroup,
} from '../src/data/filters';
import { colors } from '../src/theme/tokens';

/**
 * Step 2 — Search is home.
 *
 * No dashboard, no tab bar landing elsewhere. The dark stage, the flickering
 * bulb, one line of Playfair, and the search field as the hero. Filters are a
 * row of lit/unlit stage-direction chips, not dropdowns. Submitting carries the
 * query and the chosen filters to the results list.
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

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Selection>(EMPTY);

  // The search field catches the light when you touch it — the border warms to
  // orange and a soft glow rises, like stepping into the spot.
  const focus = useSharedValue(0);
  const searchGlow = useBreathingGlow();
  const fieldStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [colors.dark.border, colors.stageGlow]),
    shadowColor: colors.stageGlow,
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
    const params = selectionToParams(selected);
    router.push({
      pathname: '/results',
      params: {
        q: query.trim(),
        ...Object.fromEntries(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        ),
      },
    });
  }, [query, selected, router]);

  const activeCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, paddingHorizontal: 28 }}>
          <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 22 }}>
            <Pressable
              onPress={() => router.push('/saves')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Saved monologues"
            >
              <Text className="text-[20px]" style={{ color: colors.dark.mutedForeground }}>
                ☆
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/account')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Account"
            >
              <Text style={{ fontSize: 19, color: colors.dark.mutedForeground }}>⚙</Text>
            </Pressable>
          </View>

          <View style={{ flex: 1 }} className="items-center justify-center">
            <GhostLight size={18} />

            <Text
              className="mt-6 text-center text-[30px] leading-[38px] text-foreground"
              style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
            >
              What are you{'\n'}looking for?
            </Text>

            <Animated.View
              style={[
                fieldStyle,
                {
                  marginTop: 32,
                  width: '100%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: 16,
                  borderWidth: 1,
                  paddingHorizontal: 16,
                  backgroundColor: 'rgba(29, 20, 15, 0.7)',
                },
              ]}
            >
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={submit}
                onFocus={() => (focus.value = withTiming(1, { duration: 260 }))}
                onBlur={() => (focus.value = withTiming(0, { duration: 320 }))}
                returnKeyType="search"
                placeholder="a grieving mother, something funny…"
                placeholderTextColor={colors.dark.mutedForeground}
                selectionColor={colors.stageGlow}
                className="text-[16px] text-foreground"
                style={{ flex: 1, paddingVertical: 16, fontFamily: 'Montserrat_400Regular' }}
              />
            </Animated.View>

            {/* Filters: a row of stage-direction chips. Lit orange = active. */}
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
                      borderColor: active ? colors.stageGlow : colors.dark.border,
                      backgroundColor: active ? 'rgba(243, 130, 29, 0.14)' : 'transparent',
                    }}
                  >
                    <Text
                      className="text-[13px] lowercase"
                      style={{
                        fontFamily: 'CourierPrime_400Regular_Italic',
                        letterSpacing: 0.5,
                        color: active ? colors.stageGlow : colors.dark.mutedForeground,
                      }}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ paddingBottom: 16 }}>
            <Animated.View style={searchGlow}>
            <Pressable
              onPress={submit}
              accessibilityRole="button"
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 16,
                paddingVertical: 16,
                backgroundColor: colors.primary,
              }}
            >
              <Text
                className="text-[15px] uppercase tracking-[2px] text-white"
                style={{ fontFamily: 'Montserrat_600SemiBold' }}
              >
                Search
              </Text>
            </Pressable>
            </Animated.View>

            <View className="mt-3 items-center">
              <StageDirection>
                {activeCount > 0
                  ? `(${activeCount} filter${activeCount === 1 ? '' : 's'} lit.)`
                  : '(the whole stage.)'}
              </StageDirection>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
