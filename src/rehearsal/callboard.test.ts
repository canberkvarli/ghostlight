import { describe, expect, it } from 'vitest';
import type { Audition } from '../api/auditions';
import type { Take } from '../lib/takes';
import { badges, callboard, tapeDue } from '../lib/callboard';

const NOW = new Date('2026-11-09T12:00:00');
const inDays = (d: number, h = 17) => { const x = new Date(NOW); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };

function aud(over: Partial<Audition>): Audition {
  return {
    id: 1, project: 'Proof', role: 'Catherine', kind: 'self_tape', status: 'scheduled', starts_at: null, due_at: inDays(3), when: inDays(3),
    tz: 'America/New_York', location: null, casting: null, material_raw: null, bring: null, tape_link: null, notes: null,
    reminders_on: true, reminder_moments: ['prep', 'eve', 'after'], scope: 'upcoming', created_at: null, after_notes: null,
    bring_list: [], callback_id: null, pieces: [{ id: 9, monologue_id: 42, scene_id: null, used: false, title: 'S', character: 'Catherine', play_title: 'Proof' }],
    assist: null, ...over,
  } as Audition;
}
function take(over: Partial<Take>): Take {
  return { id: 't1', pieceId: '42', number: 3, file: 'f.mov', createdAt: 0, durationMs: 60000, endMs: 58000, starred: true, auditionId: 1, ...over };
}
const base = { tonight: null, left: null, medium: 'theatre' as const };

describe('callboard', () => {
  it('puts a kept take still to send first, opening the take in the tape room', () => {
    const calls = callboard({ ...base, auditions: [aud({})], takes: [take({})] }, NOW);
    expect(calls[0].kind).toBe('tape');
    expect(calls[0].title).toBe('Take 3 for Proof');
    expect(calls[0].route).toEqual({ pathname: '/tape/[id]', params: { id: '42', take: 't1', audition: '1' } });
  });

  it('a due self-tape opens the tape room on its piece; an in-person one opens the file', () => {
    const calls = callboard({ ...base, auditions: [aud({}), aud({ id: 2, kind: 'in_person', project: 'Glass' })], takes: [] }, NOW);
    expect(calls.map((c) => c.route.pathname)).toEqual(['/tape/[id]', '/prep']);
    expect(calls[0].sub.startsWith('Tape due')).toBe(true);
  });

  it('drops a self-tape once it is marked sent, and its kept takes with it', () => {
    const calls = callboard({ ...base, auditions: [aud({ status: 'submitted' })], takes: [take({})] }, NOW);
    expect(calls).toEqual([]);
  });

  it('leaves out what is more than a week off, and unkept takes', () => {
    const calls = callboard({ ...base, auditions: [aud({ when: inDays(10), due_at: inDays(10) })], takes: [take({ starred: false })] }, NOW);
    expect(calls).toEqual([]);
  });

  it('asks how it went for three days after, then lets it go', () => {
    const gone = aud({ kind: 'in_person', when: inDays(-1, 10), scope: 'waiting' });
    expect(callboard({ ...base, auditions: [gone], takes: [] }, NOW)[0].kind).toBe('after');
    const long = aud({ kind: 'in_person', when: inDays(-5, 10), scope: 'waiting' });
    expect(callboard({ ...base, auditions: [long], takes: [] }, NOW)).toEqual([]);
  });

  it('a callback not yet on the board, until it is', () => {
    expect(callboard({ ...base, auditions: [aud({ status: 'callback', scope: 'past', when: inDays(-10) })], takes: [] }, NOW)[0].kind).toBe('callback');
    expect(callboard({ ...base, auditions: [aud({ status: 'callback', callback_id: 7, scope: 'past', when: inDays(-10) })], takes: [] }, NOW)).toEqual([]);
  });

  it("tonight's speech is a new line each day; the piece you left is not said twice", () => {
    const t = { id: '5', character: 'Hamlet', source: 'Hamlet' };
    const a = callboard({ ...base, auditions: [], takes: [], tonight: t, left: { id: '5', character: 'Hamlet', medium: 'theatre' } }, NOW);
    expect(a.map((c) => c.kind)).toEqual(['tonight']);
    const tomorrow = new Date(NOW); tomorrow.setDate(tomorrow.getDate() + 1);
    const b = callboard({ ...base, auditions: [], takes: [], tonight: t }, tomorrow);
    expect(b[0].key).not.toBe(a[0].key);
  });
});

describe('badges', () => {
  it('counts self-tapes due this week and kept takes waiting to go', () => {
    expect(badges([aud({}), aud({ id: 2, status: 'submitted' })], [take({}), take({ id: 't2', auditionId: 2 })], NOW)).toEqual({ due: 1, unsent: 1 });
    expect(tapeDue(aud({ kind: 'in_person' }), NOW)).toBe(false);
  });
});
