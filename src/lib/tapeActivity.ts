/**
 * The self-tape countdown on the lock screen (CAN-33): keeps it in step with
 * the Board. Called when the auditions are read (launch, sign-in), when one
 * changes (marked sent), and when the app comes back to the front, since a
 * Live Activity can only be started while the app is open.
 */
import { AppState } from 'react-native';

import { tapeActivity } from '../../modules/tape-activity';
import type { Audition } from '../api/auditions';
import { countdownFor, countdownUrl } from './callboard';

let last: Audition[] = [];
let watching = false;

export async function syncTapeCountdown(auditions?: Audition[]): Promise<void> {
  if (auditions) last = auditions;
  if (!tapeActivity) return;
  if (!watching) {
    watching = true;
    AppState.addEventListener('change', (s) => { if (s === 'active') void syncTapeCountdown(); });
  }
  try {
    if (!tapeActivity.isAvailable()) return;
    const a = countdownFor(last);
    const running = tapeActivity.running();
    if (!a) {
      if (running) {
        // The one running was just sent: it says so for a while. Otherwise it goes.
        const was = last.find((x) => countdownUrl(x) === running);
        await tapeActivity.end(Boolean(was && was.kind === 'self_tape' && was.status === 'submitted'));
      }
      return;
    }
    await tapeActivity.start({ project: a.project, role: a.role?.trim() ?? '', url: countdownUrl(a), dueMs: Date.parse(a.when!) });
  } catch {
    /* Live Activities off, or too many: the reminders still come */
  }
}
