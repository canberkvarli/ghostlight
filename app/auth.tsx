import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition,
  SlideInRight,
  SlideOutLeft,
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
  sendPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../src/lib/auth';
import { useGoBack } from '../src/lib/nav';
import { track } from '../src/lib/analytics';
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
  // `typing` used to unmount the hero outright. That deleted the lamp, the
  // headline and the line under it the instant a field took focus — every piece
  // of identity on the screen gone at the exact moment someone is deciding
  // whether to trust it with a password — and because the block below is
  // bottom-anchored, the space it vacated stayed behind as a hole. The hero now
  // collapses to a small header instead of leaving, so there is nothing to
  // leave a hole. Kept as state, not a shared value: it changes twice a session.
  const [typing, setTyping] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  // Set when Supabase says the credentials match no user. We don't create the
  // account off the back of that on our own — see signInWithEmail for why the
  // same error also means "wrong password" — so this offers instead.
  const [offerSignUp, setOfferSignUp] = useState(false);

  useEffect(() => {
    isAppleAuthAvailable().then(setAppleReady).catch(() => setAppleReady(false));
  }, []);

  const done = (method: 'apple' | 'google' | 'email') => {
    track('signed_in', { method });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/search');
  };

  const withApple = async () => {
    setBusy('apple');
    setError(null);
    const res = await signInWithApple();
    setBusy(null);
    if (res.ok) done('apple');
    else if (!res.canceled) setError(res.message ?? 'Could not sign in.');
  };

  const withGoogle = async () => {
    setBusy('google');
    setError(null);
    const res = await signInWithGoogle();
    setBusy(null);
    if (res.ok) done('google');
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
      done('email');
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

  const forgotPassword = async () => {
    if (resetting) return;
    setResetting(true);
    setError(null);
    setNotice(null);
    const res = await sendPasswordReset(email);
    setResetting(false);
    // Deliberately the same words whether or not that address has an account.
    // See sendPasswordReset: this form must not answer "does this person use
    // Ghost Light" for anyone who can type.
    if (res.ok) setNotice('If that address is registered, a reset link is on its way.');
    else setError(res.message ?? 'Could not send the reset link.');
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
      done('email');
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
              style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 13, letterSpacing: 4.5, textTransform: 'uppercase', color: c.mutedForeground }}
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
        {/* Three sizes, not two states. Full when you are choosing a way in,
            medium once the form is out, small while you are typing — and never
            absent, so the screen keeps its name and its lamp the whole way
            down. `flexGrow` goes to 0 while typing: that is what closes the
            hole, because the hero stops claiming the spare height rather than
            being deleted and leaving it behind. */}
        <Animated.View
          layout={LinearTransition.duration(260).easing(Easing.out(Easing.cubic))}
          style={{
            flexGrow: typing ? 0 : 1,
            flexShrink: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 36,
            paddingTop: typing ? 4 : 0,
            paddingVertical: emailOpen && !typing ? 8 : typing ? 0 : 20,
          }}
        >
          <GhostLight size={typing ? 24 : emailOpen ? 34 : 66} />
          <Text
            className="text-center text-foreground"
            style={{
              marginTop: typing ? 8 : emailOpen ? 16 : 28,
              fontFamily: 'InstrumentSerif_400Regular',
              fontSize: typing ? 20 : emailOpen ? 26 : 40,
              lineHeight: typing ? 26 : emailOpen ? 32 : 46,
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

        <Animated.View layout={LinearTransition.duration(260)} style={{ paddingHorizontal: 28, paddingBottom: 32 }}>
          {/* Two states, one stage. The ways in leave to the left and the form
              arrives from the right, so the change reads as travel in a
              direction rather than one block being swapped for another under
              your finger. `(back.)` reverses it, which is why it is the only
              thing on this screen that moves the other way. */}
          {emailOpen ? null : (
            <Animated.View
              entering={SlideInRight.duration(260).easing(Easing.out(Easing.cubic))}
              exiting={SlideOutLeft.duration(200)}
            >
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
                  style={{ height: 54, width: '100%', marginBottom: 10 }}
                  onPress={withApple}
                />
              ) : null}

              {/* Google was bare left-aligned text sitting directly under a
                  black slab, so two things that are peers read as a button and
                  a footnote. It is now the same height and radius, outlined
                  rather than filled — which keeps Apple's the prominent one, as
                  its guidelines require, without demoting Google to a caption. */}
              <OutlineButton
                label="Continue with Google"
                icon="logo-google"
                onPress={withGoogle}
                busy={busy === 'google'}
              />

              <View style={{ height: 8 }} />
              <WayRow label="Use an email address" onPress={() => setEmailOpen(true)} />
              <WayRow label="(already on actorrise? connect it.)" quiet onPress={() => setEmailOpen(true)} last />
            </Animated.View>
          )}

          {emailOpen ? (
            <Animated.View
              entering={SlideInRight.duration(280).easing(Easing.out(Easing.cubic))}
              exiting={FadeOutDown.duration(180)}
              layout={LinearTransition.duration(220)}
            >
              {/* Staggered by 60ms so the two fields arrive in reading order
                  rather than as one slab. Small enough that it registers as
                  weight, not as waiting. */}
              <Animated.View entering={FadeInDown.duration(240).delay(60)}>
                <LabelledField
                  label="Email"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setOfferSignUp(false); setNotice(null); }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="username"
                  autoFocus
                  returnKeyType="next"
                  onFocusChange={setTyping}
                />
              </Animated.View>

              <Animated.View entering={FadeInDown.duration(240).delay(120)}>
                <LabelledField
                  label="Password"
                  value={password}
                  onChangeText={(t) => { setPassword(t); setOfferSignUp(false); setNotice(null); }}
                  secureTextEntry={!reveal}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={withEmail}
                  onFocusChange={setTyping}
                  style={{ marginTop: 22 }}
                  // A reveal toggle is not a luxury on a phone keyboard. Without
                  // it the only way to check a typo is to clear the field and
                  // start again, and the error you get for a wrong password is
                  // the same one you get for no account.
                  accessory={
                    <Pressable
                      onPress={() => setReveal((v) => !v)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
                    >
                      <Ionicons
                        name={reveal ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={c.mutedForeground}
                      />
                    </Pressable>
                  }
                />
              </Animated.View>

              <Animated.View
                entering={FadeIn.duration(240).delay(180)}
                style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Pressable
                  onPress={() => { setEmailOpen(false); setNotice(null); setError(null); }}
                  hitSlop={10}
                  accessibilityRole="button"
                >
                  <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, color: c.chevron }}>
                    (back.)
                  </Text>
                </Pressable>
                {busy === 'email' ? (
                  <ActivityIndicator color={colors.stageGlow} />
                ) : (
                  <WordArrow label="Enter" onPress={withEmail} haptic="none" />
                )}
              </Animated.View>

              <Animated.View entering={FadeIn.duration(240).delay(240)} style={{ marginTop: 18, alignItems: 'center' }}>
                <Pressable onPress={forgotPassword} hitSlop={10} accessibilityRole="button" disabled={resetting}>
                  {resetting ? (
                    <ActivityIndicator color={c.mutedForeground} />
                  ) : (
                    <Text
                      style={{
                        fontFamily: 'BricolageGrotesque_500Medium',
                        fontSize: 12,
                        color: c.mutedForeground,
                        textDecorationLine: 'underline',
                      }}
                    >
                      Forgot your password?
                    </Text>
                  )}
                </Pressable>
              </Animated.View>
            </Animated.View>
          ) : null}

          {notice ? (
            <Animated.Text
              entering={FadeIn.duration(200)}
              className="mt-4 text-center text-[13px]"
              style={{ fontFamily: 'BricolageGrotesque_500Medium', color: c.mutedForeground }}
            >
              {notice}
            </Animated.Text>
          ) : null}

          {busy === 'apple' ? (
            <View style={{ alignItems: 'center' }} className="mt-4">
              <ActivityIndicator color={colors.stageGlow} />
            </View>
          ) : null}

          {error ? (
            <Text className="mt-4 text-center text-[13px]" style={{ fontFamily: 'BricolageGrotesque_500Medium', color: colors.primary }}>
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
            : { fontFamily: 'BricolageGrotesque_500Medium', fontSize: 15, color: c.foreground },
        ]}
      >
        {label}
      </Animated.Text>
      {busy ? <ActivityIndicator color={c.mutedForeground} /> : null}
    </Pressable>
  );
}

