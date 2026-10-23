import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Sides arriving from outside: a file opened into Ghost Light from Mail,
 * Files or the share sheet. iOS hands the app a file URL; the router ignores
 * it (it is not our scheme), so this takes it to the add-sides sheet with
 * the file already chosen. Rendered once, at the root.
 */
export function SidesInbox() {
  const router = useRouter();
  useEffect(() => {
    const take = (url: string | null) => {
      if (!url || !url.startsWith('file:')) return;
      const name = decodeURIComponent(url.split('/').pop() ?? 'sides.pdf');
      router.push({ pathname: '/sides', params: { uri: url, name } });
    };
    void Linking.getInitialURL().then(take).catch(() => {});
    const sub = Linking.addEventListener('url', e => take(e.url));
    return () => sub.remove();
  }, [router]);
  return null;
}
