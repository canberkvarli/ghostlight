import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { getSimilar } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import type { Monologue } from '../data/monologues';
import { colors, radius } from '../theme/tokens';

/**
 * "In the same key" — the kin at the foot of the reading page.
 *
 * It was a horizontal scroller of six. Two problems with that at the bottom of a
 * page you are reading: a sideways scroll area inside a vertical one steals the
 * gesture at the exact moment you are trying to reach the end of the speech, and
 * six suggestions at the foot of a monologue is a feed, which is the opposite of
 * what this screen is for.
 *
 * Two cards, side by side, each a small sheet of paper tilted the other way — a
 * pair of sides someone left next to yours. Server-backed; if it can't load
 * (offline, or the wall) it simply isn't there.
 */
export function SimilarRow({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const { data } = useQuery<Monologue[]>({
    queryKey: ['similar', id],
    enabled: enabled && Boolean(id),
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => (await getSimilar(id, 6, signal)).map(apiToMonologue),
  });

  if (!data || data.length === 0) return null;
  const pair = data.slice(0, 2);

  return (
    <View
      style={{
        marginTop: 34,
        paddingTop: 18,
        borderTopWidth: 1.5,
        borderTopColor: `${colors.paper.ink}40`,
        borderStyle: 'dashed',
      }}
    >
      <Text
        style={{
          fontFamily: 'CourierPrime_400Regular_Italic',
          fontSize: 12,
          letterSpacing: 0.8,
          color: colors.paper.muted,
        }}
      >
        (in the same key.)
      </Text>
      <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
        {pair.map((m, i) => (
          <Pressable
            key={m.id}
            onPress={() => router.push(`/read/${m.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${m.character}, ${m.source}`}
            style={{
              flex: 1,
              minWidth: 0,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: radius.card,
              borderWidth: 1.5,
              borderColor: colors.paper.ink,
              backgroundColor: colors.paper.backgroundLight,
              // Tilted away from each other, so two cards read as two things put
              // down rather than as a two-column grid.
              transform: [{ rotate: i === 0 ? '-1deg' : '1deg' }],
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'CourierPrime_700Bold',
                fontSize: 14,
                lineHeight: 18,
                color: colors.paper.ink,
              }}
            >
              {m.character}
            </Text>
            <Text
              numberOfLines={2}
              style={{
                marginTop: 3,
                fontFamily: 'CourierPrime_400Regular',
                fontSize: 11,
                lineHeight: 15,
                color: colors.paper.muted,
              }}
            >
              {m.source}
              {m.author ? ` · ${m.author}` : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
