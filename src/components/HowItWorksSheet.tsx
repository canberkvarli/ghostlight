import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AuditionsScene } from './AuditionsScene';
import { PrimaryPill } from './PrimaryPill';
import { StageDirection } from './StageDirection';
import { useTheme } from '../theme/ThemeContext';

/**
 * "How this works", behind a question mark rather than on the board itself.
 * The loop from the website plays once the sheet is up, with one line under
 * it and the one thing to do next. Opacity only on the way in: a sliding
 * entrance leaves the buttons untouchable on the new architecture.
 */
export function HowItWorksSheet({
  open,
  onClose,
  primaryLabel,
  onPrimary,
}: {
  open: boolean;
  onClose: () => void;
  primaryLabel: string;
  onPrimary: () => void;
}) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1, backgroundColor: 'rgba(12,7,4,0.72)' }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }} />
        <Animated.View
          entering={FadeIn.duration(260).delay(60)}
          style={{
            backgroundColor: c.panel,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: c.border,
            paddingHorizontal: 22,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <StageDirection>(how this works.)</StageDirection>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={c.mutedForeground} />
            </Pressable>
          </View>
          <Text
            style={{
              marginTop: 8,
              fontFamily: 'InstrumentSerif_400Regular',
              fontSize: 30,
              lineHeight: 34,
              letterSpacing: -0.4,
              color: c.foreground,
            }}
          >
            Paste the email.{' '}
            <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>
              The board does the rest.
            </Text>
          </Text>

          <AuditionsScene style={{ marginTop: 16 }} />

          <Text
            style={{
              marginTop: 16,
              fontFamily: 'BricolageGrotesque_500Medium',
              fontSize: 14.5,
              lineHeight: 21,
              color: c.mutedForeground,
            }}
          >
            The casting email goes in and a ticket comes out: the date, the room, the part, what to bring.
            The night before, your phone taps you on the shoulder. Or fill it in by hand, that is always free.
          </Text>

          <PrimaryPill label={primaryLabel} onPress={onPrimary} block style={{ marginTop: 18 }} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
