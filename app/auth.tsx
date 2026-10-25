import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { LabelledField } from '../src/components/LabelledField';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { AboutActorRiseSheet } from '../src/components/AboutActorRiseSheet';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { enterCode, isAppleAuthAvailable, sendCode, signInWithApple, signInWithGoogle } from '../src/lib/auth';
import { useGoBack } from '../src/lib/nav';
import { track } from '../src/lib/analytics';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';

const CODE_LENGTH = 6;
/** Supabase sends one code a minute to an address; the page counts it down rather than letting a tap fail. */
const RESEND_AFTER = 60;

/**
 * Sign in. One page, read from the top: the name of the thing, Apple, Google,
 * and one address under a hairline. The address gets a six-digit code by
 * email, and typing it back is the whole of signing in: a new actor and a
 * returning one go through the same door, since the code makes the account
 * when there is none. No password, nothing to forget, nothing to create.
 *
 * The page never reflows for the keyboard: it starts at the top, so the
 * field sits in the upper half of any phone, and the scroll view takes the
 * keyboard as an inset. The code page is the same page with the headline
 * changed, so the move from one to the other is a fade and not a lurch.
 */
export default function Auth() {
  const router = useRouter();
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState<null | 'apple' | 'google' | 'email'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [about, setAbout] = useState(false);

  useEffect(() => {
    isAppleAuthAvailable().then(setAppleReady).catch(() => setAppleReady(false));
  }, []);

  // The minute until another code may be asked for.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const done = (method: 'apple' | 'google' | 'email') => {
    track('signed_in', { method });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/search');
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

  const askForCode = async (again = false) => {
    const address = email.trim();
    if (!address) { setError('An address first.'); return; }
    setBusy('email');
    clear();
    const res = await sendCode(address);
    setBusy(null);
    if (!res.ok) { setError(res.message ?? 'Could not send the code.'); return; }
    Haptics.selectionAsync().catch(() => {});
    setSentTo(address.toLowerCase());
    setCode('');
    setWait(RESEND_AFTER);
    if (again) setNotice('Another code is on its way.');
  };

  const checkCode = async (value: string) => {
    if (!sentTo || value.length < CODE_LENGTH) return;
    setBusy('email');
    clear();
    const res = await enterCode(sentTo, value);
    setBusy(null);
    if (res.ok) { done('email'); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setCode('');
    setError(res.message ?? 'Could not check the code.');
  };

  const anotherAddress = () => {
    Haptics.selectionAsync().catch(() => {});
    clear();
    setSentTo(null);
    setCode('');
  };

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
          contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 10, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          {sentTo ? (
            <Animated.View key="code" entering={FadeIn.duration(260)}>
              <Text style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 46, letterSpacing: -0.5, color: c.foreground }}>
                Check <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>your mail.</Text>
              </Text>
              <StageDirection style={{ marginTop: 8 }}>(a six-digit code went to {sentTo}.)</StageDirection>

              <CodeCells value={code} busy={busy === 'email'} onChange={(v) => { clear(); setCode(v); if (v.length === CODE_LENGTH) void checkCode(v); }} />

              <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable onPress={() => { if (wait <= 0 && !busy) void askForCode(true); }} hitSlop={10} accessibilityRole="button" disabled={wait > 0 || Boolean(busy)}>
                  <Text style={{ fontFamily: SANS, fontSize: 13, color: c.mutedForeground }}>
                    {wait > 0 ? `Another code in ${wait}s` : <Text style={{ fontFamily: SANS_B, color: c.accentText }}>Send another</Text>}
                  </Text>
                </Pressable>
                <Pressable onPress={anotherAddress} hitSlop={10} accessibilityRole="button">
                  <Text style={{ fontFamily: SANS, fontSize: 13, color: c.mutedForeground, textDecorationLine: 'underline' }}>Another address</Text>
                </Pressable>
              </View>
              <StageDirection style={{ marginTop: 14 }}>(not there? the spam folder, or a minute.)</StageDirection>
            </Animated.View>
          ) : (
            <Animated.View key="address" entering={FadeIn.duration(260)}>
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

              {/* The hairline, with "or" sat in it, and the one field under it. */}
              <View style={{ marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: c.divider }} />
                <Text style={{ fontFamily: MONO_I, fontSize: 12, letterSpacing: 0.6, color: c.mutedForeground }}>or with email</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: c.divider }} />
              </View>

              <LabelledField
                label="Email"
                value={email}
                onChangeText={(t) => { setEmail(t); clear(); }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={() => { if (!busy) void askForCode(); }}
                style={{ marginTop: 20 }}
              />

              {busy === 'email' ? (
                <View style={{ height: 54, marginTop: 24, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={c.accentText} />
                </View>
              ) : (
                <PrimaryPill label="Email me a code" onPress={() => { void askForCode(); }} height={54} block haptic="medium" style={{ marginTop: 24 }} />
              )}
              <StageDirection style={{ marginTop: 14 }}>(new here or back again, the same door. no password.)</StageDirection>
            </Animated.View>
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
            <StageDirection>(actorrise accounts work here too. what is actorrise?)</StageDirection>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
      <AboutActorRiseSheet open={about} onClose={() => setAbout(false)} from="auth" />
    </View>
  );
}

/**
 * Six cells for the code, over one invisible field that does the typing: the
 * keyboard is the number pad, the phone offers the code from the mail above
 * it, and the cell being filled carries the accent. Tapping the row brings
 * the keyboard back.
 */
function CodeCells({ value, busy, onChange }: { value: string; busy: boolean; onChange: (v: string) => void }) {
  const { colors: c } = useTheme();
  const input = useRef<TextInput>(null);
  const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
  const at = Math.min(digits.length, CODE_LENGTH - 1);
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityRole="none" style={{ marginTop: 26 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const filled = i < digits.length;
          const live = i === at && !busy;
          return (
            <View
              key={i}
              style={{
                flex: 1, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                borderWidth: live ? 1.5 : 1, borderColor: live ? c.accentText : filled ? c.foreground : c.divider,
                backgroundColor: c.panel, opacity: busy ? 0.6 : 1,
              }}
            >
              <Text style={{ fontFamily: MONO, fontSize: 26, color: c.foreground }}>{digits[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={digits}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        editable={!busy}
        maxLength={CODE_LENGTH}
        caretHidden
        accessibilityLabel="The six-digit code"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.01, fontSize: 1, color: 'transparent' }}
      />
      {busy ? (
        <View style={{ marginTop: 16, alignItems: 'center' }}>
          <ActivityIndicator color={c.accentText} />
        </View>
      ) : null}
    </Pressable>
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
