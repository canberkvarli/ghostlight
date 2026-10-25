import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInUp, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { StageBackdrop } from '../../../src/components/StageBackdrop';
import { StageDirection } from '../../../src/components/StageDirection';
import { BackHeader } from '../../../src/components/BackHeader';
import { PrimaryPill } from '../../../src/components/PrimaryPill';
import { Sketch } from '../../../src/components/Sketches';
import { useStageMotion } from '../../../src/hooks/useStageMotion';
import {
  useAddCallback,
  useAskAudition,
  useAssistRead,
  useAttachPiece,
  useAuditions,
  useDeleteAudition,
  useForgetAsk,
  useLogOutcome,
  usePatchAudition,
} from '../../../src/hooks/useAuditions';
import { ApiError } from '../../../src/api/client';
import {
  KIND_LABEL,
  OUTCOME_LABEL,
  REMINDER_MOMENTS,
  attachedPiece,
  type Audition,
  type BringItem,
  type Outcome,
  type ReminderMoment,
} from '../../../src/api/auditions';
import {
  hasNotificationPermission,
  phoneRemindersOff,
  requestNotificationPermission,
  setPhoneReminders,
} from '../../../src/lib/notifications';
import { track } from '../../../src/lib/analytics';
import { useGoBack } from '../../../src/lib/nav';
import { useSession } from '../../../src/lib/useSession';
import { clockLabel, dayLabel, eyebrow, timeLabel } from '../../../src/lib/when';
import { useTheme } from '../../../src/theme/ThemeContext';
import { useRoomName } from '../../../src/lib/room';
import { addAuditionToCalendar } from '../../../src/lib/calendar';
import { useTabBarSpace } from '../../../src/components/TabBar';
import { useHideBarOnScroll } from '../../../src/lib/barScroll';

/**
 * One audition as its file: the website's prep room, on a phone.
 *
 * What it is and how soon up top, then the one thing to do next, then the
 * work in the order you live it: what to bring (ticked as you pack), the
 * piece from your book, the notes, and after the room, how it went. The
 * reminders have their switches here, both the phone's and the emails the
 * site sends. The facts sit at the bottom with Edit, where the form is.
 *
 * Every small change is shown at once and saved behind (usePatchAudition);
 * nothing on this screen should wait on the network for a tick.
 */

const SERIF = 'InstrumentSerif_400Regular';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_BOLD = 'BricolageGrotesque_600SemiBold';
const MONO = 'CourierPrime_400Regular';

/** Addresses the reminder emails can never reach. Mirrors the server's list. */
const UNREACHABLE = ['@anon.actorrise.com', '@privaterelay.appleid.com'];

