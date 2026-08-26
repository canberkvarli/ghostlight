import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
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
import { WordArrow } from '../src/components/WordArrow';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useFavorites } from '../src/hooks/useFavorites';
import type { ReadState } from '../src/api/client';
import { useSession } from '../src/lib/useSession';
import { useGoBack } from '../src/lib/nav';
import { supabase } from '../src/lib/supabase';
import { deleteAccount } from '../src/api/client';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { restore } from '../src/lib/purchases';
import { colors } from '../src/theme/tokens';
import { useTheme, type ThemeMode } from '../src/theme/ThemeContext';

/**
 * Account — warm, not a settings screen (handoff §5). A greeting, the plan as a
 * lit trial card, two stat tiles, four rows, and a small lamp still burning over
 * the sign-off. Everything else lives one level down (an action sheet), because
 * the old screen had too many buttons.
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

function firstName(email?: string | null): string | null {
  if (!email) return null;
  const local = email.split('@')[0].split(/[._+]/)[0];
  if (!local) return null;
  return local[0].toUpperCase() + local.slice(1);
}

export default function Account() {
  const router = useRouter();
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const { session, isAuthenticated } = useSession();
  const [busy, setBusy] = useState<null | 'restore' | 'signout' | 'delete'>(null);

  // Not a raw ['read-wall'] read: the server learns about a purchase from a
  // webhook, so for the first seconds after paying it still answers is_paid:
  // false. useEntitlement ORs in the device's own receipt, which is why this
  // card no longer says "unlimited" and then takes it back.
  const { wall: readState, isPaid } = useEntitlement();
  const { data: saved } = useFavorites(isAuthenticated);

  const name = firstName(session?.user.email);
  const keptCount = saved?.length ?? 0;
  const readCount = readState?.reads_used ?? 0;

  const onRestore = async () => {
    setBusy('restore');
    try {
      const ok = await restore();
      Alert.alert(ok ? 'Restored' : 'Nothing to restore', ok ? 'Welcome back.' : 'No purchase found on this account.');
    } finally {
      setBusy(null);
    }
  };

  // Sign-out used to fire on the first tap and drop you on /search with no
  // acknowledgement, so it read like a misfire. Confirm first, then say what
  // happened — and reassure, because signing out of a library app looks like it
  // might take your saves with it.
  const onSignOut = () => {
    Alert.alert(
      'Sign out?',
      'Your saved monologues stay on your account. Sign back in any time to pick them up.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setBusy('signout');
            try {
              // The cache clear and the fresh anonymous session are handled
              // centrally by the SIGNED_OUT listener in app/_layout.tsx.
              await supabase.auth.signOut();
              router.replace('/search');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
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
              router.replace('/search');
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
      { text: 'Contact support', onPress: () => Linking.openURL('mailto:hello@actorrise.com') },
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
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            className="text-foreground"
            style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 34, lineHeight: 40 }}
          >
            {name ? `${greeting()}, ${name}.` : `${greeting()}.`}
          </Text>
          <StageDirection className="mt-1">(the light's still on.)</StageDirection>

          <View style={{ marginTop: 22 }}>
            <PlanCard readState={readState} paid={isPaid} onStay={() => router.push('/paywall')} />
          </View>

          {/* Who you're signed in as. This was the one question the screen
              couldn't answer: Sign in with Apple often hands back a relay
              address you've never seen, so "am I even signed in, and as whom?"
              had no answer anywhere in the app — which is exactly the doubt
              someone has when they've paid and the app still looks locked. */}
          <View style={{ marginTop: 12 }}>
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

          {/* The standalone "Sign in" arrow that used to sit here is gone: the
              identity card directly above now says "tap to sign in", so two
              affordances for the same act were stacked one on top of the other. */}

          {/* Four rows only. Everything else is one level down. */}
          <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: colors.dark.divider }}>
            <AppearanceRow />
            <Row label="Subscription" onPress={onSubscription} busy={busy === 'restore'} />
            <Row label="Help & legal" onPress={onHelp} />
            {isAuthenticated ? <Row label="Sign out" onPress={onSignOut} busy={busy === 'signout'} last /> : null}
          </View>

          {/* Sign-off: a small lamp still burning. */}
          <View style={{ alignItems: 'center', marginTop: 34 }}>
            <GhostLight size={21} />
            <StageDirection className="mt-2">(ghost light.)</StageDirection>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/**
 * The plan as a warm card: a breathing amber bloom top-left, an eyebrow, a big
 * Playfair line, three filament bars, and the action. Honest — driven by the
 * server counter, never a hardcoded "two days left".
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
  const reduce = useReducedMotion();
  const loaded = readState !== undefined || paid;

  const limit = readState && readState.reads_limit > 0 ? readState.reads_limit : 3;
  const used = Math.min(readState?.reads_used ?? 0, limit);
  const left = Math.max(0, limit - used);
  // Bars stay dark until we actually know, so the card doesn't flip on load.
  const litBars = !loaded ? 0 : paid ? 3 : Math.max(0, Math.min(3, Math.round((left / limit) * 3)));

  // The bloom breathes on the 7s flicker.
  const bloom = useSharedValue(0.12);
  useEffect(() => {
    if (reduce) {
      bloom.value = 0.14;
      return;
    }
    bloom.value = withRepeat(withTiming(0.2, { duration: 3500, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduce, bloom]);
  const bloomStyle = useAnimatedStyle(() => ({ opacity: bloom.value }));

  const eyebrow = !loaded ? '' : paid ? 'THE WHOLE STAGE' : 'FREE';
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
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(243, 130, 29, 0.3)',
        backgroundColor: c.card,
        padding: 22,
        overflow: 'hidden',
      }}
    >
      {/* amber bloom bleeding from the top-left */}
      <Animated.View
        pointerEvents="none"
        style={[
          bloomStyle,
          {
            position: 'absolute',
            top: -80,
            left: -80,
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: colors.stageGlow,
          },
        ]}
      />
      <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.stageGlow }}>
        {eyebrow}
      </Text>
      <Text style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 28, lineHeight: 34, color: c.foreground, marginTop: 8 }}>
        {headline}
      </Text>

      {/* three filament bars */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i < litBars ? colors.stageGlow : colors.dark.inactiveMeter,
              shadowColor: colors.stageGlow,
              shadowOpacity: i < litBars ? 0.8 : 0,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        ))}
      </View>

      {loaded && !paid ? (
        <View style={{ marginTop: 18, alignItems: 'flex-start' }}>
          <WordArrow label="Stay on" onPress={onStay} />
        </View>
      ) : null}
    </View>
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
        borderRadius: 18,
        borderWidth: 1,
        borderColor: isAuthenticated ? colors.dark.cardBorder : 'rgba(243, 130, 29, 0.3)',
        backgroundColor: c.card,
        paddingVertical: 16,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
      }}
    >
      <Ionicons
        name={isAuthenticated ? 'person-circle-outline' : 'ellipse-outline'}
        size={26}
        color={isAuthenticated ? colors.stageGlow : c.mutedForeground}
      />
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: 'Montserrat_500Medium', fontSize: 14, color: c.foreground }}
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
      {isAuthenticated ? null : (
        <Ionicons name="chevron-forward" size={16} color={colors.stageGlow} />
      )}
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
      style={{
        flex: 1,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.dark.cardBorder,
        backgroundColor: c.card,
        paddingVertical: 20,
        paddingHorizontal: 18,
      }}
    >
      <Text style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 30, color: c.foreground }}>{n}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
        <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, color: c.mutedForeground }}>
          {label}
        </Text>
        {onPress ? (
          <Ionicons name="chevron-forward" size={13} color={c.mutedForeground} style={{ marginLeft: 2 }} />
        ) : null}
      </View>
    </Container>
  );
}

function Row({
  label,
  onPress,
  busy,
  last,
}: {
  label: string;
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
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 17,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.dark.divider,
      }}
    >
      <Text className="text-[16px]" style={{ fontFamily: 'Montserrat_400Regular', color: c.foreground }}>
        {label}
      </Text>
      {busy ? (
        <ActivityIndicator color={c.mutedForeground} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.dark.chevron} />
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
    <View style={{ paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.dark.divider }}>
      <Text className="text-[16px]" style={{ fontFamily: 'Montserrat_400Regular', color: c.foreground, marginBottom: 12 }}>
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
                paddingVertical: 11,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: active ? colors.stageGlow : c.border,
                backgroundColor: active ? 'rgba(243, 130, 29, 0.14)' : 'transparent',
              }}
            >
              <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 13, color: active ? colors.stageGlow : c.mutedForeground }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
