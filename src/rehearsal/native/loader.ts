/**
 * Partner lines, fetched and decoded in order, always ahead of the scene.
 * A line that was null at open (cold cache) is polled every 250ms until the
 * server says ready. Files are kept by key in the cache directory, so a scene
 * run once plays again with no signal, and a voice shared by two scenes is
 * fetched once.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { type LineSource, pollAudio } from '../../api/rehearsal';
import type { LinePlayer } from './player';

const POLL_MS = 250;
/** A line is tried this many times, then it stays failed; the run tells the actor rather than spinning. */
const MAX_ATTEMPTS = 3;

export class LineLoader {
  private order: number[] = [];
  private sources = new Map<number, LineSource>();
  private started = new Set<number>();
  private attempts = new Map<number, number>();
  private inflight = 0;
  private stopped = false;
  onReady: ((lineIndex: number) => void) | null = null;
  onFailed: ((lineIndex: number, why: string) => void) | null = null;

  constructor(private player: LinePlayer, private concurrency = 2) {}

  set(lineIndex: number, src: LineSource) { this.sources.set(lineIndex, src); if (!this.order.includes(lineIndex)) this.order.push(lineIndex); }

  /** Make sure `lineIndex` and the lines after it are moving. Called on every engine change. */
  ahead(lineIndex: number) { this.pump(lineIndex); }

  private pump(from = 0) {
    const room = this.concurrency - this.inflight;
    if (room <= 0 || this.stopped) return;
    const pending = this.order.filter(i => i >= from && !this.started.has(i) && !this.player.has(i) && (this.attempts.get(i) ?? 0) < MAX_ATTEMPTS);
    for (const i of pending.slice(0, room)) void this.load(i);
  }

  private async load(i: number): Promise<void> {
    const src = this.sources.get(i);
    if (!src || this.started.has(i) || this.player.has(i)) return;
    this.started.add(i);
    this.attempts.set(i, (this.attempts.get(i) ?? 0) + 1);
    this.inflight++;
    let decoded = false;
    try {
      const file = cached(src.key);
      if (!file.exists) {
        let url = src.url;
        while (!url && !this.stopped) {
          await new Promise(r => setTimeout(r, POLL_MS));
          url = await pollAudio(src.key);
        }
        if (!url) return; // stopped while polling
        await File.downloadFileAsync(url, file);
      }
      await this.player.load(i, file.uri);
      decoded = true;
    } catch (e) {
      this.started.delete(i);
      this.onFailed?.(i, e instanceof Error ? e.message : String(e));
    } finally {
      this.inflight--;
    }
    if (decoded) { this.onReady?.(i); this.pump(i); }
  }

  stop() {
    this.stopped = true;
    for (const i of this.started) if (!this.player.has(i)) this.started.delete(i);
  }
}

const dir = () => { const d = new Directory(Paths.cache, 'partner'); if (!d.exists) d.create(); return d; };
const cached = (key: string) => new File(dir(), `${key}.mp3`);