export default function Prep() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const room = useRoomName();
  const goBack = useGoBack(room === 'Board' ? '/auditions' : '/search');
  const { tiltX, tiltY } = useStageMotion();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isAuthenticated, session } = useSession();
  const { data, isLoading } = useAuditions(isAuthenticated);
  const a = useMemo(() => data?.find((x) => String(x.id) === id) ?? null, [data, id]);

  const patch = usePatchAudition();
  const remove = useDeleteAudition();
  const callback = useAddCallback();

  const scroll = useRef<Animated.ScrollView>(null);
  const onBarScroll = useHideBarOnScroll();
  const tabSpace = useTabBarSpace();
  const yAfter = useRef(0);
  const yAsk = useRef(0);
  const scrollTo = (y: number) => scroll.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });

  // A question fired from elsewhere on the file (the bring list's "ask me what
  // to pack"): Ask me picks it up, sends it, and the page scrolls to the answer.
  const [fire, setFire] = useState<{ q: string; n: number } | null>(null);
  const askFromElsewhere = (q: string) => {
    Haptics.selectionAsync().catch(() => {});
    setFire({ q, n: Date.now() });
    setTimeout(() => scrollTo(yAsk.current), 160);
  };

  const onEdit = useCallback(() => {
    if (!a) return;
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: '/audition', params: { id: String(a.id) } });
  }, [router, a]);

  const onRemove = () => {
    if (!a) return;
    Alert.alert('Remove this audition?', 'Its reminders go with it. You can bring it back on the website for 30 days.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          remove.mutate(a.id, { onSuccess: () => goBack() });
        },
      },
    ]);
  };

  const onCallback = () => {
    if (!a || callback.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    callback.mutate(a.id, {
      // The callback has no date yet, so it opens on the form to get one.
      onSuccess: (cb) => router.push({ pathname: '/audition', params: { id: String(cb.id) } }),
      onError: () => Alert.alert("Couldn't add it", 'Check your connection and try again.'),
    });
  };

  const [adding, setAdding] = useState(false);
  const onCalendar = async () => {
    if (!a || adding) return;
    Haptics.selectionAsync().catch(() => {});
    setAdding(true);
    const r = await addAuditionToCalendar(a);
    setAdding(false);
    if (r === 'added') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      track('app_calendar_feed_opened', {});
      Alert.alert('In your calendar', `${a.project} is on your calendar, with a reminder two hours before.`);
    } else if (r === 'denied') Alert.alert('Calendar access is off', 'Allow Ghost Light to add to your calendar in Settings, then try again.');
    else if (r === 'undated') Alert.alert('No date yet', 'Give the audition a date and time first.');
    else Alert.alert("Couldn't add it", 'Try again in a moment.');
  };

  const email = session?.user.email ?? '';
  const emailReachable = Boolean(email) && !UNREACHABLE.some((d) => email.toLowerCase().endsWith(d));

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <BackHeader
          label={room}
          onPress={goBack}
          right={
            a ? (
              <Pressable onPress={onEdit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Edit the details" style={{ paddingVertical: 6 }}>
                <Text style={{ fontFamily: SANS_BOLD, fontSize: 13, color: c.accentText }}>Edit</Text>
              </Pressable>
            ) : undefined
          }
        />

        {!a ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 90 }}>
            <Sketch name="footlights" size={96} stroke={c.mutedForeground} />
            <StageDirection numberOfLines={2} style={{ marginTop: 24, textAlign: 'center' }}>
              {isLoading ? '(finding the file…)' : "(that one isn't on your board.)"}
            </StageDirection>
          </View>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Animated.ScrollView
              ref={scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={onBarScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: tabSpace + 24 }}
            >
              <Head a={a} />

              <Animated.View entering={FadeIn.delay(120).duration(300)}>
                <Primary
                  a={a}
                  onRead={(mid) => router.push(`/read/${mid}`)}
                  onCallback={onCallback}
                  busy={callback.isPending}
                />
              </Animated.View>

              <Animated.View layout={LinearTransition.duration(240)}>
                {a.scope !== 'upcoming' ? (
                  <View onLayout={(e) => (yAfter.current = e.nativeEvent.layout.y)}>
                    <Reveal order={1}>
                      <After a={a} onCallback={onCallback} busy={callback.isPending} onFocusNote={() => scrollTo(yAfter.current)} />
                    </Reveal>
                  </View>
                ) : null}

                <Reveal order={a.scope !== 'upcoming' ? 2 : 1}>
                  <Bring a={a} onAsk={askFromElsewhere} />
                </Reveal>

                <View onLayout={(e) => (yAsk.current = e.nativeEvent.layout.y)}>
                  <Reveal order={a.scope !== 'upcoming' ? 3 : 2}>
                    <AskMe a={a} fire={fire} />
                  </Reveal>
                </View>

                <Reveal order={a.scope !== 'upcoming' ? 4 : 3}>
                  <Piece a={a} onPick={() => router.push({ pathname: '/saves', params: { pick: String(a.id) } })} onRead={(mid) => router.push(`/read/${mid}`)} />
                </Reveal>

                {a.notes?.trim() ? (
                  <Reveal order={4}>
                    <Section title="Notes">
                      <Text style={{ fontFamily: SANS, fontSize: 15.5, lineHeight: 23, color: c.foreground }}>{a.notes.trim()}</Text>
                    </Section>
                  </Reveal>
                ) : null}

                {a.scope === 'upcoming' ? (
                  <Reveal order={5}>
                    <Reminders a={a} emailReachable={emailReachable} email={email} />
                  </Reveal>
                ) : null}

                <Reveal order={6}>
                  <Details a={a} onEdit={onEdit} onRemove={onRemove} removing={remove.isPending} />
                </Reveal>
              </Animated.View>

              <Pressable
                onPress={onCalendar}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Add to calendar"
                style={{ marginTop: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Ionicons name="calendar-outline" size={14} color={c.mutedForeground} />
                <StageDirection numberOfLines={1}>(add to calendar.)</StageDirection>
              </Pressable>
            </Animated.ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </View>
  );
}

/** Sections fade up in the order they are read. Opacity and a little lift, on views with no buttons inside the moving part. */
function Reveal({ order, children }: { order: number; children: React.ReactNode }) {
  return <Animated.View entering={FadeIn.delay(140 + order * 70).duration(320)}>{children}</Animated.View>;
}

/**
 * The eyebrow, the title, and the call sheet: a cream card with the day torn
 * off at the left (weekday, the date large, the month) and the facts beside
 * it, one to a line, in the order you need them at the door: the hour, the
 * place, the part. Directions and the link are on the card, under the facts.
 *
 * It was three lines of 17pt prose, with the date and the place sharing a
 * line, and a long address made it a paragraph. A day you can read from across
 * the room, and a short list, is what a call sheet is for.
 */
