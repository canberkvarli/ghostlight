import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import type { Audition } from '../api/auditions';
import type { Monologue } from '../data/monologues';
import type { Medium } from '../theme/medium';
import { track } from './analytics';
import { hasNotificationPermission, requestNotificationPermission, type ReminderData } from './notifications';
import { isFresh, trailOf, type RecentPiece } from './recents';
import { clockLabel, daysUntil, distanceLabel } from './when';

/**
 * The one voice that asks you back.
 *
 * Two mouths, one brain. The TICKET is the single line under the search field
 * on the home: the most urgent thing today, never two things, each sentence
 * dismissable for the day. The KNOCKS are local notifications written from
 * the same candidates whenever the home has fresh data: tonight's speech in
 * the evening, the piece you left two days on, and the audition reminders
 * that already exist and own their day outright.
 *
 * Rules that are the point, not details: one knock a day at most, nothing
 * after ten, tonight's speech goes quiet after five unopened in a row and
 * comes back the next time you read one from the home, and the question of
 * whether to knock at all is asked once, in the app's voice, after the first
 * save or the first curtain. Never at launch.
 */

const KEY = 'gl.nudges.v1';
const KNOCK_HOUR = 19;
const LEFT_AFTER_DAYS = 2;
const BOARD_EVERY_DAYS = 7;
const QUIET_AFTER = 5;
const DAYS_AHEAD = 7;

export type NudgeKind = 'audition' | 'left' | 'tonight' | 'board';

export interface Nudge {
  kind: NudgeKind;
  /** What is dismissed: the kind plus the thing, so a new piece is a new sentence. */
  key: string;
  /** "(where you left " + "Hamlet" + ", yesterday.)" */
  pre: string;
  name: string;
  post: string;
  route: { pathname: '/read/[id]'; params: { id: string; medium: Medium } } | { pathname: '/prep'; params: { id: string } } | { pathname: '/audition' };
  accessibility: string;
}

interface State {
  /** Local day the ticket was slid aside: nothing more is said that day. */
  quietOn?: string;
  /** Local day the empty-board line was last shown. */
  boardShownOn?: string;
  /** Tonight knocks that fired without being opened, in a row. */
  tonightUnopened: number;
  /** Tonight knocks scheduled: id and when, so the unopened count can be kept. */
  tonightPending: { id: string; at: number }[];
  left?: { id: string; monologueId: string };
  /** The question was put, whatever the answer. */
  knockAsked?: boolean;
  /** Said yes (and iOS agreed) or no. Undefined until asked. */
  knocksOn?: boolean;
  /** Last time a tonight knock was opened, so a run of silence can be measured. */
  lastOpenedAt?: number;
}

const EMPTY: State = { tonightUnopened: 0, tonightPending: [] };

let cache: State | null = null;

async function load(): Promise<State> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<State>) : {};
    cache = {
      ...EMPTY,
      ...parsed,
      tonightPending: Array.isArray(parsed.tonightPending) ? parsed.tonightPending : [],
      tonightUnopened: typeof parsed.tonightUnopened === 'number' ? parsed.tonightUnopened : 0,
    };
  } catch {
    cache = { ...EMPTY };
  }
  return cache;
}

async function save(next: State): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Cosmetic.
  }
}

