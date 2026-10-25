import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { StageBackdrop } from '../../../src/components/StageBackdrop';
import { StageDirection } from '../../../src/components/StageDirection';
import { PrimaryPill } from '../../../src/components/PrimaryPill';
import { PaperCard } from '../../../src/components/PaperCard';
import { HowItWorksSheet } from '../../../src/components/HowItWorksSheet';
import { waitingOn } from '../../../src/lib/outcomeWait';
import { Sketch } from '../../../src/components/Sketches';
import { useStageMotion } from '../../../src/hooks/useStageMotion';
import { useAuditions, useCalendarFeed } from '../../../src/hooks/useAuditions';
import { KIND_LABEL, STATUS_LABEL, attachedPiece, type Audition } from '../../../src/api/auditions';
import { useSession } from '../../../src/lib/useSession';
import { clockLabel, daysUntil, eyebrow, stubLabel } from '../../../src/lib/when';
import { useTheme } from '../../../src/theme/ThemeContext';
import { TAB_BAR_H, TAB_BAR_LIFT, TAB_BAR_SPACE } from '../../../src/components/TabBar';
import { useHideBarOnScroll } from '../../../src/lib/barScroll';
import { RoomHeader } from '../../../src/components/RoomHeader';

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


type Segment = 'coming' | 'heard' | 'all';
const HEARD = new Set<Audition['status']>(['callback', 'booked', 'passed']);

/** "(this week.)", "(next week.)", "(later.)": which shelf of the board a date goes on. */
function weekOf(iso: string | null, now = new Date()): 'this' | 'next' | 'later' | 'undated' {
  if (!iso) return 'undated';
  const d = new Date(iso);
  const day = (x: Date) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
  const start = day(now);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  const diff = Math.floor((day(d).getTime() - start.getTime()) / 86_400_000);
  if (diff < 7) return 'this';
  if (diff < 14) return 'next';
  return 'later';
}
const WEEK_LABEL = { this: '(this week.)', next: '(next week.)', later: '(later.)', undated: '(no date yet.)' } as const;

