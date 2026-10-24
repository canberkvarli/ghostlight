import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { getFromPlay, getSimilar } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import { formatDuration, type Monologue } from '../data/monologues';
import { radius } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

/**
 * The kin at the foot of the reading page, in two shapes that must not look
 * alike, because they answer two different questions.
 *
 * "Elsewhere in the play" is the rest of the cast: the same play on every row,
 * so the play's name is noise and the person is the point. It is set like the
 * dramatis personae at the front of a script: the name in capitals, the first
 * words of the speech under it in the serif, the running time at the margin,
 * one rule between each. A list, flat on the page.
 *
 * "In the same key" is other plays that feel like this one. Two small sheets of
 * paper tilted away from each other, a pair of sides someone left next to
 * yours: here the play and the writer are the whole point, so they get the
 * card. It was a horizontal scroller of six once; a sideways scroll inside the
 * page steals the gesture at the exact moment you reach the end of the speech,
 * and six suggestions under a monologue is a feed.
 *
 * Server-backed; if it can't load (offline, or the wall) it simply isn't there.
 */
export function SimilarRow({
  id,
  enabled,
  kind = 'similar',
  label = '(in the same key.)',
}: {
  id: string;
  enabled: boolean;
  /** `play`: the other speeches in the same play or script, not the whole corpus. */
  kind?: 'similar' | 'play';
  label?: string;
}) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const { data } = useQuery<Monologue[]>({
    queryKey: [kind === 'play' ? 'from-play' : 'similar', id],
    enabled: enabled && Boolean(id),
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) =>
      (await (kind === 'play' ? getFromPlay(id, 6, signal) : getSimilar(id, 6, signal)))
        .map(apiToMonologue)
        .filter((m) => m.id !== id),
  });

  if (!data || data.length === 0) return null;
  const open = (m: Monologue) => router.push(`/read/${m.id}`);

  return (
    <View
      style={{
        marginTop: 34,
        paddingTop: 18,
        borderTopWidth: 1.5,
        borderTopColor: `${c.paperInk}40`,
        borderStyle: 'dashed',
      }}
    >
      <Text
        style={{
          fontFamily: 'CourierPrime_400Regular_Italic',
          fontSize: 12,
          letterSpacing: 0.8,
          color: c.paperMuted,
        }}
      >
        {label}
      </Text>
      {kind === 'play' ? <Cast items={data.slice(0, 3)} onOpen={open} /> : <Pair items={data.slice(0, 2)} onOpen={open} />}
    </View>
  );
}

/** The first words of the speech, enough to know it by, never a whole line. */
function opening(m: Monologue): string {
  const words = (m.excerpt ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return '';
  const head = words.slice(0, 9).join(' ').replace(/[,;:.!?]+$/, '');
  return words.length > 9 ? `${head}…` : head;
}

/** The rest of the cast, as the front page of a script lists them. */
function Cast({ items, onOpen }: { items: Monologue[]; onOpen: (m: Monologue) => void }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: 6 }}>
      {items.map((m, i) => {
        const first = opening(m);
        return (
          <Pressable
            key={m.id}
            onPress={() => onOpen(m)}
            accessibilityRole="button"
            accessibilityLabel={`${m.character}, ${formatDuration(m.duration)}`}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              paddingVertical: 11,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: `${c.paperInk}1f`,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: 'CourierPrime_700Bold',
                  fontSize: 12,
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                  color: c.paperInk,
                }}
              >
                {m.character}
              </Text>
              {first ? (
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 3,
                    fontFamily: 'InstrumentSerif_400Regular_Italic',
                    fontSize: 16,
                    lineHeight: 20,
                    color: c.paperMuted,
                  }}
                >
                  “{first}”
                </Text>
              ) : null}
            </View>
            <Text
              style={{
                marginTop: 1,
                fontFamily: 'CourierPrime_400Regular',
                fontSize: 11,
                letterSpacing: 0.6,
                color: c.paperMuted,
              }}
            >
              {formatDuration(m.duration)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two sides from other plays, put down next to yours. */
function Pair({ items, onOpen }: { items: Monologue[]; onOpen: (m: Monologue) => void }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
      {items.map((m, i) => (
        <Pressable
          key={m.id}
          onPress={() => onOpen(m)}
          accessibilityRole="button"
          accessibilityLabel={`${m.character}, ${m.source}`}
          style={{
            flex: 1,
            minWidth: 0,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: radius.card,
            borderWidth: 1.5,
            borderColor: c.paperInk,
            backgroundColor: c.paper,
            // Tilted away from each other, so two cards read as two things put
            // down rather than as a two-column grid.
            transform: [{ rotate: i === 0 ? '-1deg' : '1deg' }],
          }}
        >
          {/* The play is the point here, so it leads, in the serif, and the
              person is the line under it. Half a page wide, so the title gets
              two lines and shrinks before it ellipses. */}
          <Text
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={{
              fontFamily: 'InstrumentSerif_400Regular',
              fontSize: 17,
              lineHeight: 20,
              letterSpacing: -0.2,
              color: c.paperInk,
            }}
          >
            {m.source}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              marginTop: 5,
              fontFamily: 'CourierPrime_400Regular',
              fontSize: 11,
              lineHeight: 15,
              color: c.paperMuted,
            }}
          >
            {m.character}
            {m.author ? ` · ${m.author}` : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
