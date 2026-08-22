import { useEffect, useState } from 'react';
import { Pressable, View, type TextStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { colors } from '../theme/tokens';

/**
 * Memorize mode. The speech is broken into lines; with memorize on, tapping a
 * line drops it into shadow so the actor can rehearse recalling it — a faint
 * ghost of the words remains, and a tap brings it back. Turning memorize off
 * reveals everything. Blank lines stay as stanza breaks.
 *
 * A rehearsal aid, not chrome — so the lines are real Text (selectable line
 * breaks preserved) and the fade rides the UI thread.
 */

interface Props {
  text: string;
  active: boolean;
  /** Bump to reveal every line at once ("reveal all"). */
  revealKey: number;
  textStyle: TextStyle;
}

export function MemorizeText({ text, active, revealKey, textStyle }: Props) {
  const lines = text.split('\n');
  return (
    <View>
      {lines.map((line, i) => (
        <MemorizeLine
          key={`${revealKey}:${i}`}
          text={line}
          active={active}
          textStyle={textStyle}
        />
      ))}
    </View>
  );
}

function MemorizeLine({
  text,
  active,
  textStyle,
}: {
  text: string;
  active: boolean;
  textStyle: TextStyle;
}) {
  const [hidden, setHidden] = useState(false);
  const opacity = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Leaving memorize mode lights every line back up.
  useEffect(() => {
    if (!active && hidden) {
      setHidden(false);
      opacity.value = withTiming(1, { duration: 220 });
    }
  }, [active, hidden, opacity]);

  // A blank line is a stanza break — keep the rhythm, nothing to tap.
  if (text.trim() === '') {
    return <View style={{ height: (textStyle.lineHeight ?? 24) * 0.6 }} />;
  }

  const toggle = () => {
    if (!active) return;
    Haptics.selectionAsync().catch(() => {});
    const next = !hidden;
    setHidden(next);
    opacity.value = withTiming(next ? 0.08 : 1, { duration: 220 });
  };

  return (
    <Pressable onPress={toggle} disabled={!active}>
      <View
        style={
          hidden
            ? {
                borderBottomWidth: 1,
                borderBottomColor: colors.light.border,
                borderStyle: 'dashed',
              }
            : undefined
        }
      >
        <Animated.Text style={[textStyle, style]}>{text}</Animated.Text>
      </View>
    </Pressable>
  );
}
