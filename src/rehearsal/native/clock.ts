/**
 * The run's clock, in seconds. The web uses the AudioContext's clock so a
 * beat is scheduled to the sample; the phone has no such clock exposed, so
 * this is the monotonic one, and `schedule` re-arms a late timer so nothing
 * fires early. Jitter is tens of milliseconds against a 300ms breath.
 */
export class Clock {
  now(): number { return performance.now() / 1000; }
  /** iOS speaker path. Not measured; the engine subtracts it from a beat's start. */
  outputLatency(): number { return 0.03; }
  schedule(at: number, fn: () => void): () => void {
    let handle: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      const ms = Math.max(0, (at - this.now()) * 1000);
      handle = setTimeout(() => { if (this.now() + 0.002 >= at) fn(); else arm(); }, ms);
    };
    arm();
    return () => { if (handle) clearTimeout(handle); };
  }
}
