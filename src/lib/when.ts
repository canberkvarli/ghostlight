/**
 * Dates the way the callboard writes them: "Thu 16 Oct", "10:30", "in 3 days".
 * Local time throughout; the server stores UTC and the phone knows where it is.
 */

const DAY = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d) - startOfDay(now)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${weekday} ${date}${year}`;
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "(in 3 days.)" / "(tomorrow.)" / "(today.)" — the stage direction under a card. */
export function distanceLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d) - startOfDay(now)) / DAY);
  if (days === 0) return d.getTime() < now.getTime() ? 'earlier today' : 'today';
  if (days === 1) return 'tomorrow';
  if (days < 0) return days === -1 ? 'yesterday' : `${-days} days ago`;
  if (days < 14) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  return `in ${weeks} week${weeks === 1 ? '' : 's'}`;
}

/** The phone's IANA zone, which is what `/api/auditions` wants in `tz`. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Tomorrow at 10:00, the most common audition slot and a sane default. */
export function defaultAuditionDate(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}
