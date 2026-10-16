import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { GhostLight } from '../src/components/GhostLight';
import { BackHeader } from '../src/components/BackHeader';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { PaperCard } from '../src/components/PaperCard';
import { AboutActorRiseSheet } from '../src/components/AboutActorRiseSheet';
import { Sketch } from '../src/components/Sketches';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useFavorites } from '../src/hooks/useFavorites';
import type { ReadState } from '../src/api/client';
import { useSession } from '../src/lib/useSession';
import { useGoBack } from '../src/lib/nav';
import { supabase } from '../src/lib/supabase';
import { deleteAccount } from '../src/api/client';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { restore } from '../src/lib/purchases';
import { MAKER, emailMaker, openInstagram, openX, rateGhostLight } from '../src/lib/maker';
import { colors, radius } from '../src/theme/tokens';
import { track } from '../src/lib/analytics';
import { useTheme, type ThemeMode } from '../src/theme/ThemeContext';

/**
 * Account — warm, not a settings screen. A greeting, the plan as a lit paper
 * card, two stat tiles, four rows, and a small lamp still burning over the
 * sign-off. Everything else lives one level down (an action sheet), because the
 * old screen had too many buttons.
 *
 * v2 restyles it and changes exactly one behaviour: signing out asks on a sheet
 * of paper rather than in a system Alert. That is not decoration. The Alert was
 * the only moment in the app that looked like iOS instead of like Ghost Light,
 * and it arrived at the one moment an actor is worried about losing their saves
 * — so the reassurance was delivered by a stranger. Still one confirm, never
 * two, and Delete account keeps its own native Alert inside Help & legal, where
 * a system dialog is the right register for something irreversible.
 */

const PRIVACY_URL = 'https://actorrise.com/privacy';
const TERMS_URL = 'https://actorrise.com/terms';
const MANAGE_SUBS_URL = 'https://apps.apple.com/account/subscriptions';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 18) return 'Afternoon';
  return 'Evening';
}

/**
 * A first name, or nothing at all.
 *
 * This used to take whatever sat before the @ and capitalise it, which is fine
 * for sarah@ and a small disaster for Sign in with Apple: Hide My Email hands
 * back `k8j3n2p9qx@privaterelay.appleid.com`, so the screen opened with "Good
 * afternoon, K8j3n2p9qx." Addresses are not names, and an address the user has
 * never seen is certainly not their name.
 *
 * So we ask in order of how much the source actually knows:
 *
 *   1. `given_name`, which src/lib/auth.ts captures from Apple on the one
 *      occasion Apple offers it.
 *   2. The OAuth profile Supabase fills in for Google.
 *   3. The address, and only if it genuinely looks like a name.
 *
 * "Evening." on its own is a perfectly good greeting. Guessing wrong is worse
 * than not guessing, because a stranger's name in your own app is the kind of
 * small wrongness people don't forgive.
 */
