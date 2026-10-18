import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { StageDirection } from './StageDirection';
import type { Audition } from '../api/auditions';
import { clockLabel, daysUntil } from '../lib/when';
import { track } from '../lib/analytics';
import { useTheme } from '../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const CAP = 'CourierPrime_700Bold';

/**
 * The board, under the search field: the next audition as a call sheet. A
 * cream card with the day torn off at the left (THU over 23, or DUE for a
 * tape) and the project and the hour beside it; the same card that heads the
 * prep file, so tapping it opens the thing it already looks like.
 *
 * Auditions is the bigger room behind this screen, which is why it gets a
 * card and the book gets an icon in the corner. With nothing on the board the
 * card says so and offers to add one; signed out it says what the board is
 * for and the screen behind it asks for the account.
 */
/** The soonest upcoming audition, dated ones first. */
export function nextAudition(auditions: Audition[] | undefined): Audition | undefined {
  return (auditions ?? [])
    .filter((a) => a.scope === 'upcoming')
    .sort((a, b) => (a.when ? Date.parse(a.when) : Infinity) - (b.when ? Date.parse(b.when) : Infinity))[0];
}

export function BoardCard({ isAuthenticated, next }: { isAuthenticated: boolean; next: Audition | undefined }) {
  const router = useRouter();
  const { colors: c } = useTheme();

  const open = () => {
    Haptics.selectionAsync().catch(() => {});
    track('app_home_row', { row: 'next' });
    if (next) router.push({ pathname: '/prep', params: { id: String(next.id) } });
    else if (isAuthenticated) router.push('/audition');
    else router.push('/auditions');
  };

  const cap = { fontFamily: CAP, fontSize: 9, lineHeight: 11, letterSpacing: 1.3, color: c.paperMuted } as const;
  const card = {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: c.cardBorder,
    backgroundColor: c.paper,
    overflow: 'hidden' as const,
    transform: [{ rotate: '-0.3deg' }],
  };

  let day: [string, string, string] | null = null;
  let line = '';
  if (next) {
    if (next.when) {
      const d = new Date(next.when);
      const due = next.kind === 'self_tape';
      day = [
        (due ? 'DUE' : d.toLocaleDateString(undefined, { weekday: 'short' })).toUpperCase(),
        String(d.getDate()),
        d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
      ];
      line = daysUntil(next.when) === 0 ? `today, ${clockLabel(next.when)}` : clockLabel(next.when);
      if (next.status === 'callback') line = `callback · ${line}`;
    } else {
      day = ['TBD', '?', ''];
      line = 'date to come';
    }
  }

  return (
    <View style={{ width: '100%' }}>
      <StageDirection style={{ marginBottom: 8 }}>{next ? '(next up.)' : '(the board.)'}</StageDirection>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={next ? `${next.project}, ${line}` : isAuthenticated ? 'Nothing on the board. Add an audition' : 'Auditions. Sign in to keep the board'}
        style={({ pressed }) => [card, { opacity: pressed ? 0.85 : 1 }]}
      >
        {next && day ? (
          <>
            <View style={{ width: 64, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: c.paperRule }}>
              <Text style={cap}>{day[0]}</Text>
              <Text style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 34, color: next.when ? c.paperInk : c.paperMuted }}>{day[1]}</Text>
              <Text style={cap}>{day[2] || ' '}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' }}>
              <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 25, letterSpacing: -0.2, color: c.paperInk }}>
                {next.project}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: 'CourierPrime_400Regular', fontSize: 12.5, letterSpacing: 0.3, color: c.paperMuted }}>
                {[line, next.role?.trim()].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={{ justifyContent: 'center', paddingRight: 12 }}>
              <Ionicons name="chevron-forward" size={15} color={c.paperFaint} />
            </View>
          </>
        ) : (
          <>
            <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 25, letterSpacing: -0.2, color: c.paperInk }}>Auditions</Text>
              <StageDirection on="paper" numberOfLines={2} style={{ marginTop: 3 }}>
                {isAuthenticated
                  ? '(nothing on the board. add the next one.)'
                  : '(the date, what to bring, the reminders. sign in to keep it.)'}
              </StageDirection>
            </View>
            <View style={{ justifyContent: 'center', paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, color: c.accentText }}>{isAuthenticated ? 'Add one' : 'Sign in'}</Text>
              <Ionicons name="chevron-forward" size={13} color={c.accentText} />
            </View>
          </>
        )}
      </Pressable>
    </View>
  );
}
