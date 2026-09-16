import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { mediumPalette, type Medium } from '../theme/medium';

/**
 * The two houses, as a segmented pill.
 *
 * v2 inverts how this works. It used to light each segment in its own house
 * colour, which meant the control changed colour twice — once for which side was
 * active and once for which house that side belonged to — and on the violet
 * stage the "active" violet segment sat on a violet field and read as neither.
 *
 * Now the selection is plain: the live segment is a solid cream chip with ink
 * type, on both schemes and in both houses. The only thing that carries the
 * house colour is the 13pt device to the left of the label, which is the part
 * that is actually saying *where you are* rather than *what is selected*.
 */

const SEGMENTS: { medium: Medium; label: string }[] = [
  { medium: 'theatre', label: 'Plays' },
  { medium: 'screen', label: 'Film & TV' },
];

/**
 * A proscenium and a screen, drawn from borders.
 *
 * Neither shape exists in Ionicons and both are 13pt, where a Skia canvas per
 * icon would cost more than the icon is worth. Four Views each, and they scale
 * with the label rather than with an icon font's own metrics.
 */
function Device({ medium, tint }: { medium: Medium; tint: string }) {
  if (medium === 'screen') {
    return (
      <View style={{ width: 14, alignItems: 'center' }}>
        <View
          style={{
            width: 14,
            height: 9.5,
            borderRadius: 2,
            borderWidth: 1.4,
            borderColor: tint,
          }}
        />
        <View style={{ width: 6, height: 1.4, marginTop: 1.6, backgroundColor: tint }} />
      </View>
    );
  }
  return (
    <View
      style={{
        width: 14,
        height: 11,
        borderWidth: 1.4,
        borderColor: tint,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'stretch',
        paddingVertical: 1,
      }}
    >
      {/* Two legs of curtain inside the arch. */}
      <View style={{ width: 1.4, backgroundColor: tint }} />
      <View style={{ width: 1.4, backgroundColor: tint }} />
    </View>
  );
}

export function MediumToggle({
  medium,
  onChange,
}: {
  medium: Medium;
  onChange: (m: Medium) => void;
}) {
  const { colors: c } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: c.foreground,
        padding: 4,
        gap: 4,
      }}
    >
      {SEGMENTS.map((seg) => {
        const active = seg.medium === medium;
        // The active chip is the foreground colour, so it is cream on the dark
        // stage and ink on the paper one — which means the device on it needs
        // the OPPOSITE scheme's house colour to stay legible: the deep accent on
        // cream, the bright glow on ink.
        const house = mediumPalette(seg.medium, !c.isLight).accent;
        return (
          <Pressable
            key={seg.medium}
            onPress={() => onChange(seg.medium)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              height: 34,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              paddingHorizontal: 16,
              borderRadius: 999,
              backgroundColor: active ? c.foreground : 'transparent',
            }}
          >
            {/* On the active chip the device takes its house colour against the
                cream; on an inactive one it is simply the muted foreground, so
                the unselected side never advertises itself. */}
            <Device
              medium={seg.medium}
              tint={active ? house : c.mutedForeground}
            />
            {/* "Film & TV" is the wider of the two and the pill must not grow a
                second row on a narrow phone. */}
            <Text
              numberOfLines={1}
              style={{
                fontFamily: active ? 'BricolageGrotesque_700Bold' : 'BricolageGrotesque_600SemiBold',
                fontSize: 13,
                letterSpacing: 0.1,
                color: active ? c.background : c.mutedForeground,
              }}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
