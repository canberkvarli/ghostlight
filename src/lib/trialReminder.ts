import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { hasNotificationPermission } from './notifications';

/**
 * The one reminder the paywall promises: two days before the free trial
 * ends, a knock on the phone. Apple does not send this. If the phone never
 * granted notifications, nothing is scheduled, and the paywall leaves the
 * promise out of its timeline rather than make one it cannot keep.
 */
const KEY = 'ghostlight:trial-reminder';

/** When the reminder lands for a trial of `days` starting now: two days before the end, at ten in the morning. */
export function trialReminderAt(days: number, now = new Date()): Date | null {
  if (days <= 2) return null;
  const at = new Date(now);
  at.setDate(at.getDate() + days - 2);
  at.setHours(10, 0, 0, 0);
  return at;
}

export async function scheduleTrialReminder(days: number, now = new Date()): Promise<boolean> {
  const at = trialReminderAt(days, now);
  if (!at) return false;
  if (!(await hasNotificationPermission())) return false;
  await cancelTrialReminder();
  const ends = new Date(now);
  ends.setDate(ends.getDate() + days);
  const when = ends.toLocaleDateString(undefined, { weekday: 'long' });
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your free week ends in two days',
        body: `Keep the whole stage, or cancel in Settings before ${when} and pay nothing.`,
        data: { kind: 'trial' },
        sound: false,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    await AsyncStorage.setItem(KEY, id);
    return true;
  } catch {
    return false;
  }
}

export async function cancelTrialReminder(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to cancel.
  }
}
