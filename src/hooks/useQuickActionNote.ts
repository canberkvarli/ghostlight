import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import * as QuickActions from 'expo-quick-actions';

/**
 * The home-screen quick action ("Before you go…", above Remove App) opens the
 * note from Canberk.
 *
 * Not `useQuickActionRouting` from `expo-quick-actions/router`: that file
 * imports `expo-router/build/hooks`, which expo-router v7 no longer ships, so
 * importing it breaks the bundle. This is the same idea in a dozen lines.
 *
 * On a cold launch the action arrives before the stage door (app/index.tsx)
 * has redirected, and a push made then would be replaced by that redirect. So
 * it is held until the app has left `/`, then pushed.
 *
 * The action itself is static, declared for iOS in app.json under the
 * expo-quick-actions plugin, so it exists from install without any JS.
 */

export const NOTE_ACTION_ID = 'note';

export function useQuickActionNote() {
  const router = useRouter();
  const pathname = usePathname();
  const waiting = useRef(QuickActions.initial?.id === NOTE_ACTION_ID);

  useEffect(() => {
    const sub = QuickActions.addListener((action) => {
      if (action.id !== NOTE_ACTION_ID) return;
      waiting.current = true;
      // Warm launch: the stage is already up, so go now.
      if (pathname !== '/') {
        waiting.current = false;
        if (pathname !== '/note') router.push('/note');
      }
    });
    return () => sub.remove();
  }, [pathname, router]);

  useEffect(() => {
    if (!waiting.current || pathname === '/') return;
    if (pathname === '/note') {
      waiting.current = false;
      return;
    }
    // A beat, so the redirect's own transition has settled first.
    const t = setTimeout(() => {
      waiting.current = false;
      router.push('/note');
    }, 250);
    return () => clearTimeout(t);
  }, [pathname, router]);
}
