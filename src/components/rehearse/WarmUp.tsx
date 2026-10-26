import { Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GhostLight } from '../GhostLight';
import { useTheme } from '../../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';

/**
 * The moment between tapping Begin and the first line: the lamp, the name of
 * the scene, and the house getting ready, one direction at a time. It used
 * to be the cast sheet, shown for a second with its pill greyed and then
 * taken away, which read as something going wrong.
 */
export function WarmUp({ title }: { title: string; waiting?: string | null }) {
  const { colors: c } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(420)} exiting={FadeOut.duration(520)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 60 }}>
      <GhostLight size={52} />
      <Text numberOfLines={2} style={{ marginTop: 30, textAlign: 'center', fontFamily: SERIF, fontSize: 28, lineHeight: 32, letterSpacing: -0.3, color: c.foreground }}>{title}</Text>
    </Animated.View>
  );
}
