import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

import type { Audition } from '../api/auditions';

/**
 * One audition into the phone's own calendar, as an event: what a tap on
 * "add to calendar" means to anyone. The phone asks for the calendar the
 * first time; after that it is one tap.
 */
export async function addAuditionToCalendar(a: Audition): Promise<'added' | 'denied' | 'undated' | 'failed'> {
  if (!a.when) return 'undated';
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return 'denied';
    const cal = await writableCalendar();
    if (!cal) return 'failed';
    const start = new Date(a.when);
    const end = new Date(start.getTime() + 60 * 60_000);
    await Calendar.createEventAsync(cal.id, {
      title: [a.project, a.role].filter(Boolean).join(' · '),
      startDate: start,
      endDate: end,
      location: a.location ?? undefined,
      notes: [a.casting ? `Casting: ${a.casting}` : null, a.notes].filter(Boolean).join('\n') || undefined,
      alarms: [{ relativeOffset: -120 }],
    });
    return 'added';
  } catch {
    return 'failed';
  }
}

async function writableCalendar(): Promise<{ id: string } | null> {
  if (Platform.OS === 'ios') {
    const d = await Calendar.getDefaultCalendarAsync().catch(() => null);
    if (d) return d;
  }
  const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return all.find((c) => c.allowsModifications) ?? all[0] ?? null;
}
