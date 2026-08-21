import { View } from 'react-native';
import { Redirect } from 'expo-router';

import { useOnboardingComplete } from '../src/lib/onboarding';
import { colors } from '../src/theme/tokens';

/**
 * The stage door. Decides where a launch lands: first-timers into onboarding,
 * everyone else straight to results. It renders nothing but the dark stage
 * while the flag is read, so the app never flashes the wrong screen — the
 * splash's warm near-black carries straight through to here.
 */
export default function StageDoor() {
  const complete = useOnboardingComplete();

  if (complete === null) {
    return <View style={{ flex: 1, backgroundColor: colors.dark.background }} />;
  }

  return <Redirect href={complete ? '/results' : '/onboarding'} />;
}
