import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { BackHeader } from '../src/components/BackHeader';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { PaperCard } from '../src/components/PaperCard';
import { AuditionsScene } from '../src/components/AuditionsScene';
import { Sketch } from '../src/components/Sketches';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useAuditions, useCalendarFeed, useLogOutcome } from '../src/hooks/useAuditions';
import {
  KIND_LABEL,
  OUTCOME_LABEL,
  STATUS_LABEL,
  attachedPiece,
  type Audition,
  type Outcome,
} from '../src/api/auditions';
import { useGoBack } from '../src/lib/nav';
import { useSession } from '../src/lib/useSession';
import { dayLabel, distanceLabel, timeLabel } from '../src/lib/when';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * Auditions — "Your week."
 *
 * The same tracker as actorrise.com/auditions, cut down to the thing a phone is
 * for: what is coming, when, and which piece you are bringing. Each card is a
 * page of sides with the date in the margin; tap one to change it. The reminders
 * are what make this worth a second day — see src/lib/notifications.ts.
 *
 * Anonymous readers, and anyone with an empty board, get the intro: the
 * website's "how it works" loop cut for a phone, with the one thing to do
 * next under it. Sign in, or paste the first casting email.
 */

const TILTS = [-0.5, 0.4, -0.3];

type Row = { type: 'audition'; a: Audition } | { type: 'divider'; label: string };

