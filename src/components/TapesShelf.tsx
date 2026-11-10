import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { useTakeList } from '../hooks/useCallboard';
import { thumbFile, type Take } from '../lib/takes';
import { useTheme } from '../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/** Where a take opens: the tape room on its piece, playing that take, for its audition if it had one. */
export function takeHref(t: Take): Href {
  const params: Record<string, string> = { id: t.pieceId, take: t.id };
  if (t.auditionId != null) params.audition = String(t.auditionId);
  return { pathname: '/tape/[id]', params } as Href;
}

/**
 * Your tapes, on the Book: the newest stills in a row, kept ones first, and
 * the way to all of them. Shown only once there is a take.
 */
export function TapesShelf() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const takes = useTakeList();
  if (!takes.length) return null;
  const kept = takes.filter((t) => t.starred).length;
  const row = [...takes].sort((a, b) => Number(b.starred) - Number(a.starred) || b.createdAt - a.createdAt).slice(0, 8);
  const all = () => { Haptics.selectionAsync().catch(() => {}); router.push('/tapes' as Href); };
  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontFamily: SERIF, fontSize: 22, color: c.foreground }}>
          Tapes <Text style={{ fontFamily: SANS, fontSize: 14, color: c.mutedForeground }}>· {takes.length}{kept ? ` · ${kept} kept` : ''}</Text>
        </Text>
        <Pressable onPress={all} hitSlop={10} accessibilityRole="button" accessibilityLabel="See all your tapes" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ fontFamily: SANS_B, fontSize: 13.5, color: c.accentText }}>See all</Text>
          <Ionicons name="chevron-forward" size={14} color={c.accentText} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {row.map((t) => <Still key={t.id} take={t} width={92} onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(takeHref(t)); }} />)}
      </ScrollView>
    </View>
  );
}

/** One take: its still, its length, a star if kept, and whose it is. */
export function Still({ take, width, onPress }: { take: Take; width: number; onPress: () => void }) {
  const { colors: c } = useTheme();
  const still = thumbFile(take);
  const s = Math.round(take.endMs / 1000);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${take.character ?? 'No script'}, take ${take.number}${take.starred ? ', kept' : ''}`}
      style={({ pressed }) => ({ width, opacity: pressed ? 0.75 : 1 })}>
      <View style={{ width, height: width * 1.3, borderRadius: 10, overflow: 'hidden', backgroundColor: c.foreground + '14' }}>
        {still?.exists ? <Image source={{ uri: still.uri }} style={{ flex: 1 }} contentFit="cover" transition={200} /> : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="videocam-outline" size={20} color={c.mutedForeground} /></View>
        )}
        <View style={{ position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 5, height: 18, justifyContent: 'center', backgroundColor: 'rgba(8,5,4,0.55)' }}>
          <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 10.5, color: '#fffaf3' }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</Text>
        </View>
        {take.starred ? <View style={{ position: 'absolute', right: 6, top: 6 }}><Ionicons name="star" size={14} color="#e0731f" /></View> : null}
      </View>
      <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: SERIF, fontSize: 15.5, color: c.foreground }}>{take.character ?? 'No script'}</Text>
      <Text numberOfLines={1} style={{ fontFamily: SANS, fontSize: 11, color: c.mutedForeground }}>Take {take.number}</Text>
    </Pressable>
  );
}
