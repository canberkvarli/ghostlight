/**
 * The Callboard: what is waiting for the actor, in one place.
 *
 * Not a feed. Every line is about the actor's own work, comes from what the
 * app already knows (the Board, the takes, tonight's speech, the piece left
 * on the stand), and goes by itself once it is done: a tape marked sent, an
 * outcome logged, a callback added. Nothing here sells anything.
 *
 * Most urgent first: a kept take that has not gone to casting, then what is
 * due, then what needs an answer, then the evening's reading.
 *
 * Pure, so callboard.test.ts pins it. The trial is left out on purpose:
 * Canberk removed every "your trial is ending" message (2026-09-29).
 */
import type { Audition } from '../api/auditions';
import type { Medium } from '../theme/medium';
import type { Take } from './takes';
import { clockLabel, dayLabel, daysUntil } from './when';

export type CallKind = 'tape' | 'audition' | 'callback' | 'after' | 'tonight' | 'left';

export type CallRoute =
  | { pathname: '/tape/[id]'; params: { id: string; take?: string; audition?: string } }
  | { pathname: '/prep'; params: { id: string } }
  | { pathname: '/outcome'; params: { id: string } }
  | { pathname: '/read/[id]'; params: { id: string; medium?: Medium } };

export interface Call {
  /** Seen once per key: a new key is a new line, and lights the bell again. */
  key: string;
  kind: CallKind;
  title: string;
  sub: string;
  route: CallRoute;
}

export interface CallboardInput {
  auditions: Audition[];
  takes: Take[];
  tonight: { id: string; character: string; source: string } | null;
  left: { id: string; character: string; medium: Medium } | null;
  medium: Medium;
}

/** Self-tapes due in the next week, still to send. */
const AHEAD_DAYS = 7;
/** How long after an audition "how did it go" stays up. */
const AFTER_DAYS = 3;

const sent = (a: Audition) => a.kind === 'self_tape' && a.status === 'submitted';
const dueLine = (iso: string, now: Date) => `${dayLabel(iso, now)} ${clockLabel(iso)}`;

/** A self-tape not yet sent, due in the coming week. */
export function tapeDue(a: Audition, now = new Date()): boolean {
  if (a.kind !== 'self_tape' || sent(a) || !a.when || a.scope !== 'upcoming') return false;
  const d = daysUntil(a.when, now);
  return d >= 0 && d <= AHEAD_DAYS;
}

export function callboard(input: CallboardInput, now = new Date()): Call[] {
  const { auditions, takes, tonight, left, medium } = input;
  const out: Call[] = [];
  const byId = new Map(auditions.map((a) => [a.id, a]));

  // A take you kept for an audition that is still to send: the most urgent thing there is.
  for (const t of takes) {
    if (!t.starred || t.auditionId == null) continue;
    const a = byId.get(t.auditionId);
    if (!a || !tapeDue(a, now)) continue;
    out.push({
      key: `tape:${t.id}`,
      kind: 'tape',
      title: `Take ${t.number} for ${a.project}`,
      sub: `Kept, not sent yet. Due ${dueLine(a.when!, now)}.`,
      route: { pathname: '/tape/[id]', params: { id: t.pieceId, take: t.id, audition: String(a.id) } },
    });
  }

  // What is coming, soonest first.
  const upcoming = auditions
    .filter((a) => a.scope === 'upcoming' && a.when && daysUntil(a.when, now) >= 0 && daysUntil(a.when, now) <= AHEAD_DAYS && !sent(a))
    .sort((x, y) => Date.parse(x.when!) - Date.parse(y.when!));
  for (const a of upcoming) {
    const tape = a.kind === 'self_tape';
    const mid = a.pieces.find((p) => p.monologue_id != null)?.monologue_id;
    out.push({
      key: `audition:${a.id}:${a.when}`,
      kind: 'audition',
      title: a.project,
      sub: tape ? `Tape due ${dueLine(a.when!, now)}.` : `Audition ${dueLine(a.when!, now)}.`,
      route: tape
        ? { pathname: '/tape/[id]', params: { id: mid != null ? String(mid) : 'free', audition: String(a.id) } }
        : { pathname: '/prep', params: { id: String(a.id) } },
    });
  }

  // A callback that came, not yet on the board.
  for (const a of auditions) {
    if (a.status !== 'callback' || a.callback_id) continue;
    out.push({
      key: `callback:${a.id}`,
      kind: 'callback',
      title: a.project,
      sub: 'A callback. Put it on the board.',
      route: { pathname: '/prep', params: { id: String(a.id) } },
    });
  }

  // Gone, and not yet said how it went.
  for (const a of auditions) {
    if (!a.when || (a.status !== 'scheduled' && a.status !== 'submitted')) continue;
    const ago = -daysUntil(a.when, now);
    if (ago < 0 || ago > AFTER_DAYS || Date.parse(a.when) > now.getTime()) continue;
    out.push({
      key: `after:${a.id}`,
      kind: 'after',
      title: a.project,
      sub: a.kind === 'self_tape' ? 'Tape is in. How do you feel about it?' : 'How did it go? One tap to say.',
      route: { pathname: '/outcome', params: { id: String(a.id) } },
    });
  }

  if (tonight) {
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    out.push({
      key: `tonight:${day}:${tonight.id}`,
      kind: 'tonight',
      title: tonight.character,
      sub: `Tonight's speech, from ${tonight.source}.`,
      route: { pathname: '/read/[id]', params: { id: tonight.id, medium } },
    });
  }

  if (left && left.id !== tonight?.id) {
    out.push({
      key: `left:${left.id}`,
      kind: 'left',
      title: left.character,
      sub: 'Where you left it. Pick it up again.',
      route: { pathname: '/read/[id]', params: { id: left.id, medium: left.medium } },
    });
  }

  return out;
}

/** The tab bar's two marks: self-tapes due this week, and kept takes waiting to go. */
export function badges(auditions: Audition[], takes: Take[], now = new Date()): { due: number; unsent: number } {
  const due = auditions.filter((a) => tapeDue(a, now));
  const dueIds = new Set(due.map((a) => a.id));
  const unsent = takes.filter((t) => t.starred && t.auditionId != null && dueIds.has(t.auditionId)).length;
  return { due: due.length, unsent };
}

/** iOS keeps a Live Activity up for about eight hours. */
const COUNTDOWN_HOURS = 8;

/** The self-tape the lock screen counts down to: the soonest due within eight hours, not yet sent. */
export function countdownFor(auditions: Audition[], now = new Date()): Audition | null {
  const soon = auditions
    .filter((a) => a.kind === 'self_tape' && !sent(a) && a.when)
    .filter((a) => { const ms = Date.parse(a.when!) - now.getTime(); return ms > 0 && ms <= COUNTDOWN_HOURS * 3600_000; })
    .sort((x, y) => Date.parse(x.when!) - Date.parse(y.when!));
  return soon[0] ?? null;
}

/** Where "Tape it" on the lock screen goes: the tape room on the audition's piece. */
export function countdownUrl(a: Audition): string {
  const mid = a.pieces.find((p) => p.monologue_id != null)?.monologue_id;
  return `ghostlight://tape/${mid != null ? mid : 'free'}?audition=${a.id}`;
}
