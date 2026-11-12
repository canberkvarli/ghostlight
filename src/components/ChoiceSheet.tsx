import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { useL } from '../i18n';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const MONO_I = 'CourierPrime_400Regular_Italic';

export interface Choice {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** The one that takes something away: drawn in the warning red. */
  danger?: boolean;
  /** Ticked: where the thing already is. */
  current?: boolean;
  onPress: () => void;
}

/**
 * A short list of things to do, as a sheet of our own rather than the
 * phone's action sheet: the title in the headline voice with its last word
 * lit, an optional Courier line, one row a choice, and the way back as a word.
 */
export function ChoiceSheet({ open, title, accent, line, choices, onClose }: {
  open: boolean;
  title: string;
  accent?: string;
  line?: string;
  choices: Choice[];
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const L = useL();
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,7,4,0.66)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={L('Close', 'Kapat')} />
        <Animated.View entering={FadeIn.duration(240).delay(40)}
          style={{ maxHeight: '80%', backgroundColor: c.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: c.border, paddingHorizontal: 24, paddingTop: 22, paddingBottom: Math.max(insets.bottom, 16) + 6 }}>
          <Text numberOfLines={2} style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 34, letterSpacing: -0.4, color: c.foreground }}>
            {title}{accent ? <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{` ${accent}`}</Text> : null}
          </Text>
          {line ? <Text numberOfLines={2} style={{ marginTop: 4, fontFamily: MONO_I, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground }}>{line}</Text> : null}
          <ScrollView style={{ marginTop: 12 }} bounces={false} showsVerticalScrollIndicator={false}>
            {choices.map((ch, i) => (
              <Pressable key={`${ch.label}-${i}`} onPress={() => { Haptics.selectionAsync().catch(() => {}); ch.onPress(); }} accessibilityRole="button" accessibilityState={{ selected: !!ch.current }}
                style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: i === choices.length - 1 ? 0 : 1, borderBottomColor: c.divider, opacity: pressed ? 0.6 : 1 })}>
                {ch.icon ? <Ionicons name={ch.icon} size={19} color={ch.danger ? '#c0392b' : c.foreground} /> : null}
                <Text numberOfLines={1} style={{ flex: 1, fontFamily: SANS_B, fontSize: 16, color: ch.danger ? '#c0392b' : c.foreground }}>{ch.label}</Text>
                {ch.current ? <Ionicons name="checkmark" size={18} color={c.accentText} /> : null}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 10, paddingVertical: 8 }}>
            <Text style={{ fontFamily: SANS, fontSize: 15, color: c.mutedForeground }}>{L('Cancel', 'Vazgeç')}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