function Head({ a }: { a: Audition }) {
  const { colors: c } = useTheme();
  const role = [a.role?.trim(), KIND_LABEL[a.kind]].filter(Boolean).join(' · ');
  const place = a.kind === 'self_tape' ? null : a.location?.trim() || null;
  const directions = a.kind === 'in_person' && a.location?.trim() ? `http://maps.apple.com/?daddr=${encodeURIComponent(a.location.trim())}` : null;
  const link = a.kind !== 'in_person' ? a.tape_link?.trim() || null : null;
  const due = a.kind === 'self_tape';
  const d = a.when ? new Date(a.when) : null;
  const hour = d && a.when ? `${due ? 'Due ' : ''}${d.toLocaleDateString(undefined, { weekday: 'long' })} at ${clockLabel(a.when)}` : null;

  const cap = { fontFamily: 'CourierPrime_700Bold', fontSize: 9.5, lineHeight: 12, letterSpacing: 1.4, color: c.paperMuted } as const;
  return (
    <View>
      <Animated.View entering={FadeInUp.duration(380)}>
        <Text style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', color: c.accentText }}>
          {eyebrow(a)}
        </Text>
        <Text style={{ marginTop: 10, fontFamily: SERIF, fontSize: 38, lineHeight: 42, letterSpacing: -0.6, color: c.foreground }}>{a.project}</Text>
      </Animated.View>

      <Animated.View
        entering={FadeIn.delay(80).duration(300)}
        style={{
          marginTop: 16,
          flexDirection: 'row',
          borderRadius: 8,
          borderWidth: 1.5,
          borderColor: c.cardBorder,
          backgroundColor: c.paper,
          overflow: 'hidden',
          transform: [{ rotate: '-0.3deg' }],
        }}
      >
        {/* The day, torn off at the left. */}
        <View style={{ width: 74, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: c.paperRule }}>
          {d ? (
            <>
              <Text style={cap}>{(due ? 'DUE' : d.toLocaleDateString(undefined, { weekday: 'short' })).toUpperCase()}</Text>
              <Text style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 40, color: c.paperInk }}>{d.getDate()}</Text>
              <Text style={cap}>{d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</Text>
            </>
          ) : (
            <>
              <Text style={cap}>TBD</Text>
              <Text style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 40, color: c.paperMuted }}>?</Text>
              <Text style={cap}>{'  '}</Text>
            </>
          )}
        </View>

        {/* The facts, one to a line. */}
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center', gap: 3 }}>
          <Text style={{ fontFamily: SANS_BOLD, fontSize: 16, lineHeight: 22, color: c.paperInk }}>{hour ?? 'No date yet'}</Text>
          {place ? (
            <Text numberOfLines={2} style={{ fontFamily: SANS, fontSize: 14.5, lineHeight: 20, color: c.paperBody }}>
              {place}
            </Text>
          ) : null}
          {role ? (
            <Text numberOfLines={1} style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 12.5, lineHeight: 17, letterSpacing: 0.3, color: c.paperMuted }}>
              {role}
            </Text>
          ) : null}
          {!hour ? <StageDirection on="paper" style={{ marginTop: 2 }}>(edit it to set one.)</StageDirection> : null}
          {directions || link ? (
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
              {directions ? <TextLink icon="navigate-outline" label="Directions" onPress={() => Linking.openURL(directions).catch(() => {})} /> : null}
              {link ? (
                <TextLink
                  icon="open-outline"
                  label={a.kind === 'self_tape' ? 'Where to send it' : 'Meeting link'}
                  onPress={() => Linking.openURL(/^https?:\/\//.test(link) ? link : `https://${link}`).catch(() => {})}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * The one orange button: the next thing to do for this audition. Pack when
 * it is tomorrow and the list has things on it; read the piece once more
 * when there is one; how did it go once it has gone; add the callback when
 * one came. Nothing to do, no button.
 */
function Primary({
  a,
  onRead,
  onCallback,
  busy,
}: {
  a: Audition;
  onRead: (monologueId: number) => void;
  onCallback: () => void;
  busy: boolean;
}) {
  const piece = attachedPiece(a);
  let label: string | null = null;
  let act: (() => void) | null = null;
  if (a.scope !== 'upcoming') {
    if (a.status === 'callback' && !a.callback_id) {
      label = busy ? 'Adding it' : 'Add the callback';
      act = onCallback;
    }
  } else if (piece?.monologue_id != null) {
    label = 'Read it once more';
    act = () => onRead(piece.monologue_id as number);
  }
  if (!label || !act) return null;
  return <PrimaryPill label={label} onPress={act} block disabled={busy} style={{ marginTop: 24 }} />;
}

/** A heading with a rule under it. `onHeaderPress` makes the heading a button (the folding sections); no children, no body. */
function Section({
  title,
  aside,
  children,
  onHeaderPress,
  accessibilityLabel,
}: {
  title: string;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  onHeaderPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors: c } = useTheme();
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <Text style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 30, letterSpacing: -0.3, color: c.foreground }}>{title}</Text>
      {aside}
    </View>
  );
  return (
    <View style={{ marginTop: 34 }}>
      {onHeaderPress ? (
        <Pressable onPress={onHeaderPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} hitSlop={6}>
          {head}
        </Pressable>
      ) : (
        head
      )}
      {children ? <View style={{ paddingTop: 12 }}>{children}</View> : null}
    </View>
  );
}

function TextLink({ icon, label, onPress, muted = false }: { icon?: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; muted?: boolean }) {
  const { colors: c } = useTheme();
  const color = muted ? c.mutedForeground : c.accentText;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 }}>
      {icon ? <Ionicons name={icon} size={14} color={color} /> : null}
      <Text style={{ fontFamily: SANS_BOLD, fontSize: 13.5, color, textDecorationLine: muted ? 'underline' : 'none' }}>{label}</Text>
    </Pressable>
  );
}

