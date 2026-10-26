import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { EditedLine } from '../../src/api/rehearsal';
import { ChoiceSheet } from '../../src/components/ConfirmSheet';
import { PrimaryPill } from '../../src/components/PrimaryPill';
import { StageBackdrop } from '../../src/components/StageBackdrop';
import { StageDirection } from '../../src/components/StageDirection';
import { useStageMotion } from '../../src/hooks/useStageMotion';
import { useEditSceneLines, useRehearsalScene } from '../../src/hooks/useScenePartner';
import { useGoBack } from '../../src/lib/nav';
import { sameCharacter } from '../../src/rehearsal/contract';
import { useTheme } from '../../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const CAP = 'BricolageGrotesque_700Bold';
const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';

type Row = { key: number; character: string; text: string; direction: string };

type RowAct = 'direction' | 'join' | 'below' | 'remove';
type LeaveAct = 'save' | 'discard' | 'stay';
const LEAVE: { key: LeaveAct; label: string; line: string }[] = [
  { key: 'save', label: 'Save and leave', line: 'the partner reads it this way from now on.' },
  { key: 'discard', label: 'Leave without saving', line: 'the sides stay as the reader had them.' },
  { key: 'stay', label: 'Keep editing', line: 'nothing happens.' },
];

const ROW_ACTS: { key: RowAct; label: string; line: string }[] = [
  { key: 'direction', label: 'This is a stage direction', line: 'the words go in brackets on the next line.' },
  { key: 'join', label: 'Join with the line above', line: 'one speech, not two.' },
  { key: 'below', label: 'Add a line below', line: 'a line the reader missed.' },
  { key: 'remove', label: 'Remove this line', line: 'it was never in the scene.' },
];

/**
 * The sides of a scene of your own, read through and put right. The reader
 * that pulled them from the file gets a speaker wrong, folds a stage
 * direction into a line, or breaks one speech in two, and you are the one
 * who knows. Tap a name to change who speaks it, or to rename them in every
 * line of theirs; tap the dots on a line for the rest: make it a direction,
 * join it to the line above, add one below, take it out. Save sends the
 * whole scene back in order; the partner reads the corrected version.
 */
