import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import {
  getCurrentOffering,
  isPurchasesConfigured,
  purchase,
  restore,
} from '../src/lib/purchases';
import { colors } from '../src/theme/tokens';

/**
 * Step 7 — the paywall. The product decision the whole app is built around, so
 * it is built last and slowly. The bulb comes back up carrying the offer:
 * annual pushed, monthly secondary, and the promise of every monologue.
 *
 * This is the offer surface. The full spec §5 sequence — on the 4th read the
 * lit lines dim under a Skia gradient mask before the bulb returns — is the
 * transition *into* this screen and is wired once the server-side read counter
 * exists (spec §4 #2); the counter, not the client, decides when to fire.
 *
 * Live prices come from RevenueCat when it is configured; otherwise the static
 * $29.99 / $4.99 copy stands so the screen is never empty. "Restore Purchases"
 * is present because Apple requires it — omitting it is a guaranteed rejection.
 */

const BULLETS = [
  'Every monologue, all 10,863',
  'Unlimited saves',
  'Memorize mode',
  'Record yourself',
  'Works offline',
];

type Plan = 'annual' | 'monthly';

export default function Paywall() {
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const [plan, setPlan] = useState<Plan>('annual');
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    getCurrentOffering().then(setOffering).catch(() => setOffering(null));
  }, []);

  const annualPkg = offering?.annual ?? null;
  const monthlyPkg = offering?.monthly ?? null;
  const annualPrice = annualPkg?.product.priceString ?? '$29.99';
  const monthlyPrice = monthlyPkg?.product.priceString ?? '$4.99';

  const close = () => (router.canGoBack() ? router.back() : router.replace('/search'));

  const buy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const pkg: PurchasesPackage | null = plan === 'annual' ? annualPkg : monthlyPkg;
    if (!isPurchasesConfigured() || !pkg) {
      setNote('Purchases aren’t configured yet in this build.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const entitled = await purchase(pkg);
      if (entitled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        close();
      }
    } catch (e) {
      const err = e as { userCancelled?: boolean; message?: string };
      if (!err.userCancelled) setNote(err.message ?? 'Purchase failed.');
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    setBusy(true);
    setNote(null);
    try {
      const entitled = await restore();
      setNote(entitled ? 'Restored. Welcome back.' : 'Nothing to restore on this account.');
      if (entitled) close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1">
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <View className="h-12 flex-row items-center justify-end px-5">
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text className="text-[22px]" style={{ color: colors.dark.mutedForeground }}>
              ✕
            </Text>
          </Pressable>
        </View>

        <View className="flex-1 justify-center px-8">
          <View className="items-center">
            <GhostLight size={20} />
            <Text
              className="mt-6 text-center text-[32px] leading-[38px] text-foreground"
              style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
            >
              The whole stage.
            </Text>
            <StageDirection className="mt-3">(three reads were the trial.)</StageDirection>
          </View>

          <View className="mt-8">
            {BULLETS.map((b) => (
              <View key={b} className="mb-2.5 flex-row items-center">
                <Text style={{ color: colors.stageGlow }} className="mr-3 text-[15px]">
                  ●
                </Text>
                <Text
                  className="text-[15px] text-foreground"
                  style={{ fontFamily: 'Montserrat_400Regular' }}
                >
                  {b}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-8 gap-3">
            <PlanRow
              selected={plan === 'annual'}
              onPress={() => setPlan('annual')}
              title="Annual"
              price={annualPrice}
              caption="best value · billed yearly"
              badge="save"
            />
            <PlanRow
              selected={plan === 'monthly'}
              onPress={() => setPlan('monthly')}
              title="Monthly"
              price={monthlyPrice}
              caption="billed monthly"
            />
          </View>
        </View>

        <View className="px-8 pb-6">
          <Pressable
            onPress={buy}
            disabled={busy}
            accessibilityRole="button"
            className="h-[54px] items-center justify-center rounded-2xl active:opacity-90"
            style={{ backgroundColor: colors.primary }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                className="text-[15px] uppercase tracking-[2px] text-white"
                style={{ fontFamily: 'Montserrat_600SemiBold' }}
              >
                Unlock everything
              </Text>
            )}
          </Pressable>

          {note ? (
            <Text
              className="mt-3 text-center text-[12px]"
              style={{ fontFamily: 'Montserrat_400Regular', color: colors.dark.mutedForeground }}
            >
              {note}
            </Text>
          ) : null}

          <Pressable onPress={onRestore} hitSlop={10} className="mt-3 items-center" accessibilityRole="button">
            <Text
              className="text-[13px] text-muted-foreground"
              style={{ fontFamily: 'Montserrat_500Medium' }}
            >
              Restore Purchases
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function PlanRow({
  selected,
  onPress,
  title,
  price,
  caption,
  badge,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  caption: string;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center rounded-2xl border px-4 py-3.5"
      style={{
        borderColor: selected ? colors.stageGlow : colors.dark.border,
        backgroundColor: selected ? 'rgba(243, 130, 29, 0.10)' : colors.dark.card,
      }}
    >
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text
            className="text-[16px] text-foreground"
            style={{ fontFamily: 'Montserrat_600SemiBold' }}
          >
            {title}
          </Text>
          {badge ? (
            <View className="ml-2 rounded-full px-2 py-0.5" style={{ backgroundColor: colors.primary }}>
              <Text
                className="text-[10px] uppercase tracking-[1px] text-white"
                style={{ fontFamily: 'Montserrat_600SemiBold' }}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          className="mt-0.5 text-[12px] text-muted-foreground"
          style={{ fontFamily: 'Montserrat_400Regular' }}
        >
          {caption}
        </Text>
      </View>
      <Text
        className="text-[18px] text-foreground"
        style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
      >
        {price}
      </Text>
    </Pressable>
  );
}
