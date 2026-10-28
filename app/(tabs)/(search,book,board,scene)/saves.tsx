import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedRef } from 'react-native-reanimated';

import { StageBackdrop } from '../../../src/components/StageBackdrop';
import { StageDirection } from '../../../src/components/StageDirection';
import { BackHeader } from '../../../src/components/BackHeader';
import { PrimaryPill } from '../../../src/components/PrimaryPill';
import { PaperCard } from '../../../src/components/PaperCard';
import { PieceCover } from '../../../src/components/PieceCover';
import { Sketch } from '../../../src/components/Sketches';
import { GhostLight } from '../../../src/components/GhostLight';
import { ChoiceSheet } from '../../../src/components/ConfirmSheet';
import { useStageMotion } from '../../../src/hooks/useStageMotion';
import { useFavorites, useSetOffBook, useToggleFavorite } from '../../../src/hooks/useFavorites';
import { useAttachPiece, useAudition, useAuditions } from '../../../src/hooks/useAuditions';
import { attachedPiece } from '../../../src/api/auditions';
import { UndoBar } from '../../../src/components/UndoBar';
import { SwipeRow } from '../../../src/components/SwipeRow';
import { SortableList } from '../../../src/components/SortableList';
import { track } from '../../../src/lib/analytics';
import { BOOK_ORDERS, FIND_FROM, TONE_LABEL, byHand, compareBy, findInBook, rowMeta, shelve, type BookOrder, type RoomPiece } from '../../../src/lib/book';
import { useGoBack } from '../../../src/lib/nav';
import { useSession } from '../../../src/lib/useSession';
import { stubLabel } from '../../../src/lib/when';
import { useTheme } from '../../../src/theme/ThemeContext';
import type { Monologue, Tone } from '../../../src/data/monologues';
import { useTabBarSpace } from '../../../src/components/TabBar';
import { useRoomScroll } from '../../../src/lib/barScroll';
import { RoomHeader, RoomTitle } from '../../../src/components/RoomHeader';
import { ComingUp, YourLists } from '../../../src/components/BookSections';
import { useLists } from '../../../src/hooks/useLists';

/**
 * Saved — "Your book."
 *
 * A book that sorts itself. Under five pieces it is one list of pages. Past
 * that, three shelves, each only when it has something on it: the pocket
 * (what you are off book on), the room (what is going into an audition), and
 * the shelf (everything else, by house, what you touched last at the top).
 * Past twelve, a tone row and a find field. Nothing to file, nothing to name
 * (src/lib/book.ts decides).
 *
 * Two things you do by hand. The tick at the right edge of a row: off book, and
 * the page lifts into the pocket at the top, the two or three you could do
 * right now; it is the website's "off book" mark, so the pocket is the same on
 * the laptop. And a slide to the left, which takes the page out of the book,
 * with five seconds to take that back.
 *
 * Above the shelves, two things the actor arranges: what is coming up (the
 * auditions still to come, which used to be a room of their own, the Board) and
 * their own lists (src/components/BookSections.tsx). Neither shows in picker mode.
 *
 * With `?pick=<auditionId>` the book is a picker: an audition's file sent you
 * here for the piece to bring, a tap attaches it and takes you back. The pocket
 * comes first there too; those are the ready ones.
 */

type Saved = Monologue;

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO = 'CourierPrime_400Regular';
const MONO_B = 'CourierPrime_700Bold';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/** Alternating tilt, so a column of pages reads as paper rather than as rows. */
const TILTS = [-0.5, 0.4, -0.3];
const ORDER_KEY = 'ghostlight:book.order';
/** The actor's own order, when they have put the pages in one by hand. */
const HAND_KEY = 'ghostlight:book.hand';

