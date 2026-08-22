import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageButton } from '../src/components/StageButton';
import { StageDirection } from '../src/components/StageDirection';
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
 * Step 5 — Auth. Presented as a sheet when the actor makes their first save,
 * not at launch. It keeps their anonymous saves and read count by upgrading the
 * same user (spec §5). Apple is native and mandatory; Google goes through the
 * OAuth redirect.
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
    // Back to whatever they were doing (the save that sent them here).
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
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 20 }}>
          <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button">
            <Text
              className="text-[13px] uppercase tracking-[1.5px] text-muted-foreground"
              style={{ fontFamily: 'Montserrat_500Medium' }}
            >
              Not now
            </Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <GhostLight size={18} stem stemHeight={48} />
          <Text
            className="mt-8 text-center text-[30px] leading-[38px] text-foreground"
            style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
          >
            Keep this one.
          </Text>
          <StageDirection className="mt-3">(sign in to save. nothing you did is lost.)</StageDirection>
        </View>

        <View style={{ paddingHorizontal: 36, paddingBottom: 32 }}>
          {Platform.OS === 'ios' && appleReady ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={16}
              style={{ height: 52, width: '100%' }}
              onPress={withApple}
            />
          ) : null}

          <Pressable
            onPress={withGoogle}
            disabled={busy !== null}
            accessibilityRole="button"
            style={{ marginTop: 12, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}
          >
            {busy === 'google' ? (
              <ActivityIndicator color={c.foreground} />
            ) : (
              <Text
                className="text-[15px] text-foreground"
                style={{ fontFamily: 'Montserrat_600SemiBold' }}
              >
                Continue with Google
              </Text>
            )}
          </Pressable>

          {/* Connect an existing ActorRise account (same Supabase as the web). */}
          {emailOpen ? (
            <View style={{ marginTop: 18 }}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="ActorRise email"
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                selectionColor={colors.stageGlow}
                className="text-[15px] text-foreground"
                style={{ height: 52, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, paddingHorizontal: 18, fontFamily: 'Montserrat_400Regular' }}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={c.mutedForeground}
                secureTextEntry
                autoComplete="password"
                onSubmitEditing={withEmail}
                selectionColor={colors.stageGlow}
                className="text-[15px] text-foreground"
                style={{ height: 52, marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, paddingHorizontal: 18, fontFamily: 'Montserrat_400Regular' }}
              />
              <View style={{ marginTop: 12 }}>
                <StageButton onPress={withEmail} disabled={busy === 'email'}>
                  {busy === 'email' ? (
                    <ActivityIndicator color={colors.stageGlow} />
                  ) : (
                    <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 14, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.stageGlow }}>
                      Sign in
                    </Text>
                  )}
                </StageButton>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setEmailOpen(true)} hitSlop={10} style={{ marginTop: 18, alignItems: 'center' }} accessibilityRole="button">
              <StageDirection>(connect your actorrise account.)</StageDirection>
            </Pressable>
          )}

          {busy === 'apple' ? (
            <View className="mt-4 items-center">
              <ActivityIndicator color={colors.stageGlow} />
            </View>
          ) : null}

          {error ? (
            <Text
              className="mt-4 text-center text-[13px]"
              style={{ fontFamily: 'Montserrat_400Regular', color: colors.primary }}
            >
              {error}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
