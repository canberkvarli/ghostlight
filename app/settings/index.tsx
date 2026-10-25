import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Application from 'expo-application';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { StageBackdrop } from '../../src/components/StageBackdrop';
import { BackHeader } from '../../src/components/BackHeader';
import { AboutActorRiseSheet } from '../../src/components/AboutActorRiseSheet';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { useStageMotion } from '../../src/hooks/useStageMotion';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { PRIVACY_URL, TERMS_URL } from '../../src/hooks/useTrialOffer';
import { useSession } from '../../src/lib/useSession';
import { useGoBack, useGuardedPush } from '../../src/lib/nav';
import { useAuditions } from '../../src/hooks/useAuditions';
import { supabase } from '../../src/lib/supabase';
import { getSubscription, manageSubscription, restore } from '../../src/lib/purchases';
import { hasNotificationPermission, notificationsDenied, remindersMuted, requestNotificationPermission, setRemindersMuted, syncReminders } from '../../src/lib/notifications';
import { MAKER, emailMaker, openInstagram, rateGhostLight } from '../../src/lib/maker';
import { track } from '../../src/lib/analytics';
import { useTheme, type ThemeMode } from '../../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const SANS_X = 'BricolageGrotesque_700Bold';
const MONO_I = 'CourierPrime_400Regular_Italic';

/**
 * Settings (handoff account-v2, 2c): two groups, one line per setting.
 * Appearance is the one control drawn in full. Under it the account rows,
 * then the app's own, the note from the maker, and at the foot, sign out on
 * the left and the version on the right. Pushed from the gear on You, and
 * open to a stranger too, so Appearance works before anyone signs in.
 */
export default function Settings() {
  const router = useRouter();
  const goBack = useGoBack('/account');
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const { session, isAuthenticated } = useSession();
  const { isPaid } = useEntitlement();
  const { data: sub } = useQuery({ queryKey: ['subscription'], queryFn: getSubscription, enabled: isPaid, staleTime: 5 * 60_000 });
  const [about, setAbout] = useState(false);
  const [reminders, setReminders] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<null | 'restore' | 'signout' | 'manage'>(null);
  const { data: auditions } = useAuditions(isAuthenticated);
  const push = useGuardedPush();

  useFocusEffect(useCallback(() => {
    let alive = true;
    // On from the start: the phone is asked the first time an audition is
    // saved. Off only once the actor has muted it here, or the phone said no.
    Promise.all([notificationsDenied(), remindersMuted()])
      .then(([denied, muted]) => { if (alive) setReminders(!denied && !muted); })
      .catch(() => {});
    return () => { alive = false; };
  }, []));

  // Apple's own sheet takes its time to come up; the row says so meanwhile,
  // and a second tap while it is coming is the same tap.
  const onSubscription = async () => {
    if (!isPaid) { push('/paywall'); return; }
    if (busy) return;
    setBusy('manage');
    try { await manageSubscription(); } finally { setBusy(null); }
  };

  // The switch: on means the phone may knock, the evening before and the
  // morning of, for every audition on the board. It is on from the start,
  // asking the phone the first time it is needed. Off mutes every reminder on
  // the phone; each audition's own switch on its page still stands when it
  // comes back on.
  const onReminders = async (on: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    if (!on) {
      setReminders(false);
      await setRemindersMuted(true);
      return;
    }
    await setRemindersMuted(false);
    const granted = (await hasNotificationPermission()) || (await requestNotificationPermission());
    setReminders(granted);
    if (!granted) {
      Alert.alert('Reminders are off', 'Turn notifications on for Ghost Light in iOS Settings to be reminded the evening before an audition.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
      ]);
      return;
    }
    if (auditions) await syncReminders(auditions);
  };

  const onRestore = async () => {
    setBusy('restore');
    try {
      const ok = await restore();
      Alert.alert(ok ? 'Restored' : 'Nothing to restore', ok ? 'Welcome back.' : 'No purchase found on this account.');
    } finally {
      setBusy(null);
    }
  };

  const onHelp = () => {
    Alert.alert('Help & legal', undefined, [
      { text: 'Privacy Policy', onPress: () => { void WebBrowser.openBrowserAsync(PRIVACY_URL); } },
      { text: 'Terms of Service', onPress: () => { void WebBrowser.openBrowserAsync(TERMS_URL); } },
      { text: 'Restore purchases', onPress: () => { void onRestore(); } },
      { text: 'Contact support', onPress: () => { void Linking.openURL(`mailto:${MAKER.email}`); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Confirm first, then say what happens: signing out of a library app looks
  // like it might take your saves with it, and it does not.
  const [askingOut, setAskingOut] = useState(false);
  const onSignOut = () => { Haptics.selectionAsync().catch(() => {}); setAskingOut(true); };
  const signOut = async () => {
    setBusy('signout');
    try {
      // The cache clear and the fresh anonymous session are handled by the SIGNED_OUT listener in app/_layout.tsx.
      await supabase.auth.signOut();
      setAskingOut(false);
      if (router.canDismiss()) router.dismissAll();
      else router.replace('/');
    } finally {
      setBusy(null);
    }
  };

  const email = session?.user.email ?? null;
  const planValue = !isPaid ? 'Free' : sub?.plan === 'annual' ? 'Annual' : sub?.plan === 'monthly' ? 'Monthly' : 'Premium';
  const version = Application.nativeApplicationVersion ?? '';

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <BackHeader label="You" onPress={goBack} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontFamily: SERIF, fontSize: 42, lineHeight: 46, letterSpacing: -0.5, color: c.foreground }}>Settings</Text>

          <Group label="APPEARANCE" />
          <Appearance />

          <Group label="ACCOUNT" />
          <Row label="Subscription" value={busy === 'manage' ? 'Opening…' : planValue} lit onPress={() => { void onSubscription(); }} busy={busy === 'manage'} />
          {isAuthenticated ? (
            <Row label="Email & sign-in" value={email ?? 'Apple'} onPress={() => push('/settings/signin')} />
          ) : (
            <Row label="Email & sign-in" value="Sign in" lit onPress={() => push('/auth')} />
          )}
          <SwitchRow label="Audition reminders" on={Boolean(reminders)} onChange={(on) => { void onReminders(on); }} last />

          <Group label="GHOST LIGHT" />
          <Row label="Help & legal" onPress={onHelp} busy={busy === 'restore'} />
          <Row label="What is ActorRise?" onPress={() => { track('app_about_actorrise', { from: 'settings', visited: false }); setAbout(true); }} />
          <Row label="Rate Ghost Light" onPress={() => { track('app_review_prompted', { from: 'settings' }); void rateGhostLight({ inApp: false }); }} last />

          {/* From the maker: a note, and two doors. */}
          <View style={{ marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 24, color: c.accentText }}>{MAKER.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: MONO_I, fontSize: 12, letterSpacing: 0.3, color: c.mutedForeground }}>(from the maker.)</Text>
              <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: c.foreground }}>An actor building this alone. Say hi.</Text>
            </View>
            <Door icon="logo-instagram" label="Instagram" onPress={openInstagram} />
            <Door icon="mail-outline" label={`Email ${MAKER.email}`} onPress={() => emailMaker('Ghost Light')} />
          </View>

          <View style={{ flexGrow: 1 }} />
          <View style={{ marginTop: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {isAuthenticated ? (
              <Pressable onPress={onSignOut} disabled={busy === 'signout'} hitSlop={10} accessibilityRole="button" accessibilityState={{ busy: busy === 'signout' }}>
                <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.accentText, opacity: busy === 'signout' ? 0.5 : 1 }}>Sign out</Text>
              </Pressable>
            ) : <View />}
            <Text style={{ fontFamily: MONO_I, fontSize: 12, letterSpacing: 0.3, color: c.chevron }}>{`(v${version} · ghost light.)`}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
      <AboutActorRiseSheet open={about} onClose={() => setAbout(false)} from="account" />
      <ConfirmSheet
        open={askingOut}
        title="Sign"
        accent="out?"
        body="Your book, your board and your scenes stay on your account. Sign back in any time and they are where you left them."
        confirm="Sign out"
        busy={busy === 'signout'}
        onConfirm={() => { void signOut(); }}
        onCancel={() => setAskingOut(false)}
      />
    </View>
  );
}