export default function Auditions() {
  const onBarScroll = useHideBarOnScroll();
  const { colors: c } = useTheme();
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const { data, isLoading, isError } = useAuditions(isAuthenticated);
  const feed = useCalendarFeed();
  const [how, setHow] = useState(false);
  const [segment, setSegment] = useState<Segment>('coming');
  const list = data ?? [];
  const { upcoming, heard, callbacks } = useMemo(() => ({
    upcoming: list.filter((a) => a.scope === 'upcoming'),
    heard: list.filter((a) => HEARD.has(a.status) && a.scope !== 'upcoming'),
    callbacks: list.filter((a) => a.status === 'callback').length,
  }), [list]);
  const summary = [
    upcoming.length ? `${upcoming.length} coming.` : 'nothing coming.',
    callbacks ? `${callbacks} ${callbacks === 1 ? 'callback' : 'callbacks'}.` : null,
  ].filter(Boolean).join(' ');
  const open = useCallback((a: Audition) => {
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: '/prep', params: { id: String(a.id) } });
  }, [router]);
  const onAdd = useCallback(() => { Haptics.selectionAsync().catch(() => {}); router.push('/audition'); }, [router]);
  const onPaste = useCallback(() => { Haptics.selectionAsync().catch(() => {}); setHow(false); router.push({ pathname: '/audition', params: { paste: '1' } }); }, [router]);
  const onSignIn = useCallback(() => { Haptics.selectionAsync().catch(() => {}); setHow(false); router.push('/auth'); }, [router]);
  // The whole board as a calendar subscription. It leaves the app, so it says so first.
  const onCalendar = useCallback(() => {
    if (feed.isPending) return;
    Haptics.selectionAsync().catch(() => {});
    Alert.alert('Put the board in your calendar?', 'Every audition on the board appears in your calendar and stays in step as it changes. Your phone will ask to add the subscription.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Subscribe', onPress: () => feed.mutate(undefined, { onError: () => Alert.alert("Couldn't open the feed", 'Check your connection and try again.') }) },
    ]);
  }, [feed]);
  // The last audition that has not said how it went: one question, asked on the board itself.
  const [waiting, setWaiting] = useState<Record<string, number>>({});
  useFocusEffect(useCallback(() => { let alive = true; waitingOn().then((w) => { if (alive) setWaiting(w); }).catch(() => {}); return () => { alive = false; }; }, []));
  const toCheck = useMemo(() => list.find((a) => a.scope !== 'upcoming' && !HEARD.has(a.status) && a.when && !((waiting[String(a.id)] ?? 0) > Date.now())) ?? null, [list, waiting]);
  const checkIn = useCallback(() => {
    if (!toCheck) return;
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: '/outcome', params: { id: String(toCheck.id) } });
  }, [toCheck, router]);

  const headerRight = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setHow(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="How this works"
        style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', fontSize: 16, lineHeight: 18, color: c.mutedForeground }}>?</Text>
      </Pressable>
      {isAuthenticated && list.length > 0 ? (
        <Pressable onPress={onCalendar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Put the board in your calendar">
          {feed.isPending ? <ActivityIndicator size="small" color={c.mutedForeground} /> : <Ionicons name="calendar-outline" size={20} color={c.mutedForeground} />}
        </Pressable>
      ) : null}
    </View>
  );

  // What the chosen segment shows, the next one lifted out as the hero where it applies.
  const hero = segment === 'coming' ? upcoming[0] ?? null : null;
  const rows = segment === 'coming' ? upcoming.slice(1) : segment === 'heard' ? heard : list;
  const weeks = useMemo(() => {
    const groups: Record<'this' | 'next' | 'later' | 'undated', Audition[]> = { this: [], next: [], later: [], undated: [] };
    for (const a of rows) groups[segment === 'coming' ? weekOf(a.when) : 'undated'].push(a);
    return groups;
  }, [rows, segment]);

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <RoomHeader right={headerRight} />
        {!isAuthenticated ? (
          <Intro signedIn={false} onPrimary={onSignIn} onSecondary={onSignIn} onHow={() => setHow(true)} />
        ) : isLoading ? (
          <Center>
            <Sketch name="clapper" size={88} stroke={c.yellow} accent={c.yellow} />
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>(checking the callboard…)</StageDirection>
          </Center>
        ) : isError ? (
          <Center>
            <Sketch name="footlights" size={96} stroke={c.mutedForeground} />
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>(couldn&apos;t reach the callboard.)</StageDirection>
          </Center>
        ) : list.length === 0 ? (
          <Intro signedIn onPrimary={onPaste} onSecondary={onAdd} onHow={() => setHow(true)} />
        ) : (
          <Animated.ScrollView showsVerticalScrollIndicator={false} onScroll={onBarScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: TAB_BAR_SPACE + 60 }}>
            <View style={{ paddingTop: 4, paddingBottom: 6 }}>
              <Text numberOfLines={1} style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 44, lineHeight: 52, letterSpacing: -0.8, color: c.foreground }}>
                The <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>board.</Text>
              </Text>
              <StageDirection style={{ marginTop: 6 }}>({summary})</StageDirection>
            </View>
            {/* The segments: a word each, the chosen one underlined in ink. */}
            <View style={{ flexDirection: 'row', gap: 22, borderBottomWidth: 1, borderBottomColor: c.divider, marginTop: 18 }}>
              {([['coming', 'Coming up'], ['heard', 'Heard back'], ['all', 'All']] as [Segment, string][]).map(([key, label]) => {
                const on = segment === key;
                return (
                  <Pressable key={key} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSegment(key); }} accessibilityRole="tab" accessibilityState={{ selected: on }}
                    style={{ paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: on ? c.foreground : 'transparent', marginBottom: -1 }}>
                    <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 15, color: on ? c.foreground : c.mutedForeground }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Animated.View layout={LinearTransition.duration(240)} style={{ marginTop: 18 }}>
              {segment === 'coming' && toCheck ? (
                <Animated.View entering={FadeIn.duration(320)} style={{ marginBottom: 20 }}>
                  <Pressable onPress={checkIn} accessibilityRole="button" accessibilityLabel={`How did ${toCheck.project} go?`}>
                    <PaperCard shadow={6} rotate={-0.3} style={{ paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <StageDirection on="paper">(how did it go?)</StageDirection>
                        <Text numberOfLines={1} style={{ marginTop: 4, fontFamily: 'InstrumentSerif_400Regular', fontSize: 24, lineHeight: 28, color: c.paperInk }}>
                          {toCheck.project}{toCheck.role ? <Text style={{ color: c.paperMuted }}>{` — ${toCheck.role}`}</Text> : null}
                        </Text>
                        <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: 'BricolageGrotesque_500Medium', fontSize: 13, color: c.paperMuted }}>Callback, booked, waiting or passed. A note for next time.</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={c.paperMuted} />
                    </PaperCard>
                  </Pressable>
                </Animated.View>
              ) : null}
              {hero ? (
                <Animated.View entering={FadeIn.duration(320)}>
                  <Hero a={hero} onOpen={() => open(hero)} />
                </Animated.View>
              ) : null}
              {(['this', 'next', 'later', 'undated'] as const).map((w) => weeks[w].length ? (
                <View key={w} style={{ marginTop: hero || w !== 'this' ? 24 : 4 }}>
                  {segment === 'coming' ? <StageDirection style={{ marginBottom: 6 }}>{WEEK_LABEL[w]}</StageDirection> : null}
                  {weeks[w].map((a) => <Row key={a.id} a={a} onPress={() => open(a)} heard={segment !== 'coming'} />)}
                </View>
              ) : null)}
              {rows.length === 0 && !hero ? (
                <StageDirection style={{ marginTop: 12 }}>{segment === 'heard' ? '(nothing heard back yet.)' : '(nothing coming up.)'}</StageDirection>
              ) : null}
            </Animated.View>
          </Animated.ScrollView>
        )}
      </SafeAreaView>
      {/* The plus: ink, a yellow shadow set off down and right, above the bar. */}
      {isAuthenticated && list.length > 0 ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', right: 24, bottom: insets.bottom + TAB_BAR_LIFT + TAB_BAR_H + 16 }}>
          <View style={{ position: 'absolute', left: 4, top: 4, width: 56, height: 56, borderRadius: 28, backgroundColor: c.yellow }} />
          <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add an audition"
            style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, backgroundColor: c.foreground, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: pressed ? 2 : 0 }, { translateY: pressed ? 2 : 0 }] })}>
            <Ionicons name="add" size={28} color={c.isLight ? c.yellow : c.ink} />
          </Pressable>
        </View>
      ) : null}
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

