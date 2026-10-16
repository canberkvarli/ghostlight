import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { StageDirection } from './StageDirection';
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
    <View style={{ width: '100%' }}>
      <StageDirection style={{ marginBottom: 2 }}>(yours.)</StageDirection>
      <Row
        icon="bookmark-outline"
        label="Your book"
        meta={bookMeta}
        onPress={() => {
          track('app_home_row', { row: 'book' });
          router.push('/saves');
        }}
      />
      <Row
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

function Row({
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
      }}
    >
      <Ionicons name={icon} size={17} color={c.mutedForeground} />
      <Text
        numberOfLines={1}
        style={{ flexShrink: 1, fontFamily: 'BricolageGrotesque_500Medium', fontSize: 14, lineHeight: 19, color: c.foreground }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          textAlign: 'right',
          fontFamily: 'CourierPrime_400Regular_Italic',
          fontSize: 12,
          letterSpacing: 0.4,
          color: c.mutedForeground,
        }}
      >
        {`(${meta}.)`}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={c.chevron} />
    </Pressable>
  );
}
