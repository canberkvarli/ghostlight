// Carried from actorrise lib/rehearsal (commit 9e3414b9). Pure; keep in step with the web,
// the server's line contract and journal are shared.

/**
 * The run journal, client side. Appends locally, flushes in batches, never
 * blocks anything: the loop calls `emit` and moves on. The server dedupes on
 * (run, seq), so a batch that is sent twice costs nothing.
 */
import type { EventType, JournalEvent } from './contract';

export interface JournalTransport {
  send: (events: JournalEvent[]) => Promise<void>;
  /** navigator.sendBeacon, or false if it could not be queued. */
  beacon: (events: JournalEvent[]) => boolean;
}

export class Journal {
  private seq = 0;
  private queue: JournalEvent[] = [];
  private inflight: JournalEvent[] = [];
  private flushing = false;

  constructor(private transport: JournalTransport) {}

  emit(type: EventType, lineIndex: number | null, atMs: number, payload: Record<string, unknown> = {}) {
    this.queue.push({ seq: this.seq++, type, line_index: lineIndex, at_ms: Math.round(atMs), payload });
  }

  pending(): JournalEvent[] { return [...this.inflight, ...this.queue]; }

  async flush(): Promise<void> {
    if (this.flushing || (this.queue.length === 0 && this.inflight.length === 0)) return;
    this.flushing = true;
    const batch = [...this.inflight, ...this.queue];
    this.inflight = batch;
    this.queue = [];
    try {
      await this.transport.send(batch);
      this.inflight = [];
    } catch {
      // Keep them; the next flush (or the beacon) carries them.
    } finally {
      this.flushing = false;
    }
  }

  beacon(): void {
    const batch = [...this.inflight, ...this.queue];
    if (!batch.length) return;
    if (this.transport.beacon(batch)) { this.inflight = []; this.queue = []; }
  }
}
