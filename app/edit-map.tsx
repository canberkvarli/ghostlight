import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { BackHeader } from '../src/components/BackHeader';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { SortableList } from '../src/components/SortableList';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useResetScriptMap, useSaveScriptMap, useScript } from '../src/hooks/useScenePartner';
import { ChoiceSheet, type Choice } from '../src/components/ChoiceSheet';
import { ConfirmSheet } from '../src/components/ConfirmSheet';
import { NameSheet } from '../src/components/BookSections';
import { RehearsalApiError } from '../src/api/rehearsal';
import {
  actsIn, addAct, changes, moveTo, removeScene, renameAct, renameScene, settle, tidy, toRows,
  type LayoutRow, type LayoutScene,
} from '../src/rehearsal/script-layout';
import { track } from '../src/lib/analytics';
import { useGoBack } from '../src/lib/nav';
import { useTheme } from '../src/theme/ThemeContext';
import { lower } from '../src/i18n/pick';
import { useL } from '../src/i18n';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const CAP = 'CourierPrime_700Bold';
const SANS = 'BricolageGrotesque_500Medium';

/**
 * The script's map, put right by hand. The reader gets headings wrong now and
 * then (an episode split in two, a scene filed under the act before it), so
 * here every scene can be held and dragged, moved under another act or
 * episode, renamed or taken off, and every heading renamed. Nothing changes
 * on the shelf until Save.
 */
