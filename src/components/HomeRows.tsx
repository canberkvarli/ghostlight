import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useFavorites } from '../hooks/useFavorites';
import { useAuditions } from '../hooks/useAuditions';
import { clockLabel, dayLabel } from '../lib/when';
import { track } from '../lib/analytics';
import { useTheme } from '../theme/ThemeContext';

/**
 * Your things, under the search field: the book and the board, as two hairline
 * rows that say what is in them. These used to be two icons in the corner next
 * to Account, which was the whole map of the app drawn in chrome; now the
 * corner keeps Account and the rows carry the rest, with the count of what you
 * have kept and the next audition's day on them, so the screen is partly yours
 * the moment you have anything.
 *
 * Both rows are always there. Signed out, they say what signing in would get
 * you; the screens behind them ask for the account.
 */
export function HomeRows({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router = useRouter();
  const { data: kept } = useFavorites(isAuthenticated);
  const { data: auditions } = useAuditions(isAuthenticated);

  const keptCount = kept?.length ?? 0;
  const offBook = kept?.filter((m) => m.offBook).length ?? 0;
  const next = (auditions ?? [])
    .filter((a) => a.scope === 'upcoming')
    .sort((a, b) => (a.when ? Date.parse(a.when) : Infinity) - (b.when ? Date.parse(b.when) : Infinity))[0];

  const bookMeta = !isAuthenticated
    ? 'sign in to keep one'
    : keptCount === 0
      ? 'nothing kept yet'
      : `${keptCount} kept${offBook ? ` · ${offBook} off book` : ''}`;
  const nextMeta = !isAuthenticated
    ? 'sign in to add one'
    : !next
      ? 'nothing on the board'
      : next.when
        ? `${dayLabel(next.when)} · ${clockLabel(next.when)}`
        : 'date to come';

  return (
    <View style={{ width: '100%', flexDirection: 'row', gap: 10 }}>
      <Tile
        icon="bookmark-outline"
        label="Your book"
        meta={bookMeta}
        onPress={() => {
          track('app_home_row', { row: 'book' });
          router.push('/saves');
        }}
      />
      <Tile
        icon="calendar-outline"
        label={next ? next.project : 'Auditions'}
        meta={nextMeta}
        onPress={() => {
          track('app_home_row', { row: 'next' });
          if (next) router.push({ pathname: '/prep', params: { id: String(next.id) } });
          else router.push('/auditions');
        }}
      />
    </View>
  );
}

/**
 * Half a row each, side by side: the label on top, what is in it under. Two
 * full-width rows were 128pt the screen did not have; this is 56.
 */
function Tile({
  icon,
  label,
  meta,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  meta: string;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${meta}`}
      style={{
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 56,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: c.border,
      }}
    >
      <Ionicons name={icon} size={17} color={c.mutedForeground} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, lineHeight: 17, color: c.foreground }}
        >
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            marginTop: 1,
            fontFamily: 'CourierPrime_400Regular_Italic',
            fontSize: 11,
            lineHeight: 15,
            letterSpacing: 0.3,
            color: c.mutedForeground,
          }}
        >
          {`(${meta}.)`}
        </Text>
      </View>
    </Pressable>
  );
}
