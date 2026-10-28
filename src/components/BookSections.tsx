import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { PaperCard } from './PaperCard';
import { StageDirection } from './StageDirection';
import { attachedPiece, type Audition } from '../api/auditions';
import type { BookList } from '../api/book';
import { useCreateList } from '../hooks/useLists';
import { stubLabel } from '../lib/when';
import { useTheme } from '../theme/ThemeContext';
import type { Monologue } from '../data/monologues';

const SERIF = 'InstrumentSerif_400Regular';
const MONO = 'CourierPrime_400Regular';
const MONO_B = 'CourierPrime_700Bold';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const DAY = 86_400_000;

/**
 * The top of the Book: what is coming up, and the actor's own lists.
 *
 * The Board used to be a room of its own; it lives here now, as the auditions
 * still to come, each a dated card with its piece on it. The whole board (past
 * ones, the callbacks, the calendar) is one tap away, and so is adding one.
 * Under it the lists, which are the actor's own grouping of what they keep.
 * Both are fixed-height rows, like everything else in the Book.
 */

/** "today", "tomorrow", "in 9 days", "3 days ago". */
export function countdown(iso: string | null, now = Date.now()): string {
  if (!iso) return 'no date yet';
  const d = new Date(iso);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const n = Math.round((day.getTime() - start.getTime()) / DAY);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1) return `in ${n} days`;
  return n === -1 ? 'yesterday' : `${-n} days ago`;
}

function Head({ title, children }: { title: string; children?: React.ReactNode }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingBottom: 10, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <Text style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 30, letterSpacing: -0.3, color: c.foreground }}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>{children}</View>
    </View>
  );
}

/** A word of action at the right of a section's head: "Add", "Board". Sans, the app's own voice. */
function HeadLink({ label, icon, after, onPress }: { label: string; icon?: keyof typeof Ionicons.glyphMap; after?: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {icon ? <Ionicons name={icon} size={15} color={c.accentText} /> : null}
      <Text numberOfLines={1} style={{ fontFamily: SANS_B, fontSize: 13.5, color: c.accentText }}>{label}</Text>
      {after ? <Ionicons name={after} size={14} color={c.accentText} /> : null}
    </Pressable>
  );
}

/** A sentence that is also a way in, for an empty section. */
function LineLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <StageDirection link numberOfLines={2}>{label}</StageDirection>
    </Pressable>
  );
}

/** The auditions still to come, soonest first, and the way to the rest of the board. */
export function ComingUp({ auditions, book, first }: { auditions: Audition[]; book: Monologue[]; first?: boolean }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const upcoming = auditions
    .filter((a) => a.scope === 'upcoming')
    .sort((a, b) => (a.when ? Date.parse(a.when) : Infinity) - (b.when ? Date.parse(b.when) : Infinity));
  const kept = new Map(book.map((m) => [String(m.id), m]));

  if (!upcoming.length) {
    // Nothing coming: one quiet line, so adding one is never more than a tap away.
    return (
      <View style={{ marginTop: first ? 22 : 30, gap: 6 }}>
        <LineLink label="(an audition coming up? add it here.)" onPress={() => router.push('/audition')} />
        {auditions.length ? <LineLink label="(the ones gone by are on the board.)" onPress={() => router.push('/auditions')} /> : null}
      </View>
    );
  }

  return (
    <View style={{ marginTop: first ? 26 : 34 }}>
      <Head title="Coming up">
        <HeadLink label="Add" icon="add" onPress={() => router.push('/audition')} />
        <HeadLink label="Board" after="chevron-forward" onPress={() => router.push('/auditions')} />
      </Head>
      {upcoming.slice(0, 3).map((a, i) => {
        const [mon, day] = stubLabel(a);
        const p = attachedPiece(a);
        const piece = p?.monologue_id != null ? kept.get(String(p.monologue_id)) : undefined;
        // The speech by its title, as the Book names it; the character is in
        // capitals in the catalogue and shouted on a card this small.
        const what = piece
          ? `${piece.title}${piece.offBook ? ', off book' : ''}`
          : p?.title ?? 'no piece chosen yet';
        return (
          <Pressable key={a.id} onPress={() => router.push({ pathname: '/prep', params: { id: String(a.id) } })}
            accessibilityRole="button" accessibilityLabel={`${a.project}, ${countdown(a.when)}`} style={{ marginBottom: 12 }}>
            <PaperCard rotate={i % 2 ? 0.3 : -0.4} style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 48, height: 56, borderRadius: 8, borderWidth: 1.5, borderColor: c.paperRule, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: MONO_B, fontSize: 10, letterSpacing: 1.6, color: c.accentText }}>{mon}</Text>
                  <Text style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 26, color: c.paperInk }}>{day}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 23, letterSpacing: -0.2, color: c.paperInk }}>{a.project}</Text>
                  <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: MONO, fontSize: 11.5, lineHeight: 16, color: c.paperMuted }}>
                    {a.role ? <Text style={{ fontFamily: MONO_B, color: c.paperInk }}>{a.role}</Text> : null}
                    {a.role && what ? ' · ' : ''}
                    {what ?? ''}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 5, fontFamily: SANS_B, fontSize: 11, lineHeight: 14, color: c.accentText }}>{countdown(a.when)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.paperFaint} />
              </View>
            </PaperCard>
          </Pressable>
        );
      })}
      {upcoming.length > 3 ? (
        <LineLink label={`(and ${upcoming.length - 3} more on the board.)`} onPress={() => router.push('/auditions')} />
      ) : null}
    </View>
  );
}

