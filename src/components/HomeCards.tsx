import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { StageDirection } from './StageDirection';
import type { Monologue } from '../data/monologues';
import { track } from '../lib/analytics';
import { type RecentPiece, trailOf } from '../lib/recents';
import { clock } from '../lib/segments';
import { distanceLabel } from '../lib/when';
import type { Medium } from '../theme/medium';
import { useTheme } from '../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const MONO = 'CourierPrime_400Regular';

/**
 * The two paper cards that can head the home besides the call sheet.
 *
 * Pick it up: the piece you opened last, with the trail of what you did to it.
 * Tonight's speech: one piece a day for everyone, so a night with no audition
 * still has a reason to open the app and something to read without typing.
 *
 * Same paper, same lean, same chevron as the call sheet (BoardCard), so the
 * top of the page is one object whichever card is on duty.
 */

function useOpenPiece(row: 'continue' | 'tonight') {
  const router = useRouter();
  const qc = useQueryClient();
  return (m: Pick<Monologue, 'id'> & Partial<Monologue>, medium: Medium) => {
    Haptics.selectionAsync().catch(() => {});
    track('app_home_row', { row });
    // The heading paints at once from what the card knows; the words follow.
    if (m.character && m.source) qc.setQueryData(['monologue-preview', m.id], (prev: Monologue | undefined) => prev ?? m);
    router.push({ pathname: '/read/[id]', params: { id: m.id, medium } });
  };
}

function Paper({
  caption,
  title,
  line,
  trail,
  label,
  onPress,
}: {
  caption: string;
  title: string;
  line: string;
  trail?: string;
  label: string;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <View style={{ width: '100%' }}>
      <StageDirection style={{ marginBottom: 8 }}>{caption}</StageDirection>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'stretch',
          borderRadius: 8,
          borderWidth: 1.5,
          borderColor: c.cardBorder,
          backgroundColor: c.paper,
          overflow: 'hidden',
          transform: [{ rotate: '-0.3deg' }],
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 16, paddingVertical: 13, justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 26, letterSpacing: -0.2, color: c.paperInk }}>
            {title}
          </Text>
          <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: MONO, fontSize: 12.5, letterSpacing: 0.2, color: c.paperMuted }}>
            {line}
          </Text>
          {trail ? (
            <Text numberOfLines={1} style={{ marginTop: 5, fontFamily: 'CourierPrime_700Bold', fontSize: 12, letterSpacing: 0.4, color: c.accentText }}>
              {trail}
            </Text>
          ) : null}
        </View>
        <View style={{ justifyContent: 'center', paddingRight: 12 }}>
          <Ionicons name="chevron-forward" size={15} color={c.paperFaint} />
        </View>
      </Pressable>
    </View>
  );
}

export function ContinueCard({ piece }: { piece: RecentPiece }) {
  const open = useOpenPiece('continue');
  const when = distanceLabel(piece.openedAt);
  const trail = trailOf(piece);
  return (
    <Paper
      caption={`(where you left it, ${when}.)`}
      title={piece.character}
      line={piece.source}
      trail={trail || undefined}
      label={`Pick up ${piece.character}, ${piece.source}`}
      onPress={() => open(piece, piece.medium)}
    />
  );
}

export function TonightCard({ piece, medium }: { piece: Monologue; medium: Medium }) {
  const open = useOpenPiece('tonight');
  const line = piece.duration ? `${piece.source} · ${clock(piece.duration)}` : piece.source;
  return (
    <Paper
      caption="(tonight's speech.)"
      title={piece.character}
      line={line}
      label={`Tonight's speech: ${piece.character}, ${piece.source}`}
      onPress={() => open(piece, medium)}
    />
  );
}

/** Tonight's speech as one hairline row, for when another card has the top. */
export function TonightRow({ piece, medium, accent }: { piece: Monologue; medium: Medium; accent: string }) {
  const { colors: c } = useTheme();
  const open = useOpenPiece('tonight');
  return (
    <View style={{ width: '100%' }}>
      <StageDirection style={{ marginBottom: 2 }}>(tonight&apos;s speech.)</StageDirection>
      <Pressable
        onPress={() => open(piece, medium)}
        accessibilityRole="button"
        accessibilityLabel={`Tonight's speech: ${piece.character}, ${piece.source}`}
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
          {piece.character}
        </Text>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: c.mutedForeground }}>
          {piece.source}
        </Text>
        <Ionicons name="arrow-forward" size={14} color={accent} />
      </Pressable>
    </View>
  );
}
