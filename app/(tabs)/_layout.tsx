import { useSegments } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';

import { RoomButton, TabBar, TAB_ROOMS } from '../../src/components/TabBar';

/**
 * The signed-in app. Four rooms, each its own stack, one bar across them
 * (expo-router's headless tabs: the bar is ours, drawn over the slot). The
 * triggers are declared here, as the navigator needs them in the tree, the
 * board's too: it has no button on the bar (its auditions are at the top of
 * the Book) but it is still a room, so a reminder that opens it lands in a
 * stack with a way back. A stranger has no rooms: the home sends them to the
 * curtain and the bar stays off; the reader and the rest still open for a
 * link from the widget.
 */
export default function TabsLayout() {
  const segments = useSegments() as string[];
  const inRoom = (name: string) => segments.some((s) => s === `(${name})`);
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot />
      <TabList asChild>
        <TabBar>
          {TAB_ROOMS.map((r) =>
            r.offBar ? (
              <TabTrigger key={r.name} name={r.name} href={r.href} style={{ display: 'none' }} />
            ) : (
              <TabTrigger key={r.name} name={r.name} href={r.href} resetOnFocus asChild>
                <RoomButton
                  label={r.label}
                  icon={r.icon}
                  active={r.active}
                  alsoLit={TAB_ROOMS.some((o) => o.lights === r.name && inRoom(o.name))}
                />
              </TabTrigger>
            ),
          )}
        </TabBar>
      </TabList>
    </Tabs>
  );
}