// ── Bring ────────────────────────────────────────────────────────────────────

/**
 * What to bring, ticked as you pack: the casting email's list, the model's
 * ideas marked as such, and anything you add. Ticks show at once and save
 * behind; the pack bar fills as you go.
 */
/** Audition and inputs this session has already asked the model to read. */
const READ = new Set<string>();

function Bring({ a, onAsk }: { a: Audition; onAsk: (q: string) => void }) {
  const { colors: c } = useTheme();
  const patch = usePatchAudition();
  const assist = useAssistRead();
  const [draft, setDraft] = useState('');
  const items = a.bring_list;
  const packed = items.filter((i) => i.done).length;

  const save = (next: BringItem[]) => patch.mutate({ id: a.id, patch: { bring_list: next } });
  const toggle = (i: number) => {
    Haptics.selectionAsync().catch(() => {});
    save(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)));
  };
  const drop = (i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    save(items.filter((_, j) => j !== i));
  };
  const add = () => {
    const text = draft.trim();
    setDraft('');
    if (!text || items.some((x) => x.text.toLowerCase() === text.toLowerCase())) return;
    Haptics.selectionAsync().catch(() => {});
    save([...items, { text, done: false, src: 'me' }]);
  };
  /**
   * The read runs on its own, the way it does on the website: open the file and
   * the model's ideas on what to wear are already on the list, marked as its
   * own, with a cross beside each. Nobody is asked to ask. The server keeps
   * the read keyed on the inputs, so this costs one model call per audition
   * and a repeat open is served from the saved one; `READ` keeps this
   * session from even making the round trip twice for the same inputs.
   */
  const canRead = Boolean(a.role?.trim() || a.material_raw?.trim()) && a.scope === 'upcoming';
  const readKey = `${a.id}|${a.role ?? ''}|${a.material_raw ?? ''}`;
  useEffect(() => {
    if (!canRead || READ.has(readKey)) return;
    READ.add(readKey);
    assist.mutate(a.id, { onError: () => READ.delete(readKey) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, readKey, a.id]);

  return (
    <Section
      title="Bring"
      aside={items.length ? <PackBar packed={packed} total={items.length} /> : null}
    >
      {items.length === 0 ? <StageDirection>(nothing on the list yet.)</StageDirection> : null}
      <Animated.View layout={LinearTransition.duration(220)}>
        {items.map((item, i) => (
          <Animated.View key={item.text} entering={FadeIn.duration(220)} layout={LinearTransition.duration(220)}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9 }}>
              <Pressable
                onPress={() => toggle(i)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                accessibilityLabel={item.text}
                style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
              >
                <Tick on={item.done} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: SANS,
                    fontSize: 15.5,
                    lineHeight: 22,
                    color: item.done ? c.mutedForeground : c.foreground,
                    textDecorationLine: item.done ? 'line-through' : 'none',
                  }}
                >
                  {item.text}
                  {item.src === 'ai' ? <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, color: c.mutedForeground }}>{'  (my idea)'}</Text> : null}
                </Text>
              </Pressable>
              {item.src !== 'email' ? (
                <Pressable onPress={() => drop(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Take ${item.text} off the list`} style={{ paddingTop: 3 }}>
                  <Ionicons name="close" size={16} color={c.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        ))}
      </Animated.View>

      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Ionicons name="add" size={18} color={c.mutedForeground} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          returnKeyType="done"
          blurOnSubmit={false}
          placeholder="add something to bring"
          placeholderTextColor={c.mutedForeground}
          selectionColor={c.accentText}
          maxLength={200}
          style={{ flex: 1, paddingVertical: 10, fontFamily: SANS, fontSize: 15.5, color: c.foreground }}
        />
        {draft.trim() ? (
          <Pressable onPress={add} hitSlop={8} accessibilityRole="button">
            <Text style={{ fontFamily: SANS_BOLD, fontSize: 13.5, color: c.accentText }}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      {assist.isPending ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Ionicons name="sparkles-outline" size={13} color={c.mutedForeground} />
          <StageDirection numberOfLines={2} style={{ flex: 1 }}>(reading the part for what to wear…)</StageDirection>
        </Animated.View>
      ) : !canRead && a.scope === 'upcoming' ? (
        <StageDirection numberOfLines={2} style={{ marginTop: 14 }}>(add the role and i'll have ideas on what to wear.)</StageDirection>
      ) : a.scope === 'upcoming' ? (
        /* The list is the model's first pass; the rest is a question away. */
        <Pressable
          onPress={() => onAsk(a.kind === 'self_tape' ? 'What do I need to set up for this tape?' : 'What should I bring to this one, and what should I wear?')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Ask me what to bring"
          style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 7 }}
        >
          <Ionicons name="sparkles-outline" size={13} color={c.accentText} />
          <StageDirection numberOfLines={1} style={{ color: c.accentText }}>
            {a.kind === 'self_tape' ? '(not sure what to set up? ask me.)' : '(not sure what to pack? ask me.)'}
          </StageDirection>
        </Pressable>
      ) : null}
    </Section>
  );
}

function Tick({ on }: { on: boolean }) {
  const { colors: c } = useTheme();
  return (
    <View
      style={{
        marginTop: 2,
        width: 19,
        height: 19,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: on ? c.foreground : c.border,
        backgroundColor: on ? c.foreground : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? <Ionicons name="checkmark" size={13} color={c.background} /> : null}
    </View>
  );
}

function PackBar({ packed, total }: { packed: number; total: number }) {
  const { colors: c } = useTheme();
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(total ? packed / total : 0, { duration: 320 });
  }, [packed, total, w]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.round(w.value * 100)}%` }));
  const done = total > 0 && packed === total;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
      <View style={{ width: 54, height: 3, borderRadius: 2, backgroundColor: c.divider, overflow: 'hidden' }}>
        <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: c.primary }, fill]} />
      </View>
      <Text style={{ fontFamily: SANS_BOLD, fontSize: 12, color: done ? c.primary : c.mutedForeground }}>
        {done ? 'all packed' : `${packed} of ${total} packed`}
      </Text>
    </View>
  );
}