function Group({ label }: { label: string }) {
  const { colors: c } = useTheme();
  return <Text style={{ marginTop: 26, marginBottom: 6, fontFamily: SANS_X, fontSize: 10, letterSpacing: 2, color: c.chevron }}>{label}</Text>;
}

/** One line per setting: the label, its state before the chevron. */
/** A row with a switch at its end: the label, the switch, nothing to open. */
function SwitchRow({ label, on, onChange, last }: { label: string; on: boolean; onChange: (on: boolean) => void; last?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.divider }}>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: SANS, fontSize: 15, color: c.foreground }}>{label}</Text>
      <Switch value={on} onValueChange={onChange} trackColor={{ true: c.accentText, false: c.divider }} thumbColor="#fff" ios_backgroundColor={c.divider} accessibilityLabel={label} />
    </View>
  );
}

function Row({ label, value, lit, onPress, busy, last }: { label: string; value?: string; lit?: boolean; onPress: () => void; busy?: boolean; last?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(busy) }}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 17, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.divider }}
    >
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: SANS, fontSize: 15, color: c.foreground }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {value ? <Text numberOfLines={1} style={{ fontFamily: SANS, fontSize: 13, color: lit ? c.accentText : c.mutedForeground, opacity: busy ? 0.5 : 1 }}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={15} color={c.chevron} />
      </View>
    </Pressable>
  );
}

/** System / Dark / Light, one segmented control, the gel on the one that is on. */
function Appearance() {
  const { mode, setMode, colors: c } = useTheme();
  const opts: { k: ThemeMode; label: string }[] = [
    { k: 'system', label: 'System' },
    { k: 'dark', label: 'Dark' },
    { k: 'light', label: 'Light' },
  ];
  return (
    <View style={{ marginTop: 8, flexDirection: 'row', padding: 4, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.panel }}>
      {opts.map(o => {
        const active = mode === o.k;
        return (
          <Pressable
            key={o.k}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setMode(o.k); }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.yellow : 'transparent' }}
          >
            <Text style={{ fontFamily: SANS_B, fontSize: 13, color: active ? c.ink : c.mutedForeground }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A round outlined button holding one glyph: a door, not a row. */
function Door({ icon, label, onPress }: { icon: 'logo-instagram' | 'mail-outline'; label: string; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: pressed ? c.foreground : c.border, alignItems: 'center', justifyContent: 'center' })}>
      <Ionicons name={icon} size={17} color={c.mutedForeground} />
    </Pressable>
  );
}

/** "canberk…@gmail.com": enough to know which account, not enough to read over a shoulder. */
export function maskEmail(email: string): string {
  if (email.endsWith('@privaterelay.appleid.com')) return 'Apple relay';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const head = local.length <= 3 ? local : local.slice(0, Math.min(7, local.length - 1));
  return `${head}…@${domain}`;
}
