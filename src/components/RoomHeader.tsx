import { Text, View, type ViewProps } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Initial } from './Initial';

/** How far the room scrolls before the big title has gone and the small one has arrived. */
const GONE = 56;

/**
 * The top row of a room: nothing on the left (a room is not reached from
 * anywhere, so there is nowhere to go back to), your initial on the right,
 * and whatever the room keeps up there between them. Given the room's
 * scroll and its name, the name arrives in the middle of the row as the big
 * title below scrolls away, so the title is never cut by the row: it goes,
 * and comes back small.
 */
export function RoomHeader({ left, right, title, scrollY, style, ...rest }: { left?: React.ReactNode; right?: React.ReactNode; title?: string; scrollY?: SharedValue<number> } & ViewProps) {
  const small = useAnimatedStyle(() => {
    const y = scrollY?.value ?? 0;
    return { opacity: interpolate(y, [GONE * 0.6, GONE], [0, 1], Extrapolation.CLAMP), transform: [{ translateY: interpolate(y, [GONE * 0.6, GONE], [6, 0], Extrapolation.CLAMP) }] };
  });
  return (
    <View {...rest} style={[{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>{left}</View>
      {title && scrollY ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }, small]}>
          <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 20, lineHeight: 24, letterSpacing: -0.2 }} className="text-foreground">{title}</Text>
        </Animated.View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {right}
        <Initial />
      </View>
    </View>
  );
}

/** The big title at the head of a room's scroll: it fades and lifts as it goes, so it is never cut by the row above. */
export function RoomTitle({ scrollY, children, style }: { scrollY: SharedValue<number>; children: React.ReactNode; style?: ViewProps['style'] }) {
  const big = useAnimatedStyle(() => {
    const y = scrollY.value;
    return { opacity: interpolate(y, [0, GONE * 0.8], [1, 0], Extrapolation.CLAMP), transform: [{ translateY: interpolate(y, [0, GONE], [0, -8], Extrapolation.CLAMP) }] };
  });
  return <Animated.View style={[big, style]}>{children}</Animated.View>;
}