// ── The piece ────────────────────────────────────────────────────────────────

/**
 * The monologue coming with you, if one is. Most auditions don't need one,
 * so this never nags: one quiet button into the book when there is nothing
 * here, and the piece as a page when there is.
 */
function Piece({ a, onPick, onRead }: { a: Audition; onPick: () => void; onRead: (monologueId: number) => void }) {
  const { colors: c } = useTheme();
  const attach = useAttachPiece();
  const piece = attachedPiece(a);
  const takeOff = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    attach.mutate({ current: a, monologueId: null });
  };
  return (
    <Section title="Your piece">
      {piece ? (
        <Animated.View entering={FadeIn.duration(240)}>
          <Pressable
            onPress={() => piece.monologue_id != null && onRead(piece.monologue_id)}
            accessibilityRole="button"
            accessibilityLabel={`Read ${piece.title ?? 'the piece'}`}
            style={{
              borderRadius: 6,
              backgroundColor: c.paper,
              borderWidth: 1.5,
              borderColor: c.cardBorder,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              transform: [{ rotate: '-0.4deg' }],
            }}
          >
            <Ionicons name="bookmark" size={16} color={c.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 24, color: c.paperInk }}>{piece.title}</Text>
              {piece.character || piece.play_title ? (
                <Text style={{ marginTop: 2, fontFamily: MONO, fontSize: 12, color: c.paperMuted }}>
                  {[piece.character, piece.play_title].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={15} color={c.paperFaint} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 10 }}>
            <TextLink label="Change it" onPress={onPick} muted />
            <TextLink label="Take it off" onPress={takeOff} muted />
          </View>
        </Animated.View>
      ) : (
        <View>
          <PrimaryPill label="Pick one from your book" onPress={onPick} variant="outline" block haptic="selection" />
          <StageDirection style={{ marginTop: 10 }}>(most rooms don&apos;t ask for one. when they do, it&apos;s here.)</StageDirection>
        </View>
      )}
    </Section>
  );
}

// ── After the room ───────────────────────────────────────────────────────────

/**
 * Once it has gone: how did it go, in a word and then in your own. The word
 * moves the status (a callback, a pass); the note is yours to keep.
 */
