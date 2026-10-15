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

/** Calendar days from now to the moment, in the phone's zone. Negative once it has passed. */
export function daysUntil(iso: string, now = new Date()): number {
  return Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / DAY);
}

/** "2:40 pm", "10 am": the clock the way a person says it. */
export function clockLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mins = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${hour12}${mins} ${h < 12 ? 'am' : 'pm'}`;
}

interface Dated {
  when: string | null;
  kind: 'in_person' | 'self_tape' | 'virtual';
  status: 'submitted' | 'scheduled' | 'callback' | 'booked' | 'pinned' | 'passed';
  scope: 'upcoming' | 'waiting' | 'past';
}

/**
 * The line over the title, the website's: "Next up · in 5 days", "Tomorrow at
 * 2:40 pm", "Tape due today at 6 pm", "Waiting to hear", "Booked".
 */
export function eyebrow(a: Dated, next = false, now = new Date()): string {
  if (a.status === 'booked') return 'Booked';
  if (a.status === 'passed') return 'Not this time';
  if (a.scope !== 'upcoming') return a.status === 'callback' ? 'Callback' : 'Waiting to hear';
  const d = a.when ? daysUntil(a.when, now) : null;
  const at = a.when ? clockLabel(a.when) : '';
  const due = a.kind === 'self_tape';
  if (d === 0) return due ? `Tape due today at ${at}` : `Today at ${at}`;
  if (d === 1) return due ? `Tape due tomorrow at ${at}` : `Tomorrow at ${at}`;
  const lead = next ? 'Next up' : a.status === 'callback' ? 'Callback' : 'Coming up';
  return d == null ? lead : `${lead} · in ${d} days`;
}

/** "Tuesday, Oct 21 at 2:40 pm", or "Due Friday, Oct 24 at 6 pm" for a tape. */
export function whenSentence(a: Pick<Dated, 'when' | 'kind'>, now = new Date()): string | null {
  if (!a.when) return null;
  const d = new Date(a.when);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${a.kind === 'self_tape' ? 'Due ' : ''}${weekday}, ${date}${year} at ${clockLabel(a.when)}`;
}

/** The ticket stub: ["OCT", "21"], or ["DUE", "21"] for a tape still to send. */
export function stubLabel(a: Pick<Dated, 'when' | 'kind' | 'scope'>): [string, string] {
  if (!a.when) return ['TBD', '?'];
  const d = new Date(a.when);
  const month = a.kind === 'self_tape' && a.scope === 'upcoming' ? 'DUE' : d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  return [month, String(d.getDate())];
}
