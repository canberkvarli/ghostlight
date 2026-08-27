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

import { GhostLight } from '../../src/components/GhostLight';
import { StageDirection } from '../../src/components/StageDirection';
import { StageBackdrop } from '../../src/components/StageBackdrop';
import { StageButton } from '../../src/components/StageButton';
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
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { usePreventCaptureWhileFocused } from '../../src/hooks/usePreventCaptureWhileFocused';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/tokens';
import { mediumPalette, type Medium, type MediumPalette } from '../../src/theme/medium';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { useTheme } from '../../src/theme/ThemeContext';

/**
 * Step 4 — Read.
 *
 * Lights up. The card rises, the background settles to full stage dark, the
 * words fade in. The reading canvas is light — warm paper against the dark
 * shell — which inverts the app's brightness on purpose: long text reads worse
 * on pure dark, and the web app already made this call.
 *
 * This screen is where a read is spent. The counter is server-side (spec §4);
 * see src/lib/reads.ts for why it is not faked device-local.
 */
/**
 * The curtain rises — slow and even, no bounce. The paper lifts from below the
 * stage and the light comes up on it over ~three quarters of a second: gentle,
 * cinematic, settled. A long easeOut, never an overshoot.
 */
const RISE_MS = 720;
const RISE_EASE = Easing.out(Easing.cubic);

function curtainRise(_values: EntryAnimationsValues) {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 52 }, { scale: 0.99 }] },
    animations: {
      opacity: withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.quad) }),
      transform: [
        { translateY: withTiming(0, { duration: RISE_MS, easing: RISE_EASE }) },
        { scale: withTiming(1, { duration: RISE_MS, easing: RISE_EASE }) },
      ],
    },
  };
}

