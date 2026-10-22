import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { track } from '../lib/analytics';
import { useTheme } from '../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const CAP = 'CourierPrime_700Bold';

/**
 * Under the board: the scene partner as a call sheet of its own. A cream card
 * with the cue torn off at the left and one line beside it. It opens the
 * rehearse room, which does its own asking for the account.
 */
export function RehearseCard() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const open = () => {
    Haptics.selectionAsync().catch(() => {});
    track('app_rehearse_opened', { from: 'home' });
    router.push('/rehearse');
  };
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel="Scene partner">
      {({ pressed }) => (
        <View style={{
          flexDirection: 'row', alignItems: 'stretch', borderRadius: 8, borderWidth: 1.5, borderColor: c.cardBorder,
          backgroundColor: c.paper, overflow: 'hidden', transform: [{ rotate: pressed ? '0deg' : '0.3deg' }], opacity: pressed ? 0.92 : 1,
        }}>
          <View style={{ width: 62, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: c.paperRule, borderStyle: 'dashed', paddingVertical: 12 }}>
            <Text style={{ fontFamily: CAP, fontSize: 9, lineHeight: 11, letterSpacing: 1.3, color: c.paperMuted }}>CUE</Text>
            <Text style={{ marginTop: 2, fontFamily: SERIF, fontSize: 26, lineHeight: 28, color: c.paperInk }}>&amp;</Text>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' }}>
            <Text style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 23, color: c.paperInk }}>Run a scene with a partner.</Text>
            <Text style={{ marginTop: 3, fontFamily: MONO_I, fontSize: 12.5, lineHeight: 17, color: c.paperMuted }}>(your sides, or the library. it reads the other parts.)</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}