export default function EditMap() {
  const { colors: c } = useTheme();
  const L = useL();
  const goBack = useGoBack('/rehearse');
  const { tiltX, tiltY } = useStageMotion();
  const { id: raw, scene: focus } = useLocalSearchParams<{ id?: string; scene?: string }>();
  const id = raw ? Number(raw) : null;
  const detail = useScript(id, id !== null);
  const save = useSaveScriptMap();
  const [holding, setHolding] = useState(false);

  const before = useMemo<LayoutScene[]>(() => (detail.data?.scenes ?? []).map(s => ({ id: s.id, title: s.title, act: s.act })), [detail.data]);
  const [rows, setRows] = useState<LayoutRow[] | null>(null);
  useEffect(() => { if (rows === null && detail.data) setRows(toRows(before)); }, [detail.data, before, rows]);
  const diff = rows ? changes(before, tidy(rows)) : null;
  const dirty = !!diff && (diff.deleted.length > 0 || diff.renamed.length > 0 || diff.layout !== null);

  // One of our own sheets at a time, never the phone's. Going from one to the
  // next waits for the first to leave: iOS will not show a modal over one
  // that is still going away.
  type Sheet =
    | { k: 'scene'; sc: LayoutScene }
    | { k: 'move'; sc: LayoutScene }
    | { k: 'delete'; sc: LayoutScene }
    | { k: 'name'; title: string; accent: string; initial: string; placeholder: string; done: (v: string) => void }
    | { k: 'leave' }
    | { k: 'reset' };
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const next = (s: Sheet) => { setSheet(null); setTimeout(() => setSheet(s), 280); };
  const close = () => setSheet(null);
  const reset = useResetScriptMap();

  const ask = (title: string, accent: string, initial: string, placeholder: string, done: (v: string) => void) =>
    setSheet({ k: 'name', title, accent, initial, placeholder, done });

  const sceneSheet = (sc: LayoutScene) => {
    Haptics.selectionAsync().catch(() => {});
    setSheet({ k: 'scene', sc });
  };

  const sceneChoices = (sc: LayoutScene): Choice[] => [
    { label: L('Rename', 'Yeniden adlandır'), icon: 'pencil', onPress: () => next({ k: 'name', title: L('The', 'Sahnenin'), accent: L('scene.', 'adı.'), initial: sc.title, placeholder: L('What you call it', 'Ona ne diyorsun'), done: v => setRows(r => r && renameScene(r, sc.id, v)) }) },
    { label: L('Move to another act', 'Başka bir perdeye taşı'), icon: 'swap-vertical', onPress: () => next({ k: 'move', sc }) },
    { label: L('Delete this scene', 'Bu sahneyi sil'), icon: 'trash-outline', danger: true, onPress: () => next({ k: 'delete', sc }) },
  ];

  const moveChoices = (sc: LayoutScene): Choice[] => {
    const acts = rows ? actsIn(rows) : [];
    return [
      ...acts.map(a => ({ label: a, icon: 'albums-outline' as const, current: a === sc.act, onPress: () => { close(); if (a !== sc.act) setRows(r => r && moveTo(r, sc.id, a)); } })),
      { label: L('No heading', 'Başlıksız'), icon: 'remove-outline', current: !sc.act, onPress: () => { close(); if (sc.act) setRows(r => r && moveTo(r, sc.id, null)); } },
      { label: L('A new act or episode', 'Yeni bir perde ya da bölüm'), icon: 'add', onPress: () => next({ k: 'name', title: L('A new', 'Yeni bir'), accent: L('heading.', 'başlık.'), initial: '', placeholder: L('Act 2, Episode 3, Prologue', 'Perde 2, Bölüm 3, Önsöz'), done: v => setRows(r => r && moveTo(r, sc.id, v)) }) },
    ];
  };

  // Held on the Scene tab: that scene's choices come straight up.
  const focused = useRef(false);
  useEffect(() => {
    if (!rows || !focus || focused.current) return;
    focused.current = true;
    const sc = rows.find(r => r.kind === 'scene' && String(r.scene.id) === focus);
    if (sc && sc.kind === 'scene') { const t = setTimeout(() => sceneSheet(sc.scene), 380); return () => clearTimeout(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, focus]);

  const onSave = () => {
    if (!rows || id === null || !diff || !dirty) { goBack(); return; }
    Haptics.selectionAsync().catch(() => {});
    track('app_script_map_edited', { deleted: diff.deleted.length, renamed: diff.renamed.length, moved: diff.layout !== null });
    save.mutate({ id, ...diff }, {
      onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); goBack(); },
    });
  };
  const leave = () => {
    if (!dirty) { goBack(); return; }
    setSheet({ k: 'leave' });
  };
  const onReset = () => {
    if (id === null) return;
    reset.mutate(id, {
      onSuccess: (d) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        track('app_script_map_reset', {});
        setRows(toRows(d.scenes.map(x => ({ id: x.id, title: x.title, act: x.act }))));
        close();
      },
    });
  };

  const failed = save.error instanceof RehearsalApiError ? lower(save.error.message) : save.error ? L('it did not save. try again.', 'kaydedilmedi. yeniden dene.') : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <BackHeader label={L('Scene partner', 'Sahne partneri')} onPress={leave} />
        <ScrollView scrollEnabled={!holding} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40 }}>
          <View style={{ paddingTop: 8, paddingHorizontal: 2 }}>
            <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 52, letterSpacing: -0.8, color: c.foreground }}>
              {L('The ', 'Metnin ')}<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{L('map.', 'haritası.')}</Text>
            </Text>
            {detail.data ? <StageDirection numberOfLines={2} style={{ marginTop: 6 }}>({detail.data.title})</StageDirection> : null}
          </View>

          {!rows ? (
            detail.isError ? (
              <StageDirection style={{ marginTop: 36 }}>{L('(it would not open. try again.)', '(açılmadı. bir daha dene.)')}</StageDirection>
            ) : (
              <View style={{ marginTop: 36, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator size="small" color={c.mutedForeground} />
                <StageDirection>{L('(opening the sides.)', '(metin açılıyor.)')}</StageDirection>
              </View>
            )
          ) : (
            <>
              <StageDirection numberOfLines={3} style={{ marginTop: 18 }}>{L('(hold a scene to drag it under any heading. the pencil renames, moves or deletes it. tap a heading to rename it.)', '(bir sahneyi başka bir başlığa sürüklemek için basılı tut. kalem onu yeniden adlandırır, taşır ya da siler. başlığı değiştirmek için ona dokun.)')}</StageDirection>
              <View style={{ marginTop: 14 }}>
                <SortableList
                  items={rows}
                  keyOf={r => r.key}
                  byHandle
                  onHolding={setHolding}
                  onReorder={next => setRows(settle(next))}
                  renderItem={(r, grip) => r.kind === 'head' ? (
                    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); ask(L('The', 'Başlığın'), L('heading.', 'adı.'), r.act, L('Act 1, Episode 2', 'Perde 1, Bölüm 2'), v => setRows(x => x && renameAct(x, r.key, v))); }}
                      accessibilityRole="button" accessibilityLabel={L(`Rename ${r.act}`, `Yeniden adlandır: ${r.act}`)}
                      style={({ pressed }) => ({ paddingTop: 18, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1, backgroundColor: c.background })}>
                      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: CAP, fontSize: 10.5, letterSpacing: 1.4, color: c.accentText }}>{r.act.toUpperCase()}</Text>
                      <Ionicons name="pencil" size={11} color={c.mutedForeground} />
                    </Pressable>
                  ) : grip(
                    <Pressable onPress={() => sceneSheet(r.scene)} accessibilityRole="button" accessibilityHint={L('Hold to drag it', 'Sürüklemek için basılı tut')}
                      style={({ pressed }) => ({ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: c.background, opacity: pressed ? 0.7 : 1 })}>
                      <Text numberOfLines={2} style={{ flex: 1, fontFamily: SANS, fontSize: 15, lineHeight: 21, color: c.foreground }}>{r.scene.title}</Text>
                      <Pressable onPress={() => sceneSheet(r.scene)} hitSlop={10} accessibilityRole="button" accessibilityLabel={L(`Edit ${r.scene.title}`, `Düzenle: ${r.scene.title}`)}
                        style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.divider : 'transparent' })}>
                        <Ionicons name="pencil" size={15} color={c.accentText} />
                      </Pressable>
                      <Ionicons name="reorder-three" size={20} color={c.mutedForeground} />
                    </Pressable>,
                  )}
                />
              </View>
              <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); ask(L('A new', 'Yeni bir'), L('heading.', 'başlık.'), '', L('Act 2, Episode 3, Prologue', 'Perde 2, Bölüm 3, Önsöz'), v => setRows(r => r && addAct(r, v))); }}
                accessibilityRole="button" style={{ marginTop: 16, alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' }}>
                <StageDirection link>{L('(add an act or episode.)', '(perde ya da bölüm ekle.)')}</StageDirection>
              </Pressable>
              <PrimaryPill label={save.isPending ? L('Saving', 'Kaydediliyor') : L('Save', 'Kaydet')} onPress={onSave} disabled={!dirty || save.isPending} style={{ marginTop: 14, alignSelf: 'flex-start' }} />
              {failed ? <StageDirection numberOfLines={3} style={{ marginTop: 12, color: c.accentText }}>({failed})</StageDirection> : null}
              <View style={{ marginTop: 34, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.divider }}>
                <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setSheet({ k: 'reset' }); }} accessibilityRole="button" accessibilityLabel={L('Reset the map', 'Haritayı sıfırla')}
                  style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
                  <Ionicons name="refresh" size={15} color={c.mutedForeground} />
                  <StageDirection link>{L('(reset the map to how it was read.)', '(haritayı okunduğu hâline döndür.)')}</StageDirection>
                </Pressable>
                {reset.isError ? <StageDirection numberOfLines={2} style={{ marginTop: 6, color: c.accentText }}>{L('(it did not reset. try again.)', '(sıfırlanmadı. yeniden dene.)')}</StageDirection> : null}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <ChoiceSheet open={sheet?.k === 'scene'} title={sheet?.k === 'scene' ? sheet.sc.title : ''} line={sheet?.k === 'scene' && sheet.sc.act ? `(${sheet.sc.act.toLowerCase()}.)` : undefined}
        choices={sheet?.k === 'scene' ? sceneChoices(sheet.sc) : []} onClose={close} />
      <ChoiceSheet open={sheet?.k === 'move'} title={L('Move it', 'Taşı,')} accent={L('under.', 'nereye.')} line={sheet?.k === 'move' ? `(${sheet.sc.title.toLowerCase()}.)` : undefined}
        choices={sheet?.k === 'move' ? moveChoices(sheet.sc) : []} onClose={close} />
      <NameSheet open={sheet?.k === 'name'} title={sheet?.k === 'name' ? sheet.title : ''} accent={sheet?.k === 'name' ? sheet.accent : ''}
        initial={sheet?.k === 'name' ? sheet.initial : ''} placeholder={sheet?.k === 'name' ? sheet.placeholder : ''} fieldLabel={L('The name', 'Ad')} confirm={L('Done', 'Tamam')}
        onSave={(v) => { if (sheet?.k === 'name') sheet.done(v); close(); }} onClose={close} />
      <ConfirmSheet open={sheet?.k === 'delete'} danger title={L('Delete this', 'Bu sahne')} accent={L('scene?', 'silinsin mi?')}
        body={sheet?.k === 'delete' ? L(`${sheet.sc.title} comes off the map when you save, with its lines and your runs of it. Choose more scenes can build it again.`, `${sheet.sc.title} kaydedince haritadan çıkar, replikleri ve provalarıyla. "Daha fazla sahne seç" onu yeniden kurabilir.`) : ''}
        confirm={L('Delete', 'Sil')} cancel={L('Keep it', 'Kalsın')}
        onConfirm={() => { if (sheet?.k === 'delete') { const sid = sheet.sc.id; setRows(r => r && removeScene(r, sid)); } close(); }} onCancel={close} />
      <ConfirmSheet open={sheet?.k === 'leave'} title={L('Leave without', 'Kaydetmeden')} accent={L('saving?', 'çıkılsın mı?')}
        body={L('What you moved, renamed or deleted here is not on the shelf yet. Leave and it is gone.', 'Burada taşıdığın, adını değiştirdiğin ya da sildiğin şeyler henüz rafta değil. Çıkarsan gider.')}
        confirm={L('Keep editing', 'Düzenlemeye devam')} cancel={L('Leave', 'Çık')} onConfirm={close} onCancel={() => { close(); setTimeout(goBack, 200); }} />
      <ConfirmSheet open={sheet?.k === 'reset'} title={L('Back to how it was', 'Okunduğu')} accent={L('read?', 'hâline mi?')}
        body={L('This puts the map back the way it was the moment the script was read: every scene under the heading it was read under, with the name it was read with, in the order it was built. What you changed here goes, saved or not. Your lines, your edits to them and your runs stay. A scene you deleted does not come back this way; choose more scenes builds it again.', 'Bu, haritayı metnin okunduğu ana döndürür: her sahne okunduğu başlığın altında, okunduğu adla, kurulduğu sırada. Burada değiştirdiklerin, kaydedilmiş olsun olmasın, gider. Repliklerin, onlara yaptığın düzeltmeler ve provaların kalır. Sildiğin bir sahne bu yolla geri gelmez; "daha fazla sahne seç" onu yeniden kurar.')}
        confirm={reset.isPending ? L('Resetting', 'Sıfırlanıyor') : L('Reset the map', 'Haritayı sıfırla')} busy={reset.isPending} cancel={L('Keep my map', 'Haritam kalsın')}
        onConfirm={onReset} onCancel={close} />
    </View>
  );
}
