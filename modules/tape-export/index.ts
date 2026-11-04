import { requireOptionalNativeModule } from 'expo';

interface TapeExportNative {
  exportTake(options: { input: string; output: string; startMs: number; endMs: number; mark: boolean }): Promise<string>;
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
