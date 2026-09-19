import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type EntryAnimationsValues,
} from 'react-native-reanimated';

import { Sketch } from '../../src/components/Sketches';
import { StageDirection } from '../../src/components/StageDirection';
import { StageBackdrop } from '../../src/components/StageBackdrop';
import { PrimaryPill } from '../../src/components/PrimaryPill';
import { Mark, sourceTag } from '../../src/components/Marks';
import { useStageMotion } from '../../src/hooks/useStageMotion';
import { PaywallShroud } from '../../src/components/PaywallShroud';
import { PageCurl } from '../../src/components/PageCurl';
import { SimilarRow } from '../../src/components/SimilarRow';
import { PrivacyShield } from '../../src/components/PrivacyShield';
import { MonologueText } from '../../src/components/MonologueText';
import { getMonologueById, formatDuration, type Monologue } from '../../src/data/monologues';
import { getMonologue } from '../../src/api/client';
import { apiToMonologue } from '../../src/data/adapt';
import { recordRead } from '../../src/lib/reads';
import { getOffline, removeOffline, saveOffline } from '../../src/lib/offline';
import { useSession } from '../../src/lib/useSession';
import { useGoBack } from '../../src/lib/nav';
import { useIsFavorited, useToggleFavorite } from '../../src/hooks/useFavorites';
import { MonologueTextSkeleton } from '../../src/components/MonologueTextSkeleton';
import { track } from '../../src/lib/analytics';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { usePreventCaptureWhileFocused } from '../../src/hooks/usePreventCaptureWhileFocused';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../src/theme/tokens';
import { mediumPalette, type Medium, type MediumPalette } from '../../src/theme/medium';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { useTheme } from '../../src/theme/ThemeContext';

/**
 * Step 4 — Read.
 *
 * Lights up. The paper rises out of the dark, straightens most of the way out of
 * its tilt, and the words fade in. The reading canvas is warm paper against the
 * dark shell in both schemes — long text reads worse on pure dark, and this is
 * the one screen where that is not a preference.
 *
 * In v2 the card is the same object as every other card in the app, just bigger:
 * cream, a 1.5pt ink rule, a six-point corner and a block of gel yellow behind
 * it. The old version was a soft-cornered panel with a blur shadow, which made
 * the reading page the one surface that did not belong to the system.
 *
 * This screen is where a read is spent. The counter is server-side (spec §4);
 * see src/lib/reads.ts for why it is not faked device-local.
 */

/**
 * The curtain rises — slow and even, no bounce. The paper lifts from below the
 * stage and the light comes up on it over ~three quarters of a second: gentle,
 * cinematic, settled. A long easeOut, never an overshoot.
 *
 * It now also unwinds the rotation, −2° to the card's resting −0.4°, so the page
 * lands rather than simply arriving.
 */
const RISE_MS = 720;
const RISE_EASE = Easing.out(Easing.cubic);
/** The card's resting tilt. The same family as a results row, half the angle. */
const CARD_TILT = -0.4;

function curtainRise(_values: EntryAnimationsValues) {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 52 }, { scale: 0.99 }, { rotate: '-2deg' }] },
    animations: {
      opacity: withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.quad) }),
      transform: [
        { translateY: withTiming(0, { duration: RISE_MS, easing: RISE_EASE }) },
        { scale: withTiming(1, { duration: RISE_MS, easing: RISE_EASE }) },
        { rotate: withTiming(`${CARD_TILT}deg`, { duration: RISE_MS, easing: RISE_EASE }) },
      ],
    },
  };
}

/** The typewriter's line box. The wall is placed a whole number of these down. */
const LINE_HEIGHT = 27;
/** How much of the part you get to read before the light goes off it. */
const FREE_LINES = 4;
/** The gel block behind the page. */
const BLOCK = 8;

