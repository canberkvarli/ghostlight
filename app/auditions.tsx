import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { BackHeader } from '../src/components/BackHeader';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { PaperCard } from '../src/components/PaperCard';
import { HowItWorksSheet } from '../src/components/HowItWorksSheet';
import { Sketch } from '../src/components/Sketches';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useAuditions, useCalendarFeed } from '../src/hooks/useAuditions';
import { KIND_LABEL, STATUS_LABEL, attachedPiece, type Audition } from '../src/api/auditions';
import { useGoBack } from '../src/lib/nav';
import { useSession } from '../src/lib/useSession';
import { eyebrow, stubLabel, whenSentence } from '../src/lib/when';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * Auditions — "Your week."
 *
 * The website's rail, cut for a phone. The next audition is the one big
 * ticket at the top, with everything the card used to clamp said in full;
 * every other audition is a stub with the date in the margin. Tapping any of
 * them opens its file (app/prep.tsx), the way the web opens the prep room.
 * The form is behind Add and Edit, not behind every tap.
 *
 * Anonymous readers, and anyone with an empty board, get one ask and one
 * question mark. The loop that explains it lives behind the question mark.
 */

const TILTS = [-0.4, 0.3, -0.25, 0.35];

export default function Auditions() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { isAuthenticated } = useSession();
  const { data, isLoading, isError } = useAuditions(isAuthenticated);
  const feed = useCalendarFeed();
  const [how, setHow] = useState(false);
  const [logbook, setLogbook] = useState(false);

  const list = data ?? [];
  const { next, alsoUp, waiting, past } = useMemo(() => {
    const upcoming = list.filter((a) => a.scope === 'upcoming');
    return {
      next: upcoming[0] ?? null,
      alsoUp: upcoming.slice(1),
      waiting: list.filter((a) => a.scope === 'waiting'),
      past: list.filter((a) => a.scope === 'past'),
    };
  }, [list]);

  const upcomingCount = (next ? 1 : 0) + alsoUp.length;
  const subhead = upcomingCount === 0 ? '(nothing coming up.)' : `(${upcomingCount} coming up.)`;

  const open = useCallback(
    (a: Audition) => {
      Haptics.selectionAsync().catch(() => {});
      router.push({ pathname: '/prep', params: { id: String(a.id) } });
    },
    [router],
  );
  const onAdd = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push('/audition');
  }, [router]);
  const onPaste = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setHow(false);
    router.push({ pathname: '/audition', params: { paste: '1' } });
  }, [router]);
  const onSignIn = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setHow(false);
    router.push('/auth');
  }, [router]);
  const onCalendar = useCallback(() => {
    if (feed.isPending) return;
    Haptics.selectionAsync().catch(() => {});
    feed.mutate(undefined, {
      onError: () => Alert.alert("Couldn't open the feed", 'Check your connection and try again.'),
    });
  }, [feed]);

  const headerRight = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setHow(true);
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="How this works"
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: 1.5,
          borderColor: c.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', fontSize: 16, lineHeight: 18, color: c.mutedForeground }}>?</Text>
      </Pressable>
      {isAuthenticated && list.length > 0 ? (
        <Pressable onPress={onCalendar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Put the board in your calendar">
          {feed.isPending ? (
            <ActivityIndicator size="small" color={c.mutedForeground} />
          ) : (
            <Ionicons name="calendar-outline" size={20} color={c.mutedForeground} />
          )}
        </Pressable>
      ) : null}
      {isAuthenticated ? (
        <Pressable
          onPress={onAdd}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Add an audition"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 }}
        >
          <Ionicons name="add" size={20} color={c.accentText} />
          <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, color: c.accentText }}>Add</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <BackHeader label="Search" onPress={goBack} right={headerRight} />

        {!isAuthenticated ? (
          <Intro signedIn={false} onPrimary={onSignIn} onSecondary={onSignIn} onHow={() => setHow(true)} />
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
        ) : list.length === 0 ? (
          <Intro signedIn onPrimary={onPaste} onSecondary={onAdd} onHow={() => setHow(true)} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 110 }}>
            <View style={{ paddingTop: 8, paddingBottom: 18 }}>
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
                <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>week.</Text>
              </Text>
              <StageDirection style={{ marginTop: 6 }}>{subhead}</StageDirection>
            </View>

            {next ? (
              <Animated.View entering={FadeIn.duration(360)}>
                <NextTicket a={next} onPress={() => open(next)} />
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.duration(360)} style={{ paddingVertical: 10 }}>
                <PrimaryPill label="Paste a casting email" onPress={onPaste} block />
                <Pressable onPress={onAdd} hitSlop={10} accessibilityRole="button" style={{ marginTop: 12, alignSelf: 'center' }}>
                  <StageDirection>(or fill it in by hand.)</StageDirection>
                </Pressable>
              </Animated.View>
            )}

            <Animated.View layout={LinearTransition.duration(260)}>
              {alsoUp.length ? <Group label="(also coming up.)" items={alsoUp} onOpen={open} offset={1} /> : null}
              {waiting.length ? <Group label="(waiting to hear.)" items={waiting} onOpen={open} offset={1 + alsoUp.length} /> : null}
              {past.length ? (
                <View style={{ marginTop: 26 }}>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setLogbook((v) => !v);
                    }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: logbook }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <StageDirection>{logbook ? '(hide the logbook.)' : `(the logbook, ${past.length} done.)`}</StageDirection>
                    <Ionicons name={logbook ? 'chevron-up' : 'chevron-down'} size={13} color={c.mutedForeground} />
                  </Pressable>
                  {logbook ? <Group items={past} onOpen={open} offset={0} dim /> : null}
                </View>
              ) : null}
            </Animated.View>

            <Pressable
              onPress={onCalendar}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Subscribe to this board in your calendar"
              style={{ marginTop: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Ionicons name="calendar-outline" size={14} color={c.mutedForeground} />
              <StageDirection numberOfLines={1}>(put the board in your calendar.)</StageDirection>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>

      <HowItWorksSheet
        open={how}
        onClose={() => setHow(false)}
        primaryLabel={isAuthenticated ? 'Paste a casting email' : 'Sign in to track auditions'}
        onPrimary={isAuthenticated ? onPaste : onSignIn}
      />
    </View>
  );
}

