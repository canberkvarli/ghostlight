import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { GhostLight } from '../src/components/GhostLight';
import { Still, takeHref } from '../src/components/TapesShelf';
import { useTakeList } from '../src/hooks/useCallboard';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/**
 * Tapes: every take on the phone, without the camera. Opened from the Book's
 * Tapes shelf, or by holding the Tape tab. A take opens in the tape room,
 * playing, with Again, Trim, Keep, Save and Send.
 */
export default function TapesScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const { width } = useWindowDimensions();
  const takes = useTakeList();
  const [kept, setKept] = useState(false);
  const shown = takes.filter((t) => !kept || t.starred);
  const keptCount = takes.filter((t) => t.starred).length;
  const gap = 12;
  const cell = (width - 24 * 2 - gap * 2) / 3;

  const filter = (label: string, on: boolean, press: () => void) => (
    <Pressable key={label} onPress={() => { Haptics.selectionAsync().catch(() => {}); press(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ height: 32, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? c.foreground : c.border, backgroundColor: on ? c.foreground : 'transparent', justifyContent: 'center' }}>
      <Text style={{ fontFamily: SANS_B, fontSize: 13, color: on ? c.background : c.foreground }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 6 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 40, color: c.foreground }}>Tapes</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/tape/[id]', params: { id: 'free' } } as Href); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Tape a new one"
              style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: c.foreground + '14', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="videocam-outline" size={18} color={c.foreground} />
            </Pressable>
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"
              style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: c.foreground + '14', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="close" size={18} color={c.foreground} />
            </Pressable>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingBottom: 14 }}>
          {filter(`All · ${takes.length}`, !kept, () => setKept(false))}
          {filter(`Kept · ${keptCount}`, kept, () => setKept(true))}
        </View>
        {shown.length === 0 ? (
          <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 }}>
            <GhostLight size={24} />
            <StageDirection style={{ marginTop: 20, textAlign: 'center' }}>
              {kept ? '(nothing kept yet. star a take to keep it.)' : '(no takes yet. tap Tape and say “action”.)'}
            </StageDirection>
          </Animated.View>
        ) : (
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap, paddingHorizontal: 24, paddingBottom: 32 }}>
            {shown.map((t, i) => (
              <Animated.View key={t.id} entering={FadeInDown.delay(Math.min(i, 12) * 30).duration(280)}>
                <Still take={t} width={cell} onPress={() => { Haptics.selectionAsync().catch(() => {}); router.back(); setTimeout(() => router.push(takeHref(t)), 260); }} />
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
