import { Redirect } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';

import { TabBar, TAB_ROOMS } from '../../src/components/TabBar';
import { useSession } from '../../src/lib/useSession';

/**
 * The signed-in app. Four rooms, each its own stack, one bar across them
 * (expo-router's headless tabs: the bar is ours, drawn over the slot). A
 * stranger has no rooms: the curtain is theirs, and this sends them to it.
 */
export default function TabsLayout() {
  const { loading, isAuthenticated } = useSession();
  if (!loading && !isAuthenticated) return <Redirect href="/curtain" />;
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot />
      <TabList asChild>
        <TabBar />
      </TabList>
      {/* The triggers are declared for the router; the bar draws its own buttons through them. */}
      {TAB_ROOMS.map((r) => (
        <TabTrigger key={r.name} name={r.name} href={r.href} style={{ display: 'none' }} />
      ))}
    </Tabs>
  );
}
