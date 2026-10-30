import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { BackHeader } from '../src/components/BackHeader';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useFavorites } from '../src/hooks/useFavorites';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { useRunStats } from '../src/hooks/useScenePartner';
import { useQuery as useRunsQuery } from '@tanstack/react-query';
import { listRuns } from '../src/api/rehearsal';
import { GhostLight } from '../src/components/GhostLight';
import { loadRecents } from '../src/lib/recents';
import type { Streak } from '../src/rehearsal/streak';
import { useNights } from '../src/hooks/useNights';
import { useAuditions } from '../src/hooks/useAuditions';
import { NameSheet } from '../src/components/BookSections';
import { supabase } from '../src/lib/supabase';
import { PRACTICE_LABEL, onLocalDay, type PracticeEntry } from '../src/api/practice';
import { STATUS_LABEL, type Audition } from '../src/api/auditions';
import { WeekMarks } from '../src/components/WeekMarks';
import { CheckInSheet } from '../src/components/CheckInSheet';
import type { ReadState } from '../src/api/client';
import { isAppleAuthAvailable, signInWithApple, signInWithGoogle } from '../src/lib/auth';
import { useSession } from '../src/lib/useSession';
import { useGoBack, useGuardedPush } from '../src/lib/nav';
import { getSubscription, manageSubscription } from '../src/lib/purchases';
import { track } from '../src/lib/analytics';
import { paywallHref } from '../src/lib/paywall';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const SANS_X = 'BricolageGrotesque_700Bold';
const MONO_I = 'CourierPrime_400Regular_Italic';

/**
 * You (handoff account-v2, 2a/2b/2d). Three blocks and nothing else: who you
 * are, who you play, and your plan. The gear, top right, is where the
 * settings went. A stranger gets the lamp and a seat instead (2d), with the
 * gear still there so Appearance works before they sign in.
 */
export default function You() {
  const router = useRouter();
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const { session, isAuthenticated } = useSession();

  const gear = (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/settings'); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Settings" style={{ padding: 6 }}>
      <Ionicons name="settings-outline" size={22} color={c.mutedForeground} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <BackHeader label="Search" close onPress={goBack} right={gear} />
        {isAuthenticated && session ? <SignedIn session={session} /> : <SignedOut />}
      </SafeAreaView>
    </View>
  );
}

/* ----------------------------------------------------------- signed in */