/** The actor's lists, a card each, and a new one made in place. */
export function YourLists({ lists, loading, book }: { lists: BookList[]; loading: boolean; book: Monologue[] }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const create = useCreateList();
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');

  const make = () => {
    const t = title.trim();
    if (!t || create.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    create.mutate({ title: t, from: 'book' }, { onSuccess: () => { setTitle(''); setNaming(false); } });
  };

  return (
    <View style={{ marginTop: 34 }}>
      <Head title="Your lists">
        {!naming ? <HeadLink label="New" icon="add" onPress={() => setNaming(true)} /> : null}
      </Head>
      {naming ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={make}
            onBlur={() => { if (!title.trim()) setNaming(false); }}
            placeholder="For my agent"
            placeholderTextColor={c.chevron}
            selectionColor={c.accentText}
            returnKeyType="done"
            maxLength={80}
            accessibilityLabel="Name the list"
            style={{ flex: 1, paddingVertical: 10, fontFamily: SANS, fontSize: 15.5, color: c.foreground }}
          />
          {create.isPending ? <ActivityIndicator color={c.accentText} /> : (
            <Pressable onPress={make} hitSlop={10} accessibilityRole="button" accessibilityLabel="Make the list" disabled={!title.trim()}>
              <Text style={{ fontFamily: SANS_B, fontSize: 15, color: title.trim() ? c.accentText : c.chevron }}>Make it</Text>
            </Pressable>
          )}
        </View>
      ) : null}
      {loading && !lists.length ? <ActivityIndicator color={c.accentText} style={{ marginVertical: 10 }} /> : null}
      {!loading && !lists.length && !naming ? (
        <StageDirection numberOfLines={2} style={{ paddingVertical: 6 }}>
          (your own groupings: two contrasting, for my agent, class this term. hold the bookmark on any page to put it in one.)
        </StageDirection>
      ) : null}
      {lists.map((l, i) => {
        // Speeches by their titles, as the Book names them; sides by the script's.
        const kept = new Map(book.map((m) => [String(m.id), m]));
        const first = l.items.slice(0, 2).map((x) => (x.monologue_id != null ? kept.get(String(x.monologue_id))?.title : null) ?? x.title).join(', ');
        return (
          <Pressable key={l.id} onPress={() => router.push({ pathname: '/list/[id]', params: { id: String(l.id) } })}
            accessibilityRole="button" accessibilityLabel={`${l.title}, ${l.items.length} in it`} style={{ marginBottom: 12 }}>
            <PaperCard rotate={i % 2 ? -0.3 : 0.4} style={{ paddingVertical: 14, paddingHorizontal: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="albums-outline" size={20} color={c.accentText} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 23, letterSpacing: -0.2, color: c.paperInk }}>{l.title}</Text>
                  <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: MONO, fontSize: 11.5, lineHeight: 16, color: c.paperMuted }}>
                    {l.items.length ? `${l.items.length} · ${first}` : 'empty'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.paperFaint} />
              </View>
            </PaperCard>
          </Pressable>
        );
      })}
    </View>
  );
}
