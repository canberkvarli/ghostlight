import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { GhostLight } from '../src/components/GhostLight';
import { BackHeader } from '../src/components/BackHeader';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useFavorites } from '../src/hooks/useFavorites';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { useRunStats } from '../src/hooks/useScenePartner';
import type { ReadState } from '../src/api/client';
import { isAppleAuthAvailable, signInWithApple } from '../src/lib/auth';
import { castingChips, useCasting } from '../src/lib/casting';
import { useSession } from '../src/lib/useSession';
import { useGoBack } from '../src/lib/nav';
import { getSubscription, manageSubscription } from '../src/lib/purchases';
import { track } from '../src/lib/analytics';
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
        <BackHeader label="Search" onPress={goBack} right={gear} />
        {isAuthenticated && session ? <SignedIn session={session} /> : <SignedOut />}
      </SafeAreaView>
    </View>
  );
}

/* ----------------------------------------------------------- signed in */

function SignedIn({ session }: { session: Session }) {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { wall, isPaid, failed: wallFailed, refresh: refreshWall } = useEntitlement();
  const { data: saved } = useFavorites(true);
  const stats = useRunStats(true);
  const { casting } = useCasting();

  // Coming back to this screen asks again if the last answer never came.
  useFocusEffect(useCallback(() => { if (wallFailed) refreshWall(); }, [wallFailed, refreshWall]));

  const who = nameOf(session);
  const letter = (who.first || session.user.email || 'A').trim().charAt(0).toUpperCase();
  const since = sinceLabel(session.user.created_at);
  const chips = castingChips(casting);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      {/* The header: the initial, the name, one Courier line. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Avatar letter={letter} paid={isPaid} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 34, letterSpacing: -0.3, color: c.foreground }}>
            {who.first}
            {who.rest ? <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{` ${who.rest}.`}</Text> : <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>.</Text>}
          </Text>
          <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.4, color: c.mutedForeground }}>
            {isPaid ? '(the whole stage.)' : `(actor.${since ? ` since ${since}.` : ''})`}
          </Text>
        </View>
      </View>

      {/* Who you play: the search starts here. */}
      <View style={{ marginTop: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow>YOU PLAY</Eyebrow>
          <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/casting'); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit who you play">
            <Text style={{ fontFamily: SANS_B, fontSize: 12.5, color: c.accentText }}>Edit</Text>
          </Pressable>
        </View>
        {chips.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {chips.map(ch => (
              <View key={ch.key} style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: c.accentText }}>
                <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.4, color: c.accentText }}>{ch.label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Pressable onPress={() => router.push('/casting')} accessibilityRole="button" style={{ marginTop: 12 }}>
            <StageDirection>(nothing yet. say who you play and the search will know.)</StageDirection>
          </Pressable>
        )}
        <Text style={{ marginTop: 10, fontFamily: SANS, fontSize: 12, lineHeight: 18, color: c.chevron }}>Search starts here unless you change it.</Text>
      </View>

      {/* One row, three counts. */}
      <View style={{ marginTop: 26, flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.divider }}>
        <Stat n={saved?.length ?? 0} label="(kept.)" onPress={() => router.push('/saves')} />
        <Stat n={wall?.reads_used ?? 0} label="(read.)" divider />
        <Stat n={stats.data?.runs ?? 0} label="(scenes run.)" divider onPress={() => router.push('/rehearse')} />
      </View>

      <View style={{ marginTop: 26 }}>
        {isPaid ? <PaidCard /> : <FreeCard wall={wall} failed={wallFailed} onRetry={refreshWall} onPaywall={() => router.push('/paywall')} />}
      </View>
    </ScrollView>
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

function Stat({ n, label, divider, onPress }: { n: number; label: string; divider?: boolean; onPress?: () => void }) {
  const { colors: c } = useTheme();
  const Box = onPress ? Pressable : View;
  return (
    <Box onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${n} ${label.replace(/[().]/g, '')}`}
      style={{ flex: 1, paddingVertical: 18, paddingLeft: divider ? 16 : 0, borderLeftWidth: divider ? 1 : 0, borderLeftColor: c.divider }}>
      <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 38, color: c.foreground }}>{n}</Text>
      <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: MONO_I, fontSize: 12, letterSpacing: 0.3, color: c.mutedForeground }}>{label}</Text>
    </Box>
  );
}

/**
 * The free plan: the gel block behind a dark card, the reads left as a big
 * number with a segment per read, the partner's month under it, and the way
 * to the paywall. Reads are lifetime, the server's rule, so the hint names
 * the one thing that does reset: the scene runs, on the first of the month.
 */
function FreeCard({ wall, failed, onRetry, onPaywall }: { wall: ReadState | undefined; failed: boolean; onRetry: () => void; onPaywall: () => void }) {
  const { colors: c } = useTheme();
  const loaded = wall !== undefined;
  const limit = wall && wall.reads_limit > 0 ? wall.reads_limit : 1;
  const used = Math.min(wall?.reads_used ?? 0, limit);
  const left = Math.max(0, limit - used);
  const runsLimit = wall ? wall.runs_limit : 1;
  const runsLeft = runsLimit < 0 ? null : Math.max(0, runsLimit - (wall?.runs_used ?? 0));
  return (
    <View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 6, top: 6, right: -6, bottom: -6, borderRadius: 18, backgroundColor: c.yellow }} />
      <View style={{ borderRadius: 18, borderWidth: 1.5, borderColor: c.cardBorder, backgroundColor: c.card, padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow lit>FREE PLAN</Eyebrow>
          <Text style={{ fontFamily: MONO_I, fontSize: 12, letterSpacing: 0.3, color: c.mutedForeground }}>{runsLimit < 0 ? '' : `(runs reset ${firstOfNextMonth()}.)`}</Text>
        </View>
        {!loaded && failed ? (
          <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Check your plan again" hitSlop={8} style={{ marginTop: 14 }}>
            <StageDirection>(couldn&apos;t reach the house. tap to ask again.)</StageDirection>
          </Pressable>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
              <Text style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 44, color: c.foreground }}>{loaded ? left : '·'}</Text>
              <Text style={{ fontFamily: SANS, fontSize: 15, color: c.mutedForeground }}>{`free read${left === 1 ? '' : 's'} left`}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
              {Array.from({ length: limit }, (_, i) => (
                <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: loaded && i >= used ? c.accentText : c.divider }} />
              ))}
            </View>
            {runsLeft !== null ? (
              <Text style={{ marginTop: 12, fontFamily: MONO_I, fontSize: 12, letterSpacing: 0.3, color: c.mutedForeground }}>
                {`(${runsLeft} of ${runsLimit} scene run${runsLimit === 1 ? '' : 's'} left this month. the guided scene is always free.)`}
              </Text>
            ) : null}
          </>
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
          <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: MONO_I, fontSize: 12, letterSpacing: 0.3, color: c.mutedForeground }}>{price}</Text>
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

/** Take a seat: the lamp, Apple first, email second, three reasons, one footer. */
function SignedOut() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { isAppleAuthAvailable().then(setAppleReady).catch(() => setAppleReady(false)); }, []);

  const withApple = async () => {
    setBusy(true);
    setError(null);
    const res = await signInWithApple();
    setBusy(false);
    if (res.ok) track('signed_in', { method: 'apple' });
    else if (!res.canceled) setError(res.message ?? 'Could not sign in.');
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 24, paddingBottom: 24, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: 'center', marginTop: 28 }}>
        <GhostLight size={48} dress="full" />
        <Text style={{ marginTop: 30, textAlign: 'center', fontFamily: SERIF, fontSize: 42, lineHeight: 46, letterSpacing: -0.5, color: c.foreground }}>
          Take a <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>seat.</Text>
        </Text>
        <StageDirection style={{ marginTop: 12, textAlign: 'center' }}>(sign in to keep what you find.)</StageDirection>
      </View>

      <View style={{ marginTop: 36, gap: 12 }}>
        {appleReady ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={c.isLight ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={27}
            style={{ height: 54, width: '100%', opacity: busy ? 0.6 : 1 }}
            onPress={() => { if (!busy) void withApple(); }}
          />
        ) : null}
        <PrimaryPill label="Continue with email" variant="outline" height={54} block onPress={() => router.push('/auth')} />
        {error ? <Text style={{ textAlign: 'center', fontFamily: SANS, fontSize: 12.5, color: c.mutedForeground }}>{error}</Text> : null}
      </View>

      <View style={{ marginTop: 30, gap: 12 }}>
        {['Save monologues to your book', 'Track your auditions', 'Run scenes with a partner'].map(line => (
          <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.accentText }} />
            <Text style={{ fontFamily: SANS, fontSize: 14, color: c.foreground }}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexGrow: 1 }} />
      <StageDirection style={{ textAlign: 'center', marginTop: 32 }}>(search is free, no account needed.)</StageDirection>
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
function nameOf(session: Session): { first: string; rest: string } {
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string).trim() : '');
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
