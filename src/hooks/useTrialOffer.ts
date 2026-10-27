import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import type { PurchasesOffering, PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';

import type { ReadState } from '../api/client';
import { track } from '../lib/analytics';
import type { PaywallTrigger } from '../lib/paywall';
import { hasNotificationPermission } from '../lib/notifications';
import { getCurrentOffering, isPurchasesConfigured, purchase, restore } from '../lib/purchases';
import { scheduleTrialReminder } from '../lib/trialReminder';
import { useSession } from '../lib/useSession';

/**
 * The offer, wherever it is made: the paywall screen, the wall on the page
 * and the foot of the cast sheet share this one head. It knows the two
 * packages and their live prices, which plan is picked, whether there is a
 * real free trial on it, how to take the money and how to give a
 * subscription back. The screens only draw.
 *
 * Every word the screens print about money comes from here, so the wall and
 * the paywall can never disagree about the length of the same trial or the
 * price that follows it. That disagreement is a 3.1.2(c) rejection.
 *
 * Since 1.1 the plan is one: the library and the scene partner together, at
 * $9.99 a month or $59.99 a year. The free week rides on the yearly plan
 * only; monthly is charged the day it starts. The fallbacks below are what
 * the screen says while the store answers and are never what anyone is
 * charged: the CTA is inert until the store has spoken.
 */

export type Plan = 'annual' | 'monthly';

// Same pair the Account screen links to. Kept as literals so nothing here
// pulls a screen module in.
export const TERMS_URL = 'https://actorrise.com/terms';
export const PRIVACY_URL = 'https://actorrise.com/privacy';

const FALLBACK_ANNUAL = '$59.99';
const FALLBACK_MONTHLY = '$9.99';
const FALLBACK_PER_MONTH = '$5.00';

export function useTrialOffer({
  from,
  trigger,
  onDone,
  onSignIn,
}: {
  /** Where the offer was made, for `paywall_shown`. */
  from: string;
  /** Why it was made (src/lib/paywall.ts), for `paywall_shown`. */
  trigger?: PaywallTrigger | null;
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
  // Whether the phone will let us knock two days before the trial ends. The
  // timeline promises the reminder only when it can be kept.
  const [canRemind, setCanRemind] = useState(false);
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();

  // The wall firing at all is the event; whether it converts is the two below.
  // `reads_used` comes off the cached read state rather than a fresh fetch,
  // because an offer must not wait on telemetry to draw.
  useEffect(() => {
    const wall = queryClient.getQueryData<ReadState>(['read-wall']);
    track('paywall_shown', { reads_used: wall?.reads_used ?? 0, from, trigger: trigger ?? null });
  }, [queryClient, from, trigger]);

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
    hasNotificationPermission().then((ok) => { if (alive) setCanRemind(ok); }).catch(() => {});
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
      runs_used: 0,
      runs_limit: -1,
      scripts_used: 0,
      scripts_limit: -1,
    });
    queryClient.invalidateQueries({ queryKey: ['monologue'] });
    queryClient.invalidateQueries({ queryKey: ['subscription'] });
    for (const ms of [1500, 4000, 9000]) {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['read-wall'] }), ms);
    }
  }, [queryClient]);

  const annualPkg = offering?.annual ?? null;
  const monthlyPkg = offering?.monthly ?? null;
  const annualBilled = annualPkg?.product.priceString ?? FALLBACK_ANNUAL;
  const monthlyBilled = monthlyPkg?.product.priceString ?? FALLBACK_MONTHLY;
  const annualPerMonth = perMonthString(annualPkg?.product, 12) ?? FALLBACK_PER_MONTH;

  const selectedPkg: PurchasesPackage | null = plan === 'annual' ? annualPkg : monthlyPkg;
  const billed = plan === 'annual' ? annualBilled : monthlyBilled;
  const cadence = plan === 'annual' ? 'a year' : 'a month';
  // The free week rides on the yearly plan only. Real trial from RevenueCat
  // when live; else the trial set in App Store Connect. `trialLabel` gates the
  // CTA and the terms; the fallback has to say what the store says ("1 week",
  // not "7 days") or the offline copy and the live copy disagree about the
  // length of the same trial. Monthly never claims one, whatever the store
  // attaches to it.
  const annualTrial = introTrial(annualPkg) ?? (offering ? null : { label: '1 week', days: 7 });
  const trialLabel = plan === 'annual' ? annualTrial?.label ?? null : null;
  const trialDays = plan === 'annual' ? annualTrial?.days ?? null : null;
  const storeDown = storeReachable === false;

  // The disclosure 3.1.2(c) is about: trial length, the amount charged after
  // it, and that it renews on its own, in one place, for every screen.
  const terms = trialLabel
    ? `Free for ${trialLabel}, then ${billed} ${cadence}. Payment is charged to your Apple Account at the end of the trial and the subscription renews automatically at the same price until you cancel. Cancel any time in Settings, at least 24 hours before the trial ends.`
    : `${billed} ${cadence}, charged to your Apple Account today. The subscription renews automatically at the same price until you cancel. Cancel any time in Settings, at least 24 hours before the period ends.`;
  // The same, in one line, for the foot of a card.
  const termsLine = trialLabel
    ? `Free for ${trialLabel}, then ${billed}/${plan === 'annual' ? 'year' : 'month'}. Renews automatically unless cancelled 24h before the trial ends.`
    : `${billed} ${cadence}, charged today. Renews automatically until cancelled.`;

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
    track('purchase_started', { plan, trial: Boolean(trialLabel), from, trigger: trigger ?? null });
    try {
      const entitled = await purchase(selectedPkg);
      if (entitled) {
        track('purchase_completed', { plan, trial: Boolean(trialLabel), from, trigger: trigger ?? null });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        refreshEntitlement();
        // The knock two days before the trial ends, if the phone allows it.
        if (trialDays) void scheduleTrialReminder(trialDays).catch(() => {});
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
  }, [selectedPkg, plan, trialLabel, trialDays, from, trigger, isAuthenticated, onDone, onSignIn, refreshEntitlement]);

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
    /** Which packages the store actually sells. Draw only those. */
    hasAnnual: Boolean(annualPkg) || !offering,
    hasMonthly: Boolean(monthlyPkg) || !offering,
    annualBilled,
    monthlyBilled,
    annualPerMonth,
    /** The yearly plan's trial, whichever plan is picked: for the plan card's own label. */
    annualTrialLabel: annualTrial?.label ?? null,
    billed,
    cadence,
    trialLabel,
    trialDays,
    canRemind,
    terms,
    termsLine,
    buy,
    onRestore,
  };
}

/** A package's introductory *free* trial as a label ("1 week") and a count of days, or null. */
function introTrial(pkg: PurchasesPackage | null): { label: string; days: number } | null {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price > 0) return null;
  const n = intro.periodNumberOfUnits ?? 0;
  if (n <= 0) return null;
  const unit = String(intro.periodUnit ?? 'DAY').toLowerCase();
  const per = unit === 'week' ? 7 : unit === 'month' ? 30 : unit === 'year' ? 365 : 1;
  return { label: `${n} ${unit}${n === 1 ? '' : 's'}`, days: n * per };
}

/** "$5.00" from an annual product's price / 12, keeping the store's currency symbol. */
function perMonthString(product: PurchasesStoreProduct | undefined, divisor: number): string | null {
  if (!product || !product.price) return null;
  const symbol = product.priceString.replace(/[\d.,\s ]/g, '') || '$';
  return `${symbol}${(product.price / divisor).toFixed(2)}`;
}