function SignedIn({ session }: { session: Session }) {
  const router = useRouter();
  const push = useGuardedPush();
  const { colors: c } = useTheme();
  const { wall, isPaid, failed: wallFailed, refresh: refreshWall } = useEntitlement();
  const { data: saved } = useFavorites(true);
  const stats = useRunStats(true);
  const runs = useRunsQuery({ queryKey: ['runs'], queryFn: ({ signal }) => listRuns(signal), staleTime: 60_000 });
  const recents = useRunsQuery({ queryKey: ['recents-local'], queryFn: loadRecents, staleTime: 30_000 });
  const nights = useNights(true, recents.data ?? []);
  const { data: auditions } = useAuditions(true);
  const [naming, setNaming] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  // A new name is shown the moment it is saved, not when the session catches up.
  const [newName, setNewName] = useState<string | null>(null);
  const sub = useQuery({ queryKey: ['subscription'], queryFn: getSubscription, staleTime: 5 * 60_000, enabled: isPaid });
  // The page comes up whole, the streak, the plan and the counts together,
  // never a zero that turns into a number in front of you. They are fetched
  // as the app opens and kept between launches, so this is almost never seen.
  const settled = !runs.isPending && !recents.isPending && !stats.isPending && (wall !== undefined || wallFailed) && (!isPaid || !sub.isPending);
  // The profile is a sheet over a room: a count opens its tab, with the sheet put away first, never a page stacked on the sheet.
  const toRoom = (href: string) => {
    if (router.canGoBack()) router.back();
    setTimeout(() => router.navigate(href as Href), 260);
  };

  // Coming back to this screen asks again if the last answer never came.
  useFocusEffect(useCallback(() => { if (wallFailed) refreshWall(); }, [wallFailed, refreshWall]));

  const who = newName ? splitName(newName) : nameOf(session);
  // A changed name comes up out of a short fade rather than snapping in.
  const nameOpacity = useSharedValue(1);
  useEffect(() => {
    if (newName == null) return;
    nameOpacity.value = 0;
    nameOpacity.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [newName, nameOpacity]);
  const nameFade = useAnimatedStyle(() => ({ opacity: nameOpacity.value }));
  const letter = (who.first || session.user.email || 'A').trim().charAt(0).toUpperCase();
  const since = sinceLabel(session.user.created_at);

  if (!settled) {
    return (
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 120 }}>
        <GhostLight size={30} />
      </View>
    );
  }

  return (
    <>
    <Animated.ScrollView entering={FadeIn.duration(320)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      {/* The header: the initial, the name, one Courier line. The glow needs the room above: the scroll view clips at its edge. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Avatar letter={letter} paid={isPaid} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* The name is theirs to change: a tap opens it. */}
          <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setNaming(true); }} accessibilityRole="button" accessibilityLabel={`Your name, ${who.first} ${who.rest}`.trim()} accessibilityHint="Tap to change it"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Animated.Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[{ flexShrink: 1, fontFamily: SERIF, fontSize: 30, lineHeight: 34, letterSpacing: -0.3, color: c.foreground }, nameFade]}>
              {who.first}
              {who.rest ? <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{` ${who.rest}.`}</Text> : <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>.</Text>}
            </Animated.Text>
            <Ionicons name="pencil" size={15} color={c.mutedForeground} />
          </Pressable>
          <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.4, color: c.mutedForeground }}>
            {isPaid ? '(the whole stage.)' : since ? `(with ghost light since ${since}.)` : '(with ghost light.)'}
          </Text>
        </View>
      </View>

      {/* Nights in the work: the streak and this week, counted as the lamp on Search counts them. */}
      <StreakCard streak={nights.streak} onCheckIn={() => setCheckingIn(true)} />
      <NightsLog entries={nights.entries} />

      {/* Your plan: the one card. */}
      <View style={{ marginTop: 28 }}>
        {isPaid ? <PaidCard /> : <FreeCard wall={wall} failed={wallFailed} onRetry={refreshWall} onPaywall={() => push(paywallHref('account'))} />}
      </View>

      <AuditionRecord auditions={auditions ?? []} onOpen={() => toRoom('/(board)/auditions')} />

      {/* The counts, said as one line; kept and scenes run open their rooms. */}
      <View style={{ marginTop: 26, paddingVertical: 14, borderTopWidth: 1, borderColor: c.divider, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
        <Count n={saved?.length ?? 0} label="kept" onPress={() => toRoom('/(book)/saves')} />
        <Text style={{ marginHorizontal: 10, fontFamily: SANS, fontSize: 14, color: c.chevron }}>·</Text>
        <Count n={wall?.reads_used ?? 0} label="read" />
        <Text style={{ marginHorizontal: 10, fontFamily: SANS, fontSize: 14, color: c.chevron }}>·</Text>
        <Count n={stats.data?.runs ?? 0} label={(stats.data?.runs ?? 0) === 1 ? 'scene run' : 'scenes run'} onPress={() => toRoom('/(scene)/rehearse')} />
      </View>
    </Animated.ScrollView>
      {/* Outside the scroll view: inside it, the first tap on Save only put the keyboard away. */}
      <NameSheet
        open={naming}
        title="Your"
        accent="name."
        initial={`${who.first === 'You' ? '' : who.first}${who.rest ? ` ${who.rest}` : ''}`}
        placeholder="The name on your headshot"
        fieldLabel="Your name"
        confirm="Save"
        onSave={(name) => {
          setNaming(false);
          setNewName(name);
          void supabase.auth.updateUser({ data: { display_name: name } })
            .then(({ error }) => { if (error) setNewName(null); else track('app_name_changed', {}); })
            .catch(() => setNewName(null));
        }}
        onClose={() => setNaming(false)}
      />
      <CheckInSheet open={checkingIn} streak={nights.streak} entries={nights.entries} onClose={() => setCheckingIn(false)} />
    </>
  );
}

function Avatar({ letter, paid }: { letter: string; paid: boolean }) {
  const { colors: c } = useTheme();
  return (
    <View style={{
      width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
      borderWidth: paid ? 0 : 2, borderColor: c.accentText, backgroundColor: paid ? c.accentText : 'transparent',
      shadowColor: c.accentText, shadowOpacity: paid ? 0.5 : 0, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
    }}>
      <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 40, color: paid ? c.ink : c.accentText }}>{letter}</Text>
    </View>
  );
}

