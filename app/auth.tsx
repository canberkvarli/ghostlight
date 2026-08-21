import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { isAppleAuthAvailable, signInWithApple, signInWithGoogle } from '../src/lib/auth';
import { colors } from '../src/theme/tokens';

/**
 * Step 5 — Auth. Presented as a sheet when the actor makes their first save,
 * not at launch. It keeps their anonymous saves and read count by upgrading the
 * same user (spec §5). Apple is native and mandatory; Google goes through the
 * OAuth redirect.
 */
export default function Auth() {
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState<null | 'apple' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <View className="flex-1">
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View className="h-12 flex-row items-center justify-end px-5">
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text
              className="text-[13px] uppercase tracking-[1.5px] text-muted-foreground"
              style={{ fontFamily: 'Montserrat_500Medium' }}
            >
              Not now
            </Text>
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center px-9">
          <GhostLight size={18} stem stemHeight={48} />
          <Text
            className="mt-8 text-center text-[30px] leading-[38px] text-foreground"
            style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
          >
            Keep this one.
          </Text>
          <StageDirection className="mt-3">(sign in to save. nothing you did is lost.)</StageDirection>
        </View>

        <View className="px-9 pb-8">
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
            className="mt-3 h-[52px] items-center justify-center rounded-2xl border active:opacity-90"
            style={{ borderColor: colors.dark.border, backgroundColor: colors.dark.card }}
          >
            {busy === 'google' ? (
              <ActivityIndicator color={colors.dark.foreground} />
            ) : (
              <Text
                className="text-[15px] text-foreground"
                style={{ fontFamily: 'Montserrat_600SemiBold' }}
              >
                Continue with Google
              </Text>
            )}
          </Pressable>

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