/** The typewriter's line box. The wall is placed a whole number of these down. */
const LINE_HEIGHT = 27;
/** How much of the part you get to read before the light goes off it. */
const FREE_LINES = 4;

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
  /** Room the offer block needs at the foot of the card: lamp, two lines, button. */
  const OFFER_HEIGHT = 292;
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

  if (isLoading && !monologue && !preview) {
    return (
      <StageShell onBack={goBack} pal={pal}>
        <GhostLight size={18} glow={pal.glow} glassStops={pal.glassStops} neck={pal.neck} />
        <StageDirection className="mt-6">(finding the page…)</StageDirection>
      </StageShell>
    );
  }

  if (!monologue && !preview) {
    return (
      <StageShell onBack={goBack} pal={pal}>
        <GhostLight size={28} glow={pal.glow} glassStops={pal.glassStops} neck={pal.neck} />
        {isError ? (
          <>
            <StageDirection className="mt-6">(this one's behind the stage door.)</StageDirection>
            <View style={{ marginTop: 24, alignSelf: 'stretch' }}>
              <StageButton label="Sign in to read" onPress={() => router.push('/auth')} />
            </View>
            <Pressable onPress={goBack} hitSlop={10} style={{ marginTop: 16 }} accessibilityRole="button">
              <StageDirection>(back to the list.)</StageDirection>
            </Pressable>
          </>
        ) : (
          <StageDirection className="mt-6">(that page is dark.)</StageDirection>
        )}
      </StageShell>
    );
  }

  // Past the guards `head` always exists — it's the real row, or the preview the
  // list handed over. `monologue` may still be in flight, and everything that
  // touches the WORDS has to wait for it.
  const shown = head!;
  const body = monologue ? (monologue.fullText ?? monologue.excerpt) : '';

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
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="chevron-back" size={22} color={c.chevron} />
              <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: c.chevron }}>
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
                  color={copied ? pal.glow : c.mutedForeground}
                />
              </Pressable>
              <Pressable onPress={onSave} hitSlop={14} accessibilityRole="button" accessibilityLabel={favorited ? 'Unsave' : 'Save'}>
                <Ionicons
                  name={favorited ? 'bookmark' : 'bookmark-outline'}
                  size={22}
                  color={favorited ? pal.glow : c.mutedForeground}
                />
              </Pressable>
            </View>
          </View>
        </View>

        {/* The paper rises into the light. */}
        <Animated.View
          entering={reduceMotion ? undefined : curtainRise}
          onLayout={(e) => setCardH(Math.round(e.nativeEvent.layout.height))}
          style={{
            flex: 1,
            marginHorizontal: 16,
            marginBottom: 16,
            overflow: 'hidden',
            backgroundColor: colors.light.background,
            borderRadius: 20,
          }}
        >
          <ScrollView
            contentContainerStyle={{ padding: 28, paddingBottom: gated ? 32 : 56 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!gated}
          >
            <Text
              className="text-[13px] uppercase tracking-[1.6px]"
              style={{ fontFamily: 'Montserrat_600SemiBold', color: ink.accent }}
            >
              {shown.character}
            </Text>
            <Animated.Text
              className="mt-2 text-[44px] leading-[50px]"
              style={[
                titleStyle,
                {
                  fontFamily: 'PlayfairDisplay_600SemiBold',
                  color: colors.light.foreground,
                  transformOrigin: 'left',
                },
              ]}
            >
              {shown.title}
            </Animated.Text>
            {/* The metadata was one 13px grey line running source · author ·
                duration together, so the play's name — the thing you actually
                need — carried no more weight than the running time. Two lines
                now: the work and who wrote it, then the durable facts as their
                own quiet row. */}
            <Text
              className="mt-3 text-[16px]"
              style={{ fontFamily: 'PlayfairDisplay_500Medium_Italic', color: colors.light.foreground }}
            >
              {shown.source}
            </Text>
            <Text
              className="mt-1 text-[13px]"
              style={{
                fontFamily: 'Montserrat_400Regular',
                letterSpacing: 0.2,
                color: colors.light.mutedForeground,
              }}
            >
              {shown.author}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <MetaPill tint={ink.accent}>{formatDuration(shown.duration)}</MetaPill>
              {shown.ageRange ? <MetaPill tint={ink.accent}>{shown.ageRange}</MetaPill> : null}
              {shown.gender && shown.gender !== 'any' ? (
                <MetaPill tint={ink.accent}>{shown.gender}</MetaPill>
              ) : null}
            </View>

            <View
              style={{ marginVertical: 24, height: 1, width: '100%', backgroundColor: colors.light.border }}
            />

            {/* The words of the play, in the typewriter, dark ink on warm paper.
                (Memorize mode is deferred to v2.)

                `onLayout` is how the wall knows where line five begins: the y it
                reports is this block's top inside the card, and the shroud is
                pinned four line-boxes below it. Everything about the old fixed
                "56% of the window" placement was a guess that a tall phone got
                wrong in one direction and a small one in the other. */}
            {wallKnown && monologue ? (
              <Animated.View
                onLayout={(e) => setTextTop(e.nativeEvent.layout.y)}
                entering={FadeIn.duration(500)}
              >
                <MonologueText
                  body={gated ? monologue.excerpt : body}
                  // Only when the whole speech is on show. The server's segments
                  // cover the full text, so passing them behind the wall would
                  // render the part the actor hasn't paid for.
                  segments={gated ? undefined : monologue.segments}
                  lineHeight={LINE_HEIGHT}
                />
              </Animated.View>
            ) : (
              // Holds the scroll steady while the words are on their way — both
              // while the wall resolves and while the fetch lands behind a
              // preview heading. The page must not jump when they arrive.
              <View style={{ height: LINE_HEIGHT * FREE_LINES }} />
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
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: ink.accent,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <Ionicons name="refresh" size={14} color={ink.accent} />
                <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 13, color: ink.accent }}>
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
              offer sits on the same sheet of paper. It used to ramp to stage
              black and cover the bottom half of the screen whatever was there,
              which is the "too rigid" of it: a shutter, not a dimmer. */}
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
                  paddingHorizontal: 28,
                  paddingBottom: 30,
                }}
              >
                <GhostLight
                  size={17}
                  glow={ink.glow}
                  glassStops={ink.glassStops}
                  neck={ink.neck}
                />
                <Text
                  style={{
                    marginTop: 14,
                    fontFamily: 'PlayfairDisplay_600SemiBold',
                    fontSize: 23,
                    lineHeight: 29,
                    textAlign: 'center',
                    color: colors.light.foreground,
                  }}
                >
                  The rest of it{'\n'}is waiting.
                </Text>
                <Text
                  style={{
                    marginTop: 9,
                    fontFamily: 'CourierPrime_400Regular_Italic',
                    fontSize: 13,
                    letterSpacing: 0.4,
                    textAlign: 'center',
                    color: colors.light.mutedForeground,
                  }}
                >
                  (three reads were the trial.)
                </Text>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    router.push('/paywall');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Unlock every monologue"
                  style={({ pressed }) => ({
                    marginTop: 20,
                    alignSelf: 'stretch',
                    height: 54,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 16,
                    backgroundColor: ink.accent,
                    // The card is paper in both schemes, so the button is
                    // pinned to the paper palette rather than the app's —
                    // a lift and a coloured shadow, not a scheme-dependent fill.
                    shadowColor: ink.accent,
                    shadowOpacity: pressed ? 0.18 : 0.34,
                    shadowRadius: pressed ? 8 : 16,
                    shadowOffset: { width: 0, height: pressed ? 2 : 6 },
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  })}
                >
                  <Text
                    className="text-[15px] uppercase tracking-[2px] text-white"
                    style={{ fontFamily: 'Montserrat_600SemiBold' }}
                  >
                    Unlock every monologue
                  </Text>
                </Pressable>
                <Text
                  style={{
                    marginTop: 12,
                    fontFamily: 'Montserrat_400Regular',
                    fontSize: 12,
                    color: colors.light.mutedForeground,
                  }}
                >
                  Saving stays free.
                </Text>
              </View>
            </View>
          ) : null}
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
              backgroundColor: 'rgba(19, 11, 8, 0.92)',
              borderWidth: 1,
              borderColor: pal.litBorder,
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
              color={pal.glow}
            />
            <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 13, color: colors.dark.foreground }}>
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
function MetaPill({ children, tint }: { children: React.ReactNode; tint: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.light.border,
        paddingHorizontal: 11,
        paddingVertical: 5,
      }}
    >
      <Text
        style={{
          fontFamily: 'Montserrat_500Medium',
          fontSize: 11,
          letterSpacing: 0.6,
          textTransform: 'lowercase',
          color: tint,
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
            <Ionicons name="chevron-back" size={26} color={c.mutedForeground} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 60 }}>
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}
