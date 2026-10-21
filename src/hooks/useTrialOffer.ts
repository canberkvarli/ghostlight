import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import type { PurchasesOffering, PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';

import type { ReadState } from '../api/client';
import { track } from '../lib/analytics';
import { getCurrentOffering, isPurchasesConfigured, purchase, restore } from '../lib/purchases';
import { useSession } from '../lib/useSession';

/**
 * The offer, wherever it is made: the paywall screen and the wall on the page
 * share this one head. It knows the two packages and their live prices, which
 * plan is picked, whether there is a real free trial on it, how to take the
 * money and how to give a subscription back. The screens only draw.
 *
 * Every word the screens print about money comes from here, so the wall and
 * the paywall can never disagree about the length of the same trial or the
 * price that follows it. That disagreement is a 3.1.2(c) rejection.
 */

export type Plan = 'annual' | 'monthly';

// Same pair the Account screen links to. Kept as literals so nothing here
// pulls a screen module in.
export const TERMS_URL = 'https://actorrise.com/terms';
export const PRIVACY_URL = 'https://actorrise.com/privacy';

export function useTrialOffer({
  from,
  onDone,
  onSignIn,
}: {
  /** Where the offer was made, for `paywall_shown`. */
  from: string;
  /** The purchase went through (or was restored) and the person is in. */
  onDone: () => void;
  /** They bought without an account and chose to sign in to keep it. */
  onSignIn: () => void;
}) {
  const [plan, setPlan] = useState<Plan>('annual');
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // `null` means "not answered yet", which is not the same as "answered, and
  // there is nothing to sell". Conflating the two is what let the paywall show
  // prices it had invented while the CTA was inert.
  const [storeReachable, setStoreReachable] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();

  // The wall firing at all is the event; whether it converts is the two below.
  // `reads_used` comes off the cached read state rather than a fresh fetch,
  // because an offer must not wait on telemetry to draw.
  useEffect(() => {
    const wall = queryClient.getQueryData<ReadState>(['read-wall']);
    track('paywall_shown', { reads_used: wall?.reads_used ?? 0, from });
  }, [queryClient, from]);

  useEffect(() => {
    let alive = true;
    getCurrentOffering()
      .then((o) => {
        if (!alive) return;
        setOffering(o);
        setStoreReachable(Boolean(o?.annual || o?.monthly));
      })
      .catch(() => {
        if (!alive) return;
        setOffering(null);
        setStoreReachable(false);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStoreReachable(null);
    setNote(null);
    setAttempt((n) => n + 1);
  }, []);

  // RevenueCat confirms the entitlement on-device the instant the purchase
  // returns, but ['read-wall'] is served by our API, which only learns about it
  // when the RevenueCat webhook lands, a second or two later, sometimes more.
  // So: seed the unlocked state so the page opens the moment the sheet closes,
  // then reconcile against the server as the webhook arrives. The server stays
  // the source of truth; it just gets a head start.
  const refreshEntitlement = useCallback(() => {
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
  }, [queryClient]);

  const annualPkg = offering?.annual ?? null;
  const monthlyPkg = offering?.monthly ?? null;
  const annualBilled = annualPkg?.product.priceString ?? '$29.99';
  const monthlyBilled = monthlyPkg?.product.priceString ?? '$4.99';
  const annualPerMonth = perMonthString(annualPkg?.product, 12) ?? '$2.50';

  const selectedPkg: PurchasesPackage | null = plan === 'annual' ? annualPkg : monthlyPkg;
  const billed = plan === 'annual' ? annualBilled : monthlyBilled;
  const cadence = plan === 'annual' ? 'a year' : 'a month';
  // Real trial from RevenueCat when live; else the trial set in App Store
  // Connect. `trialLabel` gates the CTA and the terms; the fallback has to say
  // what the store says ("1 week", not "7 days") or the offline copy and the
  // live copy disagree about the length of the same trial.
  const trialLabel = introTrialLabel(selectedPkg) ?? (offering ? null : '1 week');
  const storeDown = storeReachable === false;

  // The disclosure 3.1.2(c) is about: trial length, the amount charged after
  // it, and that it renews on its own, in one place, for both screens.
  const terms = trialLabel
    ? `Free for ${trialLabel}, then ${billed} ${cadence}. Payment is charged to your Apple Account at the end of the trial and the subscription renews automatically at the same price until you cancel. Cancel any time in Settings, at least 24 hours before the trial ends.`
    : `${billed} ${cadence}, charged to your Apple Account. The subscription renews automatically at the same price until you cancel. Cancel any time in Settings, at least 24 hours before the period ends.`;

  const buy = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!isPurchasesConfigured() || !selectedPkg) {
      // Reachable whenever RevenueCat cannot fetch products, which is every
      // simulator run and any real device the App Store is having a bad day on.
      setNote('Couldn’t reach the App Store. Try again in a moment.');
      return;
    }
    setBusy(true);
    setNote(null);
    // Started and completed are separate events on purpose: the gap between
    // them is the Apple sheet, and how many people die in that gap is the one
    // number that tells you whether the offer or the price is the problem.
    track('purchase_started', { plan, trial: Boolean(trialLabel) });
    try {
      const entitled = await purchase(selectedPkg);
      if (entitled) {
        track('purchase_completed', { plan, trial: Boolean(trialLabel) });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        refreshEntitlement();
        // Buying without an account is allowed, but the entitlement then hangs
        // off an anonymous RevenueCat id that does not survive a reinstall or a
        // new phone. Ask once, here, while the purchase is the thing they are
        // thinking about. Never block: they have paid, they get in either way.
        if (!isAuthenticated) {
          Alert.alert(
            'Keep this subscription safe',
            'Sign in and it follows you to any device. Without an account it lives on this phone only.',
            [
              { text: 'Not now', style: 'cancel', onPress: onDone },
              { text: 'Sign in', onPress: onSignIn },
            ],
          );
          return;
        }
        onDone();
      }
    } catch (e) {
      const err = e as { userCancelled?: boolean; message?: string };
      if (!err.userCancelled) setNote(err.message ?? 'Purchase failed.');
    } finally {
      setBusy(false);
    }
  }, [selectedPkg, plan, trialLabel, isAuthenticated, onDone, onSignIn, refreshEntitlement]);

  const onRestore = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    setNote(null);
    try {
      const entitled = await restore();
      if (entitled) {
        refreshEntitlement();
        onDone();
      } else setNote('Nothing to restore on this account.');
    } catch {
      setNote('Couldn’t reach the store. Try again.');
    } finally {
      setRestoring(false);
    }
  }, [restoring, refreshEntitlement, onDone]);

  return {
    plan,
    setPlan,
    busy,
    restoring,
    note,
    storeDown,
    retry,
    annualBilled,
    monthlyBilled,
    annualPerMonth,
    billed,
    cadence,
    trialLabel,
    terms,
    buy,
    onRestore,
  };
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
  const symbol = product.priceString.replace(/[\d.,\s ]/g, '') || '$';
  return `${symbol}${(product.price / divisor).toFixed(2)}`;
}
