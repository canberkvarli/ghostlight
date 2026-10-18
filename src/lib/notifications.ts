import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { attachedPiece, type Audition } from '../api/auditions';
import { track } from './analytics';

/**
 * Local reminders. No push server, no token, nothing leaves the phone: the
 * app knows the auditions (from `/api/auditions`) and the phone keeps the
 * clock, which is all a reminder needs.
 *
 * Two per audition: 8pm the evening before, and two hours before. Both are
 * specific on purpose. "You have a reminder" is what every app says; "Your
 * audition for Ophelia is tomorrow at 10. Hamlet is in your book." is what a
 * friend would text, and it is also the only kind of notification an actor
 * will not swipe away.
 *
 * Permission is asked for exactly once, the first time someone saves an
 * audition, never at launch. Until then every function here is a no-op.
 *
 * The map from audition id to the two scheduled ids lives in AsyncStorage so a
 * delete, an edit or a fresh sync can cancel precisely what it scheduled and
 * nothing else.
 */

const MAP_KEY = 'gl.reminders.v1';
const CALLBOARD_KEY = 'gl.callboard.v1';
/** Auditions whose phone reminders were switched off on the file. */
const OFF_KEY = 'gl.reminders.off.v1';

export type ReminderMoment = 'eve' | 'soon' | 'callboard' | 'tonight' | 'left';

export interface ReminderData {
  moment: ReminderMoment;
  auditionId?: number;
  monologueId?: number | string;
  [key: string]: unknown;
}

const EVE_HOUR = 20;
const SOON_MS = 2 * 60 * 60 * 1000;
/** Never schedule something that fires before the user has put the phone down. */
const MIN_LEAD_MS = 60 * 1000;

type Scheduled = Record<string, string[]>;

async function loadMap(): Promise<Scheduled> {
  try {
    const raw = await AsyncStorage.getItem(MAP_KEY);
    return raw ? (JSON.parse(raw) as Scheduled) : {};
  } catch {
    return {};
  }
}

async function saveMap(m: Scheduled): Promise<void> {
  try {
    await AsyncStorage.setItem(MAP_KEY, JSON.stringify(m));
  } catch {
    // A reminder bookkeeping failure must never surface as an app error.
  }
}

async function loadOff(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(OFF_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function saveOff(off: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(OFF_KEY, JSON.stringify([...off]));
  } catch {
    /* ignore */
  }
}

/** Whether this audition's phone reminders were switched off on its file. */
export async function phoneRemindersOff(auditionId: number): Promise<boolean> {
  return (await loadOff()).has(String(auditionId));
}

/**
 * The switch on the file. Off cancels what is scheduled and remembers the
 * choice, so a sync or an edit does not quietly put the pair back. On forgets
 * it and schedules again.
 */
export async function setPhoneReminders(a: Audition, on: boolean): Promise<void> {
  const off = await loadOff();
  if (on) off.delete(String(a.id));
  else off.add(String(a.id));
  await saveOff(off);
  if (on) await scheduleRemindersFor(a);
  else await cancelRemindersFor(a.id);
}

/** Foreground presentation: show the banner even while the app is open. */
export function configureNotifications(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    /* ignore */
  }
}

/** True without ever prompting. The launch path uses this and only this. */
export async function hasNotificationPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Ask, once, at the first audition save. iOS only shows its sheet the first
 * time; after a refusal the only way back is Settings, so a `false` here is
 * final for this install and the caller should say so quietly, not nag.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    if (!current.canAskAgain && current.status === 'denied') return false;
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return status === 'granted';
  } catch {
    return false;
  }
}

/** "10", "10:30", "7pm"-free: the hour as a person says it. */
function sayTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mins = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  // A morning hour stands alone ("tomorrow at 10"); the rest say which half.
  const suffix = h < 7 ? 'am' : h < 12 ? '' : 'pm';
  return `${hour12}${mins}${suffix}`;
}

function whatFor(a: Audition): string {
  return a.role?.trim() || a.project.trim();
}

/** The second sentence: the piece, if there is one, so the reminder is also a cue. */
function bookLine(a: Audition): string {
  const piece = attachedPiece(a);
  if (!piece?.title) return '';
  return ` ${piece.title} is in your book.`;
}