function After({ a, onCallback, busy, onFocusNote }: { a: Audition; onCallback: () => void; busy: boolean; onFocusNote: () => void }) {
  const { colors: c } = useTheme();
  const outcome = useLogOutcome();
  const patch = usePatchAudition();
  const [how, setHow] = useState(a.after_notes?.how ?? '');
  const saveHow = () => {
    const text = how.trim();
    if (text === (a.after_notes?.how ?? '').trim()) return;
    patch.mutate({ id: a.id, patch: { after_notes: { ...(a.after_notes ?? {}), how: text } } });
  };
  const unanswered = a.status === 'scheduled' || a.status === 'submitted';
  const heard = a.status === 'booked' ? 'Booked. Go get it.' : a.status === 'passed' ? 'Not this time. On to the next one.' : a.status === 'callback' ? 'A callback.' : null;

  return (
    <Section title="After the room">
      {unanswered ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
            <Pressable
              key={o}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                outcome.mutate({ id: a.id, outcome: o });
              }}
              disabled={outcome.isPending}
              accessibilityRole="button"
              style={{
                paddingHorizontal: 14,
                height: 36,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: c.foreground,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: outcome.isPending ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: SANS_BOLD, fontSize: 13, color: c.foreground }}>{OUTCOME_LABEL[o]}</Text>
            </Pressable>
          ))}
        </View>
      ) : heard ? (
        <Animated.View entering={FadeIn.duration(240)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ fontFamily: SANS, fontSize: 15.5, color: c.foreground, flex: 1 }}>{heard}</Text>
          {a.status === 'callback' && !a.callback_id ? (
            <PrimaryPill label={busy ? 'Adding it' : 'Add the callback'} onPress={onCallback} height={38} disabled={busy} />
          ) : null}
        </Animated.View>
      ) : null}
      <TextInput
        multiline
        scrollEnabled={false}
        value={how}
        onChangeText={setHow}
        // The keyboard covers the bottom half of the file; bring the section
        // to the top once it has risen so the words land in view.
        onFocus={() => setTimeout(onFocusNote, 280)}
        onBlur={saveHow}
        placeholder="How did it go, in your own words."
        placeholderTextColor={c.mutedForeground}
        selectionColor={c.accentText}
        style={{
          marginTop: 14,
          minHeight: 44,
          paddingVertical: 8,
          fontFamily: SANS,
          fontSize: 15.5,
          lineHeight: 22,
          color: c.foreground,
          textAlignVertical: 'top',
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      />
    </Section>
  );
}

// ── Reminders ────────────────────────────────────────────────────────────────

const MOMENT_LABEL: Record<ReminderMoment, [string, string]> = {
  prep: ['Three days out', '6 pm, what to work on'],
  eve: ['The night before', '7 pm, where and when'],
  after: ['The morning after', '9 am, how did it go?'],
};

/**
 * Both kinds of reminder, each with its switch. The phone's two notifications
 * are local and theirs to turn off here; the three emails are the website's
 * and the switches write to the same row it reads. Everything that can stop a
 * reminder from arriving is said here, not discovered the morning after.
 */
