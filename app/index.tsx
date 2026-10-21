import { View } from 'react-native';
import { Redirect } from 'expo-router';

import { useSession } from '../src/lib/useSession';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * The stage door. Decides where a launch lands: anyone without an account
 * onto the curtain, where a monologue is already lit; anyone signed in onto
 * the home, with their book and their board. There is no tour any more. It
 * renders nothing but the dark stage while the session is read, so the app
 * never flashes the wrong screen: the splash's warm near-black carries
 * straight through to here.
 */
export default function StageDoor() {
  const { loading, isAuthenticated } = useSession();
  const { colors: c } = useTheme();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: c.background }} />;
  }

  return <Redirect href={isAuthenticated ? '/search' : '/curtain'} />;
}