function looksLikeAName(value: string): boolean {
  // Letters only, and a plausible length. That rules out relay hashes, anything
  // with digits, and the o.henry / no-vowel machine strings that aren't names.
  return /^[\p{L}][\p{L}'’-]{1,15}$/u.test(value);
}

function titleCase(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}

function firstName(session: Session | null): string | null {
  if (!session) return null;
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;

  const given = typeof meta.given_name === 'string' ? meta.given_name.trim() : '';
  if (given && looksLikeAName(given)) return titleCase(given);

  const full =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    '';
  const firstToken = full.trim().split(/\s+/)[0] ?? '';
  if (firstToken && looksLikeAName(firstToken)) return titleCase(firstToken);

  const email = session.user.email ?? '';
  // Never mine a relay address. There is no name in it by design.
  if (!email || email.endsWith('@privaterelay.appleid.com')) return null;
  const local = email.split('@')[0].split(/[._+]/)[0] ?? '';
  return local && looksLikeAName(local) ? titleCase(local) : null;
}

export default function Account() {
  const router = useRouter();
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const { session, isAuthenticated } = useSession();
  const [busy, setBusy] = useState<null | 'restore' | 'signout' | 'delete'>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [about, setAbout] = useState(false);

  // Not a raw ['read-wall'] read: the server learns about a purchase from a
  // webhook, so for the first seconds after paying it still answers is_paid:
  // false. useEntitlement ORs in the device's own receipt, which is why this
  // card no longer says "unlimited" and then takes it back.
  const { wall: readState, isPaid } = useEntitlement();
  const { data: saved } = useFavorites(isAuthenticated);

  const name = firstName(session);
  const keptCount = saved?.length ?? 0;
  const readCount = readState?.reads_used ?? 0;

  const onRestore = async () => {
    setBusy('restore');
    try {
      const ok = await restore();
      Alert.alert(
        ok ? 'Restored' : 'Nothing to restore',
        ok ? 'Welcome back.' : 'No purchase found on this account.',
      );
    } finally {
      setBusy(null);
    }
  };

  // Sign-out used to fire on the first tap and drop you on /search with no
  // acknowledgement, so it read like a misfire. Confirm first, then say what
  // happened — and reassure, because signing out of a library app looks like it
  // might take your saves with it.
  const doSignOut = async () => {
    setConfirmSignOut(false);
    setBusy('signout');
    try {
      // The cache clear and the fresh anonymous session are handled centrally by
      // the SIGNED_OUT listener in app/_layout.tsx.
      await supabase.auth.signOut();
      // `replace` turned THIS screen into a second /search on top of the one
      // already underneath, so swiping back from search landed on search. Pop
      // back to the real one instead.
      goBack();
    } finally {
      setBusy(null);
    }
  };

  const onDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently erases your account, saves, and reading history. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            try {
              await deleteAccount();
              await supabase.auth.signOut();
              goBack();
            } catch {
              Alert.alert('Could not delete', 'Please try again, or contact support.');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  // Non-subscribers see the plans. Subscribers used to be thrown straight out
  // to Apple's subscription settings, which is a one-tap path to Cancel and the
  // only thing on that screen — a strange destination to hand someone who just
  // wanted to check what they're on. Show their status first; managing (and
  // therefore cancelling) stays available, just not as the default action.
  const onSubscription = () => {
    if (!isPaid) {
      router.push('/paywall');
      return;
    }
    Alert.alert(
      'Ghost Light, in full',
      'Every monologue, every filter, offline. Renews through the App Store.',
      [
        { text: 'Done', style: 'cancel' },
        { text: 'Manage in Settings', onPress: () => Linking.openURL(MANAGE_SUBS_URL) },
      ],
    );
  };

  const onHelp = () => {
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: 'Privacy Policy', onPress: () => WebBrowser.openBrowserAsync(PRIVACY_URL) },
      { text: 'Terms of Service', onPress: () => WebBrowser.openBrowserAsync(TERMS_URL) },
      { text: 'Restore purchases', onPress: onRestore },
      { text: 'Contact support', onPress: () => Linking.openURL('mailto:canberk@actorrise.com') },
    ];
    if (isAuthenticated) options.push({ text: 'Delete account', style: 'destructive', onPress: onDelete });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Help & legal', undefined, options);
  };

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <BackHeader label="Search" onPress={goBack} />

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* One line, always: "Afternoon, Konstantin." is the longest this can
              get and it has to hold at 40pt on a narrow phone, so the serif
              shrinks rather than the name wrapping away from the comma. */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            style={{
              fontFamily: 'InstrumentSerif_400Regular',
              fontSize: 40,
              lineHeight: 45,
              letterSpacing: -0.8,
              color: c.foreground,
            }}
          >
            {name ? (
              <>
                {`${greeting()}, `}
                <Text
                  style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}
                >
                  {`${name}.`}
                </Text>
              </>
            ) : (
              `${greeting()}.`
            )}
          </Text>
          <StageDirection style={{ marginTop: 4 }}>(the light&apos;s still on.)</StageDirection>

          <View style={{ marginTop: 22, paddingRight: 8 }}>
            <PlanCard readState={readState} paid={isPaid} onStay={() => router.push('/paywall')} />
          </View>

          {/* Who you're signed in as. This was the one question the screen
              couldn't answer: Sign in with Apple often hands back a relay
              address you've never seen, so "am I even signed in, and as whom?"
              had no answer anywhere in the app — which is exactly the doubt
              someone has when they've paid and the app still looks locked. */}
          <View style={{ marginTop: 16 }}>
            <IdentityCard
              session={session}
              isAuthenticated={isAuthenticated}
              onSignIn={() => {
                Haptics.selectionAsync().catch(() => {});
                router.push('/auth');
              }}
            />
          </View>

          {/* Two stat tiles — kept and read. */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <StatTile n={keptCount} label="(kept.)" onPress={() => router.push('/saves')} />
            <StatTile n={readCount} label="(read.)" />
          </View>

          {/* Four rows only. Everything else is one level down. */}
          <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: c.divider }}>
            <AppearanceRow />
            {/* The plan card above says it in the app's voice, which is lovely
                and apparently not enough — "am I subscribed?" was still hard to
                answer at a glance. This says it in the plainest words there are,
                on the row you'd tap to find out. */}
            <Row
              label="Subscription"
              value={isPaid ? 'Subscribed' : 'Free'}
              valueLit={isPaid}
              onPress={onSubscription}
              busy={busy === 'restore'}
            />
            <Row label="Help & legal" onPress={onHelp} />
            <Row
              label="What is ActorRise?"
              onPress={() => {
                track('app_about_actorrise', { from: 'account', visited: false });
                setAbout(true);
              }}
              last={!isAuthenticated}
            />
            {isAuthenticated ? (
              <Row
                label="Sign out"
                onPress={() => setConfirmSignOut(true)}
                busy={busy === 'signout'}
                last
              />
            ) : null}
          </View>

          {/* From the maker. Permanent, and the honest home for "rate the app":
              a row you choose to tap, rather than only a note that finds you. */}
          <View style={{ marginTop: 30 }}>
            <StageDirection>(from the maker.)</StageDirection>
            <Text
              style={{
                marginTop: 6,
                fontFamily: 'BricolageGrotesque_500Medium',
                fontSize: 15,
                lineHeight: 22,
                color: c.foreground,
              }}
            >
              I&apos;m Canberk, an actor building Ghost Light on my own. I&apos;d love to hear from you.
            </Text>
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: c.divider }}>
              <Row label="Rate Ghost Light" onPress={() => {
                  track('app_review_prompted', { from: 'account' });
                  void rateGhostLight({ inApp: false });
                }} last />
            </View>
            {/* Three doors in one line. They were three full rows with the
                handles spelled out, which made "from the maker" the tallest
                block on the screen and read as a contact page. */}
            <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Social icon="logo-instagram" label="Instagram" onPress={openInstagram} />
              <Social icon="logo-x" label="X" onPress={openX} />
              <Social icon="mail-outline" label={`Email ${MAKER.email}`} onPress={() => emailMaker('Ghost Light')} />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  marginLeft: 4,
                  fontFamily: 'CourierPrime_400Regular_Italic',
                  fontSize: 12.5,
                  color: c.mutedForeground,
                }}
              >
                @{MAKER.instagram}
              </Text>
            </View>
          </View>

          {/* Sign-off: a small lamp still burning. */}
          <View style={{ alignItems: 'center', marginTop: 34 }}>
            <GhostLight size={21} />
            <StageDirection style={{ marginTop: 4 }}>(ghost light.)</StageDirection>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Signing out and deleting take a second or two and tear the session
          down under every other screen, so the page is held while they run:
          one ring in the middle, nothing tappable behind it. The per-row ring
          let you wander off mid-teardown and tap into a session that was
          halfway gone. */}
      {busy === 'signout' || busy === 'delete' ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.isLight ? 'rgba(250,246,238,0.6)' : 'rgba(19,11,8,0.6)' }}
          accessibilityViewIsModal
          accessibilityLabel={busy === 'signout' ? 'Signing out' : 'Deleting your account'}
        >
          <Ring size={28} />
        </Animated.View>
      ) : null}

      <SignOutCard
        visible={confirmSignOut}
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={doSignOut}
      />
      <AboutActorRiseSheet open={about} onClose={() => setAbout(false)} from="account" />
    </View>
  );
}

