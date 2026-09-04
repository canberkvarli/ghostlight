import { Platform } from 'react-native';
import PostHog from 'posthog-react-native';

/**
 * Product analytics.
 *
 * The app shipped 1.0 with none at all, which meant every decision about what
 * to fix next was a guess. The web has GA4 and knows its funnel; the app knew
 * nothing about itself.
 *
 * Degrades silently when unconfigured, the same way `purchases.ts` does. A
 * missing key must never be the reason someone cannot read a monologue, so
 * every function here is a no-op rather than a throw, and none of them are
 * awaited by anything on a render path.
 */

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: PostHog | null = null;

export function initAnalytics(): void {
  if (client || !KEY) return;
  try {
    client = new PostHog(KEY, {
      host: HOST,
      // The app is a search box and a reading screen. Autocapture would fill the
      // project with taps on monologue cards we cannot name, and the events
      // below are the ones we would actually ask questions about.
      captureAppLifecycleEvents: true,
      // Ship in batches rather than a request per event. An actor scrolling a
      // results list should not be paying for our telemetry in radio time.
      flushAt: 20,
      flushInterval: 30_000,
    });
    // Stamped onto every event from here on. The web app is about to report into
    // this same project, and without this the two are indistinguishable: a funnel
    // would silently blend an actor on a phone with one on a laptop and answer
    // every question wrong. `client` is the same word the API already uses in
    // `X-Client` and in `monologue_views.client`, so the split means the same
    // thing on both sides of the wire.
    client.register({ platform: Platform.OS, client: 'ghostlight' });
  } catch {
    client = null;
  }
}

/**
 * Tie events to the account once there is one. Called after sign-in, never
 * before: an anonymous reader stays anonymous, and PostHog's own generated id
 * is enough to follow a session without knowing who it belongs to.
 *
 * Deliberately does not send the email address. We know who user 4471 is if we
 * ever genuinely need to; the analytics project does not need a mailing list,
 * and the privacy policy promises we do not build one.
 */
export function identify(userId: string, isPaid: boolean): void {
  try {
    client?.identify(userId, { is_paid: isPaid });
  } catch {
    /* analytics must never break a sign-in */
  }
}

export function resetIdentity(): void {
  try {
    client?.reset();
  } catch {
    /* ignore */
  }
}

/**
 * The events worth having. Named for the question each one answers, because a
 * dashboard full of `button_clicked` is the same as having no analytics.
 *
 * Search text is NOT sent. What someone is auditioning for is their business,
 * the backend already logs queries against `search_logs` where the privacy
 * policy accounts for them, and the callboard promise is explicit that raw
 * queries never travel. Shape of the search, yes; the words, no.
 */
export type Event =
  /** Did they search at all, and with what shape of query? */
  // `theatre`, not `stage`: it is what `Medium` in src/theme/medium.ts calls it
  // and what the toggle says. A private vocabulary for the analytics layer would
  // mean translating at every call site and eventually mistranslating at one.
  | { name: 'search_performed'; props: { medium: 'theatre' | 'screen'; filters: number; has_query: boolean; results: number } }
  /** Which result did they open, and how far down was it? */
  | { name: 'monologue_opened'; props: { id: string; position: number; medium: 'theatre' | 'screen' } }
  /** Did they read it, or bounce off the first two lines? */
  | { name: 'monologue_read'; props: { id: string; seconds: number } }
  /** The wall. How many reads had they spent, and where did it fire? */
  | { name: 'paywall_shown'; props: { reads_used: number; from: string } }
  /** Did the paywall convert, and on which plan? */
  | { name: 'purchase_started'; props: { plan: 'annual' | 'monthly'; trial: boolean } }
  | { name: 'purchase_completed'; props: { plan: 'annual' | 'monthly'; trial: boolean } }
  /** Saves are the retention signal: someone building a book comes back. */
  | { name: 'monologue_saved'; props: { id: string } }
  /** Sign-in is the other one, and which method matters for what to keep. */
  | { name: 'signed_in'; props: { method: 'apple' | 'google' | 'email' } };

export function track<E extends Event>(name: E['name'], props: E['props']): void {
  try {
    // Every prop above is a string, number or boolean, which is exactly what
    // PostHog accepts; the cast is only to satisfy its JSON-shaped index
    // signature, which a discriminated union cannot prove to it.
    client?.capture(name, props as Record<string, string | number | boolean>);
  } catch {
    /* ignore */
  }
}

/** Flush before the app is backgrounded so a session is not lost on a swipe-up. */
export function flushAnalytics(): void {
  try {
    void client?.flush();
  } catch {
    /* ignore */
  }
}
