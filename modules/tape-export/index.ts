import { requireOptionalNativeModule } from 'expo';

interface TapeExportNative {
  exportTake(options: { input: string; output: string; startMs: number; endMs: number; mark: boolean }): Promise<string>;
  /** From build 58. Undefined on a build before it. */
  exportJoined?(options: { clips: { input: string; startMs: number; endMs: number }[]; output: string; mark: boolean; shapeFrom: number }): Promise<string>;
}

/** Null in a build without the module (Expo Go, an old dev build): saving falls back to the raw file. */
const native = requireOptionalNativeModule<TapeExportNative>('TapeExport');

export function canExport(): boolean {
  return native != null;
}

/**
 * One take out to an MP4: trimmed to `endMs`, the Ghost Light mark burned in
 * when `mark` is set. Resolves to the written file's uri.
 */
export async function exportTake(options: { input: string; output: string; startMs?: number; endMs: number; mark: boolean }): Promise<string> {
  if (!native) throw new Error('This build cannot export takes yet.');
  return native.exportTake({ ...options, startMs: options.startMs ?? 0 });
}

/** Whether this build can put the slate and the take in one file. */
export function canJoin(): boolean {
  return typeof native?.exportJoined === 'function';
}

/**
 * The slate, then the take, as one MP4. The take sets the picture's shape;
 * a slate held the other way is fitted on black. Each clip is trimmed to its
 * own start and end.
 */
export async function exportJoined(options: { clips: { input: string; startMs?: number; endMs: number }[]; output: string; mark: boolean }): Promise<string> {
  if (!native?.exportJoined) throw new Error('This build cannot join takes yet.');
  return native.exportJoined({
    clips: options.clips.map((c) => ({ input: c.input, startMs: c.startMs ?? 0, endMs: c.endMs })),
    output: options.output,
    mark: options.mark,
    shapeFrom: options.clips.length - 1,
  });
}
