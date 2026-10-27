import { TIMEZONE } from '../api/client';
import { deviceId } from './device';
import { supabase } from './supabase';

/**
 * Spending a read.
 *
 * The free-read counter is deliberately server-side (spec §4 #2): three full
 * reads a day, by the phone's midnight, surviving reinstall. It must NOT live only on the device —
 * a device-local counter is trivially reset, and the entire business model is
 * where the paywall sits. So this does not fake a local tally; it tells the
 * server a read happened and lets the server be the source of truth.
 *
 * The backend endpoint still has to be added on the ActorRise side (spec §4 #2
 * calls for `monologue_reads` on `usage_metrics`, incremented here). Until it
 * exists this call fails quietly — a missing counter must never block reading —
 * and the Read screen behaves exactly as it will once the endpoint ships.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.actorrise.com';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export async function recordRead(monologueId: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    // No session yet (anonymous sign-ins still disabled server-side) → there is
    // no user to attribute the read to. Skip rather than send an orphan.
    if (!token) return;

    // This endpoint already assumes ghostlight when the header is absent, since
    // nothing on the web has ever called it. Sending it anyway so the two paths
    // that count a read agree, and so that assumption can be dropped server-side
    // without silently reclassifying every read this app has ever recorded.
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Client': 'ghostlight',
    };
    if (ANON_KEY) headers.apikey = ANON_KEY;
    // Three a day, by the phone's midnight: the day this read is spent on is
    // the actor's, so the server has to be told which one that is.
    if (TIMEZONE) headers['X-Timezone'] = TIMEZONE;
    // The read this spends has to be attributable to the install and not only to
    // the account, or signing out wipes the tally. This endpoint is where a read
    // is actually spent, so of the two places that send the header, this is the
    // one that matters.
    const device = await deviceId();
    if (device) headers['X-Device-Id'] = device;

    await fetch(`${API_URL}/api/monologues/${monologueId}/read`, {
      method: 'POST',
      headers,
    });
  } catch {
    // A counter that throws must never keep an actor from reading.
  }
}
