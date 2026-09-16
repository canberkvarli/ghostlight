import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { WordArrow } from './WordArrow';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { SHEET_GROUPS, chipKey, chipText, type FilterChip, type Selection } from '../data/filters';

/**
 * The "(more filters.)" sheet. Free identity + length filters (who / how old /
 * how long) are fully usable by everyone. The craft filters (tone, emotion,
 * freshness) are shown too — the value is visible — but marked premium: a free
 * actor tapping one routes to the paywall instead of a dead lock. Paid actors
 * use everything.
 */
export function FilterSheet({
  visible,
  onClose,
  onApply,
  onClear,
  selected,
  onToggle,
  onUnlock,
  isPaid,
  glow,
  chipFill,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: () => void;
  onClear: () => void;
  selected: Selection;
  onToggle: (chip: FilterChip) => void;
  onUnlock: () => void;
  isPaid: boolean;
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
          height: '85%',
          backgroundColor: c.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderWidth: 1,
          borderColor: c.border,
          overflow: 'hidden',
        }}
      >
        <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
          {/* Grabber + title. */}
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.border }} />
          </View>
          {/* flex-end, not space-between: the title used to hold the left edge,
              and without it space-between would park the close button there. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4 }}>
            <Pressable onPress={onClose} hitSlop={14} accessibilityRole="button" accessibilityLabel="Close filters">
              <Ionicons name="close" size={24} color={c.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {SHEET_GROUPS.map((g) => {
              const locked = Boolean(g.premium) && !isPaid;
              const firstPremium = g.premium && SHEET_GROUPS.find((x) => x.premium)?.group === g.group;
              return (
                <View key={g.group} style={{ marginBottom: 30 }}>
                  {/* A single quiet divider introduces the craft filters. */}
                  {firstPremium ? (
                    <View style={{ height: 1, backgroundColor: c.border, marginBottom: 26, marginTop: -2 }} />
                  ) : null}
                  {/* The group label is the app talking, so it's Montserrat —
                      and it has to be, because it used to be Courier italic
                      lowercase in muted grey exactly like the chips beneath it.
                      Same face, same case, same colour: nothing told your eye
                      where a heading ended and its options began, which is what
                      made the sheet tiring to scan. Typeface does the
                      separating now, not size alone. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                    <Text
                      style={{
                        fontFamily: 'BricolageGrotesque_600SemiBold',
                        fontSize: 11,
                        letterSpacing: 2.6,
                        textTransform: 'uppercase',
                        color: c.mutedForeground,
                      }}
                    >
                      {chipText(g.title)}
                    </Text>
                    {locked ? <Ionicons name="lock-closed" size={12} color={glow} /> : null}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {g.chips.map((chip) => {
                      const active = selected[chip.group] === chip.value;
                      return (
                        <Pressable
                          key={chipKey(chip)}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            if (locked) onUnlock();
                            else onToggle(chip);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityHint={locked ? 'Part of the subscription' : undefined}
                          style={{
                            opacity: locked ? 0.55 : 1,
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
                            {chipText(chip.label)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {/* The upsell line here restated the group headings directly
                      above it and then asked to be tapped, in the same italic
                      the sheet uses for labels that do nothing. Two chances to
                      buy in one sheet is one too many; the locked chips already
                      route to the paywall. */}
                </View>
              );
            })}
          </ScrollView>

          <View style={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onClear();
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              // "(clear.)" in the sheet's own italic read as another stage
              // direction — a label, not a control — so nobody knew it did
              // anything. Same voice, but inside a border it can be tapped.
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: glow,
                paddingHorizontal: 16,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 14, letterSpacing: 0.5, color: glow }}>
                (clear.)
              </Text>
            </Pressable>
            <WordArrow label="Done" onPress={onApply} tint={glow} />
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}
