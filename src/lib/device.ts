import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

/**
 * A stable id for this install, sent as `X-Device-Id`.
 *
 * The free-read counter is server-side and keyed on `user_id`, which sounds
 * airtight and is not. Signing out revokes the session, `bootstrapSession()`
 * finds none, and `signInAnonymously()` mints a *brand new* user with zero reads
 * spent. Three fresh reads, two taps, repeatable for as long as anyone cares to
 * keep tapping. The trial is bypassable from inside the app.
 *
 * This is the other half of the key. The server counts against user OR device,
 * whichever has spent more, so signing out no longer resets anything.
 *
 * What it does NOT survive is a delete-and-reinstall: AsyncStorage goes with the
 * app. That was the deliberate trade. Closing that door too means the Keychain
 * (`expo-secure-store`), which is a native dependency, which means a new binary
 * and an App Store review — while this ships over the air today. Reinstalling to
 * dodge a paywall is also a different order of effort from tapping Sign out, and
 * the cheap fix closes the path anyone would actually find.
 *
 * Not a fingerprint. A random uuid with no relationship to the hardware, the
 * advertising id, or anything that could identify a person across apps. It says
 * "this install" and nothing else, which is all the read counter ever needed.
 */

const KEY = 'ghostlight.device-id.v1';

// Resolved once and shared. Without this every request would hit AsyncStorage,
// and two calls racing on first launch would each mint an id and one would win,
// quietly handing that install a second allowance.
let pending: Promise<string | null> | null = null;

async function resolve(): Promise<string | null> {
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) return existing;
    const minted = Crypto.randomUUID();
    await AsyncStorage.setItem(KEY, minted);
    return minted;
  } catch {
    // Storage can fail. A device with no id is exactly today's behaviour, so the
    // counter falls back to user_id alone rather than the app failing to read.
    return null;
  }
}

export function deviceId(): Promise<string | null> {
  if (!pending) pending = resolve();
  return pending;
}
