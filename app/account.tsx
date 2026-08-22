import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
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

  const planLine = readState?.is_paid
    ? 'Monologues — every monologue, unlimited'
    : readState
      ? `Free — ${Math.min(readState.reads_used, readState.reads_limit)} of ${readState.reads_limit} reads used`
      : 'Free';

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
            <Text className="text-[26px] leading-[26px]" style={{ color: c.mutedForeground }}>
              ‹
            </Text>
          </Pressable>
          <Text
            className="text-[20px] text-foreground"
            style={{ marginLeft: 12, fontFamily: 'PlayfairDisplay_600SemiBold' }}
          >
            Account
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12 }}>
          {/* Who you are, and what you're on. */}
          <View style={{ marginBottom: 8 }}>
            <StageDirection>
              {isAuthenticated ? `(signed in as ${session?.user.email ?? 'you'}.)` : '(a guest on the stage.)'}
            </StageDirection>
            <Text
              className="mt-3 text-[15px] text-foreground"
              style={{ fontFamily: 'Montserrat_500Medium' }}
            >
              {planLine}
            </Text>
          </View>

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
        <Text style={{ color: c.mutedForeground, fontSize: 20 }}>›</Text>
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