/**
 * The confirm, on paper, on the stage door.
 *
 * The copy is exactly the Alert's — it was already the right words, and the
 * reassurance ("your saved monologues stay on your account") is the entire
 * reason this dialog exists. What changed is who appears to be saying it.
 *
 * The backdrop dims to .72 and the card rises 24pt, which is the same arrival
 * the reading page uses. Cancel is the outlined pill and Sign out is the
 * primary one: the destructive action is the one you came here to do, so
 * dressing it as the scary option would be a lie about what you just tapped.
 */
function SignOutCard({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const rise = useSharedValue(reduce ? 0 : 24);

  useEffect(() => {
    if (!visible) {
      rise.value = reduce ? 0 : 24;
      return;
    }
    rise.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [visible, rise, reduce]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: rise.value }] }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(160)}
        style={{ flex: 1, backgroundColor: 'rgba(11, 6, 4, 0.72)', justifyContent: 'flex-end' }}
      >
        {/* Tapping the dimmed stage is the same as Cancel. */}
        <Pressable
          onPress={onCancel}
          accessible={false}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Animated.View style={[cardStyle, { paddingHorizontal: 24, paddingBottom: 104 }]}>
          <PaperCard rotate={-0.5} shadow={8} style={{ paddingHorizontal: 22, paddingTop: 24, paddingBottom: 20 }}>
            <View style={{ alignItems: 'center' }}>
              <Sketch name="stageDoor" size={58} stroke={c.paperInk} weight={1.9} />
            </View>
            <Text
              style={{
                marginTop: 14,
                textAlign: 'center',
                fontFamily: 'InstrumentSerif_400Regular',
                fontSize: 30,
                lineHeight: 34,
                color: c.paperInk,
              }}
            >
              Sign out?
            </Text>
            <Text
              style={{
                marginTop: 10,
                textAlign: 'center',
                fontFamily: 'BricolageGrotesque_500Medium',
                fontSize: 14,
                lineHeight: 21,
                color: c.paperMuted,
              }}
            >
              Your saved monologues stay on your account. Sign back in any time to pick them up.
            </Text>
            <View style={{ marginTop: 20, gap: 10 }}>
              <PrimaryPill label="Sign out" onPress={onConfirm} height={50} block haptic="medium" />
              {/* The outline pill takes the theme foreground, and this one sits
                  on paper in both schemes — so it is pinned to ink here rather
                  than allowed to go cream on a dark-mode card. */}
              <Pressable
                onPress={onCancel}
                accessibilityRole="button"
                style={{
                  height: 46,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: c.paperInk,
                }}
              >
                <Text
                  style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 14, color: c.paperInk }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </PaperCard>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/**
 * The plan as a sheet of paper on a block of gel: an eyebrow, a big serif line,
 * three filament bars, and the action. Honest — driven by the server counter,
 * never a hardcoded "two days left".
 *
 * The amber bloom that used to breathe behind it is gone with the dark card it
 * was bleeding into. A glow on cream is a stain.
 */