export default function Auditions() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { isAuthenticated } = useSession();
  const { data, isLoading, isError } = useAuditions(isAuthenticated);
  const feed = useCalendarFeed();

  const rows = useMemo<Row[]>(() => {
    const list = data ?? [];
    const upcoming = list.filter((a) => a.scope === 'upcoming');
    const rest = list.filter((a) => a.scope !== 'upcoming');
    const out: Row[] = upcoming.map((a) => ({ type: 'audition', a }));
    if (rest.length) {
      out.push({ type: 'divider', label: '(earlier.)' });
      rest.forEach((a) => out.push({ type: 'audition', a }));
    }
    return out;
  }, [data]);

  const upcomingCount = (data ?? []).filter((a) => a.scope === 'upcoming').length;
  const subhead =
    upcomingCount === 0 ? '(nothing coming up.)' : `(${upcomingCount} coming up.)`;

  const onAdd = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push('/audition');
  }, [router]);
  const onPaste = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: '/audition', params: { paste: '1' } });
  }, [router]);
  const onSignIn = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push('/auth');
  }, [router]);
  const onCalendar = useCallback(() => {
    if (feed.isPending) return;
    Haptics.selectionAsync().catch(() => {});
    feed.mutate(undefined, {
      onError: () => Alert.alert("Couldn't open the feed", 'Check your connection and try again.'),
    });
  }, [feed]);

  const renderItem = useCallback(
    ({ item, index }: { item: Row; index: number }) =>
      item.type === 'divider' ? (
        <StageDirection style={{ marginTop: 10, marginBottom: 14, paddingHorizontal: 6 }}>{item.label}</StageDirection>
      ) : (
        <AuditionCard
          a={item.a}
          index={index}
          onPress={() => router.push({ pathname: '/audition', params: { id: String(item.a.id) } })}
          onOpenPiece={(id) => router.push(`/read/${id}`)}
        />
      ),
    [router],
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <BackHeader
          label="Search"
          onPress={goBack}
          right={
            isAuthenticated ? (
              <Pressable
                onPress={onAdd}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Add an audition"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 }}
              >
                <Ionicons name="add" size={20} color={c.accentText} />
                <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, color: c.accentText }}>
                  Add
                </Text>
              </Pressable>
            ) : undefined
          }
        />

        {!isAuthenticated ? (
          <Intro signedIn={false} onPrimary={onSignIn} onSecondary={onSignIn} />
        ) : isLoading ? (
          <Center>
            <Sketch name="clapper" size={88} stroke={c.yellow} accent={c.yellow} />
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>
              (checking the callboard…)
            </StageDirection>
          </Center>
        ) : isError ? (
          <Center>
            <Sketch name="footlights" size={96} stroke={c.mutedForeground} />
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>
              (couldn&apos;t reach the callboard.)
            </StageDirection>
          </Center>
        ) : rows.length === 0 ? (
          <Intro signedIn onPrimary={onPaste} onSecondary={onAdd} />
        ) : (
          <FlashList
            data={rows}
            renderItem={renderItem}
            keyExtractor={(r) => (r.type === 'divider' ? r.label : String(r.a.id))}
            getItemType={(r) => r.type}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 110 }}
            ListHeaderComponent={
              <View style={{ paddingTop: 8, paddingBottom: 20, paddingHorizontal: 6 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'InstrumentSerif_400Regular',
                    fontSize: 44,
                    lineHeight: 52,
                    letterSpacing: -0.8,
                    color: c.foreground,
                  }}
                >
                  Your{' '}
                  <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>
                    week.
                  </Text>
                </Text>
                <StageDirection style={{ marginTop: 6 }}>{subhead}</StageDirection>
              </View>
            }
            ListFooterComponent={
              <Pressable
                onPress={onCalendar}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Subscribe to this board in your calendar"
                style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {feed.isPending ? (
                  <ActivityIndicator color={c.mutedForeground} />
                ) : (
                  <>
                    <Ionicons name="calendar-outline" size={14} color={c.mutedForeground} />
                    <StageDirection numberOfLines={1}>(put the board in your calendar.)</StageDirection>
                  </>
                )}
              </Pressable>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

function AuditionCard({
  a,
  index,
  onPress,
  onOpenPiece,
}: {
  a: Audition;
  index: number;
  onPress: () => void;
  onOpenPiece: (monologueId: number) => void;
}) {
  const { colors: c } = useTheme();
  const piece = attachedPiece(a);
  const past = a.scope !== 'upcoming';
  const where = a.kind === 'self_tape' ? 'Self-tape' : a.location?.trim() || KIND_LABEL[a.kind];
  const meta = [a.role?.trim(), where].filter(Boolean).join(' · ');
  // The status only earns a chip once it says something the date does not.
  const statusChip = a.status === 'scheduled' ? null : STATUS_LABEL[a.status];
  // "How did it go?" once it has gone, until the answer moves the status.
  const askOutcome = past && (a.status === 'scheduled' || a.status === 'submitted') && !a.after_notes;
  const outcome = useLogOutcome();
  const log = (o: Outcome) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    outcome.mutate({ id: a.id, outcome: o });
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a.project}${a.role ? `, ${a.role}` : ''}${a.when ? `, ${dayLabel(a.when)}` : ''}`}
      style={{ marginBottom: 14, opacity: past ? 0.72 : 1 }}
    >
      <PaperCard rotate={TILTS[index % TILTS.length]} style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          {/* The date in the margin, the way a stage manager pencils a call. */}
          <View style={{ width: 62 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 11, letterSpacing: 0.6, color: c.paperMuted, textTransform: 'uppercase' }}
            >
              {a.when ? dayLabel(a.when) : 'No date'}
            </Text>
            <Text
              numberOfLines={1}
              style={{ marginTop: 2, fontFamily: 'InstrumentSerif_400Regular', fontSize: 24, lineHeight: 28, color: c.paperInk }}
            >
              {a.when ? timeLabel(a.when) : '—'}
            </Text>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 22, lineHeight: 25, letterSpacing: -0.3, color: c.paperInk }}
            >
              {a.project}
            </Text>
            {meta ? (
              <Text numberOfLines={2} style={{ marginTop: 4, fontFamily: 'CourierPrime_400Regular', fontSize: 12, lineHeight: 17, color: c.paperMuted }}>
                {a.role ? <Text style={{ fontFamily: 'CourierPrime_700Bold', color: c.paperInk }}>{a.role}</Text> : null}
                {a.role ? ` · ${where}` : where}
              </Text>
            ) : null}
            {statusChip ? (
              <View
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: a.status === 'passed' ? c.paperRule : c.primary,
                }}
              >
                <Text style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 9, letterSpacing: 0.6, color: a.status === 'passed' ? c.paperMuted : '#fff' }}>
                  {statusChip.toUpperCase()}
                </Text>
              </View>
            ) : null}
            {a.notes?.trim() ? (
              <Text numberOfLines={1} style={{ marginTop: 5, fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 11.5, color: c.paperMuted }}>
                {a.notes.trim().split('\n')[0]}
              </Text>
            ) : null}
          </View>

          <Ionicons name="chevron-forward" size={16} color={c.paperFaint} style={{ marginTop: 4 }} />
        </View>

        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {piece?.title ? (
            <Pressable
              onPress={() => piece.monologue_id != null && onOpenPiece(piece.monologue_id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Open ${piece.title}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}
            >
              <Ionicons name="bookmark" size={13} color={c.primary} />
              <Text numberOfLines={1} style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, color: c.paperBody, flexShrink: 1 }}>
                {piece.title}
              </Text>
            </Pressable>
          ) : (
            <StageDirection on="paper" numberOfLines={1} style={{ flex: 1 }}>
              (no piece attached.)
            </StageDirection>
          )}
          {a.when ? (
            <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 11, color: c.paperMuted }}>
              {distanceLabel(a.when)}
            </Text>
          ) : null}
        </View>

        {askOutcome ? (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: c.paperRule, paddingTop: 10 }}>
            <StageDirection on="paper" numberOfLines={1}>(how did it go?)</StageDirection>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
                <Pressable
                  key={o}
                  onPress={() => log(o)}
                  disabled={outcome.isPending}
                  accessibilityRole="button"
                  style={{
                    paddingHorizontal: 12,
                    height: 32,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: c.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: outcome.isPending ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 12, color: c.paperInk }}>{OUTCOME_LABEL[o]}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </PaperCard>
    </Pressable>
  );
}

/**
 * The board before there is anything on it. One headline, the loop, three
 * lines on what happens, and the one thing to do next. Signed out, that is
 * signing in; signed in, it is pasting the first casting email.
 */
function Intro({
  signedIn,
  onPrimary,
  onSecondary,
}: {
  signedIn: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const { colors: c } = useTheme();
  const lines = [
    'Paste the casting email. It becomes a ticket on your week.',
    'The night before and two hours out, a reminder, with your piece in it.',
    'Same board as actorrise.com. Add it here, see it there.',
  ];
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 48 }}
    >
      <Text
        style={{
          fontFamily: 'InstrumentSerif_400Regular',
          fontSize: 40,
          lineHeight: 46,
          letterSpacing: -0.6,
          color: c.foreground,
        }}
      >
        Your week,{' '}
        <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>on the board.</Text>
      </Text>
      <StageDirection style={{ marginTop: 6 }}>
        {signedIn ? '(nothing on it yet.)' : '(sign in and it fills itself.)'}
      </StageDirection>

      <AuditionsScene style={{ marginTop: 22 }} />

      <View style={{ marginTop: 22, gap: 12 }}>
        {lines.map((line) => (
          <View key={line} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.yellow, marginTop: 7 }} />
            <Text
              style={{
                flex: 1,
                fontFamily: 'BricolageGrotesque_500Medium',
                fontSize: 14,
                lineHeight: 20,
                color: c.foreground,
              }}
            >
              {line}
            </Text>
          </View>
        ))}
      </View>

      <PrimaryPill
        label={signedIn ? 'Paste a casting email' : 'Sign in to track auditions'}
        onPress={onPrimary}
        block
        style={{ marginTop: 28 }}
      />
      <Pressable onPress={onSecondary} hitSlop={10} accessibilityRole="button" style={{ marginTop: 14, alignSelf: 'center' }}>
        <StageDirection numberOfLines={2} style={{ textAlign: 'center' }}>
          {signedIn ? '(or add it by hand.)' : '(free with any ActorRise account. your saves come too.)'}
        </StageDirection>
      </Pressable>
    </ScrollView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 90 }}>
      {children}
    </View>
  );
}
