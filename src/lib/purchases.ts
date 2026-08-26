import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

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
let lastIdentified: string | null = null;

export function isPurchasesConfigured(): boolean {
  return configured;
}

/**
 * Configure once, keyed to whatever session exists at launch. On a cold start
 * that is the ANONYMOUS user, which is fine as a starting point but must not be
 * the last word — see `identifyPurchasesUser`.
 */
export async function configurePurchases(): Promise<void> {
  if (configured || !IOS_KEY) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;

  Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: IOS_KEY, appUserID: userId ?? null });
  configured = true;
  lastIdentified = userId ?? null;
}

/**
 * Re-bind RevenueCat's `app_user_id` when the Supabase user changes.
 *
 * This is load-bearing and its absence is invisible until someone pays. The app
 * launches anonymous, so `configurePurchases` binds the anonymous uuid. Signing
 * in swaps the Supabase user for a real account id, but RevenueCat keeps the
 * old one, so the purchase webhook grants the tier to the anonymous uuid while
 * the API authenticates the real account. Server reports free, the app stays
 * locked, and the receipt is real — the worst possible bug to ship.
 *
 * `logIn` also aliases the anonymous user's existing purchases onto the
 * identified one, so a trial bought before signing in follows the user across.
 */
export async function identifyPurchasesUser(userId: string | null): Promise<void> {
  if (!configured || userId === lastIdentified) return;
  try {
    if (userId) await Purchases.logIn(userId);
    else await Purchases.logOut();
    lastIdentified = userId;
  } catch {
    // Never let an identity hiccup take down the app; the next auth change
    // retries, and Restore Purchases remains the manual escape hatch.
  }
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

/**
 * Watch the device's own entitlement.
 *
 * The server is the source of truth, but it learns about a purchase from a
 * webhook, and that round trip takes seconds it doesn't promise. In the gap the
 * API still answers `is_paid: false`, so the app was showing "every monologue,
 * unlimited" the instant the sheet closed and then flipping back to "your free
 * reads are spent" when the next poll landed. Paying and watching the app take
 * it away again is the worst thirty seconds we could hand a new subscriber.
 *
 * RevenueCat's local customer info knows immediately and survives relaunch, so
 * useEntitlement ORs the two: server OR receipt. No latch, no lie — both are
 * real answers, and the local one is simply earlier.
 */
export function onCustomerInfoUpdate(cb: (active: boolean) => void): () => void {
  if (!configured) return () => {};
  const handler = (info: CustomerInfo) => {
    cb(info.entitlements.active[ENTITLEMENT_ID] !== undefined);
  };
  Purchases.addCustomerInfoUpdateListener(handler);
  return () => {
    try {
      Purchases.removeCustomerInfoUpdateListener(handler);
    } catch {
      // Older SDK builds don't expose the remover; the listener is harmless.
    }
  };
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
