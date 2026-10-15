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
  type TextStyle,
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
  FadeOut,
  FadeOutDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { LabelledField } from '../src/components/LabelledField';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
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

/**
 * Sign-in — the stage door (handoff §6). A sheet at the first save, never at
 * launch; it upgrades the same anonymous user so saves and read count survive.
 * A list of ways in, hairline-separated, each row nudging right on press. The
 * Apple slab is the only rectangle. Email folds out in place, never a new screen.
 *
 * v2 notes, because two of them were real bugs on a real phone:
 *
 *  - NOTHING on this screen takes a colour from a `className`. The headline was
 *    `className="text-foreground"`, which resolved to the LIGHT scheme's
 *    #15110f while the stage behind it was the dark scheme's #130b08 — near
 *    black on near black, so the one word that names the screen was invisible.
 *    Every colour here now comes from `useTheme()` through an explicit `style`,
 *    which cannot disagree with the backdrop because both read the same object.
 *
 *  - The hero no longer SHRINKS. It used to interpolate the lamp and the
 *    headline across three sizes as the keyboard came and went, which meant the
 *    top of the screen was permanently in motion while you were trying to type a
 *    password. It now has two compositions: a title card when you are choosing a
 *    way in, and a compact header row once the form is out. It changes role
 *    rather than scale, and once the form is open it does not move again.
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
            outright. Padding behaviour lets the hero above give up its height
            instead, carrying the inputs up with it. */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={{
              height: 48,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingHorizontal: 28,
            }}
          >
            <Pressable onPress={goBack} hitSlop={14} accessibilityRole="button">
              <Text
                style={{
                  fontFamily: 'CourierPrime_700Bold',
                  fontSize: 11,
                  lineHeight: 15,
                  letterSpacing: 2.2,
                  textTransform: 'uppercase',
                  color: c.mutedForeground,
                }}
              >
                Not now
              </Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Two compositions, not three scales. `flexGrow` is what makes the
                swap work: the title card claims every spare point on the screen
                and centres itself in it; the header row claims none, so the
                form rises to meet the keyboard without anything above it
                needing to be resized, faded or deleted. */}
            <Animated.View
              layout={LinearTransition.duration(260).easing(Easing.out(Easing.cubic))}
              style={{
                flexGrow: emailOpen ? 0 : 1,
                flexShrink: 1,
                justifyContent: 'center',
                paddingHorizontal: 30,
                paddingTop: emailOpen ? 6 : 0,
                paddingBottom: emailOpen ? 22 : 24,
              }}
            >
              {emailOpen ? (
                <Animated.View
                  entering={FadeIn.duration(240)}
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                >
                  <GhostLight size={26} />
                  <Headline size={24} line={30} style={{ marginLeft: 12 }} />
                </Animated.View>
              ) : (
                <Animated.View entering={FadeIn.duration(240)} style={{ alignItems: 'center' }}>
                  <GhostLight size={66} />
                  <Headline
                    size={42}
                    line={50}
                    style={{ marginTop: 26, textAlign: 'center' }}
                  />
                  <StageDirection style={{ marginTop: 12, textAlign: 'center' }}>
                    {'(sign in to save.\nnothing you did is lost.)'}
                  </StageDirection>
                </Animated.View>
              )}
            </Animated.View>

            <Animated.View
              layout={LinearTransition.duration(260)}
              style={{ paddingHorizontal: 30, paddingBottom: 30 }}
            >
              {/* Two states, one stage, and they CROSS-FADE. They used to travel:
                  the ways in slid out to the left and the form slid in from the
                  right. On the new architecture a sliding `entering` animation
                  leaves the block's touch area where the slide started, off the
                  right edge of the screen, so nothing inside it could be
                  pressed: Google and the email row were dead on every device
                  while the Apple slab, a native control, kept working. Fades
                  never move the hit area. Nothing in this file may animate a
                  transform on a view that holds something pressable. */}
              {emailOpen ? null : (
                <Animated.View exiting={FadeOut.duration(160)}>
                  {/* The Apple slab — the one rectangle Apple's guidelines
                      require, given the v2 pill radius so it stands in the same
                      family as everything else that gets pressed. */}
                  {Platform.OS === 'ios' && appleReady ? (
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                      // WHITE on the dark stage, BLACK on paper. A white slab on
                      // cream is a rectangle you have to hunt for, and this is
                      // the button Apple requires to be the prominent one.
                      buttonStyle={
                        c.isLight
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                          : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      }
                      cornerRadius={27}
                      style={{ height: 54, width: '100%', marginBottom: 12 }}
                      onPress={withApple}
                    />
                  ) : null}

                  {/* Google is the same size and shape as the slab, outlined
                      rather than filled — which keeps Apple's the prominent one,
                      as its guidelines require, without demoting Google to the
                      bare left-aligned caption it used to be. */}
                  <OutlineButton
                    label="Continue with Google"
                    icon="logo-google"
                    onPress={withGoogle}
                    busy={busy === 'google'}
                  />

                  <View style={{ height: 22 }} />
                  <View style={{ height: 1, backgroundColor: c.divider }} />
                  {/* One row. There used to be a second, "(already on actorrise?
                      connect it.)", which opened this same form: an ActorRise
                      account IS an email account on the same project, so the
                      row promised a connection and delivered a no-op. */}
                  <WayRow
                    label="Use an email address"
                    hint="ActorRise accounts work here too"
                    last
                    onPress={() => setEmailOpen(true)}
                  />
                </Animated.View>
              )}

              {emailOpen ? (
                <Animated.View
                  entering={FadeIn.duration(240)}
                  exiting={FadeOutDown.duration(180)}
                  layout={LinearTransition.duration(220)}
                >
                  {/* Staggered by 60ms so the two fields arrive in reading order
                      rather than as one slab. Small enough that it registers as
                      weight, not as waiting. */}
                  <Animated.View entering={FadeIn.duration(240).delay(60)}>
                    <LabelledField
                      label="Email"
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        setOfferSignUp(false);
                        setNotice(null);
                      }}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      textContentType="username"
                      autoFocus
                      returnKeyType="next"
                    />
                  </Animated.View>

                  <Animated.View entering={FadeIn.duration(240).delay(120)}>
                    <LabelledField
                      label="Password"
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        setOfferSignUp(false);
                        setNotice(null);
                      }}
                      secureTextEntry={!reveal}
                      autoComplete="password"
                      textContentType="password"
                      returnKeyType="go"
                      onSubmitEditing={withEmail}
                      style={{ marginTop: 20 }}
                      // A reveal toggle is not a luxury on a phone keyboard.
                      // Without it the only way to check a typo is to clear the
                      // field and start again, and the error you get for a wrong
                      // password is the same one you get for no account.
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
                    style={{
                      marginTop: 26,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        setEmailOpen(false);
                        setNotice(null);
                        setError(null);
                      }}
                      hitSlop={14}
                      accessibilityRole="button"
                    >
                      <Text
                        style={{
                          fontFamily: 'CourierPrime_400Regular_Italic',
                          fontSize: 13,
                          lineHeight: 18,
                          color: c.chevron,
                        }}
                      >
                        (back.)
                      </Text>
                    </Pressable>
                    {busy === 'email' ? (
                      <ActivityIndicator color={c.accentText} />
                    ) : (
                      <PrimaryPill label="Enter" onPress={withEmail} height={50} haptic="medium" />
                    )}
                  </Animated.View>

                  <Animated.View
                    entering={FadeIn.duration(240).delay(240)}
                    style={{ marginTop: 20, alignItems: 'center' }}
                  >
                    <Pressable
                      onPress={forgotPassword}
                      hitSlop={12}
                      accessibilityRole="button"
                      disabled={resetting}
                    >
                      {resetting ? (
                        <ActivityIndicator color={c.mutedForeground} />
                      ) : (
                        <Text
                          style={{
                            fontFamily: 'BricolageGrotesque_500Medium',
                            fontSize: 12,
                            lineHeight: 17,
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
                  style={{
                    marginTop: 16,
                    textAlign: 'center',
                    fontFamily: 'BricolageGrotesque_500Medium',
                    fontSize: 13,
                    lineHeight: 19,
                    color: c.mutedForeground,
                  }}
                >
                  {notice}
                </Animated.Text>
              ) : null}

              {busy === 'apple' ? (
                <View style={{ alignItems: 'center', marginTop: 16 }}>
                  <ActivityIndicator color={c.accentText} />
                </View>
              ) : null}

              {/* The brand orange resolved for the current stage. `colors.primary`
                  straight off the tokens is 4.1:1 on cream, which is under the
                  floor for 13pt — and an error message is the one string on the
                  screen that has to survive being read in a hurry. */}
              {error ? (
                <Text
                  style={{
                    marginTop: 16,
                    textAlign: 'center',
                    fontFamily: 'BricolageGrotesque_500Medium',
                    fontSize: 13,
                    lineHeight: 19,
                    color: c.accentText,
                  }}
                >
                  {error}
                </Text>
              ) : null}

              {offerSignUp ? (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  style={{ marginTop: 18, alignItems: 'center' }}
                >
                  <PrimaryPill
                    label="Create one"
                    onPress={createAccount}
                    height={50}
                    haptic="medium"
                  />
                  <Text
                    style={{
                      marginTop: 12,
                      fontFamily: 'CourierPrime_400Regular_Italic',
                      fontSize: 12,
                      lineHeight: 17,
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

/**
 * The screen's name, in the v2 headline voice: Instrument Serif with the
 * operative phrase in its italic and the house orange.
 *
 * `lineHeight` is passed in beside `fontSize` and is never allowed below about
 * 1.16× it. RN clips a glyph to the line box rather than letting it overhang the
 * way CSS does, so a 42pt Instrument Serif in a 42pt box loses the descender of
 * the "p" in "Keep" — which is exactly the trimming this redesign was asked to
 * stop doing.
 */
function Headline({
  size,
  line,
  style,
}: {
  size: number;
  line: number;
  style?: StyleProp<TextStyle>;
}) {
  const { colors: c } = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: 'InstrumentSerif_400Regular',
          fontSize: size,
          lineHeight: line,
          letterSpacing: -0.5,
          color: c.foreground,
        },
        style,
      ]}
    >
      Keep{' '}
      <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>
        this one.
      </Text>
    </Text>
  );
}

/** A way in — a hairline row that nudges right on press. */
function WayRow({
  label,
  onPress,
  busy,
  quiet,
  last,
  hint,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  quiet?: boolean;
  last?: boolean;
  /** A second, quieter line under the label. */
  hint?: string;
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
      <Animated.View style={[style, { flex: 1 }]}>
        <Text
          style={[
            quiet
              ? {
                  fontFamily: 'CourierPrime_400Regular_Italic',
                  fontSize: 14,
                  lineHeight: 19,
                  color: c.chevron,
                }
              : {
                  fontFamily: 'BricolageGrotesque_500Medium',
                  fontSize: 15,
                  lineHeight: 21,
                  color: c.foreground,
                },
          ]}
        >
          {label}
        </Text>
        {hint ? (
          <Text
            style={{
              marginTop: 2,
              fontFamily: 'CourierPrime_400Regular_Italic',
              fontSize: 12,
              lineHeight: 16,
              color: c.mutedForeground,
            }}
          >
            {hint}
          </Text>
        ) : null}
      </Animated.View>
      {busy ? (
        <ActivityIndicator color={c.mutedForeground} />
      ) : (
        <Ionicons name="chevron-forward" size={15} color={c.chevron} />
      )}
    </Pressable>
  );
}

/**
 * An outlined button the same size and radius as the Apple slab. Apple's
 * guidelines want their button to be the prominent one, which an outline
 * satisfies — filled beats outlined — while still giving the alternative a real
 * shape to press.
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
          borderRadius: 999,
          // 1.5, matching PrimaryPill — a 1pt hairline next to Apple's solid
          // slab reads as a disabled control rather than a peer.
          borderWidth: 1.5,
          borderColor: c.foreground,
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
          <Text
            style={{
              fontFamily: 'BricolageGrotesque_700Bold',
              fontSize: 16,
              lineHeight: 22,
              letterSpacing: 0.2,
              color: c.foreground,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
