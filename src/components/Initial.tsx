import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useSession } from '../lib/useSession';
import { useTheme } from '../theme/ThemeContext';

/**
 * The account, as your initial in a circle, top-right of every room. It
 * opens the account screen; settings live inside it. A stranger gets the
 * ghost light's own initial.
 */
export function Initial() {
  const router = useRouter();
  const { colors: c, scheme } = useTheme();
  // Ink on the dark stage is a circle nobody can see, with a letter floating
  // alone; there it is a lit ring. On paper the ink circle holds.
  const dark = scheme === 'dark';
  const { session, isAuthenticated } = useSession();
  const name = session?.user.user_metadata?.display_name ?? session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? session?.user.email ?? '';
  const letter = isAuthenticated && name ? String(name).trim().charAt(0).toUpperCase() : 'G';
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/account'); }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Account"
      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: dark ? 'transparent' : c.ink, borderWidth: dark ? 1.5 : 0, borderColor: c.accentText, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 20, lineHeight: 24, color: dark ? c.accentText : c.yellow }}>{letter}</Text>
    </Pressable>
  );
}
