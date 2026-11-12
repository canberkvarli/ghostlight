import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';

import { isNewAccount, welcomedHere } from '../lib/demo';

/** Pages the welcome never lands on top of: a sign-in, a sale, a run, the welcome itself. */
const QUIET = ['/welcome', '/first-night', '/auth', '/paywall', '/demo', '/curtain', '/run', '/tape', '/sides', '/audition', '/note'];

/**
 * The welcome, once per account, wherever the account was made.
 *
 * It used to come only after the demo's sign-up, so anyone who made an account
 * from a save, the read wall or Settings went straight to Search with nothing
 * asked. Now a new account that has not answered is taken there once, a beat
 * after it lands, unless it is mid-something on a quiet page. Accounts made
 * more than an hour ago are left alone (src/lib/demo.ts isNewAccount): the
 * welcome is for the first night, not for people who already have an account.
 */
export function useWelcomeOnce(session: Session | null, isAuthenticated: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  path.current = pathname;
  const asked = useRef<string | null>(null);

  const user = session?.user;
  const id = isAuthenticated ? user?.id : undefined;

  useEffect(() => {
    if (!id || !user || asked.current === id) return;
    if (!isNewAccount(user)) return;

    asked.current = id;
    let alive = true;
    const t = setTimeout(() => {
      void welcomedHere(id).then((done) => {
        if (!alive || done) return;
        const p = path.current ?? '';
        if (QUIET.some((q) => p === q || p.startsWith(`${q}/`))) { asked.current = null; return; }
        router.push('/welcome');
      });
    }, 1200);
    return () => { alive = false; clearTimeout(t); };
  }, [id, user, router, pathname]);
}