function Eyebrow({ children, lit }: { children: string; lit?: boolean }) {
  const { colors: c } = useTheme();
  return <Text style={{ fontFamily: SANS_X, fontSize: 10, letterSpacing: 2, color: lit ? c.accentText : c.chevron }}>{children}</Text>;
}

function Count({ n, label, onPress }: { n: number; label: string; onPress?: () => void }) {
  const { colors: c } = useTheme();
  const Box = onPress ? Pressable : View;
  return (
    <Box onPress={onPress} hitSlop={8} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${n} ${label}`}>
      <Text style={{ fontFamily: SANS, fontSize: 14, color: c.mutedForeground }}>
        <Text style={{ fontFamily: SANS_B, color: c.foreground }}>{n}</Text>{` ${label}`}
      </Text>
    </Box>
  );
}

/**
 * The free plan: the gel block behind a dark card, the reads left as a big
 * number with a segment per read, the partner's month under it, and the way
 * to the paywall. Reads come back at midnight and the scene runs on the first
 * of the month, and each meter says when.
 */
function FreeCard({ wall, failed, onRetry, onPaywall }: { wall: ReadState | undefined; failed: boolean; onRetry: () => void; onPaywall: () => void }) {
  const { colors: c } = useTheme();
  const loaded = wall !== undefined;
  return (
    <View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 6, top: 6, right: -6, bottom: -6, borderRadius: 18, backgroundColor: c.yellow }} />
      <View style={{ borderRadius: 18, borderWidth: 1.5, borderColor: c.cardBorder, backgroundColor: c.card, padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow lit>FREE PLAN</Eyebrow>
          <Text style={{ fontFamily: MONO_I, fontSize: 12, letterSpacing: 0.3, color: c.mutedForeground }}>(what is left.)</Text>
        </View>
        {!loaded && failed ? (
          <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Check your plan again" hitSlop={8} style={{ marginTop: 14 }}>
            <StageDirection link>(couldn&apos;t reach the house. tap to ask again.)</StageDirection>
          </Pressable>
        ) : (
          <View style={{ marginTop: 14, gap: 14 }}>
            <Meter label="Speeches to read" used={wall?.reads_used ?? 0} limit={wall?.reads_limit ?? 0} loaded={loaded} note="today, back at midnight" />
            <Meter label="Scene runs" used={wall?.runs_used ?? 0} limit={wall?.runs_limit ?? 0} loaded={loaded} note={`this month, back ${firstOfNextMonth()}`} />
            <Meter label="Your own sides" used={wall?.scripts_used ?? 0} limit={wall?.scripts_limit ?? 0} loaded={loaded} note="scripts on the account" />
            <StageDirection>(the first scenes never count.)</StageDirection>
          </View>
        )}
        <ArrowRow label="Read without limits" onPress={onPaywall} />
      </View>
    </View>
  );
}

/** The plan you have: what it is, when it renews, what it costs, and Apple's own sheet to manage it. */
function PaidCard() {
  const { colors: c } = useTheme();
  const { data } = useQuery({ queryKey: ['subscription'], queryFn: getSubscription, staleTime: 5 * 60_000 });
  const name = data?.plan === 'annual' ? 'ANNUAL' : data?.plan === 'monthly' ? 'MONTHLY' : 'PREMIUM';
  const when = data?.renews ? data.renews.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : null;
  const line = !data ? '' : data.inTrial ? (when ? `Trial ends ${when}` : 'On trial') : data.willRenew ? (when ? `Renews ${when}` : 'Renews') : when ? `Ends ${when}` : 'The whole stage';
  const price = data?.price ? `(${data.price} ${data.plan === 'monthly' ? 'a month' : 'a year'}.)` : '(renews through the app store.)';
  return (
    <View style={{ borderRadius: 18, borderWidth: 1.5, borderColor: c.cardBorder, backgroundColor: c.card, padding: 20 }}>
      <Eyebrow lit>{name}</Eyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 26, color: c.foreground }}>{line}</Text>
          <Text numberOfLines={2} style={{ marginTop: 6, fontFamily: MONO_I, fontSize: 12, lineHeight: 16, letterSpacing: 0.3, color: c.mutedForeground }}>{price}</Text>
        </View>
        <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); void manageSubscription(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Manage subscription" style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontFamily: SANS_B, fontSize: 13, color: c.accentText }}>Manage</Text>
          <Ionicons name="chevron-forward" size={14} color={c.accentText} />
        </Pressable>
      </View>
    </View>
  );
}

/** A label with the gel disc and its arrow at the end of the row: the card's one way forward. */
function ArrowRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onPress(); }} accessibilityRole="button" accessibilityLabel={label}
      style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.foreground }}>{label}</Text>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.yellow, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="arrow-forward" size={17} color={c.ink} />
      </View>
    </Pressable>
  );
}

/* ---------------------------------------------------------- signed out */

/**
 * Take a seat: the lamp and the line, a page of what an account keeps, then
 * the three doors at one width (Apple, Google, and email as a quiet link),
 * and the free search at the foot. The same voice as the sign-in page.
 */
function SignedOut() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState<null | 'apple' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { isAppleAuthAvailable().then(setAppleReady).catch(() => setAppleReady(false)); }, []);

  const door = async (method: 'apple' | 'google') => {
    if (busy) return;
    setBusy(method);
    setError(null);
    const res = method === 'apple' ? await signInWithApple() : await signInWithGoogle();
    setBusy(null);
    if (res.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      track('signed_in', { method });
    } else if (!res.canceled) setError(res.message ?? 'Could not sign in.');
  };

  const KEEPS: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; line: string }[] = [
    { icon: 'bookmark-outline', title: 'Your book', line: 'the speeches you keep, with your cuts.' },
    { icon: 'calendar-outline', title: 'Your board', line: 'auditions, and a nudge the night before.' },
    { icon: 'people-outline', title: 'Your scenes', line: 'your sides, read back by a partner.' },
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeIn.duration(420)} style={{ alignItems: 'center', marginTop: 18 }}>
        <GhostLight size={36} />
        <Text style={{ marginTop: 16, textAlign: 'center', fontFamily: SERIF, fontSize: 46, lineHeight: 50, letterSpacing: -0.6, color: c.foreground }}>
          Take a <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>seat.</Text>
        </Text>
        <StageDirection style={{ marginTop: 10, textAlign: 'center' }}>(one account, on every phone and on the web.)</StageDirection>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(420).delay(120)} style={{ marginTop: 28, borderRadius: 18, borderWidth: 1.5, borderColor: c.cardBorder, backgroundColor: c.card, paddingHorizontal: 18, paddingVertical: 6 }}>
        {KEEPS.map((k, i) => (
          <View key={k.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: c.divider }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.yellow, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={k.icon} size={17} color={c.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: SANS_B, fontSize: 15.5, color: c.foreground }}>{k.title}</Text>
              <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: MONO_I, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground }}>({k.line})</Text>
            </View>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={FadeIn.duration(420).delay(240)} style={{ marginTop: 28, alignItems: 'center', gap: 12 }}>
        {appleReady ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={c.isLight ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={25}
            style={{ height: 50, width: 280, opacity: busy === 'apple' ? 0.6 : 1 }}
            onPress={() => { void door('apple'); }}
          />
        ) : null}
        <Pressable
          onPress={() => { void door('google'); }}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          style={({ pressed }) => ({ width: 280, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: pressed || busy === 'google' ? 0.6 : 1 })}
        >
          {busy === 'google' ? <ActivityIndicator color={c.foreground} /> : (
            <>
              <Ionicons name="logo-google" size={17} color={c.foreground} />
              <Text style={{ fontFamily: SANS_B, fontSize: 16, color: c.foreground }}>Continue with Google</Text>
            </>
          )}
        </Pressable>
        <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/auth', params: { only: 'email' } }); }} hitSlop={10} accessibilityRole="button" style={{ paddingVertical: 6 }}>
          <Text style={{ fontFamily: SANS_B, fontSize: 14.5, color: c.accentText }}>Use email instead</Text>
        </Pressable>
        {error ? <Text style={{ textAlign: 'center', fontFamily: SANS, fontSize: 12.5, color: c.mutedForeground }}>{error}</Text> : null}
      </Animated.View>

      <View style={{ flexGrow: 1 }} />
      <StageDirection style={{ textAlign: 'center', marginTop: 28 }}>(search is free, no account needed.)</StageDirection>
    </ScrollView>
  );
}

/* --------------------------------------------------------------- words */

/**
 * A name, in two parts: the first word upright, the rest in the italic. We
 * ask the sources in order of how much they know: `given_name` and
 * `family_name`, which auth captures from Apple the one time Apple offers
 * them; the OAuth profile's full name; and the address, only when it
 * genuinely looks like a name. Hide My Email hands back a relay hash, and a
 * hash in your own app is not your name.
 */
/** A name as typed, as the header shows it: the first word, then the rest. */
function splitName(name: string): { first: string; rest: string } {
  const [first, ...rest] = name.trim().split(/\s+/);
  return { first: first ?? '', rest: rest.join(' ') };
}

function nameOf(session: Session): { first: string; rest: string } {
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string).trim() : '');
  // The name they gave themselves on this page wins over anything a provider guessed.
  const chosen = str('display_name').split(/\s+/).filter(Boolean);
  if (chosen.length) return { first: chosen[0], rest: chosen.slice(1).join(' ') };
  const given = str('given_name');
  const family = str('family_name');
  if (given && looksLikeAName(given)) return { first: titleCase(given), rest: family && looksLikeAName(family) ? titleCase(family) : '' };
  const full = str('full_name') || str('name');
  const tokens = full.split(/\s+/).filter(Boolean);
  if (tokens[0] && looksLikeAName(tokens[0])) {
    return { first: titleCase(tokens[0]), rest: tokens.slice(1).filter(looksLikeAName).map(titleCase).join(' ') };
  }
  const email = session.user.email ?? '';
  if (email && !email.endsWith('@privaterelay.appleid.com')) {
    const local = email.split('@')[0].split(/[._+]/)[0] ?? '';
    if (local && looksLikeAName(local)) return { first: titleCase(local), rest: '' };
  }
  return { first: 'You', rest: '' };
}

function looksLikeAName(value: string): boolean {
  return /^[\p{L}][\p{L}'’-]{1,15}$/u.test(value);
}

function titleCase(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}

/** "march", or "march 2025" once it is more than a year ago. */
function sinceLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const months = (Date.now() - d.getTime()) / (30.4 * 24 * 3600 * 1000);
  return months >= 12 ? `${month} ${d.getFullYear()}` : month;
}

/** "nov 1": when the partner's month turns over. */
function firstOfNextMonth(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.toLocaleDateString('en-US', { month: 'short' }).toLowerCase()} 1`;
}


/**
 * The streak: nights in a row with some work in them, and this week as seven
 * marks, a check in each night worked. Under it, the week's timed minutes.
 * Today with nothing yet keeps a streak that reached yesterday, and says so.
 */
function StreakCard({ streak: s, onCheckIn }: { streak: Streak; onCheckIn: () => void }) {
  const { colors: c } = useTheme();
  const line = s.days === 0
    ? '(tonight starts it. one scene, or one speech.)'
    : s.today
      ? `(${s.days === 1 ? 'one night' : `${s.days} nights`} in a row. come back tomorrow.)`
      : '(tonight keeps it going.)';
  return (
    <View style={{ marginTop: 26, borderRadius: 18, borderWidth: 1.5, borderColor: c.cardBorder, backgroundColor: c.card, padding: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 48, color: s.days ? c.accentText : c.foreground }}>{s.days}</Text>
        <Text style={{ fontFamily: SERIF_I, fontSize: 22, color: c.foreground }}>{s.days === 1 ? 'night running.' : 'nights running.'}</Text>
      </View>
      <Text style={{ marginTop: 4, fontFamily: MONO_I, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground }}>{line}</Text>
      <View style={{ marginTop: 16 }}><WeekMarks week={s.week} /></View>
      {/* Work away from the app (class, an audition, a rehearsal) is checked in here; a scene run or a speech counts by itself. */}
      <PrimaryPill label={s.today ? 'Add to tonight' : 'Check in tonight'} variant={s.today ? 'outline' : 'primary'} onPress={onCheckIn} block height={46} style={{ marginTop: 18 }} />
    </View>
  );
}

/** One allowance: what it is, how many are left of how many, a thin bar, and when it comes back. */
function Meter({ label, used, limit, loaded, note }: { label: string; used: number; limit: number; loaded: boolean; note: string }) {
  const { colors: c } = useTheme();
  const unlimited = limit < 0;
  const left = unlimited ? 0 : Math.max(0, limit - used);
  const frac = unlimited || limit <= 0 ? 0 : Math.min(1, used / limit);
  const out = !unlimited && limit > 0 && left === 0;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.foreground }}>{label}</Text>
        <Text style={{ fontFamily: SANS_B, fontSize: 15, color: out ? c.accentText : c.foreground }}>
          {!loaded ? '·' : unlimited ? 'unlimited' : `${left} of ${limit} left`}
        </Text>
      </View>
      {unlimited ? null : (
        <View style={{ marginTop: 7, height: 4, borderRadius: 2, backgroundColor: c.divider, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round((1 - frac) * 100)}%`, height: 4, borderRadius: 2, backgroundColor: out ? c.chevron : c.accentText }} />
        </View>
      )}
      <Text style={{ marginTop: 5, fontFamily: MONO_I, fontSize: 11.5, color: c.mutedForeground }}>({note}.)</Text>
    </View>
  );
}

/**
 * The nights, written down: what was checked in from the lamp, newest first,
 * a line a thing. The last ten; the lamp is where it is written.
 */
function NightsLog({ entries }: { entries: PracticeEntry[] }) {
  const { colors: c } = useTheme();
  const shown = entries.slice(0, 10);
  return (
    <View style={{ marginTop: 22 }}>
      <Eyebrow>YOUR NIGHTS</Eyebrow>
      {shown.length === 0 ? (
        <Text style={{ marginTop: 8, fontFamily: SANS, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground }}>
          A scene run or a speech read counts by itself. Check in here for the work done away from the app.
        </Text>
      ) : (
        shown.map((e) => (
          <View key={e.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.divider }}>
            <Text style={{ width: 54, fontFamily: MONO_I, fontSize: 12, lineHeight: 19, color: c.mutedForeground }}>
              {onLocalDay(e.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: SANS_B, fontSize: 14, lineHeight: 19, color: c.foreground }}>{PRACTICE_LABEL[e.kind]}</Text>
              {e.note ? <Text numberOfLines={2} style={{ marginTop: 1, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: c.mutedForeground }}>{e.note}</Text> : null}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * This year's auditions, said back as a sentence, and the last three as
 * stubs: when, what, how it went. A tap opens the board.
 */
function AuditionRecord({ auditions, onOpen }: { auditions: Audition[]; onOpen: () => void }) {
  const { colors: c } = useTheme();
  const year = new Date().getFullYear();
  const at = (a: Audition) => Date.parse(a.when ?? a.created_at ?? '') || 0;
  const mine = auditions.filter((a) => new Date(at(a)).getFullYear() === year && at(a) > 0);
  if (!mine.length) return null;
  const callbacks = mine.filter((a) => a.status === 'callback' || a.callback_id != null).length;
  const booked = mine.filter((a) => a.status === 'booked').length;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const sentence = `${n(mine.length, 'audition', 'auditions')}, ${n(callbacks, 'callback', 'callbacks')}, ${booked} booked.`;
  const now = Date.now();
  const recent = [...mine].filter((a) => at(a) <= now).sort((a, b) => at(b) - at(a)).slice(0, 3);
  return (
    <View style={{ marginTop: 28 }}>
      <Eyebrow>THIS YEAR</Eyebrow>
      <Text style={{ marginTop: 8, fontFamily: SERIF, fontSize: 26, lineHeight: 30, letterSpacing: -0.2, color: c.foreground }}>{sentence}</Text>
      {recent.length ? (
        <View style={{ marginTop: 10 }}>
          {recent.map((a) => {
            const d = new Date(at(a));
            const status = STATUS_LABEL[a.status];
            const strong = a.status === 'callback' || a.status === 'booked';
            return (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider }}>
                <Text style={{ width: 52, fontFamily: SANS_X, fontSize: 10.5, letterSpacing: 1.2, color: c.chevron }}>
                  {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}
                </Text>
                <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: SANS_B, fontSize: 14.5, color: c.foreground }}>{a.project}</Text>
                <Text style={{ fontFamily: SANS_B, fontSize: 13, color: strong ? c.accentText : c.mutedForeground }}>{status}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onOpen(); }} accessibilityRole="button" hitSlop={8}
        style={({ pressed }) => ({ alignSelf: 'flex-end', marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.accentText }}>All of them</Text>
        <Ionicons name="chevron-forward" size={14} color={c.accentText} />
      </Pressable>
    </View>
  );
}