function PlanCard({
  readState,
  paid,
  onStay,
}: {
  readState?: ReadState;
  paid: boolean;
  onStay: () => void;
}) {
  const { colors: c } = useTheme();
  const loaded = readState !== undefined || paid;

  const limit = readState && readState.reads_limit > 0 ? readState.reads_limit : 3;
  const used = Math.min(readState?.reads_used ?? 0, limit);
  const left = Math.max(0, limit - used);
  // Bars stay dark until we actually know, so the card doesn't flip on load.
  const litBars = !loaded ? 0 : paid ? 3 : Math.max(0, Math.min(3, Math.round((left / limit) * 3)));

  const eyebrow = !loaded ? '' : paid ? 'The whole stage' : 'Free';
  // "3 of 3 reads left" is a strange thing to tell someone who has not read
  // anything yet — it reads like a countdown that has already started, and the
  // three filament bars below already say "of three". So an untouched account
  // gets an invitation, a part-spent one gets the plain remainder, and only the
  // empty one gets told it's empty.
  const headline = !loaded
    ? 'Your stage.'
    : paid
      ? 'Every monologue,\nunlimited.'
      : used === 0
        ? `${limit} reads,\non the house.`
        : left > 0
          ? `${left} read${left === 1 ? '' : 's'}\nleft.`
          : 'Your free reads\nare spent.';

  return (
    <PaperCard rotate={-0.5} shadow={8} style={{ padding: 20 }}>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: 'CourierPrime_700Bold',
          fontSize: 11,
          letterSpacing: 2.2,
          textTransform: 'uppercase',
          color: colors.primary,
        }}
      >
        {eyebrow}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontFamily: 'InstrumentSerif_400Regular',
          fontSize: 30,
          lineHeight: 34,
          letterSpacing: -0.4,
          color: c.paperInk,
        }}
      >
        {headline}
      </Text>

      {/* three filament bars */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i < litBars ? colors.primary : c.paperRule,
            }}
          />
        ))}
      </View>

      {/* The plan card is a stretching column, so the pill says out loud that it
          hugs its label rather than running the full width of the card. */}
      {loaded && !paid ? (
        <PrimaryPill
          label="Stay on"
          onPress={onStay}
          height={44}
          style={{ marginTop: 16, alignSelf: 'flex-start' }}
        />
      ) : null}
    </PaperCard>
  );
}

