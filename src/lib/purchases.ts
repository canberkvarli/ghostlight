import Purchases, { LOG_LEVEL, type PurchasesOffering, type PurchasesPackage } from 'react-native-purchases';

import { supabase } from './supabase';

/**
 * RevenueCat, wrapped (spec §2 payments, §5 Step 7). Everything here is guarded
 * on an API key: until `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is set, the wrapper is
 * inert — no configure, no crash — so the rest of the app builds and runs
 * without a RevenueCat account. The paywall screen falls back to static offer
 * copy when there are no live offerings.
 *
 * The entitlement of record lives on the ActorRise account: RevenueCat's
 * `app_user_id` is set to the Supabase user id at login, and a RevenueCat
 * webhook (spec §4 #3) grants/revokes the Monologues tier server-side. This
 * client reads entitlement to gate the UI; the server is the source of truth.
 */

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ENTITLEMENT_ID = 'monologues';

let configured = false;

export function isPurchasesConfigured(): boolean {
  return configured;
}

/**
 * Configure once, keyed to the Supabase user so the webhook can match
 * `app_user_id` back to the ActorRise account. Safe to call repeatedly.
 */
export async function configurePurchases(): Promise<void> {
  if (configured || !IOS_KEY) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;

  Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: IOS_KEY, appUserID: userId ?? null });
  configured = true;
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

export async function hasMonologuesEntitlement(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

export async function purchase(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

/** Required by Apple — omitting a restore path is a guaranteed rejection (spec §5). */
export async function restore(): Promise<boolean> {
  if (!configured) return false;
  const info = await Purchases.restorePurchases();
  return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
}