export default function Read() {
  const { id, medium: mediumParam } = useLocalSearchParams<{ id: string; medium?: string }>();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const reduceMotion = useReducedMotion();
  const { height, width } = useWindowDimensions();
  const { colors: c } = useTheme();

  // Which house you came through. Results hands this over on the push; without
  // it a Film & TV monologue opened in theatre amber, which made the toggle feel
  // like it had been forgotten the moment you tapped something.
  const medium: Medium = mediumParam === 'screen' ? 'screen' : 'theatre';
  const pal = mediumPalette(medium, c.isLight);
  // Anything drawn ON the card asks for the light-scheme palette regardless of
  // the app's scheme, because the reading card is always warm paper — the violet
  // that glows on near-black is far too pale to read on cream.
  const ink = mediumPalette(medium, true);

  // Protect the words of the play. Android blocks screenshots + recording
  // outright (FLAG_SECURE); iOS can't block a still screenshot at the OS level,
  // but this obscures the app in screen recordings and the app switcher.
  usePreventCaptureWhileFocused('read');

  // Fixtures first (offline, instant); fall to the live fetch for real search
  // results whose id the device has never seen.
  const fixture = id ? getMonologueById(id) : undefined;
  const { data: fetched, isLoading, isError, refetch } = useQuery<Monologue>({
    queryKey: ['monologue', id],
    enabled: Boolean(id) && !fixture,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return apiToMonologue(await getMonologue(id!, signal));
      } catch (err) {
        // No signal? Read the offline copy if this one is on the shelf.
        const local = await getOffline(id!);
        if (local) return local;
        throw err;
      }
    },
  });
  // The row the list handed over on the tap. Enough to draw the heading — title,
  // character, source, author, duration — and nothing else. Deliberately NOT
  // used for the body: the list only carries a two-line excerpt, so seeding the
  // words would start you reading and then swap them under you when the real
  // text arrived. Reflow mid-read is worse than a second of waiting.
  const qc = useQueryClient();
  const preview = id ? qc.getQueryData<Monologue>(['monologue-preview', id]) : undefined;

  const monologue = fixture ?? fetched;
  /** What the heading draws from — the real row once it lands, the preview until then. */
  const head = monologue ?? preview;

  // Coming back from the sign-in sheet: if the page couldn't be reached before
  // (no session), try again now that there might be one — so the read opens
  // itself instead of leaving the actor on the dead-end.
  useFocusEffect(
    useCallback(() => {
      if (!fixture && !fetched) void refetch();
    }, [fixture, fetched, refetch]),
  );

  // Ungating the UI is only half of it: when the API decides a read is walled it
  // doesn't send the words at all, so `fullText` is simply absent and lifting
  // the shroud would reveal the same three lines. The moment entitlement turns
  // true we have to go back and ask again, now that the server will answer.
  const paidRef = useRef(false);

  const { isAuthenticated } = useSession();
  const favorited = useIsFavorited(id ?? '', isAuthenticated);
  const toggleFavorite = useToggleFavorite();

  const [copied, setCopied] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  // Where the words start inside the card, and how tall the card is. Both are
  // measured rather than assumed, because the wall is placed relative to the
  // text (four lines down) and has to leave room for the offer underneath.
  const [textTop, setTextTop] = useState<number | null>(null);
  const [cardH, setCardH] = useState(0);
  /** Room the offer block needs at the foot of the card: sketch, two lines, pill. */
  const OFFER_HEIGHT = 300;
  const wallTop =
    textTop === null
      ? 0
      : Math.max(
          textTop + LINE_HEIGHT,
          Math.min(
            textTop + LINE_HEIGHT * FREE_LINES,
            // On a short excerpt or a small phone the wall comes UP to meet the
            // offer rather than letting it slide off the bottom of the card.
            (cardH || height * 0.72) - OFFER_HEIGHT,
          ),
        );

  // The title settles up into place from the card's size — a soft matched
  // hand-off, eased not sprung, so nothing bounces. Origin is the left edge so
  // it grows from where the card title sat, not from its centre.
  const titleScale = useSharedValue(reduceMotion ? 1 : 0.86);
  const titleRise = useSharedValue(reduceMotion ? 0 : 6);
  useEffect(() => {
    if (reduceMotion) return;
    titleScale.value = withTiming(1, { duration: RISE_MS, easing: RISE_EASE });
    titleRise.value = withTiming(0, { duration: RISE_MS, easing: RISE_EASE });
  }, [reduceMotion, titleScale, titleRise]);
  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: titleRise.value }, { scale: titleScale.value }],
  }));

  // The wall (spec §5, Step 7). Free users get three reads, lifetime; the server
  // owns the count (src/lib/reads.ts). If we can't reach it — no session yet,
  // anon sign-ins still off — we don't gate: reading never breaks on a missing
  // counter, the wall just doesn't fire until the backend is live.
  const { isPaid, atWall, settled } = useEntitlement();
  // A subscriber is never walled. This used to lead with the server's
  // `paywalled` flag, which sounds right — the API is the authority — but the
  // API learns about a purchase from a webhook, and until that lands it keeps
  // answering `paywalled: true` and withholding the text. So someone who had
  // just paid was still reading three lines and a buy button. The receipt on the
  // device is a real answer too, and in that window it's the only true one.
  const gated = !isPaid && (monologue?.paywalled === true || (settled && atWall));

  // Do we yet KNOW whether this is walled? This gap is why the whole monologue
  // flashed up for a beat on the very first open: `atWall` is undefined until
  // the counter comes back, undefined isn't true, so the text rendered unwalled
  // and the shroud dropped on top of it a moment later. You could read the
  // ending of a piece you hadn't paid for by opening it and looking quickly.
  // Now the words wait until the answer is in.
  const wallKnown = monologue?.paywalled !== undefined || settled;

  useEffect(() => {
    // Only on the false → true edge, so this can't loop.
    if (isPaid && !paidRef.current) {
      paidRef.current = true;
      if (!fixture) void refetch();
    } else if (!isPaid) {
      paidRef.current = false;
    }
  }, [isPaid, fixture, refetch]);

  // Paid, but the server still withheld the words. That's the webhook not having
  // landed yet, and it is a genuinely different state from "you need to buy
  // this" — offering someone a buy button for something they just bought is the
  // worst thing this screen can do. Say what's actually happening instead.
  const syncing = isPaid && monologue?.paywalled === true && !monologue.fullText;

  const onSave = () => {
    if (!monologue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // The first save is what asks for an account — never launch (spec §5).
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }
    const willSave = !favorited;
    // Saves only, not un-saves. This event exists as the retention signal — the
    // piece someone is building a book around — and counting removals in the same
    // bucket would net them against each other into a number meaning nothing.
    if (willSave) track('monologue_saved', { id: String(monologue.id) });
    // Handing the row over lets the cache paint the save without waiting for the
    // POST, which is what made this button feel dead (see useToggleFavorite).
    toggleFavorite.mutate({ id: monologue.id, on: willSave, item: monologue });
    // A bookmark filling in is easy to miss and easy to misread as a tap that
    // didn't land — especially since the same button un-saves. One word, and it
    // says which of the two just happened.
    setSaveNote(willSave ? 'Saved' : 'Removed');
    setTimeout(() => setSaveNote(null), 1500);
    // Mirror to the offline shelf so a saved piece reads without signal.
    if (willSave) void saveOffline(monologue);
    else void removeOffline(monologue.id);
  };

  // Copying the words is a subscriber privilege — the free tier reads on the
  // stage, it doesn't walk off with the script. Non-subscribers meet the wall.
  const onCopy = async () => {
    if (!monologue) return;
    if (!isPaid) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      router.push('/paywall');
      return;
    }
    await Clipboard.setStringAsync(monologue.fullText ?? monologue.excerpt);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    // The icon swapping to a tick tells you something happened only if you knew
    // what the icon was for. Say the word.
    setSaveNote('Copied');
    setTimeout(() => setSaveNote(null), 1500);
    setTimeout(() => setCopied(false), 1400);
  };

  useEffect(() => {
    // Spend a read only when one is actually being read — never behind the wall,
    // and never before we know whether there IS a wall. Without `wallKnown` the
    // first open of a walled piece spent a read it then refused to show.
    if (monologue && wallKnown && !gated) void recordRead(monologue.id);
  }, [monologue, gated, wallKnown]);

  // A read is dwell, not an open. Bouncing off the first two lines is the most
  // common thing that happens on this screen, and counting it as a read would
  // make the number flattering and useless.
  //
  // Measured on the way out rather than fired by a 20s timer, so `seconds` carries
  // a real distribution instead of every read landing on exactly 20. Under the
  // threshold nothing is sent. An app killed mid-read reports nothing, which is
  // the price of not running a timer that would have to survive backgrounding.
  //
  // Keyed on the id, not the row: `monologue` is a query result whose identity
  // changes on refetch, and depending on the object would restart the clock every
  // time the cache settled.
  const readId = monologue?.id;
  useEffect(() => {
    if (readId == null || gated || !wallKnown) return;
    const MINIMUM_SECONDS = 20;
    const startedAt = Date.now();
    return () => {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      if (seconds >= MINIMUM_SECONDS) track('monologue_read', { id: String(readId), seconds });
    };
  }, [readId, gated, wallKnown]);

  if (isLoading && !monologue && !preview) {
    return (
      <StageShell onBack={goBack} pal={pal}>
        <Sketch name="scriptPages" size={96} stroke={c.yellow} accent={c.yellow} />
        <StageDirection style={{ marginTop: 24 }}>(finding the page…)</StageDirection>
      </StageShell>
    );
  }

  if (!monologue && !preview) {
    return (
      <StageShell onBack={goBack} pal={pal}>
        <Sketch name="stageDoor" size={96} stroke={c.mutedForeground} accent={c.yellow} />
        {isError ? (
          <>
            <StageDirection style={{ marginTop: 24, textAlign: 'center' }}>
              (this one&apos;s behind the stage door.)
            </StageDirection>
            <PrimaryPill
              label="Sign in to read"
              onPress={() => router.push('/auth')}
              style={{ marginTop: 26, alignSelf: 'center' }}
            />
            <Pressable onPress={goBack} hitSlop={10} style={{ marginTop: 18 }} accessibilityRole="button">
              <StageDirection>(back to the list.)</StageDirection>
            </Pressable>
          </>
        ) : (
          <StageDirection style={{ marginTop: 24 }}>(that page is dark.)</StageDirection>
        )}
      </StageShell>
    );
  }

  // Past the guards `head` always exists — it's the real row, or the preview the
  // list handed over. `monologue` may still be in flight, and everything that
  // touches the WORDS has to wait for it.
  const shown = head!;
  const body = monologue ? (monologue.fullText ?? monologue.excerpt) : '';
  const tag = sourceTag(shown);
  // The last word of the title goes italic — the same gesture as every headline
  // in the system, and the reason a one-word title still reads as set rather
  // than typed.
  const words = shown.title.trim().split(' ');
  const titleHead = words.length > 1 ? `${words.slice(0, -1).join(' ')} ` : '';
  const titleTail = words[words.length - 1] ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: pal.background ?? c.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* On the dark shell: the eyebrow (centred), the way back, and the tools. */}
        <View style={{ height: 48, justifyContent: 'center', paddingHorizontal: 20 }}>
          <View style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
            <StageDirection>(lights up.)</StageDirection>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              onPress={goBack}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Back to results"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
            >
              <Ionicons name="chevron-back" size={20} color={c.mutedForeground} />
              <Text
                style={{
                  fontFamily: 'BricolageGrotesque_600SemiBold',
                  fontSize: 13,
                  color: c.mutedForeground,
                }}
              >
                Results
              </Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
              <Pressable
                onPress={onCopy}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel={isPaid ? 'Copy the monologue' : 'Copying is a subscriber feature'}
              >
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={21}
                  color={copied ? c.yellow : c.mutedForeground}
                />
              </Pressable>
              {/* Saved is the gel, not the house colour: it is a mark you made,
                  and the gel is what the system uses for "you did this". */}
              <Pressable onPress={onSave} hitSlop={14} accessibilityRole="button" accessibilityLabel={favorited ? 'Unsave' : 'Save'}>
                <Ionicons
                  name={favorited ? 'bookmark' : 'bookmark-outline'}
                  size={22}
                  color={favorited ? c.yellow : c.mutedForeground}
                />
              </Pressable>
            </View>
          </View>
        </View>

        {/* The paper rises into the light, on its block of gel. */}
        <Animated.View
          entering={reduceMotion ? undefined : curtainRise}
          style={{
            flex: 1,
            marginHorizontal: 16,
            marginBottom: 16,
            transform: reduceMotion ? [{ rotate: `${CARD_TILT}deg` }] : undefined,
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: BLOCK,
              left: BLOCK,
              right: -BLOCK,
              bottom: -BLOCK,
              borderRadius: radius.card,
              backgroundColor: c.yellow,
            }}
          />
          <View
            onLayout={(e) => setCardH(Math.round(e.nativeEvent.layout.height))}
            style={{
              flex: 1,
              overflow: 'hidden',
              backgroundColor: c.paper,
              borderRadius: radius.card,
              borderWidth: 1.5,
              borderColor: c.ink,
            }}
          >
            <ScrollView
              contentContainerStyle={{ padding: 24, paddingBottom: gated ? 32 : 56 }}
              showsVerticalScrollIndicator={false}
              scrollEnabled={!gated}
            >
              {/* The character, as a tag rather than an eyebrow — it is a fact
                  about the piece, the same class of thing as "classical". */}
              <View style={{ flexDirection: 'row' }}>
                <View
                  style={{
                    borderWidth: 1.5,
                    borderColor: `${ink.accent}80`,
                    backgroundColor: `${ink.accent}1a`,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: 'CourierPrime_700Bold',
                      fontSize: 10,
                      lineHeight: 14,
                      letterSpacing: 1.8,
                      textTransform: 'uppercase',
                      color: ink.accent,
                    }}
                  >
                    {shown.character}
                  </Text>
                </View>
              </View>

              <Animated.Text
                style={[
                  titleStyle,
                  {
                    marginTop: 12,
                    fontFamily: 'InstrumentSerif_400Regular',
                    fontSize: 42,
                    lineHeight: 47,
                    letterSpacing: -0.8,
                    color: c.paperInk,
                    transformOrigin: 'left',
                  },
                ]}
              >
                {titleHead}
                <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic' }}>{titleTail}</Text>
              </Animated.Text>

              {/* The work and who wrote it, on one Courier line — the play's
                  name is the thing you actually need, and it used to carry no
                  more weight than the running time. */}
              <Text
                numberOfLines={2}
                style={{
                  marginTop: 10,
                  fontFamily: 'CourierPrime_400Regular',
                  fontSize: 14,
                  lineHeight: 20,
                  color: c.paperMuted,
                }}
              >
                {shown.source}
                {shown.author ? ` · ${shown.author}` : ''}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 14,
                }}
              >
                <MetaPill>{formatDuration(shown.duration)}</MetaPill>
                {shown.ageRange && shown.ageRange !== '—' ? <MetaPill>{shown.ageRange}</MetaPill> : null}
                {shown.gender && shown.gender !== 'any' ? <MetaPill>{shown.gender}</MetaPill> : null}
                {tag ? (
                  <Mark spec={{ label: tag, kind: 'source', tint: ink.tagInk }} />
                ) : null}
              </View>

              <View style={{ marginTop: 22, height: 1.5, width: '100%', backgroundColor: c.ink }} />

              {/* Where it happens, before the words.

                  Unclamped on purpose: scene descriptions run from six words to
                  a short paragraph, the page scrolls, and a setting cut off at
                  "she has just been told that—" is worse than three extra lines
                  before the speech. */}
              {shown.sceneNote ? (
                <Text
                  style={{
                    marginTop: 18,
                    fontFamily: 'CourierPrime_400Regular_Italic',
                    fontSize: 12,
                    lineHeight: 18,
                    letterSpacing: 0.8,
                    color: c.paperMuted,
                  }}
                >
                  {`(${shown.sceneNote.replace(/^\(|\)$/g, '').toLowerCase()})`}
                </Text>
              ) : null}

              {/* The words of the play, in the typewriter, dark ink on warm paper.
                  (Memorize mode is deferred to v2.)

                  `onLayout` is how the wall knows where line five begins: the y it
                  reports is this block's top inside the card, and the shroud is
                  pinned four line-boxes below it. */}
              {wallKnown && monologue ? (
                <Animated.View
                  onLayout={(e) => setTextTop(e.nativeEvent.layout.y)}
                  entering={FadeIn.duration(500)}
                  style={{ marginTop: 16 }}
                >
                  <MonologueText
                    body={gated ? monologue.excerpt : body}
                    // Only when the whole speech is on show. The server's segments
                    // cover the full text, so passing them behind the wall would
                    // render the part the actor hasn't paid for.
                    segments={gated ? undefined : monologue.segments}
                    lineHeight={LINE_HEIGHT}
                    fontSize={15}
                  />
                </Animated.View>
              ) : (
                // Holds the scroll steady while the words are on their way — both
                // while the wall resolves and while the fetch lands behind a
                // preview heading. The page must not jump when they arrive.
                //
                // This was a bare spacer, which kept that promise and nothing else:
                // opening a piece from the results list hands this screen a preview,
                // so the heading paints at once and the loading screen never shows,
                // leaving several seconds of blank paper where a speech should be.
                // Empty cream reads as broken; lines that breathe read as coming.
                // Same height to the pixel, so the page still cannot jump.
                <Animated.View style={{ marginTop: 16 }} exiting={FadeOut.duration(220)}>
                  <MonologueTextSkeleton lines={FREE_LINES} lineHeight={LINE_HEIGHT} />
                </Animated.View>
              )}

              {syncing ? (
                <Pressable
                  onPress={() => refetch()}
                  accessibilityRole="button"
                  style={{
                    marginTop: 26,
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: radius.card,
                    borderWidth: 1.5,
                    borderColor: ink.accent,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <Ionicons name="refresh" size={14} color={ink.accent} />
                  <Text
                    style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 13, color: ink.accent }}
                  >
                    Subscription still syncing. Tap to reload.
                  </Text>
                </Pressable>
              ) : null}

              {/* Kin at the foot of the page. Never behind the wall. */}
              {gated || !id ? null : <SimilarRow id={id} enabled />}
            </ScrollView>

            {/* A folded corner, so the page reads as paper. Hidden behind the wall. */}
            {gated ? null : <PageCurl />}

            {/* The wall. Four lines stay lit — enough to hear the voice and know
                whether it's yours — and then the page goes out of focus and the
                offer sits on the same sheet of paper. */}
            {gated && textTop !== null ? (
              <View
                // No entering animation. It was FadeIn delayed 260ms over 600ms,
                // which is precisely the "I can read the whole thing for a second
                // and then it blurs" — nearly a second of unobstructed walled text
                // on every open, which is both a worse wall and a worse tease. The
                // shroud is part of the page now, not something that arrives.
                style={{ position: 'absolute', left: 0, right: 0, top: wallTop, bottom: 0 }}
                pointerEvents="box-none"
              >
                <PaywallShroud
                  width={width - 32}
                  height={Math.max(0, (cardH || height) - wallTop)}
                  offerTop={Math.max(0, (cardH || height) - wallTop - OFFER_HEIGHT)}
                />
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: 'center',
                    paddingHorizontal: 24,
                    paddingBottom: 26,
                  }}
                >
                  {/* The stage door again — the same drawing the app uses for
                      "there's more through here", which is exactly the offer. */}
                  <Sketch name="stageDoor" size={56} stroke={c.paperInk} accent={ink.accent} weight={1.9} />
                  <Text
                    style={{
                      marginTop: 12,
                      fontFamily: 'InstrumentSerif_400Regular',
                      fontSize: 26,
                      lineHeight: 29,
                      textAlign: 'center',
                      color: c.paperInk,
                    }}
                  >
                    The rest of it{'\n'}
                    <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: ink.accent }}>
                      is waiting.
                    </Text>
                  </Text>
                  <Text
                    style={{
                      marginTop: 8,
                      fontFamily: 'CourierPrime_400Regular_Italic',
                      fontSize: 13,
                      letterSpacing: 0.8,
                      textAlign: 'center',
                      color: c.paperMuted,
                    }}
                  >
                    (three reads were the trial.)
                  </Text>
                  <PrimaryPill
                    label="Unlock every monologue"
                    haptic="medium"
                    height={50}
                    block
                    onPress={() => router.push('/paywall')}
                    style={{ marginTop: 16 }}
                  />
                  <Text
                    style={{
                      marginTop: 10,
                      fontFamily: 'BricolageGrotesque_500Medium',
                      fontSize: 12,
                      color: c.paperMuted,
                    }}
                  >
                    Saving stays free.
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </SafeAreaView>

      {/* The save acknowledgement — a beat over the page, then gone. */}
      {saveNote ? (
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(260)}
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 44, alignItems: 'center' }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 9,
              backgroundColor: colors.ink,
              borderWidth: 1.5,
              borderColor: colors.stageLine,
            }}
          >
            <Ionicons
              name={
                saveNote === 'Copied'
                  ? 'copy-outline'
                  : saveNote === 'Saved'
                    ? 'bookmark'
                    : 'bookmark-outline'
              }
              size={13}
              color={c.yellow}
            />
            <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, color: '#f7f3ec' }}>
              {saveNote}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {/* Blur over the words when the app backgrounds or a screenshot is taken. */}
      <PrivacyShield />
    </View>
  );
}

/** A durable fact about the piece — length, age, gender. Quiet, on paper. */
function MetaPill({ children }: { children: React.ReactNode }) {
  const { colors: c } = useTheme();
  return (
    <View
      style={{
        height: 26,
        justifyContent: 'center',
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: c.paperRule,
        paddingHorizontal: 11,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: 'BricolageGrotesque_600SemiBold',
          fontSize: 11,
          textTransform: 'lowercase',
          color: c.paperMuted,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/**
 * The dark stage the loading / can't-reach states stand on — so those moments
 * keep the backdrop and, crucially, a way back. No screen in the app should
 * ever be a dead end.
 */
function StageShell({
  onBack,
  pal,
  children,
}: {
  onBack: () => void;
  pal?: MediumPalette;
  children: React.ReactNode;
}) {
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} glowColor={pal?.glow} background={pal?.background} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ height: 48, justifyContent: 'center', paddingHorizontal: 20 }}>
          <Pressable onPress={onBack} hitSlop={14} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={c.mutedForeground} />
          </Pressable>
        </View>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 36,
            paddingBottom: 60,
          }}
        >
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}