export default function Saves() {
  const { onScroll: onBarScroll, scrollY } = useRoomScroll();
  const tabSpace = useTabBarSpace();
  const { colors: c } = useTheme();
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const picking = useAudition(pick ? Number(pick) : null, isAuthenticated && Boolean(pick));
  const goBack = useGoBack(pick ? '/auditions' : '/search');
  const { tiltX, tiltY } = useStageMotion();
  const { data, isLoading, isError } = useFavorites(isAuthenticated);
  // For the room: the board is already on the phone; nothing is fetched for it.
  const { data: auditions } = useAuditions(isAuthenticated);
  const { data: lists, isLoading: listsLoading } = useLists(isAuthenticated && !pick);
  const attach = useAttachPiece();
  const attachedId = picking ? attachedPiece(picking)?.monologue_id ?? null : null;

  const toggleFavorite = useToggleFavorite();
  const setOffBook = useSetOffBook();
  const [pendingRemoval, setPendingRemoval] = useState<Saved | null>(null);
  const [find, setFind] = useState('');
  const [tone, setTone] = useState<Tone | null>(null);
  // A tone chip shortens the shelf; the page used to snap to the top as the
  // content shrank under it. Now it glides to the shelf's head instead.
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const shelfY = useRef(0);
  const toneTouched = useRef(false);
  useEffect(() => {
    if (!toneTouched.current) return;
    scroller.current?.scrollTo({ y: Math.max(0, shelfY.current - 10), animated: true });
  }, [tone, scroller]);
  const pickTone = useCallback((t: Tone | null) => { toneTouched.current = true; setTone(t); }, []);

  // How the shelf is ordered: the book's own way until the actor picks one,
  // kept on the phone. The pocket and the room keep their own orders.
  const [order, setOrder] = useState<BookOrder>('touched');
  const [hand, setHand] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(ORDER_KEY).then((v) => { if (v && BOOK_ORDERS.some((o) => o.key === v)) setOrder(v as BookOrder); }).catch(() => {});
    AsyncStorage.getItem(HAND_KEY).then((v) => { if (v) setHand(JSON.parse(v) as string[]); }).catch(() => {});
  }, []);
  const cmp = useMemo(() => (order === 'mine' ? byHand(hand) : compareBy(order)), [order, hand]);
  // Held and dragged: the page goes where it was put, and the shelf is in the
  // actor's own order from then on, starting from the one they were looking at.
  const [dragging, setDragging] = useState(false);
  const putInOrder = (shown: Saved[], section: Saved[], next: Saved[]) => {
    const moved = new Set(section.map((m) => String(m.id)));
    const nextHand = [...next.map((m) => String(m.id)), ...shown.map((m) => String(m.id)).filter((id) => !moved.has(id))];
    setHand(nextHand);
    setOrder('mine');
    track('app_book_sorted', { by: 'mine' });
    AsyncStorage.setItem(HAND_KEY, JSON.stringify(nextHand)).catch(() => {});
    AsyncStorage.setItem(ORDER_KEY, 'mine').catch(() => {});
  };
  const [sorting, setSorting] = useState(false);
  const pickOrder = () => { Haptics.selectionAsync().catch(() => {}); setSorting(true); };
  const setOrderTo = (key: BookOrder) => {
    setOrder(key);
    track('app_book_sorted', { by: key });
    AsyncStorage.setItem(ORDER_KEY, key).catch(() => {});
  };
  const orderLine = BOOK_ORDERS.find((o) => o.key === order)?.short ?? '';

  const all = (data ?? []) as Saved[];
  const items = useMemo(
    () => (pendingRemoval ? all.filter((m) => m.id !== pendingRemoval.id) : all),
    [all, pendingRemoval],
  );
  const shelved = useMemo(() => shelve(items, auditions ?? [], Date.now(), order === 'mine' ? 'touched' : order), [items, auditions, order]);
  const book = useMemo(
    () => (order === 'mine' ? { ...shelved, stage: [...shelved.stage].sort(cmp), screen: [...shelved.screen].sort(cmp) } : shelved),
    [shelved, order, cmp],
  );
  const finding = find.trim().length > 0;
  const found = useMemo(() => {
    const list = finding ? findInBook(items, find) : items;
    return order === 'touched' ? list : [...list].sort(cmp);
  }, [items, find, finding, order, cmp]);
  const flat = useMemo(() => (order === 'touched' ? book.flat : [...book.flat].sort(cmp)), [book.flat, order, cmp]);

  // One event per search, after the typing has stopped, with the count and not the words.
  const findTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!finding) return;
    if (findTimer.current) clearTimeout(findTimer.current);
    findTimer.current = setTimeout(() => track('app_book_find', { hits: found.length }), 900);
    return () => {
      if (findTimer.current) clearTimeout(findTimer.current);
    };
  }, [find, finding, found.length]);

  const subhead = picking
    ? `(for ${picking.project}. tap one and it comes with you.)`
    : book.pocket.length
      ? `(${items.length} kept, ${book.pocket.length} ready.)`
      : `(${items.length} kept.)`;

  const onUnsave = useCallback(
    (item: Saved) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setPendingRemoval((prev) => {
        // A second removal inside the first one's five seconds used to replace
        // it, and the first page, never sent to the server, came back on the
        // next refetch, which made the whole thing feel like a toggle. The
        // earlier one is settled the moment a new one starts.
        if (prev && prev.id !== item.id) toggleFavorite.mutate({ id: prev.id, on: false });
        return item;
      });
    },
    [toggleFavorite],
  );
  // The same promise on the way out: leave the screen with the bar still up,
  // and the removal happens rather than quietly not happening.
  const pendingRef = useRef<Saved | null>(null);
  pendingRef.current = pendingRemoval;
  useEffect(
    () => () => {
      const victim = pendingRef.current;
      if (victim) toggleFavorite.mutate({ id: victim.id, on: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const onUndo = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setPendingRemoval(null);
  }, []);
  const onExpire = useCallback(() => {
    setPendingRemoval((victim) => {
      if (victim) toggleFavorite.mutate({ id: victim.id, on: false });
      return null;
    });
  }, [toggleFavorite]);

  const onTick = useCallback(
    (item: Saved) => {
      Haptics.impactAsync(item.offBook ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setOffBook.mutate({ id: item.id, on: !item.offBook });
    },
    [setOffBook],
  );

  const onPick = useCallback(
    (item: Saved) => {
      if (!picking || attach.isPending) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      attach.mutate({ current: picking, monologueId: Number(item.id) }, { onSuccess: () => goBack() });
    },
    [picking, attach, goBack],
  );
  const open = useCallback(
    (item: Saved) => (picking ? onPick(item) : router.push(`/read/${item.id}`)),
    [picking, onPick, router],
  );

  const row = (item: Saved, i: number, note?: string) => (
    <Row
      key={item.id}
      item={item}
      index={i}
      note={note}
      onPress={() => open(item)}
      onUnsave={picking ? undefined : () => onUnsave(item)}
      onTick={picking ? undefined : () => onTick(item)}
      picked={picking ? Number(item.id) === attachedId : undefined}
    />
  );

  const toneFilter = (list: Saved[]) => (tone ? list.filter((m) => m.tone === tone) : list);

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {picking ? <BackHeader label="Audition" onPress={goBack} /> : <RoomHeader title="Your book" scrollY={scrollY} />}

        {!isAuthenticated ? (
          <Center>
            <Sketch name="stageDoor" size={96} stroke={c.mutedForeground} accent={c.yellow} />
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>
              (sign in to keep monologues.)
            </StageDirection>
            <PrimaryPill label="Sign in" onPress={() => router.push('/auth')} style={{ marginTop: 22, alignSelf: 'center' }} />
          </Center>
        ) : isLoading ? (
          <Center>
            <Sketch name="scriptPages" size={88} stroke={c.yellow} accent={c.yellow} />
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>
              (gathering your saves…)
            </StageDirection>
          </Center>
        ) : isError ? (
          <Center>
            <View style={{ marginBottom: 4 }}><GhostLight size={28} /></View>
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>
              (couldn&apos;t reach your book.)
            </StageDirection>
            <Text style={{ marginTop: 16, textAlign: 'center', fontFamily: SANS, fontSize: 13, lineHeight: 20, color: c.mutedForeground }}>
              Your saves are safe. Check your{'\n'}connection and try again.
            </Text>
          </Center>
        ) : items.length === 0 && !pendingRemoval ? (
          <Center>
            <Sketch name="stageDoor" size={96} stroke={c.mutedForeground} accent={c.yellow} />
            <Text style={{ marginTop: 26, textAlign: 'center', fontFamily: SERIF, fontSize: 30, lineHeight: 34, letterSpacing: -0.4, color: c.foreground }}>
              Nothing kept <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>yet.</Text>
            </Text>
            <StageDirection numberOfLines={3} style={{ marginTop: 12, textAlign: 'center' }}>
              {'(the bookmark on any page puts it here.\nthe book sorts itself as it fills.)'}
            </StageDirection>
            <PrimaryPill label="Find one" onPress={goBack} style={{ marginTop: 22, alignSelf: 'center' }} />
            {/* The auditions live in the Book now; an empty Book still leads to them. */}
            <View style={{ alignSelf: 'stretch', alignItems: 'center' }}>
              <ComingUp auditions={auditions ?? []} book={[]} />
            </View>
          </Center>
        ) : (
          <Animated.ScrollView
            scrollEnabled={!dragging}
            ref={scroller}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            onScroll={onBarScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: tabSpace }}
          >
            <RoomTitle scrollY={scrollY} style={{ paddingTop: 8, paddingHorizontal: 2 }}>
              <Text
                numberOfLines={1}
                style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 52, letterSpacing: -0.8, color: c.foreground }}
              >
                {picking ? 'Pick a ' : 'Your '}
                <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{picking ? 'piece.' : 'book.'}</Text>
              </Text>
              <StageDirection numberOfLines={2} style={{ marginTop: 6 }}>
                {subhead}
              </StageDirection>
            </RoomTitle>

            {!picking && !finding ? (
              <Reveal order={0}>
                <ComingUp auditions={auditions ?? []} book={items} first />
                <YourLists lists={lists ?? []} loading={listsLoading} book={items} />
              </Reveal>
            ) : null}

            {items.length >= FIND_FROM ? (
              <Animated.View entering={FadeIn.duration(260)} style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Ionicons name="search-outline" size={16} color={c.mutedForeground} />
                <TextInput
                  value={find}
                  onChangeText={setFind}
                  placeholder="find in your book"
                  placeholderTextColor={c.mutedForeground}
                  selectionColor={c.accentText}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  accessibilityLabel="Find in your book"
                  style={{ flex: 1, paddingVertical: 10, fontFamily: SANS, fontSize: 15.5, color: c.foreground }}
                />
              </Animated.View>
            ) : null}

            {finding ? (
              <Animated.View key="found" entering={FadeIn.duration(220)} layout={LinearTransition.duration(220)} style={{ marginTop: 18 }}>
                {found.length === 0 ? (
                  <StageDirection style={{ marginTop: 8 }}>(nothing in the book by that name.)</StageDirection>
                ) : (
                  found.map((m, i) => row(m, i))
                )}
              </Animated.View>
            ) : (
              <Animated.View key="book" layout={LinearTransition.duration(260)}>
                {book.pocket.length > 0 ? (
                  <Reveal order={0}>
                    <Shelf title="In your pocket" aside={`(${book.pocket.length} ready.)`} first>
                      <Pocket items={book.pocket} onOpen={open} onTick={picking ? undefined : onTick} pickedId={attachedId} />
                    </Shelf>
                  </Reveal>
                ) : book.shelved && !picking ? (
                  <Reveal order={0}>
                    <Shelf title="In your pocket" first>
                      <StageDirection numberOfLines={2} style={{ paddingVertical: 6 }}>
                        (tick a piece when you&apos;re off book. it waits here.)
                      </StageDirection>
                    </Shelf>
                  </Reveal>
                ) : null}

                {!book.shelved ? (
                  <Reveal order={1}>
                    <View style={{ marginTop: book.pocket.length ? 28 : 22 }}>
                      {picking ? flat.map((m, i) => row(m, i)) : (
                        <SortableList items={flat} keyOf={(m) => m.id} onHolding={setDragging}
                          onReorder={(next) => putInOrder(flat, flat, next)}
                          renderItem={(m) => row(m, flat.indexOf(m))} />
                      )}
                    </View>
                  </Reveal>
                ) : (
                  <>
                    {book.room.length > 0 ? (
                      <Reveal order={1}>
                        <Shelf title="For the room" aside={`(${book.room.length}.)`}>
                          {book.room.map((r, i) => row(r.item, i, roomNote(r)))}
                        </Shelf>
                      </Reveal>
                    ) : null}
                    {book.stage.length + book.screen.length > 0 ? (
                      <Reveal order={2}>
                        <View onLayout={(e) => { shelfY.current = e.nativeEvent.layout.y; }} />
                        <Shelf title="The shelf" aside={`(${book.stage.length + book.screen.length} · ${orderLine})`} onAside={pickOrder}>
                          {items.length >= FIND_FROM && book.tones.length > 1 ? (
                            <ToneRow tones={book.tones} value={tone} onChange={pickTone} />
                          ) : null}
                          {toneFilter(book.stage).length > 0 ? (
                            <>
                              {book.screen.length > 0 ? <House label="Stage" /> : null}
                              {picking || tone ? toneFilter(book.stage).map((m, i) => row(m, i)) : (
                                <SortableList items={book.stage} keyOf={(m) => m.id} onHolding={setDragging}
                                  onReorder={(next) => putInOrder([...book.stage, ...book.screen], book.stage, next)}
                                  renderItem={(m) => row(m, book.stage.indexOf(m))} />
                              )}
                            </>
                          ) : null}
                          {toneFilter(book.screen).length > 0 ? (
                            <>
                              {book.stage.length > 0 ? <House label="Screen" /> : null}
                              {picking || tone ? toneFilter(book.screen).map((m, i) => row(m, i)) : (
                                <SortableList items={book.screen} keyOf={(m) => m.id} onHolding={setDragging}
                                  onReorder={(next) => putInOrder([...book.stage, ...book.screen], book.screen, next)}
                                  renderItem={(m) => row(m, book.screen.indexOf(m))} />
                              )}
                            </>
                          ) : null}
                          {tone && toneFilter(book.stage).length + toneFilter(book.screen).length === 0 ? (
                            <StageDirection style={{ marginTop: 12 }}>(nothing {TONE_LABEL[tone]} on the shelf.)</StageDirection>
                          ) : null}
                        </Shelf>
                      </Reveal>
                    ) : null}
                  </>
                )}
              </Animated.View>
            )}
          </Animated.ScrollView>
        )}

        {pendingRemoval ? (
          // Keyed on the id so a second removal restarts the five seconds
          // instead of inheriting the first one's remaining time.
          <UndoBar key={pendingRemoval.id} label={`Removed “${pendingRemoval.title}”`} onUndo={onUndo} onExpire={onExpire} />
        ) : null}
      </SafeAreaView>
      <ChoiceSheet open={sorting} title="Sort the" accent="shelf." options={BOOK_ORDERS.map(({ key, label }) => ({ key, label }))} value={order} onPick={setOrderTo} onClose={() => setSorting(false)} />
    </View>
  );
}

