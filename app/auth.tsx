import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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
    const res = await signInWithEmail(email, password);
    setBusy(null);
    if (res.ok) done();
    else setError(res.message ?? 'Could not sign in.');
  };

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 24 }}>
          <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button">
            <Text
              style={{ fontFamily: 'Montserrat_500Medium', fontSize: 13, letterSpacing: 4.5, textTransform: 'uppercase', color: colors.dark.mutedForeground }}
            >
              Not now
            </Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <GhostLight size={66} />
          <Text
            className="mt-7 text-center text-foreground"
            style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 40, lineHeight: 46 }}
          >
            Keep this one.
          </Text>
          <StageDirection className="mt-3">
            {'(sign in to save.\nnothing you did is lost.)'}
          </StageDirection>
        </View>

        <View style={{ paddingHorizontal: 28, paddingBottom: 32 }}>
          {/* The Apple slab — the one rectangle Apple's guidelines require. */}
          {Platform.OS === 'ios' && appleReady ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={14}
              style={{ height: 54, width: '100%', marginBottom: 6 }}
              onPress={withApple}
            />
          ) : null}

          {/* The rest — hairline rows, nudging right on press. */}
          <WayRow label="Continue with Google" onPress={withGoogle} busy={busy === 'google'} />

          {emailOpen ? (
            <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.dark.divider }}>
              <UnderlineField
                value={email}
                onChangeText={setEmail}
                placeholder="email"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <UnderlineField
                value={password}
                onChangeText={setPassword}
                placeholder="password"
                secureTextEntry
                autoComplete="password"
                onSubmitEditing={withEmail}
                style={{ marginTop: 14 }}
              />
              <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, color: colors.dark.chevron }}>
                  (forgot it.)
                </Text>
                {busy === 'email' ? (
                  <ActivityIndicator color={colors.stageGlow} />
                ) : (
                  <WordArrow label="Enter" onPress={withEmail} haptic="none" />
                )}
              </View>
            </View>
          ) : (
            <WayRow label="Use an email address" onPress={() => setEmailOpen(true)} />
          )}

          <WayRow label="(already on actorrise? connect it.)" quiet onPress={() => setEmailOpen(true)} last />

          {busy === 'apple' ? (
            <View className="mt-4 items-center">
              <ActivityIndicator color={colors.stageGlow} />
            </View>
          ) : null}

          {error ? (
            <Text className="mt-4 text-center text-[13px]" style={{ fontFamily: 'Montserrat_400Regular', color: colors.primary }}>
              {error}
            </Text>
          ) : null}
        </View>
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
        borderBottomColor: colors.dark.divider,
      }}
    >
      <Animated.Text
        style={[
          style,
          quiet
            ? { fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 14, color: colors.dark.chevron }
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
  ...props
}: React.ComponentProps<typeof TextInput> & { style?: object }) {
  const { colors: c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
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
