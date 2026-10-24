import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';

import { StageBackdrop } from '../../src/components/StageBackdrop';
import { BackHeader } from '../../src/components/BackHeader';
import { StageDirection } from '../../src/components/StageDirection';
import { useStageMotion } from '../../src/hooks/useStageMotion';
import { deleteAccount } from '../../src/api/client';
import { useSession } from '../../src/lib/useSession';
import { useGoBack } from '../../src/lib/nav';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const MONO_I = 'CourierPrime_400Regular_Italic';

/**
 * Email & sign-in: which account this is and how it was signed into, in
 * full, and at the foot the one irreversible thing, deleting the account,
 * behind a system alert. Apple's private relay means the address is often
 * one the actor has never typed, so the provider line is the fact they can
 * act on when a purchase looks like it went to the wrong place.
 */
export default function SignIn() {
  const router = useRouter();
  const goBack = useGoBack('/settings');
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const { session } = useSession();
  const [busy, setBusy] = useState(false);

  const email = session?.user.email ?? null;
  const relay = Boolean(email?.endsWith('@privaterelay.appleid.com'));
  const provider = providerOf(session);

  const onDelete = () => {
    Alert.alert('Delete account?', 'This permanently erases your account, saves, auditions and reading history. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteAccount();
            await supabase.auth.signOut();
            if (router.canDismiss()) router.dismissAll();
            else router.replace('/');
          } catch {
            Alert.alert('Could not delete', 'Please try again, or contact support.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <BackHeader label="Settings" onPress={goBack} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 40, letterSpacing: -0.4, color: c.foreground }}>Email & sign-in</Text>

          <View style={{ marginTop: 26, borderTopWidth: 1, borderTopColor: c.divider }}>
            <Line label="Signed in with" value={provider ?? 'Ghost Light'} />
            <Line label="Email" value={email ?? 'None on the account'} />
          </View>
          {relay ? (
            <StageDirection style={{ marginTop: 12 }}>(apple&apos;s relay address. mail still reaches you.)</StageDirection>
          ) : null}
          <Text style={{ marginTop: 18, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: c.mutedForeground }}>
            Your subscription follows this account to any phone you sign into.
          </Text>

          <View style={{ flexGrow: 1 }} />
          <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" accessibilityState={{ busy }}
            style={{ marginTop: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderTopWidth: 1, borderTopColor: c.divider }}>
            <Text style={{ fontFamily: SANS_B, fontSize: 15, color: '#c0392b', opacity: busy ? 0.5 : 1 }}>Delete account</Text>
            <Ionicons name="chevron-forward" size={15} color={c.chevron} />
          </Pressable>
          <Text style={{ fontFamily: MONO_I, fontSize: 12, letterSpacing: 0.3, color: c.chevron }}>(erases everything. cannot be undone.)</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <Text style={{ fontFamily: SANS, fontSize: 15, color: c.foreground }}>{label}</Text>
      <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontFamily: SANS, fontSize: 13, color: c.mutedForeground }}>{value}</Text>
    </View>
  );
}

/** How the session was actually established, in words an actor would use. */
function providerOf(session: Session | null): string | null {
  if (!session) return null;
  const ids = session.user.identities ?? [];
  const provider = ids.find(i => i.provider !== 'anonymous')?.provider ?? (session.user.app_metadata?.provider as string | undefined);
  switch (provider) {
    case 'apple': return 'Apple';
    case 'google': return 'Google';
    case 'email': return 'Email';
    default: return provider ? provider[0].toUpperCase() + provider.slice(1) : null;
  }
}