/**
 * The next audition, in full. The eyebrow says how soon, the title wraps as
 * far as it needs to, and the last line says what is coming with you.
 */
function NextTicket({ a, onPress }: { a: Audition; onPress: () => void }) {
  const { colors: c } = useTheme();
  const piece = attachedPiece(a);
  const role = [a.role?.trim(), a.kind !== 'in_person' ? KIND_LABEL[a.kind] : null].filter(Boolean).join(' · ');
  const when = whenSentence(a);
  const place = a.kind === 'self_tape' ? null : a.location?.split(',')[0]?.trim();
  const packed = a.bring_list.filter((i) => i.done).length;
  const total = a.bring_list.length;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow(a, true)}. ${a.project}${a.role ? `, ${a.role}` : ''}`}
    >
      <PaperCard rotate={-0.35} shadow={7} style={{ paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16 }}>
        <Text
          style={{
            fontFamily: 'BricolageGrotesque_700Bold',
            fontSize: 11,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: c.primary,
          }}
        >
          {eyebrow(a, true)}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: 'InstrumentSerif_400Regular',
            fontSize: 32,
            lineHeight: 36,
            letterSpacing: -0.5,
            color: c.paperInk,
          }}
        >
          {a.project}
        </Text>
        {role ? (
          <Text style={{ marginTop: 6, fontFamily: 'CourierPrime_700Bold', fontSize: 13.5, lineHeight: 19, color: c.paperBody }}>
            {role}
          </Text>
        ) : null}
        {when || place ? (
          <Text style={{ marginTop: 10, fontFamily: 'BricolageGrotesque_500Medium', fontSize: 14.5, lineHeight: 21, color: c.paperInk }}>
            {when}
            {place ? <Text style={{ color: c.paperMuted }}>{when ? ' · ' : ''}{place}</Text> : null}
          </Text>
        ) : (
          <StageDirection on="paper" style={{ marginTop: 10 }}>(no date yet.)</StageDirection>
        )}

        <View
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: c.paperRule,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <Ionicons name={piece?.title ? 'bookmark' : 'bookmark-outline'} size={13} color={piece?.title ? c.primary : c.paperFaint} />
            {piece?.title ? (
              <Text numberOfLines={1} style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, color: c.paperBody, flexShrink: 1 }}>
                {piece.title}
              </Text>
            ) : (
              <StageDirection on="paper" numberOfLines={1} style={{ flexShrink: 1 }}>(no piece yet.)</StageDirection>
            )}
          </View>
          {total > 0 ? (
            <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 11.5, color: packed === total ? c.primary : c.paperMuted }}>
              {packed === total ? 'all packed' : `${packed} of ${total} packed`}
            </Text>
          ) : (
            <Ionicons name="chevron-forward" size={15} color={c.paperFaint} />
          )}
        </View>
      </PaperCard>
    </Pressable>
  );
}

/** A run of stubs under one stage direction. */
function Group({
  label,
  items,
  onOpen,
  offset,
  dim = false,
}: {
  label?: string;
  items: Audition[];
  onOpen: (a: Audition) => void;
  offset: number;
  dim?: boolean;
}) {
  return (
    <View style={{ marginTop: label ? 26 : 12 }}>
      {label ? <StageDirection style={{ marginBottom: 12 }}>{label}</StageDirection> : null}
      {items.map((a, i) => (
        <Animated.View key={a.id} entering={FadeIn.delay(Math.min(offset + i, 8) * 55).duration(300)}>
          <Stub a={a} index={offset + i} onPress={() => onOpen(a)} dim={dim} />
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * One audition as a ticket stub: the date torn off in the margin, the show
 * and the part beside it. Two lines for the title, which is enough for any
 * title once the date has its own column.
 */
function Stub({ a, index, onPress, dim }: { a: Audition; index: number; onPress: () => void; dim: boolean }) {
  const { colors: c } = useTheme();
  const [month, day] = stubLabel(a);
  const sub = [a.role?.trim(), a.kind !== 'in_person' ? KIND_LABEL[a.kind] : null].filter(Boolean).join(' · ');
  const chip = a.status === 'callback' || a.status === 'booked' ? STATUS_LABEL[a.status] : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a.project}${a.role ? `, ${a.role}` : ''}, ${eyebrow(a)}`}
      style={{ marginBottom: 10, opacity: dim ? 0.78 : 1 }}
    >
      <PaperCard rotate={TILTS[index % TILTS.length]} style={{ padding: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          <View
            style={{
              width: 58,
              paddingVertical: 10,
              alignItems: 'center',
              justifyContent: 'center',
              borderRightWidth: 1,
              borderRightColor: c.paperRule,
            }}
          >
            <Text style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 10, letterSpacing: 1, color: c.paperMuted }}>{month}</Text>
            <Text style={{ marginTop: 1, fontFamily: 'InstrumentSerif_400Regular', fontSize: 26, lineHeight: 30, color: c.paperInk }}>{day}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingVertical: 11, paddingHorizontal: 14, justifyContent: 'center' }}>
            <Text numberOfLines={2} style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 19, lineHeight: 22, letterSpacing: -0.2, color: c.paperInk }}>
              {a.project}
            </Text>
            {sub ? (
              <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: 'CourierPrime_400Regular', fontSize: 12, lineHeight: 16, color: c.paperMuted }}>
                {sub}
              </Text>
            ) : null}
          </View>
          <View style={{ paddingRight: 12, justifyContent: 'center' }}>
            {chip ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: c.primary }}>
                <Text style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 9, letterSpacing: 0.6, color: '#fff' }}>{chip.toUpperCase()}</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={15} color={c.paperFaint} />
            )}
          </View>
        </View>
      </PaperCard>
    </Pressable>
  );
}

