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
import { pick, useL } from '../../src/i18n';

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
  const L = useL();

  const email = session?.user.email ?? null;
  const relay = Boolean(email?.endsWith('@privaterelay.appleid.com'));
  const provider = providerOf(session);

  const onDelete = () => {
    Alert.alert(L('Delete account?', 'Hesap silinsin mi?'), L('This permanently erases your account, saves, auditions and reading history. It cannot be undone.', 'Bu, hesabını ve içindeki her şeyi kalıcı olarak siler: sahnelerini, metinlerini, geçmişini. Geri alınamaz.'), [
      { text: L('Cancel', 'Vazgeç'), style: 'cancel' },
      {
        text: L('Delete', 'Sil'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteAccount();
            await supabase.auth.signOut();
            if (router.canDismiss()) router.dismissAll();
            else router.replace('/');
          } catch {
            Alert.alert(L('Could not delete', 'Silinemedi'), L('Please try again, or contact support.', 'Tekrar dene ya da destekle iletişime geç.'));
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
        <BackHeader label={L('Settings', 'Ayarlar')} onPress={goBack} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 40, letterSpacing: -0.4, color: c.foreground }}>{L('Email & sign-in', 'E-posta ve giriş')}</Text>

          <View style={{ marginTop: 26, borderTopWidth: 1, borderTopColor: c.divider }}>
            <Line label={L('Signed in with', 'GİRİŞ YÖNTEMİ')} value={provider ?? 'Ghost Light'} />
            <Line label={L('Email', 'E-POSTA')} value={email ?? L('None on the account', 'Hesapta yok')} />
          </View>
          {relay ? (
            <StageDirection style={{ marginTop: 12 }}>{L("(apple's relay address. mail still reaches you.)", "(apple'ın aktarma adresi. postan yine sana ulaşır.)")}</StageDirection>
          ) : null}
          <Text style={{ marginTop: 18, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: c.mutedForeground }}>
            {L('Your subscription follows this account to any phone you sign into.', 'Aboneliğin, bu hesapla giriş yaptığın her telefonda seninle.')}
          </Text>

          <View style={{ flexGrow: 1 }} />
          <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" accessibilityState={{ busy }}
            style={{ marginTop: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderTopWidth: 1, borderTopColor: c.divider }}>
            <Text style={{ fontFamily: SANS_B, fontSize: 15, color: '#c0392b', opacity: busy ? 0.5 : 1 }}>{L('Delete account', 'Hesabı sil')}</Text>
            <Ionicons name="chevron-forward" size={15} color={c.chevron} />
          </Pressable>
          <Text style={{ fontFamily: MONO_I, fontSize: 12, letterSpacing: 0.3, color: c.chevron }}>{L('(erases everything. cannot be undone.)', '(her şeyi siler. geri alınamaz.)')}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** The label small above the value, so an address of any length is read whole, never cut. */
function Line({ label, value }: { label: string; value: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <Text style={{ fontFamily: SANS_B, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.mutedForeground }}>{label}</Text>
      <Text selectable style={{ marginTop: 6, fontFamily: SANS, fontSize: 16, lineHeight: 22, color: c.foreground }}>{value}</Text>
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
    case 'email': return pick('Email', 'E-posta');
    default: return provider ? provider[0].toUpperCase() + provider.slice(1) : null;
  }
}