/**
 * An outlined button the same size as the Apple slab. Apple's guidelines want
 * their button to be the prominent one, which an outline satisfies — filled
 * beats outlined — while still giving the alternative a real shape to press.
 */
function OutlineButton({
  label,
  icon,
  onPress,
  busy,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  busy?: boolean;
}) {
  const { colors: c } = useTheme();
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: 1 - press.value * 0.35 }));
  return (
    <AnimatedPressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => (press.value = withTiming(1, { duration: 90 }))}
      onPressOut={() => (press.value = withTiming(0, { duration: 200 }))}
      style={[
        style,
        {
          height: 54,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: c.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={c.mutedForeground} />
      ) : (
        <>
          <Ionicons name={icon} size={17} color={c.foreground} style={{ marginRight: 10 }} />
          <Text style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 16, color: c.foreground }}>
            {label}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A field whose label rises out of the way instead of being erased by the first
 * character you type. A placeholder is the label, right up until you need it:
 * once both fields hold text, "email" and "password" are two indistinguishable
 * lines and the only way to check which is which is to clear one.
 *
 * The rule still lights amber on focus. The label moves on the UI thread, so
 * holding a key down never stutters it.
 */
function LabelledField({
  label,
  style,
  onFocusChange,
  accessory,
  value,
  ...props
  // `style` here dresses the wrapping View, not the input, so it has to be
  // taken off TextInput's props before the intersection or it arrives typed as
  // a TextStyle and lands on a View that cannot accept one.
}: Omit<React.ComponentProps<typeof TextInput>, 'style'> & {
  label: string;
  style?: StyleProp<ViewStyle>;
  onFocusChange?: (v: boolean) => void;
  accessory?: React.ReactNode;
}) {
  const { colors: c } = useTheme();
  const [focused, setFocused] = useState(false);
  // Up when focused or filled; down only when empty and untouched, which is the
  // one moment the label is standing in for a placeholder.
  const up = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    const shouldLift = focused || !!value;
    up.value = withTiming(shouldLift ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [focused, value, up]);

  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -up.value * 18 }],
    fontSize: 16 - up.value * 5,
    opacity: 0.55 + up.value * 0.45,
  }));

  return (
    <View style={style}>
      <View style={{ height: 20 }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <TextInput
          {...props}
          value={value}
          onFocus={() => {
            setFocused(true);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            setFocused(false);
            onFocusChange?.(false);
          }}
          selectionColor={colors.stageGlow}
          style={{
            flex: 1,
            height: 34,
            color: c.foreground,
            fontFamily: 'BricolageGrotesque_500Medium',
            fontSize: 16,
            paddingHorizontal: 2,
            paddingBottom: 4,
          }}
        />
        {accessory ? <View style={{ paddingBottom: 8, paddingLeft: 8 }}>{accessory}</View> : null}
      </View>
      <View style={{ height: 1, backgroundColor: focused ? c.accentText : c.border }} />
      {/* Absolute so it can travel over the input without pushing it. */}
      <Animated.Text
        pointerEvents="none"
        style={[
          labelStyle,
          {
            position: 'absolute',
            left: 2,
            bottom: 9,
            fontFamily: 'BricolageGrotesque_500Medium',
            letterSpacing: 0.4,
            color: focused ? c.accentText : c.mutedForeground,
          },
        ]}
      >
        {label}
      </Animated.Text>
    </View>
  );
}