/**
 * The next audition: the date and time as the eyebrow, how far off as an ink
 * pill, the project large, the part and the kind and the office under it,
 * the piece attached with its state, and the two things to do with it.
 */
function Hero({ a, onOpen }: { a: Audition; onOpen: () => void }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const piece = attachedPiece(a);
  const d = a.when ? new Date(a.when) : null;
  const days = a.when ? daysUntil(a.when) : null;
  const stamp = d ? `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()} · ${clockLabel(a.when!)}`.toUpperCase() : 'NO DATE YET';
  const soon = days === null ? null : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  const meta = [a.role?.trim(), KIND_LABEL[a.kind], a.casting?.trim()].filter(Boolean).join(' · ');
  const place = a.location?.trim();
  const rehearse = () => {
    Haptics.selectionAsync().catch(() => {});
    if (piece?.scene_id) router.push({ pathname: '/rehearse/[id]', params: { id: String(piece.scene_id), from: 'script' } });
    else if (piece?.monologue_id) router.push({ pathname: '/run/[id]', params: { id: String(piece.monologue_id) } });
    else onOpen();
  };
  const directions = () => {
    if (!place) return;
    Haptics.selectionAsync().catch(() => {});
    Linking.openURL(`maps://?q=${encodeURIComponent(place)}`).catch(() => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(place)}`).catch(() => {}));
  };
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${eyebrow(a, true)}. ${a.project}${a.role ? `, ${a.role}` : ''}`}>
      <PaperCard shadow={7} style={{ paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 12, letterSpacing: 1.4, color: c.primary }}>{stamp}</Text>
          {soon ? (
            <View style={{ paddingHorizontal: 12, height: 28, borderRadius: 14, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 12, color: c.yellow }}>{soon}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ marginTop: 10, fontFamily: 'InstrumentSerif_400Regular', fontSize: 32, lineHeight: 36, letterSpacing: -0.5, color: c.paperInk }}>{a.project}</Text>
        {meta ? <Text style={{ marginTop: 4, fontFamily: 'BricolageGrotesque_500Medium', fontSize: 14.5, lineHeight: 20, color: c.paperMuted }}>{meta}</Text> : null}
        <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, backgroundColor: c.paperRule + '66' }}>
          <View style={{ width: 40, height: 48, borderRadius: 6, backgroundColor: piece ? '#193b26' : c.paperRule }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            {piece?.title ? (
              <>
                <Text numberOfLines={1} style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 19, lineHeight: 23, color: c.paperInk }}>{piece.title}</Text>
                <StageDirection on="paper" numberOfLines={2}>({piece.character ? `${piece.character}. ` : ''}{piece.used ? 'ready.' : 'to prepare.'})</StageDirection>
              </>
            ) : (
              <StageDirection on="paper" numberOfLines={2}>(no piece yet. tap to pick one.)</StageDirection>
            )}
          </View>
          {piece?.used ? (
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={16} color="#fff" />
            </View>
          ) : null}
        </View>
        <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 22 }}>
          <Pressable onPress={rehearse} hitSlop={8} accessibilityRole="button">
            <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 15, color: c.paperInk }}>{piece ? 'Rehearse →' : 'Pick a piece →'}</Text>
          </Pressable>
          {place ? (
            <Pressable onPress={directions} hitSlop={8} accessibilityRole="button">
              <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 15, color: c.paperMuted }}>Directions</Text>
            </Pressable>
          ) : null}
        </View>
      </PaperCard>
    </Pressable>
  );
}

