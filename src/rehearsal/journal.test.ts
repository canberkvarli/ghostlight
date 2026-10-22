import { describe, expect, it, vi } from 'vitest';
import { Journal } from './journal';

const make = () => {
  const sent: unknown[][] = [];
  const transport = { send: vi.fn(async (events: unknown[]) => { sent.push(events); }), beacon: vi.fn(() => true) };
  return { j: new Journal(transport), sent, transport };
};

describe('Journal', () => {
  it('numbers events from zero', () => {
    const { j } = make();
    j.emit('started', null, 0);
    j.emit('line_reached', 0, 5);
    expect(j.pending().map(e => e.seq)).toEqual([0, 1]);
  });
  it('flush sends everything pending once', async () => {
    const { j, sent } = make();
    j.emit('started', null, 0);
    await j.flush();
    await j.flush();
    expect(sent).toHaveLength(1);
    expect(j.pending()).toHaveLength(0);
  });
  it('a failed flush keeps the events for the next one', async () => {
    const { j, transport, sent } = make();
    transport.send.mockRejectedValueOnce(new Error('offline'));
    j.emit('started', null, 0);
    await j.flush();
    expect(j.pending()).toHaveLength(1);
    j.emit('line_reached', 0, 1);
    await j.flush();
    expect(sent[0]).toHaveLength(2);
  });
  it('beacon hands everything pending to the transport synchronously', () => {
    const { j, transport } = make();
    j.emit('abandoned', 2, 9);
    j.beacon();
    expect(transport.beacon).toHaveBeenCalledWith([expect.objectContaining({ type: 'abandoned', seq: 0 })]);
    expect(j.pending()).toHaveLength(0);
  });
});