/** "for Hedda · Thu 14" under a piece that is going into a room. */
function roomNote(r: RoomPiece): string {
  const [mon, day] = stubLabel(r.audition);
  const when = r.audition.when ? `${mon} ${day}`.trim() : 'no date yet';
  return `for ${r.audition.project} · ${when}`;
}

// ── Shelves ──────────────────────────────────────────────────────────────────

function Reveal({ order, children }: { order: number; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeIn.delay(80 + order * 70).duration(320)} layout={LinearTransition.duration(260)}>
      {children}
    </Animated.View>
  );
}

function Shelf({ title, aside, onAside, first, children }: { title: string; aside?: string; onAside?: () => void; first?: boolean; children: React.ReactNode }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: first ? 26 : 34 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingBottom: 10, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: c.divider }}>
        <Text style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 30, letterSpacing: -0.3, color: c.foreground }}>{title}</Text>
        {aside && onAside ? (
          <Pressable onPress={onAside} hitSlop={10} accessibilityRole="button" accessibilityLabel="Sort the shelf" style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <StageDirection link numberOfLines={1} style={{ flexShrink: 1 }}>{aside}</StageDirection>
            <Ionicons name="swap-vertical-outline" size={13} color={c.mutedForeground} />
          </Pressable>
        ) : aside ? (
          <StageDirection numberOfLines={1} style={{ flexShrink: 1 }}>
            {aside}
          </StageDirection>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** The small-caps house label inside the shelf: STAGE, SCREEN. */
function House({ label }: { label: string }) {
  const { colors: c } = useTheme();
  return (
    <Text style={{ marginTop: 10, marginBottom: 10, fontFamily: MONO_B, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: c.mutedForeground }}>
      {label}
    </Text>
  );
}

function ToneRow({ tones, value, onChange }: { tones: Tone[]; value: Tone | null; onChange: (t: Tone | null) => void }) {
  const { colors: c } = useTheme();
  const chip = (label: string, on: boolean, press: () => void) => (
    <Pressable
      key={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        press();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 12, height: 30, borderRadius: 999, borderWidth: 1.5, borderColor: on ? c.foreground : c.border, backgroundColor: on ? c.foreground : 'transparent', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: SANS_B, fontSize: 12.5, color: on ? c.panel : c.mutedForeground }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
      {chip('all', value === null, () => onChange(null))}
      {tones.map((t) => chip(TONE_LABEL[t], value === t, () => onChange(value === t ? null : t)))}
    </View>
  );
}

// ── The pocket ───────────────────────────────────────────────────────────────

/**
 * The ready ones, side by side and a size up from the shelf. Each is a page
 * with its cover on top, the way a pocket holds the two or three sides you
 * carry folded. The tick is filled here; tapping it puts the page back.
 */
function Pocket({
  items,
  onOpen,
  onTick,
  pickedId,
}: {
  items: Saved[];
  onOpen: (m: Saved) => void;
  onTick?: (m: Saved) => void;
  pickedId: number | null;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 4, gap: 14 }} style={{ marginHorizontal: -4 }}>
      {items.map((m, i) => (
        <Animated.View key={m.id} entering={FadeIn.duration(260)} exiting={FadeOut.duration(180)} layout={LinearTransition.duration(260)}>
          <PocketCard item={m} index={i} onPress={() => onOpen(m)} onTick={onTick ? () => onTick(m) : undefined} picked={pickedId != null ? Number(m.id) === pickedId : undefined} />
        </Animated.View>
      ))}
    </ScrollView>
  );
}

