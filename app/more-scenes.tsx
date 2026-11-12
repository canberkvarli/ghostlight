import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { BackHeader } from '../src/components/BackHeader';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { SceneMap } from '../src/components/SceneMap';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useAddScenes, useSceneMap } from '../src/hooks/useScenePartner';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { RehearsalApiError, type Sendable } from '../src/api/rehearsal';
import { groupScan, picksOf, tickRoom, toggleTick } from '../src/rehearsal/scene-map';
import { paywallHref } from '../src/lib/paywall';
import { track } from '../src/lib/analytics';
import { useGoBack } from '../src/lib/nav';
import { useTheme } from '../src/theme/ThemeContext';
import { lower } from '../src/i18n/pick';
import { useL } from '../src/i18n';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';

/**
 * More scenes from a script already on the shelf: the same map the sides
 * sheet draws, with what is built ticked and locked. The server keeps the
 * text of most scripts; an older one asks for its file once.
 */
export default function MoreScenes() {
  const { colors: c } = useTheme();
  const L = useL();
  const router = useRouter();
  const goBack = useGoBack('/rehearse');
  const { tiltX, tiltY } = useStageMotion();
  const { id: raw, title } = useLocalSearchParams<{ id?: string; title?: string }>();
  const id = raw ? Number(raw) : null;
  const { isPaid } = useEntitlement();
  const [file, setFile] = useState<Sendable | null>(null);
  const map = useSceneMap(id, file);
  const add = useAddScenes();
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const answer = map.data && !map.data.needs_file ? map.data : null;
  const groups = useMemo(() => (answer ? groupScan(answer.scan.scenes, answer.built) : []), [answer]);
  // The server's allowance is the truth; the phone's guess only until it answers.
  const limit = answer ? answer.limit : isPaid ? null : 1;
  const room = tickRoom(limit, answer?.built_count ?? 0);
  const anyOpen = groups.some(g => g.rows.some(r => r.locked === null));

  // A plan that bought more while the sheet was open is asked again.
  useEffect(() => { if (isPaid && answer?.limit != null) void map.refetch(); }, [isPaid]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (index: number) => {
    const out = toggleTick(picked, index, room);
    setPicked(out.picked);
    if (out.overLimit) router.push(paywallHref('scene_limit'));
  };

  const build = () => {
    if (!answer || id === null || picked.size === 0) return;
    Haptics.selectionAsync().catch(() => {});
    track('app_sides_mapped', { scenes: answer.scan.scenes.length, picked: picked.size, paid: isPaid, more: true });
    add.mutate({ id, picks: picksOf(answer.scan.scenes, picked), file: file ?? undefined }, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        goBack();
      },
      onError: (e) => {
        if (e instanceof RehearsalApiError && e.gated) router.push(paywallHref('scene_limit'));
        else if (e instanceof RehearsalApiError && e.message === 'needs_file') setFile(null);
      },
    });
  };

  const pickFile = async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name || 'sides.pdf', mimeType: a.mimeType ?? 'application/octet-stream' });
    } catch { /* the picker would not come up */ }
  };

  const addError = add.error instanceof RehearsalApiError && !add.error.gated ? lower(add.error.message) : add.error ? L('it did not go through. try again.', 'gitmedi. yeniden dene.') : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <BackHeader label={L('Scene partner', 'Sahne partneri')} onPress={goBack} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40 }}>
          <View style={{ paddingTop: 8, paddingHorizontal: 2 }}>
            <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 52, letterSpacing: -0.8, color: c.foreground }}>
              {L('More ', 'Daha çok ')}<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{L('scenes.', 'sahne.')}</Text>
            </Text>
            {title ? <StageDirection numberOfLines={2} style={{ marginTop: 6 }}>({title})</StageDirection> : null}
          </View>

          {map.isLoading ? (
            <View style={{ marginTop: 36, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator size="small" color={c.mutedForeground} />
              <StageDirection>{L('(reading the headings.)', '(başlıklar okunuyor.)')}</StageDirection>
            </View>
          ) : map.isError ? (
            <View style={{ marginTop: 36 }}>
              <StageDirection numberOfLines={3}>({map.error instanceof RehearsalApiError && map.error.status === 400 ? lower(map.error.message) : L('it would not open. try again.', 'açılmadı. bir daha dene.')})</StageDirection>
              <PrimaryPill label={L('Try again', 'Yeniden dene')} variant="outline" onPress={() => { void map.refetch(); }} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
            </View>
          ) : map.data?.needs_file ? (
            <View style={{ marginTop: 36 }}>
              <StageDirection numberOfLines={3}>{L('(I did not keep the pages of this one. give me the same file once and I can read the rest.)', '(bunun sayfalarını saklamamışım. aynı dosyayı bir kez ver, gerisini okurum.)')}</StageDirection>
              <PrimaryPill label={L('Choose the file', 'Dosyayı seç')} onPress={pickFile} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
            </View>
          ) : answer && !anyOpen ? (
            <StageDirection numberOfLines={3} style={{ marginTop: 36 }}>{L('(every scene I can build is on your shelf already.)', '(hazırlayabileceğim her sahne zaten rafında.)')}</StageDirection>
          ) : answer ? (
            <>
              <SceneMap
                groups={groups}
                picked={picked}
                onToggle={toggle}
                building={add.isPending}
                onBuild={build}
                note={room === 0 ? L('(your free scene of this script is built. the rest come with the whole stage.)', '(bu metinden ücretsiz sahnen hazır. gerisi sahnenin tamamıyla gelir.)') : null}
              />
              {addError ? <StageDirection numberOfLines={3} style={{ marginTop: 12, color: c.accentText }}>({addError})</StageDirection> : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
