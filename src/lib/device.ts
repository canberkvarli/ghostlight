import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * A stable id for this install, sent as `X-Device-Id`.
 *
 * The free-read counter is server-side and keyed on `user_id`, which sounds
 * airtight and is not. Signing out revokes the session, `bootstrapSession()`
 * finds none, and `signInAnonymously()` mints a *brand new* user with zero reads
 * spent. Three fresh reads, two taps, repeatable. The server closes that by
 * counting against user OR device, whichever has spent more — and this is the
 * device half of that key.
 *
 * IT LIVES IN THE KEYCHAIN, not AsyncStorage. AsyncStorage is inside the app
 * sandbox and goes with the app, so delete-and-reinstall minted a fresh id and
 * handed out three more reads: the same hole as Sign out, one step further
 * along. Keychain items survive app deletion on iOS, so the reinstalled app
 * finds its own id still there and the wall holds.
 *
 * `AFTER_FIRST_UNLOCK` because the id is read during launch, and the default
 * accessibility class would fail on a cold boot before the passcode is entered.
 * It is not `THIS_DEVICE_ONLY`: a restored backup carrying its read count across
 * is correct — the same person on the same account, on their new phone.
 *
 * WHAT IT IS NOT: a fingerprint. A random uuid, generated once, with no
 * relationship to the hardware, the advertising id, or anything identifying a
 * person across apps. It says "this install" and nothing else, which is all the
 * read counter ever needed.
 *
 * What still resets it: a factory reset, a brand-new device set up from scratch,
 * or wiping the keychain. That is the accepted floor. The point is to close the
 * path someone stumbles into, not to build a vault.
 */

const KEY = 'ghostlight_device_id_v1';
/** Where it lived before 1.0.2. Read once, migrated, then left alone. */
const LEGACY_KEY = 'ghostlight.device-id.v1';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// Resolved once and shared. Without this every request would hit the keychain,
// and two calls racing on first launch would each mint an id and one would win,
// quietly handing that install a second allowance.
let pending: Promise<string | null> | null = null;

async function resolve(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (stored) return stored;

    // Anyone who used 1.0.1 already has an id in AsyncStorage, and reads spent
    // against it are on the server. Minting a new one here would silently give
    // every existing install a fresh three reads on upgrade — the exact hole
    // this is meant to close, opened by the fix for it.
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(KEY, legacy, OPTIONS);
      return legacy;
    }

    const minted = Crypto.randomUUID();
    await SecureStore.setItemAsync(KEY, minted, OPTIONS);
    return minted;
  } catch {
    // The keychain can fail. A device with no id is exactly 1.0.1's behaviour,
    // so the counter falls back to user_id alone rather than the app failing to
    // read a monologue over a header.
    return null;
  }
}

export function deviceId(): Promise<string | null> {
  if (!pending) pending = resolve();
  return pending;
}