/**
 * The board before there is anything on it: one headline, one thing to do,
 * and a question mark for anyone who wants the tour. The tour used to play
 * here on its own; it pushed the button off a small phone and nobody had
 * asked for it yet.
 */
function Intro({
  signedIn,
  onPrimary,
  onSecondary,
  onHow,
}: {
  signedIn: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  onHow: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 24 }}>
        <Sketch name="clapper" size={120} stroke={c.yellow} accent={c.yellow} />
        <Text
          style={{
            marginTop: 26,
            textAlign: 'center',
            fontFamily: 'InstrumentSerif_400Regular',
            fontSize: 40,
            lineHeight: 46,
            letterSpacing: -0.6,
            color: c.foreground,
          }}
        >
          Your week,{'\n'}
          <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>on the board.</Text>
        </Text>
        <StageDirection style={{ marginTop: 10, textAlign: 'center' }}>
          {signedIn ? '(nothing on it yet.)' : '(same board as the site. free with any account.)'}
        </StageDirection>
      </View>

      <View>
        <PrimaryPill label={signedIn ? 'Paste a casting email' : 'Sign in to track auditions'} onPress={onPrimary} block />
        {signedIn ? (
          <Pressable onPress={onSecondary} hitSlop={10} accessibilityRole="button" style={{ marginTop: 14, alignSelf: 'center' }}>
            <StageDirection>(or fill it in by hand.)</StageDirection>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onHow}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="How this works"
          style={{ marginTop: signedIn ? 10 : 14, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', fontSize: 12, lineHeight: 14, color: c.mutedForeground }}>?</Text>
          </View>
          <StageDirection>(how this works.)</StageDirection>
        </Pressable>
      </View>
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
