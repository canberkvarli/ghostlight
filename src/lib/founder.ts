/**
 * The founder's account, for tools only he should see (the camera check).
 * Compared by a hash of the signed-in email, so no address is in the code.
 */
import { useEffect, useState } from 'react';
import * as Crypto from 'expo-crypto';

import { useSession } from './useSession';

const FOUNDER = new Set(['a0c62c53eb6432a4b4cf567ac397fed833e1ff9bead8028b380425b1c410facd']);

export function useIsFounder(): boolean {
  const { session } = useSession();
  const email = session?.user?.email?.trim().toLowerCase() ?? '';
  const [yes, setYes] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!email) { setYes(false); return; }
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, email)
      .then((h) => { if (alive) setYes(FOUNDER.has(h)); })
      .catch(() => { if (alive) setYes(false); });
    return () => { alive = false; };
  }, [email]);
  return yes;
}
