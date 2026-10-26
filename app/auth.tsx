import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { LabelledField } from '../src/components/LabelledField';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { AboutActorRiseSheet } from '../src/components/AboutActorRiseSheet';
import { useStageMotion } from '../src/hooks/useStageMotion';
import {
  isAppleAuthAvailable,
  sendPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../src/lib/auth';
import { useGoBack } from '../src/lib/nav';
import { track } from '../src/lib/analytics';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const MONO_I = 'CourierPrime_400Regular_Italic';

/**
 * Sign in. One page, read from the top: the name of the thing, Apple, Google,
 * and the email form in full under a hairline, nothing folded away and
 * nothing that has to open. The page never reflows for the keyboard: it
 * starts at the top, so the fields sit in the upper half of any phone, and
 * the scroll view takes the keyboard as an inset and brings the field you
 * are in above it. The old page kept its words at the foot and gave them up
 * to the keyboard with a layout animation, which was the lurch.
 *
 * Two things the form can do, the same two fields: enter, or make an account.
 * "New here?" switches the pill between them; a sign-in that meets no account
 * switches it for you, since Supabase answers the same words for a wrong
 * password and no account at all, and a new actor must not be dead-ended on
 * them.
 */
export default function Auth() {
  const router = useRouter();
  const { next, create } = useLocalSearchParams<{ next?: string; create?: string }>();
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState<null | 'apple' | 'google' | 'email'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [creating, setCreating] = useState(create === '1');
  const [about, setAbout] = useState(false);
  // The field you tap comes up above the keyboard: its place on the page is
  // noted as it lays out, and a focus scrolls there.
  const scroller = useRef<ScrollView>(null);
  const place = useRef<Record<string, number>>({});
  const bring = (key: string) => () => { scroller.current?.scrollTo({ y: Math.max(0, (place.current[key] ?? 0) - 28), animated: true }); };

  useEffect(() => {
    isAppleAuthAvailable().then(setAppleReady).catch(() => setAppleReady(false));
  }, []);

  const [arriving, setArriving] = useState(false);
  const done = (method: 'apple' | 'google' | 'email') => {
    track('signed_in', { method });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // A beat on the lamp, then the room: the move from the form to the app is one fade, not a jump.
    setArriving(true);
    setTimeout(() => {
      if (next) { try { router.dismissAll(); } catch { /* the root */ } router.replace(next as '/welcome'); return; }
      if (router.canGoBack()) router.back();
      else router.replace('/search');
    }, 650);
  };

  const clear = () => { setError(null); setNotice(null); };

  const withApple = async () => {
    setBusy('apple');
    clear();
    const res = await signInWithApple();
    setBusy(null);
    if (res.ok) done('apple');
    else if (!res.canceled) setError(res.message ?? 'Could not sign in.');
  };

  const withGoogle = async () => {
    setBusy('google');
    clear();
    const res = await signInWithGoogle();
    setBusy(null);
    if (res.ok) done('google');
    else if (!res.canceled) setError(res.message ?? 'Could not sign in.');
  };

  const withEmail = async () => {
    if (!email.trim() || !password) { setError('Your address and your password, both.'); return; }
    setBusy('email');
    clear();
    const res = await signInWithEmail(email, password);
    setBusy(null);
    if (res.ok) { done('email'); return; }
    if (res.noAccount) {
      setError('No account with that address, or the password is wrong. New here? Make one below.');
      setCreating(true);
      return;
    }
    setError(res.message ?? 'Could not sign in.');
  };

  const createAccount = async () => {
    if (!email.trim()) { setError('An address first.'); return; }
    if (password.length < 6) { setError('A password of at least six characters.'); return; }
    setBusy('email');
    clear();
    const res = await signUpWithEmail(email, password);
    setBusy(null);
    if (res.ok) { done('email'); return; }
    if (res.pending) { setNotice(res.message ?? 'Confirm the address from the email we sent.'); return; }
    setError(res.message ?? 'Could not create the account.');
  };

  const forgotPassword = async () => {
    if (resetting) return;
    if (!email.trim()) { setError('Type the address first, then tap this.'); return; }
    setResetting(true);
    clear();
    const res = await sendPasswordReset(email);
    setResetting(false);
    // Deliberately the same words whether or not that address has an account:
    // this form must not answer "does this person use Ghost Light" for anyone
    // who can type.
    if (res.ok) setNotice('If that address is registered, a reset link is on its way.');
    else setError(res.message ?? 'Could not send the reset link.');
  };

  const submit = () => { void (creating ? createAccount() : withEmail()); };

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 28 }}>
          <Pressable onPress={goBack} hitSlop={14} accessibilityRole="button" accessibilityLabel="Not now">
            <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>not now</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scroller}
          contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 10, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 46, letterSpacing: -0.5, color: c.foreground }}>
            Keep <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>this one.</Text>
          </Text>
          <StageDirection style={{ marginTop: 8 }}>(sign in to save. nothing you did is lost.)</StageDirection>

          {/* The two slabs. Apple's is the one its guidelines require to be the prominent one. */}
          <View style={{ marginTop: 28, gap: 12 }}>
            {Platform.OS === 'ios' && appleReady ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={c.isLight ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={27}
                style={{ height: 54, width: '100%', opacity: busy === 'apple' ? 0.6 : 1 }}
                onPress={() => { if (!busy) void withApple(); }}
              />
            ) : null}
            <OutlineButton label="Continue with Google" icon="logo-google" onPress={() => { if (!busy) void withGoogle(); }} busy={busy === 'google'} />
          </View>

          {/* The two things the form can do, as two words on one rule: the chosen one carries the rule, like the houses on the curtain. */}
          <View style={{ marginTop: 28, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: c.divider }}>
            {([['in', 'Sign in'], ['new', 'New account']] as const).map(([k, label]) => {
              const on = (k === 'new') === creating;
              return (
                <Pressable key={k} onPress={() => { if (on) return; Haptics.selectionAsync().catch(() => {}); setCreating(k === 'new'); clear(); }} hitSlop={8}
                  accessibilityRole="tab" accessibilityState={{ selected: on }}
                  style={{ paddingBottom: 10, marginRight: 24, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: on ? c.accentText : 'transparent' }}>
                  <Text style={{ fontFamily: on ? SANS_B : SANS, fontSize: 15, color: on ? c.foreground : c.mutedForeground }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View onLayout={(e) => { place.current.email = e.nativeEvent.layout.y; }} />
          <LabelledField
            label="Email"
            onFocus={bring('email')}
            value={email}
            onChangeText={(t) => { setEmail(t); clear(); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            style={{ marginTop: 20 }}
          />
          <View onLayout={(e) => { place.current.password = e.nativeEvent.layout.y; }} />
          <LabelledField
            label="Password"
            onFocus={bring('password')}
            value={password}
            onChangeText={(t) => { setPassword(t); clear(); }}
            secureTextEntry={!reveal}
            autoComplete={creating ? 'new-password' : 'password'}
            textContentType={creating ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={submit}
            style={{ marginTop: 18 }}
            accessory={
              <Pressable onPress={() => setReveal((v) => !v)} hitSlop={12} accessibilityRole="button" accessibilityLabel={reveal ? 'Hide password' : 'Show password'}>
                <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={c.mutedForeground} />
              </Pressable>
            }
          />

          <PrimaryPill label={creating ? 'Create the account' : 'Enter'} onPress={submit} height={46} haptic="medium" style={{ marginTop: 24, alignSelf: 'flex-start', paddingHorizontal: 8 }} />

          {/* Under the pill: the way back for a lost password, or the promise a new account makes. */}
          {creating ? (
            <StageDirection style={{ marginTop: 14, textAlign: 'center' }}>(this address, that password. your saves come with you.)</StageDirection>
          ) : (
            <Pressable onPress={() => { void forgotPassword(); }} hitSlop={10} accessibilityRole="button" disabled={resetting} style={{ alignSelf: 'center', marginTop: 14, paddingVertical: 4 }}>
              {resetting ? <ActivityIndicator color={c.mutedForeground} /> : (
                <Text style={{ fontFamily: SANS, fontSize: 13, color: c.mutedForeground, textDecorationLine: 'underline' }}>Forgot the password?</Text>
              )}
            </Pressable>
          )}

          {error ? (
            <Animated.Text entering={FadeIn.duration(200)} style={{ marginTop: 18, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: c.accentText }}>
              {error}
            </Animated.Text>
          ) : null}
          {notice ? (
            <Animated.Text entering={FadeIn.duration(200)} style={{ marginTop: 18, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: c.mutedForeground }}>
              {notice}
            </Animated.Text>
          ) : null}

          {/* The name above means nothing to someone who found the app on its own. */}
          <Pressable
            onPress={() => { track('app_about_actorrise', { from: 'auth', visited: false }); setAbout(true); }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="What is ActorRise?"
            style={{ marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Ionicons name="help-circle-outline" size={15} color={c.mutedForeground} />
            <StageDirection>(what is actorrise?)</StageDirection>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
      <AboutActorRiseSheet open={about} onClose={() => setAbout(false)} from="auth" />
      {/* While it signs in, the page goes and the house comes up: the lamp, one line. It stays until the room behind it is there. */}
      {busy || arriving ? (
        <Animated.View entering={FadeIn.duration(260)} pointerEvents="auto" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
          <GhostLight size={58} />
          <StageDirection style={{ marginTop: 22 }}>{arriving ? '(the house lights come up.)' : '(finding your seat.)'}</StageDirection>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The same size and shape as Apple's slab, outlined rather than filled, so Apple's stays the prominent one. */
function OutlineButton({ label, icon, onPress, busy }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; busy?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: Boolean(busy) }}
      style={({ pressed }) => ({
        height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: c.foreground,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        opacity: pressed || busy ? 0.6 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={c.foreground} /> : (
        <>
          <Ionicons name={icon} size={18} color={c.foreground} />
          <Text style={{ fontFamily: SANS_B, fontSize: 16, color: c.foreground }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
