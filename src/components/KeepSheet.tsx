import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { StageDirection } from './StageDirection';
import { attachedPiece, type Audition } from '../api/auditions';
import { holds, type Keepable } from '../api/book';
import { useAttachPiece, useAuditions } from '../hooks/useAuditions';
import { useCreateList, useLists, useToggleInList } from '../hooks/useLists';
import { track } from '../lib/analytics';
import { stubLabel } from '../lib/when';
import { useSession } from '../lib/useSession';
import { useTheme } from '../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const MONO_I = 'CourierPrime_400Regular_Italic';

/**
 * "Keep it in...": which lists, and which audition coming up, a speech or a
 * script of your own sides belongs to. A tick a row, each one saved the moment
 * it is tapped, so there is nothing to confirm and closing is always safe.
 *
 * A speech can go to an audition as its piece (the audition holds one, and
 * ticking another swaps it). Sides go into lists only: an audition's own sides
 * are set on its page, where the script is chosen.
 *
 * The last row makes a list and puts the thing in it in one go.
 */
export function KeepSheet({ open, what, name, onClose }: {
  open: boolean;
  what: Keepable;
  /** What is being kept, as the actor knows it: "Hamlet", "Doubt". */
  name: string;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const { data: lists, isLoading } = useLists(isAuthenticated && open);
  const { data: auditions } = useAuditions(isAuthenticated && open);
  const toggle = useToggleInList();
  const attach = useAttachPiece();
  const create = useCreateList();
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');

  const speech = 'monologue_id' in what ? what.monologue_id : null;
  const coming = speech != null ? (auditions ?? []).filter((a) => a.scope === 'upcoming') : [];

  const onAudition = (a: Audition) => {
    Haptics.selectionAsync().catch(() => {});
    const on = attachedPiece(a)?.monologue_id === speech;
    attach.mutate({ current: a, monologueId: on ? null : speech });
    if (!on) track('app_list_kept', { kind: 'speech', into: 'audition' });
  };

  const make = () => {
    const t = title.trim();
    if (!t || create.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    create.mutate({ title: t, from: 'sheet' }, {
      onSuccess: (made) => {
        if (made && !Array.isArray(made)) toggle.mutate({ list: made, what });
        setTitle('');
        setNaming(false);
      },
    });
  };

  const close = () => {
    setNaming(false);
    setTitle('');
    onClose();
  };

  const row = (key: string, label: string, line: string | null, on: boolean, onPress: () => void) => (
    <Pressable key={key} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.divider, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: on ? c.accentText : c.chevron, backgroundColor: on ? c.accentText : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Ionicons name="checkmark" size={14} color={c.panel} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: on ? SANS_B : SANS, fontSize: 16, color: c.foreground }}>{label}</Text>
        {line ? <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: MONO_I, fontSize: 12.5, color: c.mutedForeground }}>({line})</Text> : null}
      </View>
    </Pressable>
  );

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,7,4,0.66)' }}>
          <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" />
          <Animated.View
            entering={FadeIn.duration(240).delay(40)}
            style={{
              maxHeight: '80%', backgroundColor: c.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: c.border,
              paddingHorizontal: 24, paddingTop: 22, paddingBottom: Math.max(insets.bottom, 16) + 6,
            }}
          >
            <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 36, letterSpacing: -0.4, color: c.foreground }}>
              Keep it <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>in…</Text>
            </Text>
            <StageDirection numberOfLines={2} style={{ marginTop: 6 }}>
              ({name}. {'monologue_id' in what ? 'it stays in your book either way.' : 'they stay in the scene room either way.'})
            </StageDirection>

            <ScrollView style={{ marginTop: 10 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {coming.length ? (
                <>
                  <Text style={{ marginTop: 8, fontFamily: 'CourierPrime_700Bold', fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: c.mutedForeground }}>Coming up</Text>
                  {coming.map((a) => {
                    const [mon, day] = stubLabel(a);
                    const piece = attachedPiece(a);
                    const on = piece?.monologue_id === speech;
                    const line = on ? `the piece, ${mon} ${day}` : piece ? `swaps out ${piece.title ?? 'its piece'}` : `${mon} ${day}`;
                    return row(`a${a.id}`, a.role ? `${a.project}, ${a.role}` : a.project, line, on, () => onAudition(a));
                  })}
                </>
              ) : null}

              {(lists ?? []).length ? (
                <Text style={{ marginTop: coming.length ? 18 : 8, fontFamily: 'CourierPrime_700Bold', fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: c.mutedForeground }}>Your lists</Text>
              ) : null}
              {isLoading ? <ActivityIndicator color={c.accentText} style={{ marginVertical: 18 }} /> : null}
              {(lists ?? []).map((l) => {
                const on = holds(l, what);
                return row(`l${l.id}`, l.title, `${l.items.length} in it`, on, () => {
                  Haptics.selectionAsync().catch(() => {});
                  toggle.mutate({ list: l, what });
                });
              })}

              {naming ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider }}>
                  <TextInput
                    autoFocus
                    value={title}
                    onChangeText={setTitle}
                    onSubmitEditing={make}
                    placeholder="Classical, women"
                    placeholderTextColor={c.chevron}
                    selectionColor={c.accentText}
                    returnKeyType="done"
                    maxLength={80}
                    accessibilityLabel="Name the list"
                    style={{ flex: 1, paddingVertical: 8, fontFamily: SANS, fontSize: 16, color: c.foreground }}
                  />
                  {create.isPending ? <ActivityIndicator color={c.accentText} /> : (
                    <Pressable onPress={make} hitSlop={10} accessibilityRole="button" accessibilityLabel="Make the list" disabled={!title.trim()}>
                      <Text style={{ fontFamily: SANS_B, fontSize: 15, color: title.trim() ? c.accentText : c.chevron }}>Make it</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setNaming(true); }} accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, opacity: pressed ? 0.7 : 1 })}>
                  <Ionicons name="add" size={22} color={c.accentText} />
                  <Text style={{ fontFamily: SANS_B, fontSize: 16, color: c.accentText }}>A new list</Text>
                </Pressable>
              )}
            </ScrollView>

            <Pressable onPress={close} hitSlop={12} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 10, paddingVertical: 8 }}>
              <StageDirection link>(done.)</StageDirection>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
