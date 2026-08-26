import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
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
import { deleteAccount, getReadState } from '../src/api/client';
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

  const { data: readState } = useQuery({
    queryKey: ['read-wall'],
    queryFn: ({ signal }) => getReadState(signal),
    retry: false,
    staleTime: 15_000,
  });
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

  // Straight to the sub page: subscribers manage in Settings, everyone else sees
  // the plans (restore lives on the paywall).
  const onSubscription = () => {
    if (readState?.is_paid) Linking.openURL(MANAGE_SUBS_URL);
    else router.push('/paywall');
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
            <PlanCard readState={readState} onStay={() => router.push('/paywall')} />
          </View>

          {/* Two stat tiles — kept and read. */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <StatTile n={keptCount} label="(kept.)" />
            <StatTile n={readCount} label="(read.)" />
          </View>

          {!isAuthenticated ? (
            <View style={{ marginTop: 18 }}>
              <WordArrow label="Sign in" onPress={() => router.push('/auth')} />
            </View>
          ) : null}

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
function PlanCard({ readState, onStay }: { readState?: ReadState; onStay: () => void }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const loaded = readState !== undefined;
  const paid = readState?.is_paid === true;

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
  const headline = !loaded
    ? 'Your stage.'
    : paid
      ? 'Every monologue,\nunlimited.'
      : left > 0
        ? `${left} of ${limit} reads\nleft.`
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

function StatTile({ n, label }: { n: number; label: string }) {
  const { colors: c } = useTheme();
  return (
    <View
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
      <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, color: c.mutedForeground, marginTop: 2 }}>
        {label}
      </Text>
    </View>
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
