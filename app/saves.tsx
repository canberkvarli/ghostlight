import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { BackHeader } from '../src/components/BackHeader';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { PaperCard } from '../src/components/PaperCard';
import { PieceCover } from '../src/components/PieceCover';
import { Sketch } from '../src/components/Sketches';
import { Mark, sourceTag } from '../src/components/Marks';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useFavorites, useToggleFavorite } from '../src/hooks/useFavorites';
import { UndoBar } from '../src/components/UndoBar';
import { useGoBack } from '../src/lib/nav';
import { useSession } from '../src/lib/useSession';
import { useTheme } from '../src/theme/ThemeContext';
import { mediumPalette } from '../src/theme/medium';
import { formatDuration, type Monologue } from '../src/data/monologues';

/**
 * Saved — "Your book."
 *
 * Every card sits lit here; there is no light to chase on a shelf you made
 * yourself. So the v2 card drops the spotlight machinery entirely and becomes
 * what it always wanted to be: a page with the work's cover clipped to it.
 *
 * The covers are the change that makes this a shelf rather than a list. Film and
 * TV show their real poster; a play gets a drawn cloth binding keyed to the
 * work, so the same play looks the same everywhere in the app (see PieceCover).
 *
 * The subhead is derived from the data, never a hardcoded string.
 */

type Saved = Monologue;

/** Alternating tilt, so the shelf reads as paper rather than as rows. */
const TILTS = [-0.5, 0.4, -0.3];

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
    ({ item, index }: { item: Saved; index: number }) => (
      <SavedCard
        item={item}
        index={index}
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
            <Sketch name="stageDoor" size={96} stroke={c.mutedForeground} accent={c.yellow} />
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>
              (sign in to keep monologues.)
            </StageDirection>
            <PrimaryPill
              label="Sign in"
              onPress={() => router.push('/auth')}
              style={{ marginTop: 22, alignSelf: 'center' }}
            />
          </Center>
        ) : isLoading ? (
          <Center>
            <Sketch name="scriptPages" size={88} stroke={c.yellow} accent={c.yellow} />
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>
              (gathering your saves…)
            </StageDirection>
          </Center>
        ) : isError ? (
          // Not the same as an empty book. Free actors have no offline shelf to
          // fall back on, so a dropped signal used to render "(nothing saved
          // yet.)" — telling someone their saves are gone when they are fine.
          <Center>
            <Sketch name="footlights" size={96} stroke={c.mutedForeground} />
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>
              (couldn&apos;t reach your book.)
            </StageDirection>
            <Text
              style={{
                marginTop: 16,
                textAlign: 'center',
                fontFamily: 'BricolageGrotesque_500Medium',
                fontSize: 13,
                lineHeight: 20,
                color: c.mutedForeground,
              }}
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
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 110 }}
            ListHeaderComponent={
              <View style={{ paddingTop: 8, paddingBottom: 20, paddingHorizontal: 6 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'InstrumentSerif_400Regular',
                    fontSize: 44,
                    // 1.18×. "Your book." has a descender on both words and
                    // this is a single clipped line, so the box has to carry the
                    // tail of the "y" — 49 was 1.11× and shaved it.
                    lineHeight: 52,
                    letterSpacing: -0.8,
                    color: c.foreground,
                  }}
                >
                  Your{' '}
                  <Text
                    style={{
                      fontFamily: 'InstrumentSerif_400Regular_Italic',
                      color: c.accentText,
                    }}
                  >
                    book.
                  </Text>
                </Text>
                <StageDirection style={{ marginTop: 6 }}>{subhead}</StageDirection>
              </View>
            }
            ListEmptyComponent={
              <Center>
                <Sketch name="stageDoor" size={96} stroke={c.mutedForeground} accent={c.yellow} />
                <StageDirection style={{ marginTop: 24 }}>(nothing saved yet.)</StageDirection>
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
  index,
  onPress,
  onUnsave,
}: {
  item: Saved;
  index: number;
  onPress: () => void;
  onUnsave: () => void;
}) {
  const { colors: c } = useTheme();
  // The book holds both houses, and a violet piece turning amber the moment you
  // save it makes the shelf look like it belongs to the theatre alone.
  const screen = item.sourceType === 'film' || item.sourceType === 'tv';
  const pal = mediumPalette(screen ? 'screen' : 'theatre', c.isLight);
  const tag = sourceTag(item);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.character}`}
      style={{ marginBottom: 14 }}
    >
      <PaperCard
        rotate={TILTS[index % TILTS.length]}
        style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          <PieceCover item={item} width={46} height={66} />

          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Two lines each, and for the same reason: the text column here is
                about 240pt wide once the cover and the bookmark have taken
                theirs, which is 27 characters of 22pt serif — "The Importance
                of Being Earnest" is 31. The Saves card has no fixed height (it
                is not under the scroll spotlight), so it can simply be taller
                for the pieces that need it. */}
            <Text
              numberOfLines={2}
              style={{
                fontFamily: 'InstrumentSerif_400Regular',
                fontSize: 22,
                lineHeight: 25,
                letterSpacing: -0.3,
                color: c.paperInk,
              }}
            >
              {item.title}
            </Text>
            <Text
              numberOfLines={2}
              style={{
                marginTop: 4,
                fontFamily: 'CourierPrime_400Regular',
                fontSize: 12,
                lineHeight: 17,
                color: c.paperMuted,
              }}
            >
              <Text style={{ fontFamily: 'CourierPrime_700Bold', color: c.paperInk }}>
                {item.character}
              </Text>
              {` · ${item.source}`}
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
            style={{ marginTop: 2 }}
          >
            <Ionicons name="bookmark" size={20} color={pal.accent} />
          </Pressable>
        </View>

        <Text
          numberOfLines={2}
          style={{
            marginTop: 12,
            fontFamily: 'CourierPrime_400Regular',
            fontSize: 13,
            lineHeight: 20,
            color: c.paperBody,
          }}
        >
          {`“${item.excerpt}”`}
        </Text>

        <View
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <Text
            style={{
              fontFamily: 'BricolageGrotesque_600SemiBold',
              fontSize: 11,
              color: c.paperMuted,
            }}
          >
            {formatDuration(item.duration)}
          </Text>
          {tag ? (
            <Mark spec={{ label: tag, kind: 'source', tint: mediumPalette(screen ? 'screen' : 'theatre', true).tagInk }} />
          ) : null}
        </View>
      </PaperCard>
    </Pressable>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 36,
        paddingBottom: 90,
      }}
    >
      {children}
    </View>
  );
}
