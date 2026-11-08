import { requireOptionalNativeModule } from 'expo';

interface TapeActivityNative {
  isAvailable(): boolean;
  running(): string | null;
  start(o: { project: string; role: string; url: string; dueMs: number }): Promise<string>;
  end(sent: boolean): Promise<void>;
}

/** Null before build 58, on Android and on the web: the countdown is simply not there. */
export const tapeActivity = requireOptionalNativeModule<TapeActivityNative>('TapeActivity');
