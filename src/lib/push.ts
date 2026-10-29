import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { API_URL, TIMEZONE, authHeaders } from '../api/client';
import { setPushOwnsTonight } from './nudges';

/**
 * The phone's half of push, and the widget's key.
 *
 * Once the actor has said yes to notifications and has an account, the
 * phone's Expo push token goes to the server with its zone, and the server
 * knocks with tonight's speech at seven on that clock (backend
 * services/push.py). From then the phone stops scheduling its own tonight
 * knock, so nobody hears it twice; the audition reminders stay on the phone.
 *
 * The widget cannot sign in, so it is given a key of its own, kept in the
 * shared App Group, which opens that actor's own tonight and nothing else.
 *
 * Both fail quietly. A build without the push entitlement has no token to give,
 * and that is simply the phone scheduling its own knocks, as before.
 */

const TOKEN_KEY = 'ghostlight:push-token.v1';
const APP_GROUP = 'group.com.actorrise.ghostlight';
const WIDGET_KEY = 'widgetKey';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
}

async function post(path: string, body: unknown): Promise<Response> {
  const headers = await authHeaders();
  headers['Content-Type'] = 'application/json';
  return fetch(`${API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

export async function registerPush(): Promise<boolean> {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return false;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    if (!token) return false;
    const res = await post('/api/push/token', { token, tz: TIMEZONE });
    if (!res.ok) return false;
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await setPushOwnsTonight(true);
    return true;
  } catch {
    return false;
  }
}

/** Before signing out, while the session can still say so: this phone stops being knocked for that account. */
export async function forgetPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await post('/api/push/token/forget', { token, tz: TIMEZONE });
  } catch { /* the token moves to whoever signs in next anyway */ }
}

/** Signed out: the phone goes back to its own knocks, and the widget to the house's tonight. */
export async function clearPushLocal(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  await setPushOwnsTonight(false);
  unlinkWidget();
}

function storage() {
  try {
    // Native, from @bacons/apple-targets: UserDefaults in the App Group the widget reads.
    const { ExtensionStorage } = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
    return { ExtensionStorage, store: new ExtensionStorage(APP_GROUP) };
  } catch {
    return null;
  }
}

export async function linkWidget(): Promise<void> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/monologues/tonight/widget-key`, { method: 'POST', headers });
    if (!res.ok) return;
    const { key } = (await res.json()) as { key: string };
    const s = storage();
    if (!s || s.store.get(WIDGET_KEY) === key) return;
    s.store.set(WIDGET_KEY, key);
    s.ExtensionStorage.reloadWidget();
  } catch { /* the widget keeps the house's tonight */ }
}

export function unlinkWidget(): void {
  const s = storage();
  if (!s) return;
  try { s.store.remove(WIDGET_KEY); s.ExtensionStorage.reloadWidget(); } catch { /* nothing kept */ }
}

/** Mounted once at the root: a signed-in actor's phone is registered and the widget given its key. */
export function usePushAndWidget(isAuthenticated: boolean, userId: string | undefined): void {
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    void registerPush();
    void linkWidget();
  }, [isAuthenticated, userId]);
}
