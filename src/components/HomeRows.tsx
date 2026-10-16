import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { StageDirection } from './StageDirection';
import { useFavorites } from '../hooks/useFavorites';
import { useAuditions } from '../hooks/useAuditions';
import { clockLabel, daysUntil } from '../lib/when';
import { track } from '../lib/analytics';
import { useTheme } from '../theme/ThemeContext';

/**
 * Your things, under the search field: the book and the board, two full-width
 * hairline rows in the same hand as the recents and the trending shelf below
 * them. Each row is a prop on the left (the book is a small stack of cream
 * pages with the count on the front sheet; the next audition is a ticket stub
 * with its date on it), the name of the thing, and what is in it written at the
 * right in the stage-direction italic.
 *
 * Full width is the point. These were two half-width tiles, and no amount of
 * arranging fits "sign in to keep one" and a stack into 160pt. A row gives the
 * title and the detail the whole line between them; the title yields first,
 * the way a title would, and the detail never has to.
 *
 * Both rows are always there. Signed out, the detail says what signing in gets
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

  const bookLine = !isAuthenticated
    ? 'sign in to keep one'
    : keptCount === 0
      ? 'nothing kept yet'
      : offBook > 0
        ? `${offBook} off book`
        : `${keptCount} kept`;

  let stub: [string, string] = ['—', ''];
  let nextTitle = 'Auditions';
  let nextLine = !isAuthenticated ? 'sign in to add one' : 'nothing on the board';
  if (next) {
    nextTitle = next.project;
    if (next.when) {
      const d = new Date(next.when);
      const days = daysUntil(next.when);
      const due = next.kind === 'self_tape';
      // Inside the week the weekday is what you think in; past it, the month.
      const top = due
        ? 'DUE'
        : days <= 6
          ? d.toLocaleDateString(undefined, { weekday: 'short' })
          : d.toLocaleDateString(undefined, { month: 'short' });
      stub = [top.toUpperCase(), String(d.getDate())];
      // The stub carries the day, so the line only needs the hour.
      nextLine = days === 0 ? `today, ${clockLabel(next.when)}` : clockLabel(next.when);
      if (next.status === 'callback') nextLine = `callback, ${nextLine}`;
    } else {
      stub = ['TBD', '?'];
      nextLine = 'date to come';
    }
  }

  return (
    <View style={{ width: '100%' }}>
      <StageDirection style={{ marginBottom: 2 }}>(yours.)</StageDirection>
      <Row
        title="Your book"
        line={bookLine}
        accessibilityLabel={`Your book, ${bookLine}`}
        onPress={() => {
          track('app_home_row', { row: 'book' });
          router.push('/saves');
        }}
      >
        <Stack count={isAuthenticated ? keptCount : null} />
      </Row>
      <Row
        title={nextTitle}
        line={nextLine}
        accessibilityLabel={`${nextTitle}, ${nextLine}`}
        onPress={() => {
          track('app_home_row', { row: 'next' });
          if (next) router.push({ pathname: '/prep', params: { id: String(next.id) } });
          else router.push('/auditions');
        }}
      >
        <Stub top={stub[0]} day={stub[1]} />
      </Row>
    </View>
  );
}

/** One full-width row: the prop, the title, and what is in it at the right. */
function Row({
  title,
  line,
  onPress,
  accessibilityLabel,
  children,
}: {
  title: string;
  line: string;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        width: '100%',
        height: 58,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {/* The props sit in one fixed column so the titles line up. */}
      <View style={{ width: 44, alignItems: 'center' }}>{children}</View>
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontFamily: 'BricolageGrotesque_600SemiBold',
          fontSize: 15,
          lineHeight: 20,
          color: c.foreground,
        }}
      >
        {title}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 0,
          marginLeft: 'auto',
          fontFamily: 'CourierPrime_400Regular_Italic',
          fontSize: 12,
          letterSpacing: 0.3,
          color: c.mutedForeground,
        }}
      >
        {line}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={c.mutedForeground} style={{ marginRight: 2 }} />
    </Pressable>
  );
}

/**
 * The book: three cream sheets fanned a few points apart, the count written on
 * the front one. One sheet when there is nothing in it yet; no number when we
 * do not know (signed out).
 */
function Stack({ count }: { count: number | null }) {
  const { colors: c } = useTheme();
  const sheets = count && count > 0 ? 3 : 1;
  const W = 24;
  const H = 32;
  const STEP = 3;
  return (
    <View style={{ width: W + STEP * 2, height: H + STEP * 2 }}>
      {Array.from({ length: sheets }).map((_, i) => {
        const back = sheets - 1 - i;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: back * STEP,
              top: (sheets - 1 - back) * STEP,
              width: W,
              height: H,
              borderRadius: 2,
              borderWidth: 1,
              borderColor: c.ink,
              backgroundColor: c.paper,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: `${(back - (sheets - 1) / 2) * -3}deg` }],
            }}
          >
            {i === sheets - 1 ? (
              <Text
                style={{
                  fontFamily: 'InstrumentSerif_400Regular',
                  fontSize: 17,
                  lineHeight: 20,
                  color: count == null ? c.paperMuted : c.paperInk,
                }}
              >
                {count == null ? '·' : String(count)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * The ticket stub: the weekday (or month, or DUE) over the day, on cream, with
 * a perforated edge on the right where it was torn from the book of tickets.
 */
function Stub({ top, day }: { top: string; day: string }) {
  const { colors: c } = useTheme();
  const empty = !day;
  return (
    <View
      style={{
        width: 36,
        height: 40,
        borderRadius: 3,
        borderWidth: 1,
        borderColor: c.ink,
        backgroundColor: c.paper,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* The tear: a dashed line just inside the right edge. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 2,
          bottom: 2,
          right: 4,
          width: 0,
          borderLeftWidth: 1,
          borderStyle: 'dashed',
          borderColor: c.paperRule,
        }}
      />
      {empty ? (
        <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 18, color: c.paperMuted, marginRight: 4 }}>
          {top}
        </Text>
      ) : (
        <View style={{ alignItems: 'center', marginRight: 4 }}>
          <Text
            style={{
              fontFamily: 'CourierPrime_700Bold',
              fontSize: 8,
              lineHeight: 10,
              letterSpacing: 1,
              color: c.paperMuted,
            }}
          >
            {top}
          </Text>
          <Text
            style={{
              fontFamily: 'InstrumentSerif_400Regular',
              fontSize: 18,
              lineHeight: 20,
              color: c.paperInk,
            }}
          >
            {day}
          </Text>
        </View>
      )}
    </View>
  );
}
