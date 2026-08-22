import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { getSimilar } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import type { Monologue } from '../data/monologues';
import { colors } from '../theme/tokens';

/**
 * "More like this" — a quiet shelf of kin at the foot of the reading page, on
 * the warm paper. Server-backed; if it can't load (offline, or the wall), it
 * simply isn't there. Tapping one turns the page to it.
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

  return (
    <View style={{ marginTop: 36 }}>
      <Text
        style={{
          fontFamily: 'CourierPrime_400Regular_Italic',
          fontSize: 13,
          letterSpacing: 0.5,
          color: colors.light.mutedForeground,
          marginBottom: 14,
        }}
      >
        (more like this.)
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingRight: 8 }}
      >
        {data.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => router.push(`/read/${m.id}`)}
            accessibilityRole="button"
            style={{
              width: 168,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.light.border,
              padding: 14,
            }}
          >
            <Text
              numberOfLines={2}
              style={{
                fontFamily: 'PlayfairDisplay_600SemiBold',
                fontSize: 16,
                lineHeight: 20,
                color: colors.light.foreground,
              }}
            >
              {m.title}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'Montserrat_500Medium',
                fontSize: 11,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: colors.light.mutedForeground,
                marginTop: 6,
              }}
            >
              {m.character}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
