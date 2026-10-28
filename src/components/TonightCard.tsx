import { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PaperCard } from './PaperCard';
import { apiToMonologue } from '../data/adapt';
import { useToggleFavorite } from '../hooks/useFavorites';
import { useAnswerTonight, useMyTonight } from '../hooks/useTonight';
import { track } from '../lib/analytics';
import { useTheme } from '../theme/ThemeContext';
import type { Medium } from '../theme/medium';

const SERIF = 'InstrumentSerif_400Regular';
const MONO = 'CourierPrime_400Regular';
const MONO_B = 'CourierPrime_700Bold';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/** Seen once a night per house, for the dashboard. */
const seen = new Set<string>();

/**
 * Tonight's speech, on Search, for an actor with a session: one speech chosen
 * for them on the server from what they keep, its one line, and three things
 * to do with it. Read it (free, always: tonight's never spends a read), Keep it
 * (into the Book, and tomorrow leans that way), or Not for me (and tomorrow
 * leans away). Once answered the card says so and stays out of the way.
 *
 * Fixed height whatever the speech, so the page under it never moves: the line
 * is clamped to two, the names to one each.
 */
export function TonightCard({ medium, kept, accent }: { medium: Medium; kept: number; accent: string }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const { data: mine } = useMyTonight(medium);
  const answer = useAnswerTonight(medium);
  const toggleFavorite = useToggleFavorite();
  const piece = useMemo(() => (mine ? apiToMonologue(mine.monologue) : null), [mine]);
  // With nothing kept the server's pick is the house's: say so honestly.
  const personal = kept > 0;

  useEffect(() => {
    if (!mine) return;
    const key = `${mine.house}:${mine.day}`;
    if (seen.has(key)) return;
    seen.add(key);
    track('app_tonight_seen', { personal });
  }, [mine, personal]);

  if (!mine || !piece) return null;

  const open = () => {
    Haptics.selectionAsync().catch(() => {});
    track('app_tonight_opened', { personal });
    router.push(`/read/${piece.id}`);
  };
  const keep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    answer.mutate('keep');
    if (!mine.monologue.is_favorited) toggleFavorite.mutate({ id: piece.id, on: true, item: piece });
  };
  const pass = () => {
    Haptics.selectionAsync().catch(() => {});
    answer.mutate('pass');
  };

  const said = mine.answer === 'keep'
    ? '(kept. tomorrow leans this way.)'
    : mine.answer === 'pass'
      ? '(noted. tomorrow leans away from it.)'
      : null;

  return (
    <Animated.View entering={FadeIn.duration(320)} style={{ width: '100%' }}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Tonight's speech: ${piece.character}, ${piece.source}`}>
        <PaperCard rotate={-0.4} style={{ paddingVertical: 14, paddingHorizontal: 16, height: 148 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: MONO_B, fontSize: 10.5, letterSpacing: 2.2, textTransform: 'uppercase', color: accent }}>Tonight&apos;s speech</Text>
            <Text numberOfLines={1} style={{ flexShrink: 1, marginLeft: 10, fontFamily: MONO_I, fontSize: 11.5, color: c.paperMuted }}>
              {personal ? '(for you.)' : '(free tonight.)'}
            </Text>
          </View>
          <Text numberOfLines={1} style={{ marginTop: 8, fontFamily: SERIF, fontSize: 21, lineHeight: 25, letterSpacing: -0.2, color: c.paperInk }}>
            {piece.character}
            <Text style={{ fontFamily: MONO, fontSize: 12, color: c.paperMuted }}>{`  ${piece.source}`}</Text>
          </Text>
          <Text numberOfLines={2} style={{ marginTop: 4, fontFamily: MONO, fontSize: 13, lineHeight: 18, color: c.paperInk }}>
            {mine.quote}
          </Text>
          <View style={{ flex: 1 }} />
          {said ? (
            <Text numberOfLines={1} style={{ fontFamily: MONO_I, fontSize: 12, color: c.paperMuted }}>{said}</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <Text style={{ fontFamily: SANS_B, fontSize: 13.5, color: accent }}>Read it</Text>
              <Pressable onPress={keep} hitSlop={10} accessibilityRole="button" accessibilityLabel="Keep it">
                <Text style={{ fontFamily: SANS_B, fontSize: 13.5, color: c.paperInk }}>Keep</Text>
              </Pressable>
              <Pressable onPress={pass} hitSlop={10} accessibilityRole="button" accessibilityLabel="Not for me">
                <Text style={{ fontFamily: SANS_B, fontSize: 13.5, color: c.paperMuted }}>Not for me</Text>
              </Pressable>
            </View>
          )}
        </PaperCard>
      </Pressable>
    </Animated.View>
  );
}
