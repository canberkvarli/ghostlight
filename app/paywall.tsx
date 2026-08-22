import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { StageButton } from '../src/components/StageButton';
import { useTheme } from '../src/theme/ThemeContext';
import {
  getCurrentOffering,
  isPurchasesConfigured,
  purchase,
  restore,
} from '../src/lib/purchases';
import { colors } from '../src/theme/tokens';

/**
 * The paywall — the product decision the whole app is built around, so it is
 * built last and slowly. Modern and quiet: the bulb returns carrying the offer,
 * a short list of what unlocks, two clean plan cards (annual pushed), one CTA.
 * Restore is present because Apple requires it.
 *
 * Live prices come from RevenueCat when configured; the static $29.99 / $4.99
 * copy stands otherwise so the screen is never empty.
 */

const FEATURES = [
  'Every monologue — all 10,863',
  'Memorize mode & copy any speech',
  'Hide the overdone ones',
  'Unlimited saves, works offline',
];

type Plan = 'annual' | 'monthly';

export default function Paywall() {
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const [plan, setPlan] = useState<Plan>('annual');
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { colors: c } = useTheme();

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
    if (restoring) return;
    setRestoring(true);
    setNote(null);
    try {
      const entitled = await restore();
      if (entitled) {
        close();
      } else {
        setNote('Nothing to restore on this account.');
      }
    } catch {
      setNote('Couldn’t reach the store. Try again.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 20 }}>
          <Pressable onPress={close} hitSlop={14} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 4 }}>
            <Ionicons name="close" size={26} color={c.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 8, flexGrow: 1, justifyContent: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: 'center' }}>
            <GhostLight size={22} />
            <Text
              className="mt-6 text-center text-foreground"
              style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 44, lineHeight: 50 }}
            >
              The whole stage.
            </Text>
            <StageDirection className="mt-3">(three reads were the trial.)</StageDirection>
          </View>

          {/* What unlocks — quiet amber ticks, no loud bullets. */}
          <View style={{ marginTop: 30, alignSelf: 'center' }}>
            {FEATURES.map((f) => (
              <View key={f} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <Ionicons name="checkmark-sharp" size={18} color={colors.stageGlow} style={{ marginRight: 12 }} />
                <Text className="text-[15px] text-foreground" style={{ fontFamily: 'Montserrat_400Regular' }}>
                  {f}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 26, gap: 12 }}>
            <PlanCard
              selected={plan === 'annual'}
              onPress={() => setPlan('annual')}
              title="Annual"
              price={annualPrice}
              caption="billed yearly"
              badge="save 50%"
            />
            <PlanCard
              selected={plan === 'monthly'}
              onPress={() => setPlan('monthly')}
              title="Monthly"
              price={monthlyPrice}
              caption="billed monthly"
            />
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: 28, paddingBottom: 20, paddingTop: 8 }}>
          <StageButton onPress={buy} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.stageGlow} />
            ) : (
              <Text
                style={{
                  fontFamily: 'Montserrat_600SemiBold',
                  fontSize: 14,
                  letterSpacing: 2.5,
                  textTransform: 'uppercase',
                  color: colors.stageGlow,
                }}
              >
                Unlock everything
              </Text>
            )}
          </StageButton>

          {/* Fixed-height note slot so nothing jumps as it appears. */}
          <View style={{ minHeight: 20, marginTop: 10, justifyContent: 'center' }}>
            {note ? (
              <Text
                className="text-center text-[13px]"
                style={{ fontFamily: 'Montserrat_400Regular', color: c.mutedForeground }}
              >
                {note}
              </Text>
            ) : null}
          </View>

          <Pressable onPress={onRestore} hitSlop={10} style={{ alignItems: 'center', paddingVertical: 6 }} accessibilityRole="button">
            {restoring ? (
              <ActivityIndicator color={c.mutedForeground} />
            ) : (
              <Text className="text-[13px] text-muted-foreground" style={{ fontFamily: 'Montserrat_500Medium' }}>
                Restore Purchases
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function PlanCard({
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
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 18,
        borderWidth: selected ? 1.5 : 1,
        paddingHorizontal: 18,
        paddingVertical: 18,
        borderColor: selected ? colors.stageGlow : c.border,
        backgroundColor: selected ? 'rgba(243, 130, 29, 0.10)' : c.card,
      }}
    >
      {/* Radio dot. */}
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: selected ? colors.stageGlow : c.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
        }}
      >
        {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.stageGlow }} /> : null}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text className="text-[17px] text-foreground" style={{ fontFamily: 'Montserrat_600SemiBold' }}>
            {title}
          </Text>
          {badge ? (
            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.primary }}>
              <Text
                className="text-[10px] uppercase tracking-[1px] text-white"
                style={{ fontFamily: 'Montserrat_600SemiBold' }}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-0.5 text-[12px] text-muted-foreground" style={{ fontFamily: 'Montserrat_400Regular' }}>
          {caption}
        </Text>
      </View>

      <Text className="text-foreground" style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 30 }}>
        {price}
      </Text>
    </Pressable>
  );
}
