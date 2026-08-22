import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { StageButton } from './StageButton';
import { StageDirection } from './StageDirection';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { ADVANCED_GROUPS, chipKey, type FilterChip, type Selection } from '../data/filters';

/**
 * The premium "(more filters.)" sheet — the fine tone palette, emotion, and
 * freshness. Same lit Courier chips as the quick row, grouped by dimension,
 * raised on a sheet that matches the auth/paywall presentation. Only reached by
 * subscribers; free actors who tap "(more filters.)" meet the wall instead.
 */
export function FilterSheet({
  visible,
  onClose,
  onApply,
  selected,
  onToggle,
  glow,
  chipFill,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: () => void;
  selected: Selection;
  onToggle: (chip: FilterChip) => void;
  glow: string;
  chipFill: string;
}) {
  const { colors: c } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Scrim — tap to dismiss. */}
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />

      <Animated.View
        entering={SlideInDown.duration(320)}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '82%',
          backgroundColor: c.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderWidth: 1,
          borderColor: c.border,
        }}
      >
        <SafeAreaView edges={['bottom']}>
          {/* Grabber + title. */}
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.border }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4 }}>
            <StageDirection>(refine.)</StageDirection>
            <Pressable onPress={onClose} hitSlop={14} accessibilityRole="button" accessibilityLabel="Close filters">
              <Ionicons name="close" size={24} color={c.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {ADVANCED_GROUPS.map((g) => (
              <View key={g.group} style={{ marginBottom: 22 }}>
                <Text
                  className="text-[12px] uppercase tracking-[1.6px] text-muted-foreground"
                  style={{ fontFamily: 'Montserrat_600SemiBold', marginBottom: 12 }}
                >
                  {g.title}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {g.chips.map((chip) => {
                    const active = selected[chip.group] === chip.value;
                    return (
                      <Pressable
                        key={chipKey(chip)}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          onToggle(chip);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={{
                          borderRadius: 999,
                          borderWidth: 1,
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderColor: active ? glow : c.border,
                          backgroundColor: active ? chipFill : 'transparent',
                        }}
                      >
                        <Text
                          className="text-[13px] lowercase"
                          style={{
                            fontFamily: 'CourierPrime_400Regular_Italic',
                            letterSpacing: 0.5,
                            color: active ? glow : c.mutedForeground,
                          }}
                        >
                          {chip.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 12 }}>
            <StageButton label="Show results" onPress={onApply} glow={glow} />
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}