/** One line of the board: the day, the project and part, the kind and time, and what is still missing. */
function Row({ a, onPress, heard }: { a: Audition; onPress: () => void; heard: boolean }) {
  const { colors: c } = useTheme();
  const [month, day] = stubLabel(a);
  const d = a.when ? new Date(a.when) : null;
  const sub = [KIND_LABEL[a.kind], a.when ? (a.kind === 'self_tape' ? `due ${clockLabel(a.when)}` : clockLabel(a.when)) : null].filter(Boolean).join(' · ');
  const piece = attachedPiece(a);
  const status = a.status === 'callback' || a.status === 'booked' || a.status === 'passed' ? STATUS_LABEL[a.status] : null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${a.project}${a.role ? `, ${a.role}` : ''}, ${eyebrow(a)}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.divider, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 44, alignItems: 'center' }}>
        <Text style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 10, letterSpacing: 1.2, color: c.mutedForeground }}>{d ? d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase() : month}</Text>
        <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 26, lineHeight: 30, color: c.foreground }}>{day}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 21, lineHeight: 25, color: c.foreground }}>
          {a.project}{a.role ? <Text style={{ color: c.mutedForeground }}>{` — ${a.role}`}</Text> : null}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: 'BricolageGrotesque_500Medium', fontSize: 13, color: c.mutedForeground }}>{sub}</Text>
      </View>
      {heard && status ? (
        <View style={{ alignItems: 'flex-end', maxWidth: 130 }}>
          <StageDirection>({status.toLowerCase()}.)</StageDirection>
          {a.after_notes?.how ? <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 11, color: c.mutedForeground }}>{a.after_notes.how}</Text> : null}
        </View>
      ) : !piece ? (
        <View style={{ paddingHorizontal: 12, height: 30, borderRadius: 15, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.accentText, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 12, color: c.accentText }}>pick a piece</Text>
        </View>
      ) : (
        <StageDirection>({piece.used ? 'ready.' : 'to prepare.'})</StageDirection>
      )}
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
        {/* Straight under the line that says what the board is: the question
            belongs with the claim, not under the button that acts on it. */}
        <Pressable
          onPress={onHow}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="How this works"
          style={{ marginTop: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', fontSize: 12, lineHeight: 14, color: c.mutedForeground }}>?</Text>
          </View>
          <StageDirection>(how this works.)</StageDirection>
        </Pressable>
      </View>

      <View>
        <PrimaryPill label={signedIn ? 'Paste a casting email' : 'Sign in to track auditions'} onPress={onPrimary} block />
        {signedIn ? (
          <Pressable onPress={onSecondary} hitSlop={10} accessibilityRole="button" style={{ marginTop: 14, alignSelf: 'center' }}>
            <StageDirection>(or fill it in by hand.)</StageDirection>
          </Pressable>
        ) : null}
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