export default function EditScene() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sceneId = Number(id);
  const goBack = useGoBack('/rehearse');
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const scene = useRehearsalScene(Number.isFinite(sceneId) ? sceneId : null);
  const save = useEditSceneLines(sceneId);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [touched, setTouched] = useState(false);
  // Every change is kept, so a wrong tap is one tap back; redo is there until the next change.
  const [past, setPast] = useState<Row[][]>([]);
  const [future, setFuture] = useState<Row[][]>([]);
  const [leaving, setLeaving] = useState(false);
  // The line being worked on: lit, with its own buttons, so the eye never loses it.
  const [focus, setFocus] = useState<number | null>(null);
  // The lines as the server had them, for Reset.
  const [original, setOriginal] = useState<Row[] | null>(null);
  const [menu, setMenu] = useState<number | null>(null); // the row whose dots were tapped
  const [naming, setNaming] = useState<{ row: number; everywhere: boolean } | null>(null);
  const [speaker, setSpeaker] = useState<number | null>(null); // the row whose name was tapped
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The lines as the server has them, once; after that the page's own copy is the truth until Save.
  useEffect(() => {
    if (rows || !scene.data) return;
    const first = scene.data.lines.map((l, i) => ({ key: i, character: l.character, text: l.text, direction: l.direction ?? '' }));
    setRows(first);
    setOriginal(first);
  }, [scene.data, rows]);

  const names = useMemo(() => {
    const out: string[] = [];
    for (const r of rows ?? []) if (r.character.trim() && !out.some((n) => sameCharacter(n, r.character))) out.push(r.character.trim());
    return out;
  }, [rows]);

  const change = (fn: (rs: Row[]) => Row[]) => {
    if (!rows) return;
    const next = fn(rows);
    if (next === rows) return;
    setPast((p) => [...p.slice(-60), rows]);
    setFuture([]);
    setRows(next);
    setTouched(true); setError(null);
  };
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev || !rows) return;
    Haptics.selectionAsync().catch(() => {});
    setFuture((f) => [...f, rows]);
    setPast((p) => p.slice(0, -1));
    setRows(prev);
    setTouched(true);
  };
  const redo = () => {
    const next = future[future.length - 1];
    if (!next || !rows) return;
    Haptics.selectionAsync().catch(() => {});
    setPast((p) => [...p, rows]);
    setFuture((f) => f.slice(0, -1));
    setRows(next);
    setTouched(true);
  };
  const reset = () => {
    if (!original || !rows) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPast((p) => [...p, rows]); setFuture([]);
    setRows(original); setTouched(false); setFocus(null); setError(null);
  };
  const addAt = (i: number, where: 'above' | 'below') => {
    if (!rows) return;
    Haptics.selectionAsync().catch(() => {});
    const row = rows[i];
    const fresh = { key: Math.max(0, ...rows.map((r) => r.key)) + 1, character: row?.character ?? '', text: '', direction: '' };
    const at = where === 'above' ? i : i + 1;
    change((rs) => [...rs.slice(0, at), fresh, ...rs.slice(at)]);
    setFocus(at);
  };
  const close = () => { if (touched) setLeaving(true); else goBack(); };
  const nextKey = (rs: Row[]) => Math.max(0, ...rs.map((r) => r.key)) + 1;

  const act = (i: number, what: RowAct) => {
    Haptics.selectionAsync().catch(() => {});
    change((rs) => {
      const out = rs.map((r) => ({ ...r }));
      const row = out[i];
      if (!row) return rs;
      if (what === 'direction') {
        // The words become a direction on the line that follows, or the one before when this is the last.
        const words = row.text.trim().replace(/^[([]\s*|\s*[)\]]$/g, '');
        const to = out[i + 1] ?? out[i - 1];
        if (!to) return rs;
        to.direction = [to.direction.trim(), words].filter(Boolean).join(' ');
        out.splice(i, 1);
        return out;
      }
      if (what === 'join') {
        const above = out[i - 1];
        if (!above) return rs;
        above.text = `${above.text.trim()} ${row.text.trim()}`.trim();
        above.direction = [above.direction.trim(), row.direction.trim()].filter(Boolean).join(' ');
        out.splice(i, 1);
        return out;
      }
      if (what === 'below') {
        out.splice(i + 1, 0, { key: nextKey(out), character: row.character, text: '', direction: '' });
        return out;
      }
      out.splice(i, 1);
      return out;
    });
  };

  const rename = () => {
    const to = name.trim();
    if (!naming || !to) { setNaming(null); return; }
    const { row, everywhere } = naming;
    const from = rows?.[row]?.character ?? '';
    change((rs) => rs.map((r, i) => (i === row || (everywhere && sameCharacter(r.character, from)) ? { ...r, character: to } : r)));
    setNaming(null);
  };

  const submit = async () => {
    if (!rows) return;
    const lines: EditedLine[] = rows.map((r) => ({ character: r.character.trim(), text: r.text.trim(), direction: r.direction.trim() || null }));
    if (lines.some((l) => !l.character || !l.text)) { setError('Every line needs a name and some words.'); return; }
    try {
      await save.mutateAsync(lines);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The sides could not be saved.');
    }
  };

  const pickSpeaker = (key: string) => {
    if (speaker === null) return;
    if (key === '__new') { setName(''); setNaming({ row: speaker, everywhere: false }); return; }
    if (key === '__all') { setName(rows?.[speaker]?.character ?? ''); setNaming({ row: speaker, everywhere: true }); return; }
    change((rs) => rs.map((r, i) => (i === speaker ? { ...r, character: key } : r)));
  };

  const current = speaker !== null ? rows?.[speaker]?.character ?? '' : '';
  const speakerOptions = [
    ...names.map((n) => ({ key: n, label: n, line: 'speaks this line.' })),
    { key: '__new', label: 'Someone else', line: 'a name the reader never found.' },
    ...(current ? [{ key: '__all', label: `Rename ${current} everywhere`, line: 'every line of theirs.' }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Leave" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={24} color={c.foreground} />
          </Pressable>
          <Text style={{ fontFamily: CAP, fontSize: 10, letterSpacing: 1.8, color: c.mutedForeground }}>THE SIDES</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable onPress={reset} disabled={!touched} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reset to the original" style={{ height: 36, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', opacity: touched ? 1 : 0.3 }}>
              <Text style={{ fontFamily: SANS_B, fontSize: 13, color: c.accentText }}>Reset</Text>
            </Pressable>
            <Pressable onPress={undo} disabled={!past.length} hitSlop={8} accessibilityRole="button" accessibilityLabel="Undo" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: past.length ? 1 : 0.3 }}>
              <Ionicons name="arrow-undo-outline" size={20} color={c.foreground} />
            </Pressable>
            <Pressable onPress={redo} disabled={!future.length} hitSlop={8} accessibilityRole="button" accessibilityLabel="Redo" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: future.length ? 1 : 0.3 }}>
              <Ionicons name="arrow-redo-outline" size={20} color={c.foreground} />
            </Pressable>
          </View>
        </View>

        {!rows ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {scene.isError ? (
              <StageDirection>(the sides would not open. try again.)</StageDirection>
            ) : (
              <ActivityIndicator color={c.mutedForeground} />
            )}
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 140 }}>
            <Text style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 34, letterSpacing: -0.4, color: c.foreground }}>
              {scene.data?.scene.title ?? ''} <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>as it should read.</Text>
            </Text>
            <StageDirection style={{ marginTop: 8 }}>(tap a name to change who speaks. the dots do the rest.)</StageDirection>

            <View style={{ marginTop: 18 }}>
              {rows.map((r, i) => (
                <Animated.View key={r.key} entering={FadeIn.duration(240)} exiting={FadeOut.duration(180)} layout={LinearTransition.duration(260)}
                  style={{ paddingVertical: 12, paddingHorizontal: focus === i ? 12 : 0, marginHorizontal: focus === i ? -12 : 0, borderRadius: focus === i ? 14 : 0, backgroundColor: focus === i ? c.panel : 'transparent', borderBottomWidth: focus === i ? 0 : 1, borderBottomColor: c.divider, borderLeftWidth: focus === i ? 3 : 0, borderLeftColor: c.accentText }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setSpeaker(i); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Who speaks line ${i + 1}`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingRight: 8 }}>
                      <Animated.Text key={r.character} entering={FadeIn.duration(260)} style={{ fontFamily: SANS_B, fontSize: 11.5, letterSpacing: 1.6, textTransform: 'uppercase', color: r.character.trim() ? c.accentText : c.chevron }}>{r.character.trim() || 'WHO?'}</Animated.Text>
                      <Ionicons name="chevron-down" size={12} color={c.chevron} />
                    </Pressable>
                    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setMenu(i); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`More for line ${i + 1}`} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="ellipsis-horizontal" size={18} color={c.mutedForeground} />
                    </Pressable>
                  </View>
                  <TextInput
                    value={r.direction}
                    onChangeText={(t) => change((rs) => rs.map((x, k) => (k === i ? { ...x, direction: t } : x)))}
                    placeholder="(a direction, if there is one.)"
                    placeholderTextColor={c.chevron}
                    multiline
                    scrollEnabled={false}
                    onFocus={() => setFocus(i)}
                    style={{ marginTop: 2, fontFamily: MONO_I, fontSize: 13, lineHeight: 18, color: c.mutedForeground, paddingVertical: 2 }}
                  />
                  <TextInput
                    value={r.text}
                    onChangeText={(t) => change((rs) => rs.map((x, k) => (k === i ? { ...x, text: t } : x)))}
                    placeholder="the words."
                    placeholderTextColor={c.chevron}
                    multiline
                    scrollEnabled={false}
                    onFocus={() => setFocus(i)}
                    style={{ marginTop: 4, fontFamily: MONO, fontSize: 16, lineHeight: 24, color: c.foreground, paddingVertical: 2 }}
                  />
                  {focus === i ? (
                    <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 10, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <Chip icon="arrow-up" label="Line above" onPress={() => addAt(i, 'above')} />
                      <Chip icon="arrow-down" label="Line below" onPress={() => addAt(i, 'below')} />
                      <Chip icon="ellipsis-horizontal" label="More" onPress={() => { Haptics.selectionAsync().catch(() => {}); setMenu(i); }} />
                    </Animated.View>
                  ) : null}
                </Animated.View>
              ))}
            </View>

            <Pressable onPress={() => act(rows.length - 1, 'below')} hitSlop={8} accessibilityRole="button" style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
              <Ionicons name="add" size={16} color={c.accentText} />
              <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.6, color: c.accentText }}>(a line at the end.)</Text>
            </Pressable>

            {error ? (
              <Animated.Text entering={FadeIn.duration(200)} style={{ marginTop: 18, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: c.accentText }}>{error}</Animated.Text>
            ) : null}
          </ScrollView>
        )}

        {/* Save, at the foot, lit once something changed. */}
        {rows && touched ? (
          <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={{ position: 'absolute', alignSelf: 'center', bottom: Math.max(insets.bottom, 14) + 6 }}>
            {save.isPending ? (
              <View style={{ height: 46, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.accentText} /></View>
            ) : (
              <PrimaryPill label="Save" onPress={() => { void submit(); }} height={46} haptic="medium" />
            )}
          </Animated.View>
        ) : null}
      </SafeAreaView>

      <ChoiceSheet open={leaving} title="Leave the" accent="sides?" options={LEAVE} value={'' as LeaveAct}
        onPick={(k) => { if (k === 'save') void submit(); else if (k === 'discard') goBack(); }} onClose={() => setLeaving(false)} />
      <ChoiceSheet open={speaker !== null} title="Who" accent="speaks it?" options={speakerOptions} value={current} onPick={pickSpeaker} onClose={() => setSpeaker(null)} />
      <ChoiceSheet open={menu !== null} title="This" accent="line." options={ROW_ACTS} value={'' as RowAct} onPick={(k) => { if (menu !== null) act(menu, k); }} onClose={() => setMenu(null)} />

      {/* A name, typed: for a speaker the reader never found, or to rename one everywhere. */}
      <Modal visible={naming !== null} transparent animationType="none" onRequestClose={() => setNaming(null)} statusBarTranslucent>
        <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,7,4,0.66)' }}>
          <View style={{ backgroundColor: c.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: c.border, paddingHorizontal: 24, paddingTop: 22, paddingBottom: Math.max(insets.bottom, 16) + 10 }}>
            <Text style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 36, letterSpacing: -0.4, color: c.foreground }}>
              {naming?.everywhere ? 'Their' : 'A'} <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>name.</Text>
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={rename}
              placeholder="RILEY"
              placeholderTextColor={c.chevron}
              style={{ marginTop: 14, height: 44, borderBottomWidth: 1.5, borderBottomColor: c.accentText, fontFamily: SANS_B, fontSize: 18, letterSpacing: 1, color: c.foreground }}
            />
            <PrimaryPill label={naming?.everywhere ? 'Rename every line' : 'Use this name'} onPress={rename} height={54} block haptic="medium" style={{ marginTop: 20 }} />
            <Pressable onPress={() => setNaming(null)} hitSlop={12} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 12, paddingVertical: 8 }}>
              <StageDirection link>(leave it.)</StageDirection>
            </Pressable>
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
}

/** A small button on the line being worked on. */
function Chip({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: c.accentText, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={13} color={c.accentText} />
      <Text style={{ fontFamily: SANS_B, fontSize: 12.5, color: c.accentText }}>{label}</Text>
    </Pressable>
  );
}
