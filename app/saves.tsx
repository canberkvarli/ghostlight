import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { BackHeader } from '../src/components/BackHeader';
import { WordArrow } from '../src/components/WordArrow';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useFavorites, useToggleFavorite } from '../src/hooks/useFavorites';
import { UndoBar } from '../src/components/UndoBar';
import { useGoBack } from '../src/lib/nav';
import { useSession } from '../src/lib/useSession';
import { colors } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';
import { formatDuration, type Monologue } from '../src/data/monologues';

/**
 * Saved — "Your book" (handoff §5). The result card, warmed up: an amber-tinted
 * border and fill, a filled bookmark, and a progress rule. Every card sits lit —
 * there's no light to chase here. The subhead is derived from the data, never a
 * hardcoded string.
 *
 * Progress (off book / learning / just read) is server-owned prep state; until
 * that's wired per-save it rests at "just read", and the rule fills when it lands.
 */

/** 0 = just read, 1 = off book. */
type Saved = Monologue;

export default function Saves() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { isAuthenticated } = useSession();
  const { data, isLoading, isError } = useFavorites(isAuthenticated);

  const toggleFavorite = useToggleFavorite();
  // The row being undone is hidden optimistically rather than removed, so the
  // server round-trip never makes the list jump under the actor's thumb. It
  // reappears in place if they undo.
  const [pendingRemoval, setPendingRemoval] = useState<Saved | null>(null);

  const all = (data ?? []) as Saved[];
  const items = pendingRemoval ? all.filter((m) => m.id !== pendingRemoval.id) : all;
  const subhead = `(${items.length} kept.)`;

  const onUnsave = useCallback((item: Saved) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPendingRemoval(item);
  }, []);

  // Undo simply drops the pending state — nothing was ever sent.
  const onUndo = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setPendingRemoval(null);
  }, []);

  // The five seconds elapsed, so make it real.
  const onExpire = useCallback(() => {
    setPendingRemoval((victim) => {
      if (victim) toggleFavorite.mutate({ id: victim.id, on: false });
      return null;
    });
  }, [toggleFavorite]);

  const renderItem = useCallback(
    ({ item }: { item: Saved }) => (
      <SavedCard
        item={item}
        onPress={() => router.push(`/read/${item.id}`)}
        onUnsave={() => onUnsave(item)}
      />
    ),
    [router, onUnsave],
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <BackHeader label="Search" onPress={goBack} />

        {!isAuthenticated ? (
          <Center>
            <GhostLight size={44} />
            <StageDirection className="mt-6">(sign in to keep monologues.)</StageDirection>
            <View style={{ marginTop: 18 }}>
              <WordArrow label="Sign in" onPress={() => router.push('/auth')} />
            </View>
          </Center>
        ) : isLoading ? (
          <Center>
            <GhostLight size={28} />
            <StageDirection className="mt-6">(gathering your saves…)</StageDirection>
          </Center>
        ) : isError ? (
          // Not the same as an empty book. Free actors have no offline shelf to
          // fall back on, so a dropped signal used to render "(nothing saved
          // yet.)" — telling someone their saves are gone when they are fine.
          <Center>
            <GhostLight size={44} />
            <StageDirection className="mt-6" style={{ textAlign: 'center' }}>
              (couldn&apos;t reach your book.)
            </StageDirection>
            <Text
              className="text-center"
              style={{ marginTop: 16, fontFamily: 'Montserrat_400Regular', fontSize: 13, color: c.mutedForeground }}
            >
              Your saves are safe. Check your{'\n'}connection and try again.
            </Text>
          </Center>
        ) : (
          <FlashList
            data={items}
            renderItem={renderItem}
            keyExtractor={(m) => m.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 96 }}
            ListHeaderComponent={
              <View style={{ paddingTop: 6, paddingBottom: 18 }}>
                <Text
                  className="text-foreground"
                  style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 34 }}
                >
                  Your book
                </Text>
                <StageDirection className="mt-1">{subhead}</StageDirection>
              </View>
            }
            ListEmptyComponent={
              <Center>
                <GhostLight size={44} />
                <StageDirection className="mt-6">(nothing saved yet.)</StageDirection>
              </Center>
            }
          />
        )}

        {pendingRemoval ? (
          // Keyed on the id so a second removal restarts the five seconds
          // instead of inheriting the first one's remaining time.
          <UndoBar
            key={pendingRemoval.id}
            label={`Removed “${pendingRemoval.title}”`}
            onUndo={onUndo}
            onExpire={onExpire}
          />
        ) : null}
      </SafeAreaView>
    </View>
  );
}

function SavedCard({
  item,
  onPress,
  onUnsave,
}: {
  item: Saved;
  onPress: () => void;
  onUnsave: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        marginBottom: 13,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(243, 130, 29, 0.3)',
        backgroundColor: c.card,
        padding: 18,
        overflow: 'hidden',
      }}
    >
      {/* warm wash bleeding from the top-left (linear-gradient(150°) approximation) */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, backgroundColor: 'rgba(243, 130, 29, 0.06)' }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text
            className="text-foreground"
            numberOfLines={1}
            style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 20 }}
          >
            {item.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: 'Montserrat_500Medium',
              fontSize: 11,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: c.mutedForeground,
              marginTop: 6,
            }}
          >
            {item.character} · {item.source}
          </Text>
        </View>
        {/* The bookmark was decoration. It's the unsave now — the obvious place
            to tap to take something out of the book, with UndoBar covering the
            mistap rather than a confirm dialog on every removal. hitSlop keeps
            it from stealing taps meant for the card. */}
        <Pressable
          onPress={onUnsave}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.title} from your book`}
        >
          <Ionicons name="bookmark" size={20} color={colors.stageGlow} />
        </Pressable>
      </View>

      <Text
        numberOfLines={2}
        style={{
          fontFamily: 'CourierPrime_400Regular',
          fontSize: 13,
          lineHeight: 20,
          color: c.foreground,
          opacity: 0.85,
          marginTop: 12,
        }}
      >
        {item.excerpt}
      </Text>

      {/* `pct` was never assigned anywhere in the codebase, so this was a bar
          permanently stuck at its 6% minimum under a label permanently reading
          "(not started.)" — an app promising memorisation tracking it does not
          have. Memorize mode is v2 (spec §6). Just the running time until then. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 11, color: c.chevron }}>
          {formatDuration(item.duration)}
        </Text>
      </View>
    </Pressable>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} className="pb-24">
      {children}
    </View>
  );
}
