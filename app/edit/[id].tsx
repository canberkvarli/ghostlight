import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { EditedLine } from '../../src/api/rehearsal';
import { ChoiceSheet, ConfirmSheet } from '../../src/components/ConfirmSheet';
import { SortableList } from '../../src/components/SortableList';
import { loadCastVoices, saveCastVoice } from '../../src/lib/castVoices';
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

/** One colour per part, in the order they first speak, so a page of lines shows who is who at a glance. Readable on paper and in the dark. */
const PART_COLORS = ['#d9822b', '#4f8fd6', '#3fa56b', '#c2569b', '#8a6fd1', '#c9a227', '#2fa3a3', '#d0574b'];
type LeaveAct = 'save' | 'discard' | 'stay';
const LEAVE: { key: LeaveAct; label: string; line: string }[] = [
  { key: 'save', label: 'Save and leave', line: 'the partner reads it this way from now on.' },
  { key: 'discard', label: 'Leave without saving', line: 'the sides stay as the reader had them.' },
  { key: 'stay', label: 'Keep editing', line: 'nothing happens.' },
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
  const [askingReset, setAskingReset] = useState(false);
  // Who reads each part: the cast strip at the top, kept for the cast sheet.
  const [cast, setCast] = useState<Record<string, string>>({});
  const [casting, setCasting] = useState<string | null>(null);
  useEffect(() => { if (Number.isFinite(sceneId)) void loadCastVoices(sceneId).then(setCast); }, [sceneId]);
  // Where each line sits, so the one being typed in is scrolled clear of the keyboard.
  const scroller = useRef<ScrollView>(null);
  const listY = useRef(0);
  const heights = useRef<Record<number, number>>({});
  const bringUp = (i: number) => {
    if (!rows) return;
    let y = listY.current;
    for (let k = 0; k < i; k++) y += heights.current[rows[k]?.key ?? -1] ?? 0;
    setTimeout(() => scroller.current?.scrollTo({ y: Math.max(0, y - 90), animated: true }), 260);
  };
  const [naming, setNaming] = useState<{ row: number; everywhere: boolean } | null>(null);
  const [speaker, setSpeaker] = useState<number | null>(null); // the row whose name was tapped
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

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
    setAskingReset(false);
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
    if (what !== 'below') setFocus(null);
  };
  const tint = (name: string) => {
    const at = names.findIndex((n) => sameCharacter(n, name));
    return at < 0 ? c.chevron : PART_COLORS[at % PART_COLORS.length];
  };
  const voices = scene.data?.voices ?? [];
  const voiceName = (id: string | undefined) => (id ? voices.find((v) => v.id === id)?.label.split('·')[0].trim() : undefined);
  const castOf = (name: string) => Object.entries(cast).find(([k]) => sameCharacter(k, name))?.[1];

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
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setAskingReset(true); }} disabled={!touched} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reset to the original" style={{ height: 36, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', opacity: touched ? 1 : 0.3 }}>
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
          <ScrollView ref={scroller} scrollEnabled={!dragging} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 160 }}>
            <Text style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 34, letterSpacing: -0.4, color: c.foreground }}>
              {scene.data?.scene.title ?? ''} <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>as it should read.</Text>
            </Text>
            <StageDirection numberOfLines={2} style={{ marginTop: 8 }}>(tap a name to change who speaks. hold the grip to move a line.)</StageDirection>

            {/* The cast: each part in its colour, and who reads it when it is not yours. */}
            {names.length ? (
              <View style={{ marginTop: 18, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 4 }}>
                {names.map((n, k) => (
                  <Pressable key={n} onPress={() => { if (!voices.length) return; Haptics.selectionAsync().catch(() => {}); setCasting(n); }} accessibilityRole="button" accessibilityLabel={`Who reads ${n}`}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: k ? 1 : 0, borderTopColor: c.divider, opacity: pressed ? 0.6 : 1 })}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tint(n) }} />
                    <Text numberOfLines={1} style={{ flex: 1, fontFamily: SANS_B, fontSize: 12.5, letterSpacing: 1.4, textTransform: 'uppercase', color: c.foreground }}>{n}</Text>
                    <Text style={{ fontFamily: MONO_I, fontSize: 12.5, color: c.mutedForeground }}>{voiceName(castOf(n)) ? `read by ${voiceName(castOf(n))}` : 'read by the partner'}</Text>
                    {voices.length ? <Ionicons name="chevron-down" size={12} color={c.chevron} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={{ marginTop: 14 }} onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
              <SortableList
                items={rows}
                keyOf={(r) => r.key}
                byHandle
                onHolding={setDragging}
                onReorder={(next) => change(() => next)}
                renderItem={(r, grip) => {
                  const i = rows.indexOf(r);
                  const lit = focus === i;
                  const col = r.character.trim() ? tint(r.character) : c.chevron;
                  return (
                    <View onLayout={(e) => { heights.current[r.key] = e.nativeEvent.layout.height; }}
                      style={{ backgroundColor: lit ? c.panel : c.background, borderRadius: lit ? 14 : 0, paddingVertical: 12, paddingLeft: 12, paddingRight: 4, borderLeftWidth: 3, borderLeftColor: col, borderBottomWidth: lit ? 0 : 1, borderBottomColor: c.divider }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setSpeaker(i); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Who speaks line ${i + 1}`}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingRight: 8 }}>
                          <Animated.Text key={r.character} entering={FadeIn.duration(260)} style={{ fontFamily: SANS_B, fontSize: 11.5, letterSpacing: 1.6, textTransform: 'uppercase', color: col }}>{r.character.trim() || 'WHO?'}</Animated.Text>
                          <Ionicons name="chevron-down" size={12} color={c.chevron} />
                        </Pressable>
                        {grip(
                          <View accessibilityLabel={`Hold to move line ${i + 1}`} style={{ width: 40, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="reorder-two" size={20} color={c.chevron} />
                          </View>,
                        )}
                      </View>
                      <TextInput
                        value={r.direction}
                        onChangeText={(t) => change((rs) => rs.map((x) => (x.key === r.key ? { ...x, direction: t } : x)))}
                        placeholder="(a direction, if there is one.)"
                        placeholderTextColor={c.chevron}
                        multiline
                        scrollEnabled={false}
                        onFocus={() => { setFocus(i); bringUp(i); }}
                        style={{ marginTop: 2, fontFamily: MONO_I, fontSize: 13, lineHeight: 18, color: c.mutedForeground, paddingVertical: 2 }}
                      />
                      <TextInput
                        value={r.text}
                        onChangeText={(t) => change((rs) => rs.map((x) => (x.key === r.key ? { ...x, text: t } : x)))}
                        placeholder="the words."
                        placeholderTextColor={c.chevron}
                        multiline
                        scrollEnabled={false}
                        onFocus={() => { setFocus(i); bringUp(i); }}
                        style={{ marginTop: 4, fontFamily: MONO, fontSize: 16, lineHeight: 24, color: c.foreground, paddingVertical: 2 }}
                      />
                      {lit ? (
                        <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 10, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                          <Chip icon="arrow-up" label="Line above" onPress={() => addAt(i, 'above')} />
                          <Chip icon="arrow-down" label="Line below" onPress={() => addAt(i, 'below')} />
                          <Chip icon="chatbox-ellipses-outline" label="A direction" onPress={() => act(i, 'direction')} />
                          {i > 0 ? <Chip icon="git-merge-outline" label="Join above" onPress={() => act(i, 'join')} /> : null}
                          <Chip icon="trash-outline" label="Remove" danger onPress={() => act(i, 'remove')} />
                        </Animated.View>
                      ) : null}
                    </View>
                  );
                }}
              />
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
      <ChoiceSheet
        open={casting !== null}
        title={casting ?? ''}
        accent="is read by"
        options={voices.map((v) => ({ key: v.id, label: v.label.split('·')[0].trim(), line: v.label.split('·').slice(1).join('·').trim() || (v.gender === 'female' ? 'a woman' : 'a man') }))}
        value={casting ? castOf(casting) ?? '' : ''}
        onPick={(id) => { const n = casting; if (!n) return; setCast((m) => ({ ...m, [n]: id })); void saveCastVoice(sceneId, n, id); }}
        onClose={() => setCasting(null)}
      />
      <ConfirmSheet
        open={askingReset}
        title="Back to the"
        accent="original?"
        body="Every change since the sides were read goes, and the lines are as the reader had them. Undo can still bring this back."
        confirm="Reset"
        cancel="Keep my changes"
        onConfirm={reset}
        onCancel={() => setAskingReset(false)}
      />

      {/* A name, typed: for a speaker the reader never found, or to rename one everywhere. It rides above the keyboard. */}
      <Modal visible={naming !== null} transparent animationType="none" onRequestClose={() => setNaming(null)} statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,7,4,0.66)' }}>
            <Pressable style={{ flex: 1 }} onPress={() => setNaming(null)} accessibilityLabel="Leave it" />
            <View style={{ backgroundColor: c.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: c.border, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18 }}>
              <Text style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 36, letterSpacing: -0.4, color: c.foreground }}>
                {naming?.everywhere ? 'Their' : 'A'} <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>name.</Text>
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                autoFocus
                selectTextOnFocus
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={rename}
                placeholder="RILEY"
                placeholderTextColor={c.chevron}
                selectionColor={c.accentText}
                style={{ marginTop: 14, height: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: c.accentText, backgroundColor: c.background, fontFamily: SANS_B, fontSize: 18, letterSpacing: 1, color: c.foreground }}
              />
              <PrimaryPill label={naming?.everywhere ? 'Rename every line' : 'Use this name'} onPress={rename} height={48} haptic="medium" style={{ marginTop: 16, alignSelf: 'center', minWidth: 220 }} />
              <Pressable onPress={() => setNaming(null)} hitSlop={12} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 10, paddingVertical: 8 }}>
                <StageDirection link>(leave it.)</StageDirection>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/** A small button on the line being worked on. */
function Chip({ icon, label, onPress, danger }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; danger?: boolean }) {
  const { colors: c } = useTheme();
  const ink = danger ? '#d0574b' : c.accentText;
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: ink, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={13} color={ink} />
      <Text style={{ fontFamily: SANS_B, fontSize: 12.5, color: ink }}>{label}</Text>
    </Pressable>
  );
}