function PocketCard({ item, index, onPress, onTick, picked }: { item: Saved; index: number; onPress: () => void; onTick?: () => void; picked?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.character}, off book`}>
      <PaperCard rotate={TILTS[(index + 1) % TILTS.length]} shadow={5} style={{ width: 156, padding: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <PieceCover item={item} width={50} height={72} />
          {onTick ? (
            <Tick on onPress={onTick} label={`Put ${item.title} back on the shelf`} />
          ) : picked != null ? (
            <Ionicons name={picked ? 'checkmark-circle' : 'add-circle-outline'} size={22} color={picked ? c.primary : c.paperFaint} />
          ) : null}
        </View>
        <Text numberOfLines={2} style={{ marginTop: 12, fontFamily: SERIF, fontSize: 18, lineHeight: 21, letterSpacing: -0.2, color: c.paperInk }}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 5, fontFamily: MONO_B, fontSize: 11, lineHeight: 15, color: c.paperInk }}>
          {item.character}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: MONO, fontSize: 11, lineHeight: 15, color: c.paperMuted }}>
          {item.source}
        </Text>
      </PaperCard>
    </Pressable>
  );
}

// ── A row of the book ────────────────────────────────────────────────────────

/**
 * Denser than the old card, because a book of forty needs scanning, not
 * reading: cover, title on one line, who says it and where, then one quiet
 * line that tells you the most useful thing about YOUR copy (see rowMeta).
 * The margin on the right holds the tick, and nothing else: taking the page
 * out of the book is a slide to the left (SwipeRow), not a second tiny target
 * under the first.
 */
function Row({
  item,
  index,
  note,
  onPress,
  onUnsave,
  onTick,
  picked,
}: {
  item: Saved;
  index: number;
  /** A line that beats the usual meta, e.g. which room it is going into. */
  note?: string;
  onPress: () => void;
  /** Absent in picker mode. */
  onUnsave?: () => void;
  /** Absent in picker mode. */
  onTick?: () => void;
  /** Picker mode: whether this is the piece already on the audition. */
  picked?: boolean;
}) {
  const { colors: c } = useTheme();
  const page = (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.character}`}>
        <PaperCard rotate={TILTS[index % TILTS.length]} style={{ paddingVertical: 12, paddingLeft: 12, paddingRight: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <PieceCover item={item} width={40} height={56} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 23, letterSpacing: -0.2, color: c.paperInk }}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: MONO, fontSize: 11.5, lineHeight: 16, color: c.paperMuted }}>
                <Text style={{ fontFamily: MONO_B, color: c.paperInk }}>{item.character}</Text>
                {` · ${item.source}`}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 5, fontFamily: SANS_B, fontSize: 11, lineHeight: 14, color: note ? c.accentText : c.paperMuted }}>
                {note ?? rowMeta(item)}
              </Text>
            </View>
            {onTick ? (
              <Tick on={Boolean(item.offBook)} onPress={onTick} label={item.offBook ? `Put ${item.title} back on the shelf` : `${item.title}: off book`} />
            ) : picked != null ? (
              <Ionicons name={picked ? 'checkmark-circle' : 'add-circle-outline'} size={22} color={picked ? c.primary : c.paperFaint} />
            ) : null}
          </View>
        </PaperCard>
      </Pressable>
  );
  return (
    <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(260)}>
      {onUnsave ? (
        <SwipeRow onRemove={onUnsave} label={`Remove ${item.title} from your book`} style={{ marginBottom: 12 }}>
          {page}
        </SwipeRow>
      ) : (
        <View style={{ marginBottom: 12 }}>{page}</View>
      )}
    </Animated.View>
  );
}

/**
 * The tick. An ink ring on the page; filled with the house orange once you
 * are off book. It is the only control on the screen that changes where a
 * page lives, so it gets the room and the hit area of a real button.
 */
function Tick({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: on ? c.accentText : c.paperRule,
        backgroundColor: on ? c.accentText : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? <Ionicons name="checkmark" size={15} color={c.paper} /> : null}
    </Pressable>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 90 }}>
      {children}
    </View>
  );
}
