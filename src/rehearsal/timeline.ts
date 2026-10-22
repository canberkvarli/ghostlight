// Carried from actorrise lib/rehearsal (commit 9e3414b9). Pure; keep in step with the web,
// the server's line contract and journal are shared.

/** The per-line latency marks, on the audio clock (seconds). */
export type Mark = 'delta' | 'handover' | 'partner_scheduled' | 'partner_end' | 'mic_open' | 'first_delta';

export class Timeline {
  private marks: Partial<Record<Mark, number>> = {};
  mark(m: Mark, t: number) { this.marks[m] = t; }
  get(m: Mark) { return this.marks[m]; }
  reset() { this.marks = {}; }
  /** Last delta → partner scheduled, ms. The number the contract is about. */
  handoverMs(): number | null {
    const a = this.marks.delta, b = this.marks.partner_scheduled;
    if (a === undefined || b === undefined) return null;
    return Math.round((b - a) * 1000);
  }
}
