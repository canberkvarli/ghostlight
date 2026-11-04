/**
 * Over-the-air updates, taken at once.
 *
 * Left to itself expo-updates downloads a new update in the background and
 * runs it at the next cold start, so a fix sat unseen until the actor had
 * opened, closed and opened the app again (Canberk, 2026-11-04: "why is it
 * not picking it up"). Now the app asks on launch and whenever it comes back
 * to the front, and:
 *
 *   - just launched (the first few seconds, nothing begun yet): it reloads
 *     straight onto the new update;
 *   - otherwise it keeps it and reloads the next time the app comes back from
 *     the background, never in the middle of something.
 *
 * Never in a development build, where Metro serves the code.
 */
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/** A reload this soon after launch lands before the actor has done anything. */
const FRESH_MS = 6000;
/** Asked at most this often when the app comes to the front. */
const ASK_EVERY_MS = 10 * 60 * 1000;

let started = false;
let ready = false;
let lastAsked = 0;

async function look(launchedAt: number): Promise<void> {
  lastAsked = Date.now();
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) return;
    ready = true;
    if (Date.now() - launchedAt < FRESH_MS) await Updates.reloadAsync();
  } catch {
    /* offline, or the server is slow: next time */
  }
}

/** Call once, from the root layout. */
export function startUpdates(): void {
  if (started || __DEV__ || !Updates.isEnabled) return;
  started = true;
  const launchedAt = Date.now();
  void look(launchedAt);
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    // Back from the background with an update waiting: take it now.
    if (ready) { Updates.reloadAsync().catch(() => {}); return; }
    if (Date.now() - lastAsked > ASK_EVERY_MS) void look(Date.now());
  });
}
