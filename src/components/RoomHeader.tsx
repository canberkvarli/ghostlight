import { View, type ViewProps } from 'react-native';

import { Initial } from './Initial';

/**
 * The top row of a room: nothing on the left (a room is not reached from
 * anywhere, so there is nowhere to go back to), your initial on the right,
 * and whatever the room keeps up there between them.
 */
export function RoomHeader({ left, right, style, ...rest }: { left?: React.ReactNode; right?: React.ReactNode } & ViewProps) {
  return (
    <View {...rest} style={[{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>{left}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {right}
        <Initial />
      </View>
    </View>
  );
}
