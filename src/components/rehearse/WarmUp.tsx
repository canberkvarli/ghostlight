import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GhostLight } from '../GhostLight';
import { StageDirection } from '../StageDirection';
import { useTheme } from '../../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SANS = 'BricolageGrotesque_500Medium';

/** What a house does while it waits. One line at a time, in the stage-direction voice. */
const HOUSE = [
  'the house lights go down.',
  'your partner clears their throat.',
  'someone finds the light switch.',
  'a chair is moved, for no reason.',
  'the prompter opens the book.',
  'a cough from the third row.',
  'places, please.',
];

/**
 * The moment between tapping Begin and the first line: the lamp, the name of
 * the scene, and the house getting ready, one direction at a time. It used
 * to be the cast sheet, shown for a second with its pill greyed and then
 * taken away, which read as something going wrong.
 */
export function WarmUp({ title, waiting }: { title: string; waiting: string | null }) {
  const { colors: c } = useTheme();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % HOUSE.length), 1700);
    return () => clearInterval(t);
  }, []);
  return (
    <Animated.View entering={FadeIn.duration(320)} exiting={FadeOut.duration(420)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 60 }}>
      <GhostLight size={46} />
      <Text numberOfLines={2} style={{ marginTop: 30, textAlign: 'center', fontFamily: SERIF, fontSize: 28, lineHeight: 32, letterSpacing: -0.3, color: c.foreground }}>{title}</Text>
      <View style={{ height: 44, marginTop: 10, justifyContent: 'center', alignSelf: 'stretch' }}>
        <Animated.View key={i} entering={FadeIn.duration(420)} exiting={FadeOut.duration(260)} style={{ position: 'absolute', left: 0, right: 0 }}>
          <StageDirection style={{ textAlign: 'center' }}>({HOUSE[i]})</StageDirection>
        </Animated.View>
      </View>
      {waiting ? (
        <Text style={{ marginTop: 18, textAlign: 'center', fontFamily: SANS, fontSize: 12.5, lineHeight: 18, color: c.mutedForeground }}>{waiting}</Text>
      ) : null}
    </Animated.View>
  );
}
