import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeContext';

/**
 * The way back, top-left on every screen except Search (handoff §5): a chevron
 * and a small uppercase label naming where it goes (SEARCH, RESULTS, BACK). The
 * chevron uses the quiet chrome grey, not the muted foreground.
 */
export function BackHeader({
  label,
  onPress,
  right,
  close = false,
}: {
  label: string;
  onPress: () => void;
  right?: React.ReactNode;
  /** A page that came up from below goes down again: a cross, no destination named. */
  close?: boolean;
}) {
  const { colors: c } = useTheme();
  if (close) {
    return (
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, zIndex: 5 }}>
        <Fade />
        <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -6 }}>
          <Ionicons name="close" size={24} color={c.foreground} />
        </Pressable>
        {right ?? null}
      </View>
    );
  }
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, zIndex: 5 }}>
      <Fade />
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${label}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingRight: 10 }}
      >
        <Ionicons name="chevron-back" size={20} color={c.mutedForeground} />
        {/* Sentence case, untracked. The uppercase-and-spaced version was
            Montserrat's idea of a back label; Bricolage has enough character at
            13pt that shouting the destination just makes the corner loud. */}
        <Text
          style={{
            fontFamily: 'BricolageGrotesque_600SemiBold',
            fontSize: 13,
            color: c.mutedForeground,
          }}
        >
          {label}
        </Text>
      </Pressable>
      {right ?? null}
    </View>
  );
}

/**
 * Under the header, the page scrolling up fades out over a few points instead
 * of being cut on a line (the lamp's glow was sliced in half by it).
 */
function Fade() {
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const H = 26;
  return (
    <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 52, width, height: H }}>
      <Rect x={0} y={0} width={width} height={H}>
        <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={[c.background, `${c.background}00`]} />
      </Rect>
    </Canvas>
  );
}
