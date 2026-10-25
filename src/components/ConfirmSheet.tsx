import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PrimaryPill } from './PrimaryPill';
import { StageDirection } from './StageDirection';
import { useTheme } from '../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/**
 * A question with two answers, as a sheet of our own rather than the phone's
 * alert: the title in the headline voice with its last word lit, one
 * paragraph, the thing to do as a pill and the way back as a word. The dark
 * behind it is not a button: the sheet goes away only by its own words, like
 * the backstage note. `danger` draws the pill in the warning red for the one
 * thing that cannot be undone.
 */
export function ConfirmSheet({ open, title, accent, body, confirm, cancel = 'Not now', danger = false, busy = false, aside, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  /** The title's last word, in italic and the accent. */
  accent: string;
  body: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
  busy?: boolean;
  /** One Courier line under the pill. */
  aside?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,7,4,0.66)' }}>
        <Animated.View
          entering={FadeIn.duration(240).delay(40)}
          style={{
            backgroundColor: c.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: c.border,
            paddingHorizontal: 24, paddingTop: 22, paddingBottom: Math.max(insets.bottom, 16) + 10,
          }}
        >
          <Text style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 36, letterSpacing: -0.4, color: c.foreground }}>
            {title} <Text style={{ fontFamily: SERIF_I, color: danger ? '#c0392b' : c.accentText }}>{accent}</Text>
          </Text>
          <Text style={{ marginTop: 10, fontFamily: SANS, fontSize: 14.5, lineHeight: 21, color: c.mutedForeground }}>{body}</Text>
          {danger ? (
            <Pressable onPress={onConfirm} disabled={busy} accessibilityRole="button" accessibilityState={{ busy }}
              style={({ pressed }) => ({ marginTop: 22, height: 54, borderRadius: 27, backgroundColor: '#c0392b', alignItems: 'center', justifyContent: 'center', opacity: pressed || busy ? 0.7 : 1 })}>
              <Text style={{ fontFamily: SANS_B, fontSize: 16, color: '#fff' }}>{confirm}</Text>
            </Pressable>
          ) : (
            <PrimaryPill label={confirm} onPress={onConfirm} disabled={busy} height={54} block haptic="medium" style={{ marginTop: 22 }} />
          )}
          {aside ? <StageDirection style={{ marginTop: 10, textAlign: 'center' }}>{aside}</StageDirection> : null}
          <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 14, paddingVertical: 8 }}>
            <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.mutedForeground }}>{cancel}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/** A small paper note anchored under a thing you tapped, our own, not the phone's alert. */
export function Tooltip({ open, at, title, body, onClose }: {
  open: boolean;
  /** Where the tapped thing sits in the window: its bottom edge and left. */
  at: { x: number; y: number } | null;
  title: string;
  body: string;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  if (!open || !at) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(160)} pointerEvents="none" style={{ position: 'absolute', left: Math.max(16, at.x), top: at.y + 8, maxWidth: 300 }}>
          {/* The gel under the note, offset, the way a paper card sits on the stage. */}
          <View style={{ position: 'absolute', left: 5, top: 5, right: -5, bottom: -5, borderRadius: 12, backgroundColor: c.yellow }} />
          <View style={{ borderRadius: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.paperRule, paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 24, color: c.paperInk }}>{title}</Text>
            <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: c.paperMuted }}>{body}</Text>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