function eveBody(a: Audition, when: Date): string {
  const tape = a.kind === 'self_tape';
  const head = tape
    ? `Your tape for ${whatFor(a)} is due tomorrow at ${sayTime(when)}.`
    : `Your audition for ${whatFor(a)} is tomorrow at ${sayTime(when)}.`;
  return head + bookLine(a);
}

function soonBody(a: Audition, when: Date): string {
  const tape = a.kind === 'self_tape';
  const head = tape
    ? `Your tape for ${whatFor(a)} is due at ${sayTime(when)}, in two hours.`
    : `${whatFor(a)} is at ${sayTime(when)}, in two hours.`;
  const piece = attachedPiece(a);
  const tail = piece?.title ? ` One more read of ${piece.title}?` : '';
  return head + tail;
}

async function schedule(
  title: string,
  body: string,
  at: Date,
  data: ReminderData,
): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  } catch {
    return null;
  }
}

async function cancelIds(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}

/** Cancel whatever was scheduled for one audition, and forget it. */
export async function cancelRemindersFor(auditionId: number): Promise<void> {
  const map = await loadMap();
  const ids = map[String(auditionId)];
  if (!ids) return;
  await cancelIds(ids);
  delete map[String(auditionId)];
  await saveMap(map);
}

/**
 * (Re)schedule both reminders for one audition. Always cancels first, so an
 * edit that moves the time never leaves the old pair behind. Honours the
 * server's `reminders_on` and skips auditions already in the past or closed.
 */
export async function scheduleRemindersFor(a: Audition, { quiet = false } = {}): Promise<void> {
  if (!(await hasNotificationPermission())) return;
  await cancelRemindersFor(a.id);
  if (!a.reminders_on || a.scope !== 'upcoming' || !a.when) return;
  if (await phoneRemindersOff(a.id)) return;

  const when = new Date(a.when);
  const now = new Date();
  const piece = attachedPiece(a);
  const base: ReminderData = {
    moment: 'eve',
    auditionId: a.id,
    monologueId: piece?.monologue_id ?? undefined,
  };
  const ids: string[] = [];

  const eve = new Date(when);
  eve.setDate(eve.getDate() - 1);
  eve.setHours(EVE_HOUR, 0, 0, 0);
  if (eve.getTime() - now.getTime() > MIN_LEAD_MS) {
    const id = await schedule(a.project, eveBody(a, when), eve, { ...base, moment: 'eve' });
    if (id) {
      ids.push(id);
      if (!quiet) track('app_reminder_scheduled', { moment: 'eve', has_piece: Boolean(piece) });
    }
  }

  const soon = new Date(when.getTime() - SOON_MS);
  if (soon.getTime() - now.getTime() > MIN_LEAD_MS) {
    const id = await schedule(a.project, soonBody(a, when), soon, { ...base, moment: 'soon' });
    if (id) {
      ids.push(id);
      if (!quiet) track('app_reminder_scheduled', { moment: 'soon', has_piece: Boolean(piece) });
    }
  }

  if (ids.length) {
    const map = await loadMap();
    map[String(a.id)] = ids;
    await saveMap(map);
  }
}

/**
 * Make the phone's schedule match the server's list. Called on launch and on
 * sign-in, so an audition added on the website gets its reminders too, and one
 * deleted there loses them. Quiet: a sync is housekeeping, not an event.
 */
export async function syncReminders(list: Audition[]): Promise<void> {
  if (!(await hasNotificationPermission())) return;
  const map = await loadMap();
  const live = new Set(list.map((a) => String(a.id)));
  for (const key of Object.keys(map)) {
    if (!live.has(key)) {
      await cancelIds(map[key]);
      delete map[key];
    }
  }
  await saveMap(map);
  // An audition deleted on the website takes its "off" with it.
  const off = await loadOff();
  let trimmed = false;
  for (const key of off) {
    if (!live.has(key)) {
      off.delete(key);
      trimmed = true;
    }
  }
  if (trimmed) await saveOff(off);
  for (const a of list) await scheduleRemindersFor(a, { quiet: true });
}

/** Everything, on sign-out: the next account must not inherit this one's week. */
export async function clearAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* ignore */
  }
  await saveMap({});
  try {
    await AsyncStorage.multiRemove([CALLBOARD_KEY, OFF_KEY]);
  } catch {
    /* ignore */
  }
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Audition reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    /* ignore */
  }
}