/** Local calendar day, "2026-10-19". */
export function dayOf(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export interface Candidates {
  next: Audition | undefined;
  lastPiece: RecentPiece | undefined;
  tonight: Monologue | null;
  medium: Medium;
  isAuthenticated: boolean;
}

/** Every sentence the ticket could say today, most urgent first. Pure. */
export function candidates(c: Candidates, now = new Date()): Nudge[] {
  const out: Nudge[] = [];
  const { next, lastPiece, tonight, medium, isAuthenticated } = c;

  if (next?.when && daysUntil(next.when, now) <= 7) {
    const days = daysUntil(next.when, now);
    const tape = next.kind === 'self_tape';
    const day = new Date(next.when).toLocaleDateString(undefined, { weekday: 'long' }).toLowerCase();
    const when = days === 0 ? `today, ${clockLabel(next.when)}` : days === 1 ? 'tomorrow' : day;
    out.push({
      kind: 'audition',
      key: `audition:${next.id}`,
      pre: tape ? `(tape due ${when}: ` : `(${when}: `,
      name: next.project,
      post: '.)',
      route: { pathname: '/prep', params: { id: String(next.id) } },
      accessibility: `${tape ? 'Tape due' : 'Audition'} ${when}: ${next.project}. Open the prep file`,
    });
  }

  if (lastPiece && lastPiece.medium === medium && isFresh(lastPiece, now.getTime())) {
    const trail = trailOf(lastPiece);
    out.push({
      kind: 'left',
      key: `left:${lastPiece.id}`,
      pre: '(where you left ',
      name: lastPiece.character,
      post: `, ${trail || distanceLabel(lastPiece.openedAt, now)}.)`,
      route: { pathname: '/read/[id]', params: { id: lastPiece.id, medium } },
      accessibility: `Pick up ${lastPiece.character}, ${lastPiece.source}`,
    });
  }

  if (next?.when && daysUntil(next.when, now) > 7) {
    const day = new Date(next.when).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toLowerCase();
    out.push({
      kind: 'audition',
      key: `audition:${next.id}`,
      pre: `(${day}: `,
      name: next.project,
      post: '.)',
      route: { pathname: '/prep', params: { id: String(next.id) } },
      accessibility: `Audition ${day}: ${next.project}. Open the prep file`,
    });
  }

  if (tonight) {
    out.push({
      kind: 'tonight',
      key: `tonight:${dayOf(now)}`,
      pre: "(tonight's speech: ",
      name: tonight.character,
      post: `, ${tonight.source}.)`,
      route: { pathname: '/read/[id]', params: { id: tonight.id, medium } },
      accessibility: `Tonight's speech: ${tonight.character}, ${tonight.source}`,
    });
  }

  if (!next && isAuthenticated) {
    out.push({
      kind: 'board',
      key: 'board',
      pre: '(nothing on the board. ',
      name: '',
      post: 'add the next audition.)',
      route: { pathname: '/audition' },
      accessibility: 'Nothing on the board. Add the next audition',
    });
  }

  return out;
}

/** The soonest upcoming audition, dated ones first. */
export function nextAudition(auditions: Audition[] | undefined): Audition | undefined {
  return (auditions ?? [])
    .filter((a) => a.scope === 'upcoming')
    .sort((a, b) => (a.when ? Date.parse(a.when) : Infinity) - (b.when ? Date.parse(b.when) : Infinity))[0];
}

/** The one line for today, or nothing once the ticket was slid aside. Records the board showing. */
export async function pickNudge(c: Candidates, now = new Date()): Promise<Nudge | null> {
  const state = await load();
  const today = dayOf(now);
  if (state.quietOn === today) return null;
  for (const n of candidates(c, now)) {
    if (n.kind === 'board') {
      if (state.boardShownOn && daysBetween(state.boardShownOn, today) < BOARD_EVERY_DAYS) continue;
      await save({ ...state, boardShownOn: today });
    }
    return n;
  }
  return null;
}

export async function dismissNudge(n: Nudge): Promise<void> {
  const state = await load();
  track('app_ticket', { kind: n.kind, action: 'dismiss' });
  await save({ ...state, quietOn: dayOf() });
}

export function trackNudgeOpen(n: Nudge): void {
  track('app_ticket', { kind: n.kind, action: 'open' });
  if (n.kind === 'tonight') void noteTonightOpened();
}

/* ------------------------------------------------------------------ knocks */

/** A tonight knock was opened, from the banner or from the home. The silence count starts over. */
export async function noteTonightOpened(): Promise<void> {
  const state = await load();
  await save({ ...state, tonightUnopened: 0, lastOpenedAt: Date.now() });
}

/** The reader opened on a piece: a knock about leaving it would now be wrong. */
export async function notePieceOpened(monologueId: string): Promise<void> {
  const state = await load();
  if (state.left?.monologueId !== monologueId) return;
  await Notifications.cancelScheduledNotificationAsync(state.left.id).catch(() => {});
  await save({ ...state, left: undefined });
}

export interface KnockPlan {
  /** Tonight's speech for a given local day, in the house the home is in. */
  tonightFor: (day: Date) => Monologue | null;
  medium: Medium;
  lastPiece: RecentPiece | undefined;
  /** Local days an audition reminder owns: the eve and the day. */
  auditionDays: Set<string>;
}

function at(day: Date, hour: number): Date {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/**
 * Rewrite the knocks from what the home knows now. Cheap enough to run every
 * time the home has fresh data: cancel ours, schedule ours again.
 */
export async function syncKnocks(plan: KnockPlan, now = new Date()): Promise<void> {
  const state = await load();
  if (state.knocksOn !== true) return;
  if (!(await hasNotificationPermission())) return;

  // Count the tonight knocks that fired since last time. One opened after it
  // fired clears the run; one that passed unopened lengthens it.
  let unopened = state.tonightUnopened;
  const fired = state.tonightPending.filter((p) => p.at <= now.getTime()).sort((a, b) => a.at - b.at);
  for (const p of fired) {
    if (state.lastOpenedAt && state.lastOpenedAt >= p.at) unopened = 0;
    else unopened += 1;
  }

  // Ours, out.
  await Promise.all(state.tonightPending.map((p) => Notifications.cancelScheduledNotificationAsync(p.id).catch(() => {})));
  if (state.left) await Notifications.cancelScheduledNotificationAsync(state.left.id).catch(() => {});

  const taken = new Set(plan.auditionDays);
  const pending: { id: string; at: number }[] = [];
  let left: State['left'];

  // The piece you left: one knock, two days on, in the evening.
  if (plan.lastPiece && plan.lastPiece.medium === plan.medium && isFresh(plan.lastPiece, now.getTime())) {
    const opened = new Date(plan.lastPiece.openedAt);
    const when = at(opened, KNOCK_HOUR);
    when.setDate(when.getDate() + LEFT_AFTER_DAYS);
    const day = dayOf(when);
    if (when.getTime() > now.getTime() + 60_000 && !taken.has(day)) {
      const trail = trailOf(plan.lastPiece);
      const id = await schedule(
        'Where you left it',
        `${plan.lastPiece.character}, from ${plan.lastPiece.source}${trail ? `. ${trail[0].toUpperCase()}${trail.slice(1)}` : ''}. Pick it up?`,
        when,
        { moment: 'left', monologueId: plan.lastPiece.id },
      );
      if (id) {
        left = { id, monologueId: plan.lastPiece.id };
        taken.add(day);
      }
    }
  }

  // Tonight's speech, the week ahead, unless the silence says stop.
  if (unopened < QUIET_AFTER) {
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const day = new Date(now);
      day.setDate(day.getDate() + i);
      const when = at(day, KNOCK_HOUR);
      if (when.getTime() <= now.getTime() + 60_000) continue;
      const key = dayOf(when);
      if (taken.has(key)) continue;
      const piece = plan.tonightFor(day);
      if (!piece) continue;
      const id = await schedule(
        "Tonight's speech",
        `${piece.character}, from ${piece.source}.`,
        when,
        { moment: 'tonight', monologueId: piece.id },
      );
      if (id) pending.push({ id, at: when.getTime() });
    }
  }

  await save({ ...state, tonightUnopened: unopened, tonightPending: pending, left });
}

async function schedule(title: string, body: string, when: Date, data: ReminderData): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  } catch {
    return null;
  }
}

