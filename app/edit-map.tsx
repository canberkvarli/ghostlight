import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
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
import { useSaveScriptMap, useScript } from '../src/hooks/useScenePartner';
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

  const ask = (title: string, value: string, done: (v: string) => void) =>
    Alert.prompt(title, undefined, [
      { text: L('Cancel', 'Vazgeç'), style: 'cancel' },
      { text: L('Done', 'Tamam'), onPress: (v?: string) => { if (v != null) done(v); } },
    ], 'plain-text', value);

  const moveSheet = (sc: LayoutScene) => {
    if (!rows) return;
    const acts = actsIn(rows).filter(a => a !== sc.act);
    const options = [...acts, L('No heading', 'Başlıksız'), L('A new act or episode', 'Yeni bir perde ya da bölüm'), L('Cancel', 'Vazgeç')];
    ActionSheetIOS.showActionSheetWithOptions({ title: L(`Move ${sc.title} to`, `${sc.title} nereye`), options, cancelButtonIndex: options.length - 1 }, (i) => {
      if (i < acts.length) setRows(r => r && moveTo(r, sc.id, acts[i]));
      else if (i === acts.length) setRows(r => r && moveTo(r, sc.id, null));
      else if (i === acts.length + 1) ask(L('The new heading', 'Yeni başlık'), '', v => setRows(r => r && moveTo(r, sc.id, v)));
    });
  };

  const sceneSheet = (sc: LayoutScene) => {
    Haptics.selectionAsync().catch(() => {});
    const options = [L('Rename', 'Yeniden adlandır'), L('Move to another act', 'Başka bir perdeye taşı'), L('Delete this scene', 'Bu sahneyi sil'), L('Cancel', 'Vazgeç')];
    ActionSheetIOS.showActionSheetWithOptions({ title: sc.title, options, destructiveButtonIndex: 2, cancelButtonIndex: 3 }, (i) => {
      if (i === 0) ask(L('The scene', 'Sahne'), sc.title, v => setRows(r => r && renameScene(r, sc.id, v)));
      else if (i === 1) moveSheet(sc);
      else if (i === 2) {
        Alert.alert(L(`Delete ${sc.title}?`, `${sc.title} silinsin mi?`), L('Its lines and your runs of it go too, when you save.', 'Kaydedince replikleri ve provaların da gider.'), [
          { text: L('Cancel', 'Vazgeç'), style: 'cancel' },
          { text: L('Delete', 'Sil'), style: 'destructive', onPress: () => setRows(r => r && removeScene(r, sc.id)) },
        ]);
      }
    });
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
    Alert.alert(L('Leave without saving?', 'Kaydetmeden çıkılsın mı?'), undefined, [
      { text: L('Keep editing', 'Düzenlemeye devam'), style: 'cancel' },
      { text: L('Leave', 'Çık'), style: 'destructive', onPress: goBack },
    ]);
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
              <StageDirection numberOfLines={3} style={{ marginTop: 18 }}>{L('(hold a scene to drag it, under any heading. tap it to rename, move or delete it. tap a heading to rename it.)', '(sürüklemek için bir sahneye basılı tut. yeniden adlandırmak, taşımak ya da silmek için dokun. başlığı değiştirmek için başlığa dokun.)')}</StageDirection>
              <View style={{ marginTop: 14 }}>
                <SortableList
                  items={rows}
                  keyOf={r => r.key}
                  byHandle
                  onHolding={setHolding}
                  onReorder={next => setRows(settle(next))}
                  renderItem={(r, grip) => r.kind === 'head' ? (
                    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); ask(L('The heading', 'Başlık'), r.act, v => setRows(x => x && renameAct(x, r.key, v))); }}
                      accessibilityRole="button" accessibilityLabel={L(`Rename ${r.act}`, `Yeniden adlandır: ${r.act}`)}
                      style={({ pressed }) => ({ paddingTop: 18, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1, backgroundColor: c.background })}>
                      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: CAP, fontSize: 10.5, letterSpacing: 1.4, color: c.accentText }}>{r.act.toUpperCase()}</Text>
                      <Ionicons name="pencil" size={11} color={c.mutedForeground} />
                    </Pressable>
                  ) : grip(
                    <Pressable onPress={() => sceneSheet(r.scene)} accessibilityRole="button" accessibilityHint={L('Hold to drag it', 'Sürüklemek için basılı tut')}
                      style={({ pressed }) => ({ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: c.background, opacity: pressed ? 0.7 : 1 })}>
                      <Text numberOfLines={2} style={{ flex: 1, fontFamily: SANS, fontSize: 15, lineHeight: 21, color: c.foreground }}>{r.scene.title}</Text>
                      <Ionicons name="reorder-three" size={20} color={c.mutedForeground} />
                    </Pressable>,
                  )}
                />
              </View>
              <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); ask(L('A new act or episode', 'Yeni bir perde ya da bölüm'), '', v => setRows(r => r && addAct(r, v))); }}
                accessibilityRole="button" style={{ marginTop: 16, alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' }}>
                <StageDirection link>{L('(add an act or episode.)', '(perde ya da bölüm ekle.)')}</StageDirection>
              </Pressable>
              <PrimaryPill label={save.isPending ? L('Saving', 'Kaydediliyor') : L('Save', 'Kaydet')} onPress={onSave} disabled={!dirty || save.isPending} style={{ marginTop: 14, alignSelf: 'flex-start' }} />
              {failed ? <StageDirection numberOfLines={3} style={{ marginTop: 12, color: c.accentText }}>({failed})</StageDirection> : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
