import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';

import { isReturning } from './reviewMoments';

/**
 * The card for people who updated, once per release that has one.
 *
 * Only the first two numbers of the version count, so a 1.1.1 or an update
 * over the air never shows it twice. A fresh install never sees it: the
 * onboarding already says all of this. 1.0.x never wrote the key, so an
 * existing actor is told apart by the rating store's first open instead.
 */

const KEY = 'gl.whatsNew.v1';

/** The release the card speaks for. A later release without a card just records itself. */
export const WHATS_NEW_VERSION = '1.1';

function release(): string | null {
  const v = Application.nativeApplicationVersion;
  if (!v) return null;
  const [major, minor] = v.split('.');
  return minor == null ? null : `${major}.${minor}`;
}

/** True when this launch should offer the card. Records the version when it should not. */
export async function shouldShowWhatsNew(): Promise<boolean> {
  const current = release();
  if (!current) return false;
  try {
    const seen = await AsyncStorage.getItem(KEY);
    if (seen === current) return false;
    if (current === WHATS_NEW_VERSION && (seen != null || (await isReturning()))) return true;
    await AsyncStorage.setItem(KEY, current);
  } catch {
    // A courtesy card must never break anything.
  }
  return false;
}

/** Called the moment the card appears, so a killed app does not show it again. */
export function markWhatsNewSeen(): void {
  const current = release();
  if (current) AsyncStorage.setItem(KEY, current).catch(() => {});
}