/** Sign out: our knocks are already cancelled with the rest; forget we had any. */
export async function resetKnocks(): Promise<void> {
  const state = await load();
  await save({ ...state, tonightPending: [], left: undefined });
}

/* ------------------------------------------------------- the one question */

type Listener = (reason: KnockReason) => void;
export type KnockReason = 'save' | 'curtain';
const listeners = new Set<Listener>();

export function onKnockAsk(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * A good moment has just happened. If the question was never put and iOS has
 * not already said yes, put it (the host shows the note). If iOS already said
 * yes for the audition reminders, there is nothing to ask: knocks are on.
 */
export async function maybeAskKnock(reason: KnockReason): Promise<void> {
  const state = await load();
  if (state.knockAsked) return;
  if (await hasNotificationPermission()) {
    await save({ ...state, knockAsked: true, knocksOn: true });
    return;
  }
  for (const fn of listeners) fn(reason);
}

export async function answerKnock(yes: boolean): Promise<boolean> {
  const state = await load();
  let on = false;
  if (yes) on = await requestNotificationPermission();
  track('app_knock_asked', { yes, granted: on });
  await save({ ...state, knockAsked: true, knocksOn: on });
  return on;
}

export async function knocksOn(): Promise<boolean> {
  return (await load()).knocksOn === true;
}
