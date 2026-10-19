import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { StageDirection } from './StageDirection';
import { getTrending } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import type { Monologue } from '../data/monologues';
import { track } from '../lib/analytics';
import type { Medium } from '../theme/medium';
import { useTheme } from '../theme/ThemeContext';

/**
 * What other actors are working on right now, for the screen before there is
 * a past. The website's trending shelf, as two hairline rows in this house:
 * real pieces, each one a page you can open, which is a better invitation than
 * three searches somebody else phrased. Gone the moment you have searched
 * once; the recents take the room.
 */
export function Trending({ medium, accent, rows = 2 }: { medium: Medium; accent: string; rows?: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors: c } = useTheme();
  const { data } = useQuery<Monologue[]>({
    queryKey: ['trending'],
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => (await getTrending(20, signal)).map(apiToMonologue),
  });
  const house = (data ?? []).filter((m) => (medium === 'screen' ? m.sourceType !== 'play' : m.sourceType === 'play')).slice(0, rows);
  if (house.length === 0) return null;

  const open = (m: Monologue) => {
    Haptics.selectionAsync().catch(() => {});
    track('app_home_row', { row: 'trending' });
    // The heading paints at once from this row; the words follow.
    qc.setQueryData(['monologue-preview', m.id], m);
    router.push({ pathname: '/read/[id]', params: { id: m.id, medium } });
  };

  return (
    <View style={{ width: '100%' }}>
      <StageDirection style={{ marginBottom: 2 }}>(what others are working on.)</StageDirection>
      {house.map((m) => (
        <Pressable
          key={m.id}
          onPress={() => open(m)}
          accessibilityRole="button"
          accessibilityLabel={`${m.character}, ${m.source}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: c.divider,
          }}
        >
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: 'CourierPrime_700Bold', fontSize: 13, color: c.foreground }}>
            {m.character}
          </Text>
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontFamily: 'CourierPrime_400Regular', fontSize: 12, color: c.mutedForeground }}
          >
            {m.source}
          </Text>
          <Ionicons name="arrow-forward" size={14} color={accent} />
        </Pressable>
      ))}
    </View>
  );
}
