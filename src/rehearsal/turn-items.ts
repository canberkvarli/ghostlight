// Carried from actorrise lib/rehearsal (commit 9e3414b9). Pure; keep in step with the web,
// the server's line contract and journal are shared.

/**
 * The actor's turn transcript, built from the transcriber's items so late
 * words stay on their line. The transcript is the turn's items joined in
 * arrival order; `completed` replaces only its own item. Items seen in an
 * earlier turn are retired, and anything for them afterwards is dropped, so
 * the tail of one line (or its tidied-up `completed`) never lands on the next
 * line when two actor lines run back to back. An event with no id is accepted
 * and its item never retired: retiring '' would block every later id-less event.
 */
export class TurnItems {
  private items = new Map<string, string>();
  private retired = new Set<string>();

  /** False if the item belongs to an earlier turn (dropped). */
  delta(id: string | undefined, text: string): boolean {
    const k = id ?? '';
    if (this.retired.has(k)) return false;
    this.items.set(k, (this.items.get(k) ?? '') + text);
    return true;
  }

  /** The model's tidied version of one item: replaces that item's text only. */
  completed(id: string | undefined, text: string): boolean {
    const k = id ?? '';
    if (this.retired.has(k)) return false;
    this.items.set(k, text);
    return true;
  }

  text(): string { return [...this.items.values()].join(' '); }

  /** Retire every item seen this turn and start empty. True if any words were heard. */
  endTurn(): boolean {
    const heard = [...this.items.values()].some(t => t.trim());
    this.items.forEach((_t, k) => { if (k) this.retired.add(k); });
    this.items = new Map();
    return heard;
  }
}
