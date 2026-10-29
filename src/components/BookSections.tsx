import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { PrimaryPill } from './PrimaryPill';
import { attachedPiece, type Audition } from '../api/auditions';
import type { BookList } from '../api/book';
import { stubLabel } from '../lib/when';
import { useTheme } from '../theme/ThemeContext';
import type { Monologue } from '../data/monologues';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO_B = 'CourierPrime_700Bold';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const DAY = 86_400_000;

/**
 * The Book's own parts, above the shelf: the one + in the header, the next
 * audition as a single row, and the actor's lists as chips that narrow the
 * shelf, the way a playlist narrows a library. Only these, the rows and the
 * ticks can be tapped; nothing in brackets is ever a button.
 */

/** "today", "tomorrow", "in 9 days". */
export function countdown(iso: string | null, now = Date.now()): string {
  if (!iso) return 'no date yet';
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = new Date(iso);
  day.setHours(0, 0, 0, 0);
  const n = Math.round((day.getTime() - start.getTime()) / DAY);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1) return `in ${n} days`;
  return n === -1 ? 'yesterday' : `${-n} days ago`;
}

/** The + in the header. */
export function AddButton({ onPress }: { onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Add to your book"
      style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name="add" size={20} color={c.foreground} />
    </Pressable>
  );
}

/** The next audition, one row: tap for it, hold for the whole board. Nothing coming, nothing drawn. */
export function NextRow({ auditions, book }: { auditions: Audition[]; book: Monologue[] }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const next = auditions
    .filter((a) => a.scope === 'upcoming')
    .sort((a, b) => (a.when ? Date.parse(a.when) : Infinity) - (b.when ? Date.parse(b.when) : Infinity))[0];
  if (!next) return null;
  const [mon, day] = stubLabel(next);
  const p = attachedPiece(next);
  const piece = p?.monologue_id != null ? book.find((m) => String(m.id) === String(p.monologue_id)) : undefined;
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/prep', params: { id: String(next.id) } }); }}
      onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); router.push('/auditions'); }}
      accessibilityRole="button"
      accessibilityLabel={`Next audition: ${next.project}, ${countdown(next.when)}`}
      accessibilityHint="Hold for all your auditions"
      style={({ pressed }) => ({ marginTop: 18, height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.panel, opacity: pressed ? 0.75 : 1 })}
    >
      <Text style={{ fontFamily: MONO_B, fontSize: 10.5, letterSpacing: 2, color: c.accentText }}>NEXT</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: SANS_B, fontSize: 14.5, color: c.foreground }}>{next.project}</Text>
        <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: SANS, fontSize: 12, color: c.mutedForeground }}>
          {`${mon} ${day} · ${countdown(next.when)}${piece ? ` · ${piece.title}` : ''}`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={c.chevron} />
    </Pressable>
  );
}

/**
 * The lists as chips. All shows the whole Book; a list narrows it to what is
 * in that list. Hold a list to rename or delete it; + makes one.
 */
export function ListChips({ lists, selected, onSelect, onHold, onNew }: {
  lists: BookList[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onHold: (list: BookList) => void;
  onNew: () => void;
}) {
  const { colors: c } = useTheme();
  const chip = (key: string, label: string, on: boolean, press: () => void, hold?: () => void, count?: number) => (
    <Pressable
      key={key}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); press(); }}
      onLongPress={hold ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); hold(); } : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      accessibilityHint={hold ? 'Hold to rename or delete' : undefined}
      style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1.5, borderColor: on ? c.foreground : c.border, backgroundColor: on ? c.foreground : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Text numberOfLines={1} style={{ maxWidth: 180, fontFamily: SANS_B, fontSize: 13, color: on ? c.background : c.foreground }}>{label}</Text>
      {count != null ? <Text style={{ fontFamily: SANS, fontSize: 12, color: on ? c.background : c.mutedForeground }}>{count}</Text> : null}
    </Pressable>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18, marginHorizontal: -22 }} contentContainerStyle={{ paddingHorizontal: 22, gap: 8 }}>
      {lists.length ? chip('all', 'All', selected === null, () => onSelect(null)) : null}
      {lists.map((l) => chip(`l${l.id}`, l.title, selected === l.id, () => onSelect(selected === l.id ? null : l.id), () => onHold(l), l.items.length))}
      <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onNew(); }} accessibilityRole="button" accessibilityLabel="New list"
        style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="add" size={15} color={c.accentText} />
        <Text style={{ fontFamily: SANS_B, fontSize: 13, color: c.accentText }}>{lists.length ? 'List' : 'New list'}</Text>
      </Pressable>
    </ScrollView>
  );
}

/** A sheet with one field: naming a new list, renaming one, or the actor's own name. */
export function NameSheet({ open, title, accent, initial, confirm, busy, onSave, onClose, placeholder = 'Two contrasting, for my agent…', fieldLabel = "The list's name" }: {
  placeholder?: string;
  fieldLabel?: string;
  open: boolean;
  title: string;
  accent: string;
  initial?: string;
  confirm: string;
  busy?: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initial ?? '');
  useEffect(() => { if (open) setName(initial ?? ''); }, [open, initial]);
  const save = () => { const t = name.trim(); if (t && !busy) onSave(t); };
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,7,4,0.66)' }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
          <View style={{ backgroundColor: c.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: c.border, paddingHorizontal: 24, paddingTop: 22, paddingBottom: Math.max(insets.bottom, 16) + 6 }}>
            <Text style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 36, letterSpacing: -0.4, color: c.foreground }}>
              {title} <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{accent}</Text>
            </Text>
            <TextInput
              autoFocus
              value={name}
              onChangeText={setName}
              onSubmitEditing={save}
              placeholder={placeholder}
              placeholderTextColor={c.chevron}
              selectionColor={c.accentText}
              returnKeyType="done"
              maxLength={80}
              accessibilityLabel={fieldLabel}
              style={{ marginTop: 16, paddingVertical: 12, fontFamily: SANS, fontSize: 17, color: c.foreground, borderBottomWidth: 1.5, borderBottomColor: c.border }}
            />
            <PrimaryPill label={confirm} onPress={save} block height={50} style={{ marginTop: 20, opacity: name.trim() ? 1 : 0.5 }} />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
