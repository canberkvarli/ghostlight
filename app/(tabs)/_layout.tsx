import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';

import { RoomButton, TabBar, TAB_ROOMS } from '../../src/components/TabBar';

/**
 * The signed-in app. Four rooms, each its own stack, one bar across them
 * (expo-router's headless tabs: the bar is ours, drawn over the slot). The
 * triggers are declared here, as the navigator needs them in the tree. A
 * stranger has no rooms: the home sends them to the curtain and the bar
 * stays off; the reader and the rest still open for a link from the widget.
 */
export default function TabsLayout() {
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot />
      <TabList asChild>
        <TabBar>
          {TAB_ROOMS.map((r) => (
            <TabTrigger key={r.name} name={r.name} href={r.href} asChild>
              <RoomButton label={r.label} icon={r.icon} active={r.active} />
            </TabTrigger>
          ))}
        </TabBar>
      </TabList>
    </Tabs>
  );
}