/** How the session was actually established, in words an actor would use. */
function providerLabel(session: Session | null): string | null {
  if (!session) return null;
  const ids = session.user.identities ?? [];
  const provider =
    ids.find((i) => i.provider !== 'anonymous')?.provider ??
    (session.user.app_metadata?.provider as string | undefined);
  switch (provider) {
    case 'apple':
      return 'Signed in with Apple';
    case 'google':
      return 'Signed in with Google';
    case 'email':
      return 'Signed in with email';
    default:
      return provider ? `Signed in with ${provider}` : null;
  }
}

/**
 * The who-am-I card. Apple's private relay means the address on the account is
 * frequently one the actor has never typed and won't recognise, so the provider
 * line matters more than the address does — "Signed in with Apple" is the fact
 * they can act on when a purchase looks like it went to the wrong place.
 *
 * A stage card, not a paper one: it is a readout about the app, not a page out
 * of a script, and three cream blocks stacked down the screen would have made
 * the plan card stop being the thing you look at first.
 */
function IdentityCard({
  session,
  isAuthenticated,
  onSignIn,
}: {
  session: Session | null;
  isAuthenticated: boolean;
  onSignIn: () => void;
}) {
  const { colors: c } = useTheme();
  const email = session?.user.email ?? null;
  const provider = providerLabel(session);
  const relay = Boolean(email?.endsWith('@privaterelay.appleid.com'));

  // Not signed in, so the card IS the invitation. Reading "not signed in" and
  // having no way to act on it from the thing that just told you is a dead end.
  const Container = isAuthenticated ? View : Pressable;

  return (
    <Container
      onPress={isAuthenticated ? undefined : onSignIn}
      accessibilityRole={isAuthenticated ? undefined : 'button'}
      accessibilityLabel={isAuthenticated ? undefined : 'Sign in'}
      style={{
        borderRadius: radius.card,
        borderWidth: 1.5,
        borderColor: isAuthenticated ? c.border : colors.primary,
        backgroundColor: c.panel,
        paddingVertical: 14,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
      }}
    >
      <Ionicons
        name={isAuthenticated ? 'person-circle-outline' : 'ellipse-outline'}
        size={24}
        color={isAuthenticated ? c.accentText : c.mutedForeground}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 14, color: c.foreground }}
        >
          {isAuthenticated ? (email ?? 'Signed in') : 'Not signed in'}
        </Text>
        {/* Two lines, not one. At 12px Courier italic inside a card that has an
            icon and a chevron eating the width, every one of these strings ran
            past the edge and got clipped mid-word. */}
        <Text
          numberOfLines={2}
          style={{
            marginTop: 3,
            fontFamily: 'CourierPrime_400Regular_Italic',
            fontSize: 12,
            lineHeight: 17,
            color: c.mutedForeground,
          }}
        >
          {isAuthenticated
            ? relay
              ? '(apple relay. mail still reaches you.)'
              : provider
                ? `(${provider.toLowerCase()}.)`
                : '(signed in.)'
            : '(tap to sign in and keep your saves.)'}
        </Text>
      </View>
      {isAuthenticated ? null : <Ionicons name="chevron-forward" size={16} color={c.accentText} />}
    </Container>
  );
}

/**
 * A count, optionally a door. "Kept" leads to the book; "read" is a tally with
 * nowhere to go, so it stays inert and doesn't pretend to be tappable.
 */
