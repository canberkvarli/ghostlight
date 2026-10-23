import { Stack } from 'expo-router';

import { useTheme } from '../../../src/theme/ThemeContext';

/** The book room's own stack. What is pushed here comes back here, and names this room on its way. */
export const unstable_settings = { initialRouteName: 'saves' };

export default function Layout() {
  const { colors: c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background }, animation: 'fade', animationDuration: 260 }}>
      <Stack.Screen name="read/[id]" options={{ animation: 'fade', animationDuration: 260 }} />
      <Stack.Screen name="prep" options={{ animation: 'fade', animationDuration: 240 }} />
    </Stack>
  );
}