function Reminders({ a, emailReachable, email }: { a: Audition; emailReachable: boolean; email: string }) {
  const { colors: c } = useTheme();
  const patch = usePatchAudition();
  const [permission, setPermission] = useState<boolean | null>(null);
  const [phoneOff, setPhoneOff] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([hasNotificationPermission(), phoneRemindersOff(a.id)]).then(([p, off]) => {
      if (!live) return;
      setPermission(p);
      setPhoneOff(off);
    });
    return () => {
      live = false;
    };
  }, [a.id]);

  const phoneOn = permission === true && !phoneOff && a.reminders_on;
  const moments = a.reminders_on ? a.reminder_moments : [];

  const flipPhone = async (on: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    track('app_reminder_toggled', { channel: 'phone', on });
    if (on) {
      const ok = await requestNotificationPermission();
      setPermission(ok);
      if (!ok) {
        setDenied(true);
        return;
      }
      setPhoneOff(false);
      // The server's flag is shared with the emails; on here means on there too,
      // with whatever emails were already chosen left as they were.
      const row = a.reminders_on ? a : { ...a, reminders_on: true };
      if (!a.reminders_on) patch.mutate({ id: a.id, patch: { reminders_on: true } });
      await setPhoneReminders(row, true);
    } else {
      setPhoneOff(true);
      await setPhoneReminders(a, false);
    }
  };

  const flipEmail = (m: ReminderMoment) => {
    Haptics.selectionAsync().catch(() => {});
    const next = REMINDER_MOMENTS.filter((x) => (x === m ? !moments.includes(x) : moments.includes(x)));
    track('app_reminder_toggled', { channel: 'email', on: next.includes(m) });
    patch.mutate({ id: a.id, patch: { reminder_moments: next, reminders_on: next.length > 0 || phoneOn } });
  };

  const trackColor = { true: c.primary, false: c.divider };

  /**
   * Folded by default. The switches are set once and read never, so the whole
   * section was a screen of toggles between you and the facts. The heading
   * says what is on; tap it and the switches unfold.
   */
  const [open, setOpen] = useState(false);
  const toggleOpen = () => {
    Haptics.selectionAsync().catch(() => {});
    setOpen((v) => !v);
  };
  const emails = emailReachable ? moments.length : 0;
  const summary = !a.when
    ? 'set a date first'
    : [phoneOn ? 'phone' : null, emails ? `${emails} email${emails === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'off';
  const aside = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 5 }}>
      <Text style={{ fontFamily: MONO, fontSize: 12.5, letterSpacing: 0.3, color: c.mutedForeground }}>{summary}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.mutedForeground} />
    </View>
  );
  const label = `I'll remind you, ${summary}. ${open ? 'Hide' : 'Show'} the reminders`;

  if (!a.when) {
    return (
      <Section title="I'll remind you" aside={aside} onHeaderPress={toggleOpen} accessibilityLabel={label}>
        {open ? <StageDirection>(set a date and the reminders follow it.)</StageDirection> : null}
      </Section>
    );
  }

  if (!open) return <Section title="I'll remind you" aside={aside} onHeaderPress={toggleOpen} accessibilityLabel={label} />;

  return (
    <Section title="I'll remind you" aside={aside} onHeaderPress={toggleOpen} accessibilityLabel={label}>
      <Text style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: c.mutedForeground }}>On this phone</Text>
      <SwitchRow
        label="The night before, and two hours out"
        hint={a.kind === 'self_tape' ? '8 pm the evening before it is due, then two hours before' : '8 pm the evening before, then two hours before the room'}
        on={phoneOn}
        onChange={(v) => void flipPhone(v)}
        trackColor={trackColor}
      />
      {permission === false && (denied || !phoneOff) ? (
        <Pressable onPress={() => Linking.openSettings().catch(() => {})} hitSlop={8} accessibilityRole="button" style={{ marginTop: 2 }}>
          <StageDirection numberOfLines={3}>(notifications are off for ghost light. open settings to allow them.)</StageDirection>
        </Pressable>
      ) : null}

      <Text style={{ marginTop: 22, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: c.mutedForeground }}>By email</Text>
      {REMINDER_MOMENTS.map((m) => {
        const [label, hint] = MOMENT_LABEL[m];
        return (
          <SwitchRow
            key={m}
            label={m === 'prep' && a.kind === 'self_tape' ? "Three days before it's due" : label}
            hint={hint}
            on={emailReachable && moments.includes(m)}
            disabled={!emailReachable}
            onChange={() => flipEmail(m)}
            trackColor={trackColor}
          />
        );
      })}
      {!emailReachable ? (
        <StageDirection numberOfLines={3} style={{ marginTop: 6 }}>
          {email
            ? '(your apple sign-in hides your address, so email can’t reach you. the phone still can.)'
            : '(no email on this account, so these stay off. the phone still can.)'}
        </StageDirection>
      ) : moments.length === 0 && !phoneOn ? (
        <StageDirection style={{ marginTop: 6 }}>(nothing will remind you about this one.)</StageDirection>
      ) : null}
    </Section>
  );
}

function SwitchRow({
  label,
  hint,
  on,
  onChange,
  disabled = false,
  trackColor,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  trackColor: { true: string; false: string };
}) {
  const { colors: c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9, opacity: disabled ? 0.55 : 1 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: SANS, fontSize: 15.5, lineHeight: 21, color: c.foreground }}>{label}</Text>
        <Text style={{ marginTop: 1, fontFamily: MONO, fontSize: 12, lineHeight: 16, color: c.mutedForeground }}>{hint}</Text>
      </View>
      <Switch value={on} onValueChange={onChange} disabled={disabled} trackColor={trackColor} thumbColor="#fff" ios_backgroundColor={trackColor.false} />
    </View>
  );
}

// ── Ask me ───────────────────────────────────────────────────────────────────

/**
 * One question box about this audition, the website's. The model answers from
 * what is saved on the file (the facts, the bring list, the notes, the sides
 * when there are any, and what it already told you), and the answer stays on
 * the page until you take it off. Before the first question there are three
 * to tap, so nobody has to think of what to ask a page.
 */
const STARTERS: Record<'room' | 'tape', string[]> = {
  room: ['What should I wear?', 'How early should I get there?', 'What do I bring?'],
  tape: ['What do I wear on camera?', 'How do I frame and light it?', 'How should I slate?'],
};

