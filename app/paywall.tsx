import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import type { PurchasesOffering, PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { WordArrow } from '../src/components/WordArrow';
import { useTheme } from '../src/theme/ThemeContext';
import {
  getCurrentOffering,
  isPurchasesConfigured,
  purchase,
  restore,
} from '../src/lib/purchases';
import { colors } from '../src/theme/tokens';
import type { ReadState } from '../src/api/client';

/**
 * The paywall — a free trial (length set in App Store Connect; handoff §5). No
 * slabs: the offer is a headline, a
 * short list of perks with glowing dots, two hairline radio rows, and one word +
 * arrow. Restore is present because Apple requires it. Live prices come from
 * RevenueCat when configured; the static copy stands otherwise so it's never empty.
 */

// Every line here must map to a real entitlement check, or App Review reads it
// as a promise the purchase doesn't keep (Guideline 2.3.1/3.1.2). Saves,
// offline and memorize mode were listed once and none of them were gated —
// saves and offline are free for everyone, memorize mode is deferred to v2.
// Three true perks beat four with a lie in them. The gates, for the record:
//   unlimited reads  → app/read/[id].tsx:148 (free tier is 3 lifetime reads)
//   copy to clipboard → app/read/[id].tsx:167
//   tone/emotion/freshness filters → src/data/filters.ts (premium: true)
const PERKS = [
  'Unlimited reading, all 14,000+',
  'Filter by tone, emotion & freshness',
  'Copy any monologue',
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
  const queryClient = useQueryClient();

  // RevenueCat confirms the entitlement on-device the instant the purchase
  // returns, but ['read-wall'] is served by our API, which only learns about it
  // when the RevenueCat webhook lands — a second or two later, sometimes more.
  // Invalidating alone therefore refetches the one source that is still saying
  // "free", which is precisely the wait it looks like it's avoiding.
  //
  // So: seed the unlocked state so the app opens the moment the sheet closes,
  // then reconcile against the server as the webhook arrives. The server stays
  // the source of truth; it just gets a head start.
  const refreshEntitlement = () => {
    queryClient.setQueryData<ReadState>(['read-wall'], {
      reads_used: 0,
      reads_limit: -1,
      is_paid: true,
      atWall: false,
    });
    queryClient.invalidateQueries({ queryKey: ['monologue'] });
    for (const ms of [1500, 4000, 9000]) {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['read-wall'] }), ms);
    }
  };

  useEffect(() => {
    getCurrentOffering().then(setOffering).catch(() => setOffering(null));
  }, []);

  const annualPkg = offering?.annual ?? null;
  const monthlyPkg = offering?.monthly ?? null;
  const annualBilled = annualPkg?.product.priceString ?? '$29.99';
  const monthlyBilled = monthlyPkg?.product.priceString ?? '$4.99';
  const annualPerMonth = perMonthString(annualPkg?.product, 12) ?? '$2.50';
  const monthlyPerMonth = perMonthString(monthlyPkg?.product, 1) ?? monthlyBilled;

  const selectedPkg: PurchasesPackage | null = plan === 'annual' ? annualPkg : monthlyPkg;
  const billed = plan === 'annual' ? annualBilled : monthlyBilled;
  const cadence = plan === 'annual' ? 'a year' : 'a month';
  // Real trial from RevenueCat when live; else the 7-day trial set in App Store
  // Connect. `trialLabel` gates the CTA/terms; `headlineTrial` always carries a
  // length for the headline copy.
  const trialLabel = introTrialLabel(selectedPkg) ?? (offering ? null : '7 days');
  const headlineTrial = trialLabel ?? '7 days';
  const headlineWord = `${headlineTrial[0].toUpperCase()}${headlineTrial.slice(1)}`;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/search'));

  const buy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!isPurchasesConfigured() || !selectedPkg) {
      setNote('Purchases aren’t configured yet in this build.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const entitled = await purchase(selectedPkg);
      if (entitled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        refreshEntitlement();
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
        refreshEntitlement();
        close();
      } else setNote('Nothing to restore on this account.');
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
          contentContainerStyle={{ paddingHorizontal: 30, paddingBottom: 8, flexGrow: 1, justifyContent: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: 'center' }}>
            <GhostLight size={34} />
            <Text
              className="mt-6 text-center text-foreground"
              style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 38, lineHeight: 44 }}
            >
              {headlineWord}{'\n'}on the house.
            </Text>
            {/* The trial length is already the headline, so repeating it here
                only bought a second line: Courier at 15px with 1.04 tracking
                runs past the 30pt gutters on a 375pt screen. */}
            <StageDirection className="mt-3" numberOfLines={1}>
              {trialLabel ? '(free. cancel anytime.)' : '(cancel anytime.)'}
            </StageDirection>
          </View>

          {/* Perks — 5pt glowing dots, no loud bullets. */}
          <View style={{ marginTop: 28, alignSelf: 'center' }}>
            {PERKS.map((f) => (
              <View key={f} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: colors.stageGlow,
                    marginRight: 14,
                    shadowColor: colors.stageGlow,
                    shadowOpacity: 0.9,
                    shadowRadius: 5,
                    shadowOffset: { width: 0, height: 0 },
                  }}
                />
                <Text className="text-[15px] text-foreground" style={{ fontFamily: 'Montserrat_400Regular' }}>
                  {f}
                </Text>
              </View>
            ))}
          </View>

          {/* Plans — hairline radio rows, not slabs. */}
          <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: colors.dark.divider }}>
            <PlanRow
              selected={plan === 'annual'}
              onPress={() => setPlan('annual')}
              name="Yearly"
              badge="best."
              note={`billed ${annualBilled} a year`}
              price={annualPerMonth}
            />
            <PlanRow
              selected={plan === 'monthly'}
              onPress={() => setPlan('monthly')}
              name="Monthly"
              note={`billed ${monthlyBilled} a month`}
              price={monthlyPerMonth}
            />
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: 30, paddingBottom: 20, paddingTop: 10, alignItems: 'center' }}>
          {busy ? (
            <ActivityIndicator color={colors.stageGlow} style={{ height: 30 }} />
          ) : (
            <WordArrow
              label={trialLabel ? 'Start the trial' : 'Unlock everything'}
              onPress={buy}
              haptic="none"
            />
          )}

          {/* Fixed-height slot: error note, else the disclosure Apple checks for. */}
          <View style={{ minHeight: 18, marginTop: 12, justifyContent: 'center' }}>
            <Text
              className="text-center text-[12px]"
              style={{ fontFamily: 'Montserrat_400Regular', color: c.mutedForeground }}
            >
              {note ?? `Then ${billed} ${cadence}. Cancel any time in Settings.`}
            </Text>
          </View>

          <Pressable onPress={onRestore} hitSlop={10} style={{ alignItems: 'center', paddingVertical: 8 }} accessibilityRole="button">
            {restoring ? (
              <ActivityIndicator color={c.mutedForeground} />
            ) : (
              <Text className="text-[13px]" style={{ fontFamily: 'Montserrat_500Medium', color: colors.dark.chevron }}>
                Restore purchases
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** A human label for a package's introductory *free* trial ("3 days"), or null. */
function introTrialLabel(pkg: PurchasesPackage | null): string | null {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price > 0) return null;
  const n = intro.periodNumberOfUnits ?? 0;
  if (n <= 0) return null;
  const unit = String(intro.periodUnit ?? 'DAY').toLowerCase();
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** "$2.50" from an annual product's price / 12, keeping the store's currency symbol. */
function perMonthString(product: PurchasesStoreProduct | undefined, divisor: number): string | null {
  if (!product || !product.price) return null;
  const symbol = product.priceString.replace(/[\d.,\s ]/g, '') || '$';
  return `${symbol}${(product.price / divisor).toFixed(2)}`;
}

function PlanRow({
  selected,
  onPress,
  name,
  badge,
  note,
  price,
}: {
  selected: boolean;
  onPress: () => void;
  name: string;
  badge?: string;
  note: string;
  price: string;
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
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: colors.dark.divider,
      }}
    >
      {/* Radio ring — fills with the accent when selected. */}
      <View
        style={{
          width: 17,
          height: 17,
          borderRadius: 9,
          borderWidth: 1.5,
          borderColor: selected ? colors.stageGlow : c.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 16,
        }}
      >
        {selected ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.stageGlow }} /> : null}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text className="text-[17px] text-foreground" style={{ fontFamily: 'Montserrat_600SemiBold' }}>
            {name}
          </Text>
          {badge ? (
            <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, color: colors.stageGlow }}>
              ({badge})
            </Text>
          ) : null}
        </View>
        <Text className="mt-0.5 text-[12px]" style={{ fontFamily: 'Montserrat_400Regular', color: c.mutedForeground }}>
          {note}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text className="text-foreground" style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 28 }}>
          {price}
        </Text>
        <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 12, color: c.mutedForeground, marginLeft: 2 }}>
          /mo
        </Text>
      </View>
    </Pressable>
  );
}
