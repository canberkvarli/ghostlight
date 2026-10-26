/**
 * Nights in the work: a streak of days in a row with something done, a scene
 * run or a speech opened, and the seven days of this week, Monday first.
 * Today with nothing yet does not break a streak that reached yesterday:
 * there is still tonight.
 */
export interface Streak {
  /** Days in a row, ending today or yesterday. */
  days: number;
  /** Monday to Sunday of this week: was something done that day. */
  week: boolean[];
  /** Something was done today. */
  today: boolean;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function streakOf(moments: (Date | string | null | undefined)[], now: Date = new Date()): Streak {
  const days = new Set<string>();
  for (const m of moments) {
    if (!m) continue;
    const d = typeof m === 'string' ? new Date(m) : m;
    if (!Number.isNaN(d.getTime()) && d.getTime() <= now.getTime()) days.add(dayKey(d));
  }
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const today = days.has(dayKey(at));
  const cursor = new Date(at);
  if (!today) cursor.setDate(cursor.getDate() - 1);
  let run = 0;
  while (days.has(dayKey(cursor))) { run += 1; cursor.setDate(cursor.getDate() - 1); }
  const monday = new Date(at);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return days.has(dayKey(d));
  });
  return { days: run, week, today };
}
