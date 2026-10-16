import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useFavorites } from '../hooks/useFavorites';
import { useAuditions } from '../hooks/useAuditions';
import { clockLabel, daysUntil } from '../lib/when';
import { track } from '../lib/analytics';
import { useTheme } from '../theme/ThemeContext';

/**
 * Your things, under the search field: the book and the board, as two props on
 * the stage. The book is a small stack of cream pages with the count on the
 * front sheet; the next audition is a ticket stub with its date in a block of
 * its own. Each gets half the width and 64pt.
 *
 * The shape is the point. These were two half-width rows of text, and a
 * project name next to a day and a time in that width always lost its end.
 * Here the date lives in the stub and the name has the whole line to itself,
 * so the only thing that can ever shorten is a very long title, and it shortens
 * where a title would.
 *
 * Both are always there. Signed out, the second line says what signing in gets
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
      const top = due ? 'DUE' : days <= 6 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { month: 'short' });
      stub = [top.toUpperCase(), String(d.getDate())];
      nextLine = days === 0 ? `today · ${clockLabel(next.when)}` : clockLabel(next.when);
      if (next.status === 'callback') nextLine += ' · callback';
    } else {
      stub = ['TBD', '?'];
      nextLine = 'date to come';
    }
  }

  return (
    <View style={{ width: '100%', flexDirection: 'row', gap: 10 }}>
      <Prop
        title="Your book"
        line={bookLine}
        accessibilityLabel={`Your book, ${bookLine}`}
        onPress={() => {
          track('app_home_row', { row: 'book' });
          router.push('/saves');
        }}
      >
        <Stack count={isAuthenticated ? keptCount : null} />
      </Prop>
      <Prop
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
      </Prop>
    </View>
  );
}

/** Half the width: the prop on the left, two lines of words beside it. */
function Prop({
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
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        height: 64,
        paddingLeft: 11,
        paddingRight: 10,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: c.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {children}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, lineHeight: 17, color: c.foreground }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            marginTop: 2,
            fontFamily: 'CourierPrime_400Regular_Italic',
            fontSize: 11,
            lineHeight: 14,
            letterSpacing: 0.3,
            color: c.mutedForeground,
          }}
        >
          {line}
        </Text>
      </View>
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
        borderRightWidth: 1,
        borderRightColor: c.ink,
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
