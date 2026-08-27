import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { WordArrow } from '../src/components/WordArrow';
import { useStageMotion } from '../src/hooks/useStageMotion';
import {
  isAppleAuthAvailable,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../src/lib/auth';
import { useGoBack } from '../src/lib/nav';
import { colors } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * Sign-in — the stage door (handoff §6). A sheet at the first save, never at
 * launch; it upgrades the same anonymous user so saves and read count survive.
 * A list of ways in, hairline-separated, each row nudging right on press. The
 * Apple slab is the only rectangle. Email folds out in place, never a new screen.
 */
export default function Auth() {
  const router = useRouter();
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState<null | 'apple' | 'google' | 'email'>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // True while a field holds focus. React state, not a shared value, because
  // it mounts and unmounts a subtree — twice per session, never per frame.
  const [typing, setTyping] = useState(false);
  // Set when Supabase says the credentials match no user. We don't create the
  // account off the back of that on our own — see signInWithEmail for why the
  // same error also means "wrong password" — so this offers instead.
  const [offerSignUp, setOfferSignUp] = useState(false);

  useEffect(() => {
    isAppleAuthAvailable().then(setAppleReady).catch(() => setAppleReady(false));
  }, []);

  const done = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/search');
  };

  const withApple = async () => {
    setBusy('apple');
    setError(null);
    const res = await signInWithApple();
    setBusy(null);
    if (res.ok) done();
    else if (!res.canceled) setError(res.message ?? 'Could not sign in.');
  };

  const withGoogle = async () => {
    setBusy('google');
    setError(null);
    const res = await signInWithGoogle();
    setBusy(null);
    if (res.ok) done();
    else if (!res.canceled) setError(res.message ?? 'Could not sign in.');
  };

  const withEmail = async () => {
    if (!email.trim() || !password) return;
    setBusy('email');
    setError(null);
    setOfferSignUp(false);
    const res = await signInWithEmail(email, password);
    setBusy(null);
    if (res.ok) {
      done();
      return;
    }
    if (res.noAccount) {
      // Don't dead-end a new user on "Invalid login credentials" — which is
      // what email did until now, with no signup path anywhere in the app.
      setError('No account with that address, or the password is wrong.');
      setOfferSignUp(true);
      return;
    }
    setError(res.message ?? 'Could not sign in.');
  };

  const createAccount = async () => {
    if (!email.trim() || password.length < 6) {
      setError('Pick a password of at least six characters.');
      return;
    }
    setBusy('email');
    setError(null);
    const res = await signUpWithEmail(email, password);
    setBusy(null);
    if (res.ok) {
      setOfferSignUp(false);
      done();
      return;
    }
    setError(res.message ?? 'Could not create the account.');
  };

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* The email fields live in the bottom block, which the keyboard covered
            outright. Padding behaviour lets the centred hero above (flex: 1)
            give up its height instead, carrying the inputs up with it. */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 24 }}>
          <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button">
            <Text
              style={{ fontFamily: 'Montserrat_500Medium', fontSize: 13, letterSpacing: 4.5, textTransform: 'uppercase', color: c.mutedForeground }}
            >
              Not now
            </Text>
          </Pressable>
        </View>

        {/* The hero is a header that yields, not a half-screen that fights.
            It was `flex: 1` centred, which on a small phone in landscape-ish
            keyboard conditions left the sign-in rows with nowhere to be. Now it
            takes the room that's spare and gives it all back the moment the
            keyboard is up, so the ways in are always the thing you can see. */}
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
        {/* The hero leaves entirely once the keyboard is up. Shrinking it wasn't
            enough — a 30pt lamp plus a 24pt headline is still ~90pt, which is
            precisely the room ENTER and (back.) needed, so they sat jammed under
            the keyboard with nothing between them and the fields. While you are
            typing, the only things that matter are the two fields and the way
            in; everything decorative gets out of the way and comes back when
            you dismiss the keyboard. */}
        {typing ? null : (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(140)}
            layout={LinearTransition.duration(220)}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 36,
              paddingVertical: emailOpen ? 8 : 20,
            }}
          >
            <GhostLight size={emailOpen ? 34 : 66} />
            <Text
              className="text-center text-foreground"
              style={{
                marginTop: emailOpen ? 16 : 28,
                fontFamily: 'PlayfairDisplay_600SemiBold',
                fontSize: emailOpen ? 26 : 40,
                lineHeight: emailOpen ? 32 : 46,
              }}
            >
              Keep this one.
            </Text>
            {emailOpen ? null : (
              <StageDirection className="mt-3">
                {'(sign in to save.\nnothing you did is lost.)'}
              </StageDirection>
            )}
          </Animated.View>
        )}

        <Animated.View layout={LinearTransition.duration(220)} style={{ paddingHorizontal: 28, paddingBottom: 32 }}>
          {/* The Apple slab — the one rectangle Apple's guidelines require. */}
          {Platform.OS === 'ios' && appleReady ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              // WHITE on the dark stage, BLACK on paper. A white slab on cream
              // is a rectangle you have to hunt for, and this is the button
              // Apple requires to be the prominent one.
              buttonStyle={
                c.isLight
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              }
              cornerRadius={14}
              style={{ height: 54, width: '100%', marginBottom: 6 }}
              onPress={withApple}
            />
          ) : null}

          {/* The rest — hairline rows, nudging right on press. */}
          <WayRow label="Continue with Google" onPress={withGoogle} busy={busy === 'google'} />

          {/* Email folds out in place. Entering/exiting rather than a hard swap,
              because the block appearing instantly under your finger reads as a
              mis-tap, and `layout` lets the rows beneath slide rather than jump.
              Enter sits directly under the password field — it used to be below
              the fold with two more rows after it, so signing in meant typing a
              password and then hunting for the button. */}
          {emailOpen ? (
            <Animated.View
              entering={FadeInDown.duration(220).easing(Easing.out(Easing.cubic))}
              exiting={FadeOutUp.duration(160)}
              layout={LinearTransition.duration(200)}
              style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.divider }}
            >
              <UnderlineField
                value={email}
                onChangeText={(t) => { setEmail(t); setOfferSignUp(false); }}
                placeholder="email"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                autoFocus
                returnKeyType="next"
                onFocusChange={setTyping}
              />
              <UnderlineField
                value={password}
                onChangeText={(t) => { setPassword(t); setOfferSignUp(false); }}
                placeholder="password"
                secureTextEntry
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={withEmail}
                onFocusChange={setTyping}
                style={{ marginTop: 14 }}
              />
              <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable onPress={() => setEmailOpen(false)} hitSlop={10} accessibilityRole="button">
                  <Text
                    style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, color: c.chevron }}
                  >
                    (back.)
                  </Text>
                </Pressable>
                {busy === 'email' ? (
                  <ActivityIndicator color={colors.stageGlow} />
                ) : (
                  <WordArrow label="Enter" onPress={withEmail} haptic="none" />
                )}
              </View>
            </Animated.View>
          ) : (
            <Animated.View layout={LinearTransition.duration(200)}>
              <WayRow label="Use an email address" onPress={() => setEmailOpen(true)} />
            </Animated.View>
          )}

          {/* Hidden while the fields are out: it opens the same fold, so leaving
              it there just pushed Enter further down for no reason. */}
          {emailOpen ? null : (
            <WayRow label="(already on actorrise? connect it.)" quiet onPress={() => setEmailOpen(true)} last />
          )}

          {busy === 'apple' ? (
            <View style={{ alignItems: 'center' }} className="mt-4">
              <ActivityIndicator color={colors.stageGlow} />
            </View>
          ) : null}

          {error ? (
            <Text className="mt-4 text-center text-[13px]" style={{ fontFamily: 'Montserrat_400Regular', color: colors.primary }}>
              {error}
            </Text>
          ) : null}

          {offerSignUp ? (
            <Animated.View entering={FadeInDown.duration(200)} style={{ marginTop: 14, alignItems: 'center' }}>
              <WordArrow label="Create one" onPress={createAccount} haptic="none" />
              <Text
                style={{
                  marginTop: 8,
                  fontFamily: 'CourierPrime_400Regular_Italic',
                  fontSize: 12,
                  textAlign: 'center',
                  color: c.mutedForeground,
                }}
              >
                (this address, that password. your saves come with you.)
              </Text>
            </Animated.View>
          ) : null}
        </Animated.View>
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** A way in — a hairline row that nudges right on press. */
function WayRow({
  label,
  onPress,
  busy,
  quiet,
  last,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  quiet?: boolean;
  last?: boolean;
}) {
  const { colors: c } = useTheme();
  const nudge = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.value }] }));
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      onPressIn={() => (nudge.value = withTiming(6, { duration: 120 }))}
      onPressOut={() => (nudge.value = withTiming(0, { duration: 220 }))}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 17,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.divider,
      }}
    >
      <Animated.Text
        style={[
          style,
          quiet
            ? { fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 14, color: c.chevron }
            : { fontFamily: 'Montserrat_500Medium', fontSize: 15, color: c.foreground },
        ]}
      >
        {label}
      </Animated.Text>
      {busy ? <ActivityIndicator color={c.mutedForeground} /> : null}
    </Pressable>
  );
}

/** An underlined field whose rule lights amber on focus. */
function UnderlineField({
  style,
  onFocusChange,
  ...props
}: React.ComponentProps<typeof TextInput> & { style?: object; onFocusChange?: (v: boolean) => void }) {
  const { colors: c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      onFocus={() => {
        setFocused(true);
        onFocusChange?.(true);
      }}
      onBlur={() => {
        setFocused(false);
        onFocusChange?.(false);
      }}
      placeholderTextColor={c.mutedForeground}
      selectionColor={colors.stageGlow}
      style={[
        {
          height: 40,
          borderBottomWidth: 1,
          borderBottomColor: focused ? colors.stageGlow : c.border,
          color: c.foreground,
          fontFamily: 'Montserrat_400Regular',
          fontSize: 16,
          paddingHorizontal: 2,
        },
        style,
      ]}
    />
  );
}
