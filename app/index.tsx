import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';

import { demoSeen } from '../src/lib/demo';
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
  // A stranger's first launch is the first scenes, once; after that the curtain.
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => { demoSeen().then(setSeen).catch(() => setSeen(true)); }, []);

  if (loading || seen === null) {
    return <View style={{ flex: 1, backgroundColor: c.background }} />;
  }

  // A stranger opens on the promise every time until there is an account:
  // the monologue deck is for people who are in, not the way in.
  void seen;
  return <Redirect href={isAuthenticated ? '/search' : '/demo'} />;
}