function StatTile({ n, label, onPress }: { n: number; label: string; onPress?: () => void }) {
  const { colors: c } = useTheme();
  const Container = onPress ? Pressable : View;
  return (
    <Container
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${n} kept. Open your book` : undefined}
      style={{
        flex: 1,
        borderRadius: radius.card,
        borderWidth: 1.5,
        borderColor: c.border,
        backgroundColor: c.panel,
        paddingVertical: 16,
        paddingHorizontal: 16,
      }}
    >
      {/* 36, not 32: 30pt of Instrument Serif in a 32pt box is 1.07×, and RN
          clips to the line box. Lining figures survive it, but the moment this
          tile shows anything that is not a digit it would start trimming. */}
      <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 30, lineHeight: 36, color: c.foreground }}>
        {n}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
        <StageDirection numberOfLines={1}>{label}</StageDirection>
        {onPress ? <Ionicons name="chevron-forward" size={12} color={c.chevron} /> : null}
      </View>
    </Container>
  );
}

/**
 * The per-row busy state: a 16pt ring with one gel-yellow arc leading it.
 *
 * `ActivityIndicator` is the system's spinner and looks it — the one piece of
 * iOS chrome left on a screen that had just stopped using a system dialog.
 */
function Ring({ size = 16 }: { size?: number }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    spin.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.linear }), -1, false);
  }, [reduce, spin]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  return (
    <Animated.View
      style={[
        style,
        {
          width: size,
          height: size,
          borderRadius: 999,
          borderWidth: size > 20 ? 2.5 : 2,
          borderColor: c.inactiveMeter,
          borderTopColor: c.yellow,
        },
      ]}
    />
  );
}

/** A round outlined button holding one glyph: a door, not a row. */
function Social({
  icon,
  label,
  onPress,
}: {
  icon: 'logo-instagram' | 'logo-x' | 'mail-outline';
  label: string;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1.5,
        borderColor: pressed ? c.foreground : c.border,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Ionicons name={icon} size={18} color={c.foreground} />
    </Pressable>
  );
}

function Row({
  label,
  value,
  valueLit,
  onPress,
  busy,
  last,
}: {
  label: string;
  /** Current state, shown before the chevron. */
  value?: string;
  /** Draw the value in the stage glow — for states worth noticing. */
  valueLit?: boolean;
  onPress: () => void;
  busy?: boolean;
  last?: boolean;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(busy) }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.divider,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontFamily: 'BricolageGrotesque_500Medium', fontSize: 15, color: c.foreground }}
      >
        {label}
      </Text>
      {busy ? (
        <Ring />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {value ? (
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'BricolageGrotesque_500Medium',
                fontSize: 14,
                color: valueLit ? c.accentText : c.mutedForeground,
              }}
            >
              {value}
            </Text>
          ) : null}
          <Ionicons name="chevron-forward" size={17} color={c.chevron} />
        </View>
      )}
    </Pressable>
  );
}

/** System / Dark / Light — one of the four rows, expanded inline. */
function AppearanceRow() {
  const { mode, setMode, colors: c } = useTheme();
  const opts: { k: ThemeMode; label: string }[] = [
    { k: 'system', label: 'System' },
    { k: 'dark', label: 'Dark' },
    { k: 'light', label: 'Light' },
  ];
  return (
    <View style={{ paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <Text
        style={{
          fontFamily: 'BricolageGrotesque_500Medium',
          fontSize: 15,
          color: c.foreground,
          marginBottom: 12,
        }}
      >
        Appearance
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {opts.map((o) => {
          const active = mode === o.k;
          return (
            <Pressable
              key={o.k}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setMode(o.k);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 10,
                borderRadius: radius.card,
                borderWidth: 1.5,
                // The gel is the selection everywhere else in v2 — chips, marks,
                // the arrow disc — so it is the selection here too, with ink on
                // it rather than the house colour.
                borderColor: active ? c.ink : c.border,
                backgroundColor: active ? c.yellow : 'transparent',
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: active ? 'BricolageGrotesque_700Bold' : 'BricolageGrotesque_600SemiBold',
                  fontSize: 13,
                  color: active ? c.ink : c.mutedForeground,
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
