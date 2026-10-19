import { Platform } from 'react-native';
import * as Application from 'expo-application';
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
    //
    // `app_version` and `build` are here because their absence cost an afternoon:
    // events were missing and there was no way to tell whether the app was not
    // sending them or the phone was simply still on an older binary that had
    // never contained PostHog. With these, one glance at any event answers it.
    // `build` is the number that actually moves per binary; the version string
    // repeats across builds 15, 16 and 17.
    //
    // `void` because register() returns a promise. Awaiting it would make init
    // async for no gain, and letting it float unhandled is a warning in waiting.
    void client.register({
      platform: Platform.OS,
      client: 'ghostlight',
      app_version: Application.nativeApplicationVersion ?? 'unknown',
      build: Application.nativeBuildVersion ?? 'unknown',
    });
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
 *
 * `INTERNAL_PEOPLE` is the one exception and it is deliberately not a general
 * mechanism. PostHog shows a person as a raw uuid unless it finds a `name`,
 * which makes your own test traffic indistinguishable from a stranger's, and
 * every chart something you have to mentally subtract yourself from.
 *
 * The lookup happens HERE, on the phone, against a fixed list. A matched
 * address becomes a first name; an unmatched one is discarded and never leaves
 * the device. So this labels the three or four accounts we already know by name
 * and cannot become "send everyone's email" by a later edit that looked
 * harmless. `is_internal` rides along so PostHog's own internal-users filter can
 * key on a property rather than a pasted list of uuids.
 */
const INTERNAL_PEOPLE: Record<string, string> = {
  'canberkvarli@gmail.com': 'Canberk',
  'appreview@actorrise.com': 'App Review',
};

/** A display name, but only for us. Undefined for everyone else, always. */
export function internalName(email: string | undefined): string | undefined {
  return email ? INTERNAL_PEOPLE[email.trim().toLowerCase()] : undefined;
}
export function identify(userId: string, props?: Record<string, string | number | boolean>): void {
  try {
    client?.identify(userId, props);
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
type ReminderMomentName = 'eve' | 'soon' | 'callboard' | 'tonight' | 'left';

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
  | { name: 'signed_in'; props: { method: 'apple' | 'google' | 'email' } }
  /**
   * The 1.0.6 reason to come back: an audition on the calendar. `has_piece`
   * says whether the book was in play; `kind` separates the room from the tape.
   */
  | { name: 'app_audition_created'; props: { kind: 'in_person' | 'self_tape' | 'virtual'; has_piece: boolean } }
  | { name: 'app_audition_parsed'; props: { ok: boolean; has_date: boolean; quota_hit: boolean } }
  | { name: 'app_audition_outcome'; props: { outcome: 'good' | 'callback' | 'no' } }
  | { name: 'app_calendar_feed_opened'; props: Record<string, never> }
  /** A piece from the book went onto (or off) an audition from its file. */
  | { name: 'app_audition_piece_attached'; props: { has_piece: boolean } }
  /** The model was asked for ideas on the file. */
  | { name: 'app_audition_assist'; props: { part: 'read' } }
  /** A question typed (or tapped) on the file, answered by the model. */
  | { name: 'app_audition_asked'; props: { chars: number } }
  | { name: 'app_wall_failed'; props: { status: number | null } }
  | { name: 'app_audition_callback_added'; props: Record<string, never> }
  /** A reminder switch on the file. `channel` is the phone or email. */
  | { name: 'app_reminder_toggled'; props: { channel: 'phone' | 'email'; on: boolean } }
  /** A local reminder went on the phone's schedule. `moment` is which of the two. */
  | { name: 'app_reminder_scheduled'; props: { moment: ReminderMomentName; has_piece: boolean } }
  /** Someone tapped a reminder, and the app opened from it. */
  | { name: 'app_reminder_opened'; props: { moment: ReminderMomentName; has_piece: boolean } }
  /** The system rating sheet was asked for, and from where. */
  | { name: 'app_review_prompted'; props: { from: 'third_save' | 'note' | 'account' } }
  /** The tick on a saved piece: into the pocket (on) or back to the shelf. */
  | { name: 'app_off_book_toggled'; props: { on: boolean } }
  /** The book was searched. `hits` is how many rows matched, not what was typed. */
  | { name: 'app_book_find'; props: { hits: number } }
  /** A cut was saved (or cleared: `seconds` 0). `of` is the whole piece. */
  | { name: 'app_cut_set'; props: { seconds: number; of: number; cleared: boolean } }
  /** Running a piece: which level it started at. */
  | { name: 'app_run_started'; props: { level: 'words' | 'hints' | 'dark'; has_cut: boolean } }
  | { name: 'app_run_finished'; props: { level: 'words' | 'hints' | 'dark'; lines: number; seconds: number } }
  /** A row under the search field was tapped. */
  | { name: 'app_home_row'; props: { row: 'book' | 'next' | 'trending' } }
  | { name: 'app_ticket'; props: { kind: 'audition' | 'left' | 'tonight' | 'board'; action: 'open' | 'dismiss' } }
  | { name: 'app_knock_asked'; props: { yes: boolean; granted: boolean } }
  /** The "what is ActorRise" sheet, and where it was opened from. */
  | { name: 'app_about_actorrise'; props: { from: 'auth' | 'account'; visited: boolean } };

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
