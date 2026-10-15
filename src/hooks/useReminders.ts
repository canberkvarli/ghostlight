import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';

import { listAuditions } from '../api/auditions';
import { getDiscover } from '../api/client';
import { track } from '../lib/analytics';
import {
  ensureAndroidChannel,
  scheduleCallboard,
  syncReminders,
  type ReminderData,
} from '../lib/notifications';

/**
 * The two halves of reminders that need the app running: putting the week on
 * the schedule, and answering a tap.
 *
 * Sync runs once per signed-in session (and again whenever the identity
 * changes), so an audition typed into the website on a laptop gets its two
 * reminders the next time the phone opens the app. The callboard pick rides
 * along for anyone whose phone already allows notifications.
 *
 * A tap opens the attached piece in the reader; a reminder with no piece opens
 * the list. The cold-start case (app killed, notification tapped) is answered
 * from `getLastNotificationResponseAsync` once the navigator exists.
 */
export function useReminderSync(isAuthenticated: boolean, userId: string | undefined) {
  useEffect(() => {
    void ensureAndroidChannel();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    void (async () => {
      try {
        const list = await listAuditions();
        if (alive) await syncReminders(list);
      } catch {
        // Offline: the phone keeps whatever it already had.
      }
      try {
        const lineup = await getDiscover(8);
        const pick = lineup[0];
        if (alive && pick) {
          await scheduleCallboard({
            id: String(pick.id),
            title: pick.title,
            character: pick.character_name,
            source: pick.play_title,
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAuthenticated, userId]);
}

export function useReminderTaps() {
  const router = useRouter();
  const ready = Boolean(useRootNavigationState()?.key);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    const open = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      const data = response.notification.request.content.data as Partial<ReminderData> | undefined;
      const moment = data?.moment ?? 'eve';
      const monologueId = data?.monologueId;
      const auditionId = data?.auditionId;
      track('app_reminder_opened', { moment, has_piece: monologueId != null });
      // The night-before note opens the audition's file, where the piece, the
      // bring list and the room are. Two hours out there is one job left:
      // read the piece once more, so that one opens the reader.
      if (moment === 'soon' && monologueId != null) router.push(`/read/${monologueId}`);
      else if (auditionId != null) router.push({ pathname: '/prep', params: { id: String(auditionId) } });
      else if (monologueId != null) router.push(`/read/${monologueId}`);
      else router.push('/auditions');
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (r) open(r);
      })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [ready, router]);
}
