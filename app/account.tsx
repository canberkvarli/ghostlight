import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { StageButton } from '../src/components/StageButton';
import { useStageMotion } from '../src/hooks/useStageMotion';
import type { ReadState } from '../src/api/client';
import { useSession } from '../src/lib/useSession';
import { useGoBack } from '../src/lib/nav';
import { supabase } from '../src/lib/supabase';
import { deleteAccount, getReadState } from '../src/api/client';
import { restore } from '../src/lib/purchases';
import { colors } from '../src/theme/tokens';
import { useTheme, type ThemeMode } from '../src/theme/ThemeContext';

/**
 * Account — the quiet back-of-house. Not a social profile (the app has one job);
 * this is the plumbing the App Store requires once you offer sign-in: restore a
 * purchase, see your plan, read the legal pages, sign out, and delete the
 * account and everything in it.
 */

const PRIVACY_URL = 'https://actorrise.com/privacy';
const TERMS_URL = 'https://actorrise.com/terms';
const MANAGE_SUBS_URL = 'https://apps.apple.com/account/subscriptions';

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

  const onRestore = async () => {
    setBusy('restore');
    try {
      const ok = await restore();
      Alert.alert(ok ? 'Restored' : 'Nothing to restore', ok ? 'Welcome back.' : 'No purchase found on this account.');
    } finally {
      setBusy(null);
    }
  };

  const onSignOut = async () => {
    setBusy('signout');
    try {
      await supabase.auth.signOut();
      router.replace('/search');
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

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 }}>
          <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button">
            <Ionicons name="chevron-back" size={26} color={c.mutedForeground} />
          </Pressable>
          <Text
            className="text-foreground"
            style={{ marginLeft: 8, fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 32 }}
          >
            Account
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 14 }}>
          {/* Who you are, and what you're on. */}
          <StageDirection>
            {isAuthenticated ? `(signed in as ${session?.user.email ?? 'you'}.)` : '(a guest on the stage.)'}
          </StageDirection>

          <View style={{ marginTop: 14 }}>
            <SubscriptionCard readState={readState} onUpgrade={() => router.push('/paywall')} />
          </View>

          {!isAuthenticated ? (
            <View style={{ marginTop: 12 }}>
              <StageButton label="Sign in / Create account" onPress={() => router.push('/auth')} />
            </View>
          ) : null}

          <View style={{ height: 20 }} />
          <Divider />

          <AppearanceRow />

          <Divider />

          <Row label="Restore Purchases" onPress={onRestore} busy={busy === 'restore'} />
          {readState?.is_paid ? (
            <Row label="Manage subscription" onPress={() => Linking.openURL(MANAGE_SUBS_URL)} />
          ) : null}

          <Divider />

          <Row label="Privacy Policy" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
          <Row label="Terms of Service" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} />

          <Divider />

          {isAuthenticated ? (
            <Row label="Sign out" onPress={onSignOut} busy={busy === 'signout'} />
          ) : null}
          {isAuthenticated ? (
            <Row label="Delete account" onPress={onDelete} busy={busy === 'delete'} destructive />
          ) : null}

          <View style={{ flex: 1 }} />
          <View style={{ alignItems: 'center', paddingBottom: 12 }}>
            <StageDirection>(ghost light.)</StageDirection>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** The plan at a glance — a lit card for subscribers, a reads-left meter + upgrade for free. */
function SubscriptionCard({ readState, onUpgrade }: { readState?: ReadState; onUpgrade: () => void }) {
  const { colors: c } = useTheme();

  if (readState?.is_paid) {
    return (
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: 'rgba(243, 130, 29, 0.4)', backgroundColor: 'rgba(243, 130, 29, 0.08)', padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Ionicons name="sparkles" size={15} color={colors.stageGlow} />
          <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.stageGlow }}>
            Monologues
          </Text>
        </View>
        <Text style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 24, lineHeight: 30, color: c.foreground }}>
          Every monologue, unlimited.
        </Text>
        <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 14, color: c.mutedForeground, marginTop: 6 }}>
          Memorize, copy, offline — all yours.
        </Text>
      </View>
    );
  }

  const limit = readState && readState.reads_limit > 0 ? readState.reads_limit : 3;
  const used = Math.min(readState?.reads_used ?? 0, limit);
  const pct = Math.max(0, Math.min(1, used / limit));
  return (
    <View style={{ borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 20 }}>
      <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: c.mutedForeground, marginBottom: 8 }}>
        Free
      </Text>
      <Text style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 24, lineHeight: 30, color: c.foreground }}>
        {used} of {limit} reads used
      </Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border, marginTop: 14, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: colors.stageGlow }} />
      </View>
      <View style={{ marginTop: 18 }}>
        <StageButton label="Unlock everything" onPress={onUpgrade} />
      </View>
    </View>
  );
}

function Row({
  label,
  onPress,
  busy,
  destructive,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  destructive?: boolean;
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
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 }}
    >
      <Text
        className="text-[16px]"
        style={{
          fontFamily: 'Montserrat_400Regular',
          color: destructive ? colors.primary : c.foreground,
        }}
      >
        {label}
      </Text>
      {busy ? (
        <ActivityIndicator color={c.mutedForeground} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={c.mutedForeground} />
      )}
    </Pressable>
  );
}

function Divider() {
  const { colors: c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />;
}

/** System / Dark / Light — Ghost Light is a dark stage, but the actor chooses. */
function AppearanceRow() {
  const { mode, setMode, colors: c } = useTheme();
  const opts: { k: ThemeMode; label: string }[] = [
    { k: 'system', label: 'System' },
    { k: 'dark', label: 'Dark' },
    { k: 'light', label: 'Light' },
  ];
  return (
    <View style={{ paddingVertical: 14 }}>
      <Text
        className="text-[16px]"
        style={{ fontFamily: 'Montserrat_400Regular', color: c.foreground, marginBottom: 12 }}
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
                paddingVertical: 11,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: active ? colors.stageGlow : c.border,
                backgroundColor: active ? 'rgba(243, 130, 29, 0.14)' : 'transparent',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Montserrat_500Medium',
                  fontSize: 13,
                  color: active ? colors.stageGlow : c.mutedForeground,
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