function AskMe({ a, fire }: { a: Audition; fire: { q: string; n: number } | null }) {
  const { colors: c } = useTheme();
  const ask = useAskAudition();
  const forget = useForgetAsk();
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const asks = a.assist?.asks ?? [];

  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (t.length < 2 || ask.isPending) return;
      Haptics.selectionAsync().catch(() => {});
      setError(null);
      ask.mutate(
        { id: a.id, q: t },
        {
          onSuccess: () => setQ(''),
          onError: (err) =>
            setError(
              err instanceof ApiError && err.status === 403
                ? "(that's all my questions for this month on your plan.)"
                : "(i couldn't answer that just now. try again in a moment.)",
            ),
        },
      );
    },
    [a.id, ask],
  );

  // A question fired from elsewhere on the file.
  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (!fire || fired.current === fire.n) return;
    fired.current = fire.n;
    send(fire.q);
  }, [fire, send]);

  const remove = (at: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    forget.mutate({ id: a.id, at });
  };

  return (
    <Section title="Ask me" aside={<StageDirection style={{ paddingBottom: 5 }}>(about this one.)</StageDirection>}>
      {asks.length > 0 ? (
        <Animated.View layout={LinearTransition.duration(220)} style={{ marginBottom: 6 }}>
          {asks.map((x) => (
            <Animated.View
              key={x.at}
              entering={FadeIn.duration(240)}
              exiting={FadeOut.duration(160)}
              layout={LinearTransition.duration(220)}
              style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <Text style={{ flex: 1, fontFamily: SANS_BOLD, fontSize: 15, lineHeight: 21, color: c.foreground }}>{x.q}</Text>
                <Pressable onPress={() => remove(x.at)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Take "${x.q}" off the page`} style={{ paddingTop: 3 }}>
                  <Ionicons name="close" size={16} color={c.mutedForeground} />
                </Pressable>
              </View>
              <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 15.5, lineHeight: 23, color: c.foreground }}>{x.a}</Text>
            </Animated.View>
          ))}
        </Animated.View>
      ) : null}

      {asks.length === 0 && !ask.isPending ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          {STARTERS[a.kind === 'self_tape' ? 'tape' : 'room'].map((s) => (
            <Pressable
              key={s}
              onPress={() => send(s)}
              accessibilityRole="button"
              style={{ height: 34, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5, borderColor: c.border, justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, letterSpacing: 0.3, color: c.mutedForeground }}>{s.toLowerCase()}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Ionicons name="sparkles-outline" size={16} color={c.mutedForeground} />
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => send(q)}
          returnKeyType="send"
          blurOnSubmit={false}
          editable={!ask.isPending}
          placeholder="where do I park? what should I wear?"
          placeholderTextColor={c.mutedForeground}
          selectionColor={c.accentText}
          maxLength={500}
          style={{ flex: 1, paddingVertical: 10, fontFamily: SANS, fontSize: 15.5, color: c.foreground }}
        />
        {q.trim().length >= 2 && !ask.isPending ? (
          <Pressable onPress={() => send(q)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ask">
            <Text style={{ fontFamily: SANS_BOLD, fontSize: 13.5, color: c.accentText }}>Ask</Text>
          </Pressable>
        ) : null}
      </View>

      {ask.isPending ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Ionicons name="sparkles-outline" size={13} color={c.mutedForeground} />
          <StageDirection numberOfLines={1}>(thinking it over…)</StageDirection>
        </Animated.View>
      ) : error ? (
        <StageDirection numberOfLines={2} style={{ marginTop: 12 }}>{error}</StageDirection>
      ) : null}
    </Section>
  );
}

// ── The details ──────────────────────────────────────────────────────────────

/** The facts, at a glance, and the two quiet links: edit, remove. */
function Details({ a, onEdit, onRemove, removing }: { a: Audition; onEdit: () => void; onRemove: () => void; removing: boolean }) {
  const { colors: c } = useTheme();
  const rows: [string, string][] = [];
  rows.push([a.kind === 'self_tape' ? 'Due' : 'When', a.when ? `${dayLabel(a.when)} · ${timeLabel(a.when)}` : 'No date yet']);
  if (a.location?.trim()) rows.push(['Where', a.location.trim()]);
  rows.push(['For', [a.project, a.role, KIND_LABEL[a.kind]].filter(Boolean).join(' · ')]);
  if (a.casting?.trim()) rows.push(['Casting', a.casting.trim()]);
  if (a.material_raw?.trim()) rows.push(['Asked for', a.material_raw.trim()]);
  if (a.tape_link?.trim()) rows.push([a.kind === 'self_tape' ? 'Tape' : 'Link', a.tape_link.trim()]);
  return (
    <Section title="The details">
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 7 }}>
          <Text style={{ width: 78, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', lineHeight: 20, color: c.mutedForeground }}>{k}</Text>
          <Text style={{ flex: 1, fontFamily: SANS, fontSize: 15, lineHeight: 21, color: c.foreground }}>{v}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 18, marginTop: 10 }}>
        <TextLink label="Edit the details" onPress={onEdit} muted />
        <TextLink label={removing ? 'Removing it' : 'Remove this audition'} onPress={onRemove} muted />
      </View>
    </Section>
  );
}
