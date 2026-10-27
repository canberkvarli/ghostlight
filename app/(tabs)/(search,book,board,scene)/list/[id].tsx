import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { BackHeader } from '../../../../src/components/BackHeader';
import { ConfirmSheet } from '../../../../src/components/ConfirmSheet';
import { PaperCard } from '../../../../src/components/PaperCard';
import { StageBackdrop } from '../../../../src/components/StageBackdrop';
import { StageDirection } from '../../../../src/components/StageDirection';
import { SwipeRow } from '../../../../src/components/SwipeRow';
import { UndoBar } from '../../../../src/components/UndoBar';
import { useTabBarSpace } from '../../../../src/components/TabBar';
import { getScript } from '../../../../src/api/rehearsal';
import type { ListItem } from '../../../../src/api/book';
import { useStageMotion } from '../../../../src/hooks/useStageMotion';
import { useDeleteList, useLists, useRemoveFromList, useRenameList } from '../../../../src/hooks/useLists';
import { useGoBack } from '../../../../src/lib/nav';
import { useSession } from '../../../../src/lib/useSession';
import { useTheme } from '../../../../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO = 'CourierPrime_400Regular';
const SANS = 'BricolageGrotesque_500Medium';

/**
 * One of the actor's lists: what is in it, a tap to open each, a slide left to
 * take one out (it stays in the Book), the name to change by tapping it, and
 * the list itself to take away, asked once (the server keeps it restorable).
 *
 * Speeches open in the reader; sides open on their first scene in the Scene
 * room, which is where they are worked.
 */
export default function ListPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = Number(id);
  const router = useRouter();
  const goBack = useGoBack('/saves');
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const tabSpace = useTabBarSpace();
  const { isAuthenticated } = useSession();
  const { data: lists, isLoading } = useLists(isAuthenticated);
  const list = lists?.find((l) => l.id === listId);
  const rename = useRenameList();
  const remove = useRemoveFromList();
  const del = useDeleteList();
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');
  const [asking, setAsking] = useState(false);
  const [undo, setUndo] = useState<{ key: number; item: ListItem } | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  const open = async (item: ListItem) => {
    Haptics.selectionAsync().catch(() => {});
    if (item.kind === 'speech' && item.monologue_id != null) {
      router.push(`/read/${item.monologue_id}`);
      return;
    }
    if (item.user_script_id == null || opening != null) return;
    setOpening(item.id);
    try {
      const script = await getScript(item.user_script_id);
      const first = script.scenes[0];
      if (first) router.push({ pathname: '/rehearse/[id]', params: { id: String(first.id), from: 'script' } });
      else router.push('/rehearse');
    } catch {
      router.push('/rehearse');
    } finally {
      setOpening(null);
    }
  };

  const takeOut = (item: ListItem) => {
    if (undo) remove.mutate({ listId, itemId: undo.item.id });
    setUndo({ key: Date.now(), item });
  };

  const save = () => {
    const t = title.trim();
    setNaming(false);
    if (!list || !t || t === list.title) return;
    rename.mutate({ id: list.id, title: t });
  };

  const shown = (list?.items ?? []).filter((i) => i.id !== undo?.item.id);

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <BackHeader
          label="Your book"
          onPress={goBack}
          right={list ? (
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setAsking(true); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Take the list away">
              <Ionicons name="trash-outline" size={20} color={c.mutedForeground} />
            </Pressable>
          ) : undefined}
        />
        {isLoading && !list ? (
          <ActivityIndicator color={c.accentText} style={{ marginTop: 60 }} />
        ) : !list ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 90 }}>
            <StageDirection>(that list is gone.)</StageDirection>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: tabSpace }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {naming ? (
              <TextInput
                autoFocus
                value={title}
                onChangeText={setTitle}
                onSubmitEditing={save}
                onBlur={save}
                selectionColor={c.accentText}
                returnKeyType="done"
                maxLength={80}
                accessibilityLabel="Name the list"
                style={{ marginTop: 8, fontFamily: SERIF, fontSize: 40, lineHeight: 48, letterSpacing: -0.8, color: c.foreground, borderBottomWidth: 1, borderBottomColor: c.border }}
              />
            ) : (
              <Pressable onPress={() => { setTitle(list.title); setNaming(true); }} accessibilityRole="button" accessibilityHint="Tap to rename">
                <Text numberOfLines={2} style={{ marginTop: 8, fontFamily: SERIF, fontSize: 40, lineHeight: 48, letterSpacing: -0.8, color: c.foreground }}>
                  {list.title}
                  <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>.</Text>
                </Text>
              </Pressable>
            )}
            <StageDirection style={{ marginTop: 6 }}>
              {shown.length ? `(${shown.length} in it. slide one left to take it out; it stays in your book.)` : '(empty. hold the bookmark on a page, or open a script in the scene room, to put something here.)'}
            </StageDirection>

            <View style={{ marginTop: 22 }}>
              {shown.map((item, i) => (
                <Animated.View key={item.id} entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(240)}>
                  <SwipeRow onRemove={() => takeOut(item)} label={`Take ${item.title} out of the list`} style={{ marginBottom: 12 }}>
                    <Pressable onPress={() => void open(item)} accessibilityRole="button" accessibilityLabel={`${item.title}${item.subtitle ? `, ${item.subtitle}` : ''}`}>
                      <PaperCard rotate={i % 2 ? 0.3 : -0.4} style={{ paddingVertical: 14, paddingHorizontal: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <Ionicons name={item.kind === 'speech' ? 'document-text-outline' : 'people-outline'} size={20} color={c.accentText} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 23, letterSpacing: -0.2, color: c.paperInk }}>{item.title}</Text>
                            <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: MONO, fontSize: 11.5, lineHeight: 16, color: c.paperMuted }}>
                              {item.kind === 'sides' ? `sides${item.subtitle ? ` · ${item.subtitle}` : ''}` : item.subtitle ?? ''}
                            </Text>
                          </View>
                          {opening === item.id ? <ActivityIndicator size="small" color={c.paperMuted} /> : <Ionicons name="chevron-forward" size={18} color={c.paperFaint} />}
                        </View>
                      </PaperCard>
                    </Pressable>
                  </SwipeRow>
                </Animated.View>
              ))}
            </View>
            <Text style={{ marginTop: 8, fontFamily: SANS, fontSize: 12.5, lineHeight: 18, color: c.mutedForeground }}>
              Lists are free and there is no limit to them.
            </Text>
          </ScrollView>
        )}

        {undo ? (
          <UndoBar
            key={undo.key}
            label={`Took “${undo.item.title}” out`}
            onUndo={() => setUndo(null)}
            onExpire={() => { remove.mutate({ listId, itemId: undo.item.id }); setUndo(null); }}
          />
        ) : null}
      </SafeAreaView>

      <ConfirmSheet
        open={asking}
        title="Take the list"
        accent="away?"
        body="What is in it stays in your book. Only the list goes."
        confirm="Take it away"
        danger
        onConfirm={() => {
          if (!list) return;
          setAsking(false);
          del.mutate({ id: list.id });
          goBack();
        }}
        onCancel={() => setAsking(false)}
      />
    </View>
  );
}
