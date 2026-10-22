import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { StageBackdrop } from '../../src/components/StageBackdrop';
import { StageDirection } from '../../src/components/StageDirection';
import { BackHeader } from '../../src/components/BackHeader';
import { PrimaryPill } from '../../src/components/PrimaryPill';
import { PaperCard } from '../../src/components/PaperCard';
import { useStageMotion } from '../../src/hooks/useStageMotion';
import { useScriptFromText, useUploadScript } from '../../src/hooks/useScenePartner';
import type { ScriptDetail } from '../../src/api/rehearsal';
import { RehearsalApiError } from '../../src/api/rehearsal';
import { track } from '../../src/lib/analytics';
import { useGoBack } from '../../src/lib/nav';
import { useTheme } from '../../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';

const TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
const STEPS = ['reading the pages.', 'finding the cast.', 'splitting the scenes.', 'setting the lines.'];

/**
 * Sides in. Two doors: a file from Files (the share sheet lands here too, with
 * the file already chosen), or the text pasted. The server reads it, finds
 * the cast and splits the scenes; the screen says what it is doing in stage
 * directions rather than with a bar. One scene goes straight to the sheet.
 */
export default function AddSides() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const goBack = useGoBack('/rehearse');
  const { tiltX, tiltY } = useStageMotion();
  const { uri, name } = useLocalSearchParams<{ uri?: string; name?: string }>();
  const upload = useUploadScript();
  const paste = useScriptFromText();
  const [mode, setMode] = useState<'doors' | 'paste'>('doors');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [how, setHow] = useState<'files' | 'share' | 'paste'>('files');
  const pending = upload.isPending || paste.isPending;
  const error = upload.error ?? paste.error;
  const started = useRef(false);

  const arrived = (script: ScriptDetail, door: 'files' | 'share' | 'paste') => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    track('app_sides_added', { how: door, ok: true, characters: script.num_characters });
    if (script.scenes.length === 1) router.replace({ pathname: '/rehearse/[id]', params: { id: String(script.scenes[0].id), from: 'script' } });
    else router.replace({ pathname: '/rehearse', params: { script: String(script.id) } });
  };
  const failed = (door: 'files' | 'share' | 'paste') => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    track('app_sides_added', { how: door, ok: false, characters: 0 });
  };

  const sendFile = (file: { uri: string; name: string; mimeType?: string }, door: 'files' | 'share') => {
    setHow(door);
    upload.mutate({ ...file, title: title.trim() || undefined }, { onSuccess: s => arrived(s, door), onError: () => failed(door) });
  };

  // From the share sheet or "Open in": the file is already chosen.
  useEffect(() => {
    if (!uri || started.current) return;
    started.current = true;
    sendFile({ uri, name: name ?? uri.split('/').pop() ?? 'sides.pdf' }, 'share');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const pick = async () => {
    Haptics.selectionAsync().catch(() => {});
    const res = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    sendFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? undefined }, 'files');
  };

  const sendText = () => {
    const body = text.trim();
    if (body.length < 40) return;
    Haptics.selectionAsync().catch(() => {});
    setHow('paste');
    paste.mutate({ text: body, title: title.trim() || undefined }, { onSuccess: s => arrived(s, 'paste'), onError: () => failed('paste') });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <BackHeader label="Scene partner" onPress={goBack} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40 }}>
            <View style={{ paddingTop: 8, paddingHorizontal: 2 }}>
              <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 52, letterSpacing: -0.8, color: c.foreground }}>
                Bring your <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>sides.</Text>
              </Text>
              <StageDirection numberOfLines={2} style={{ marginTop: 6 }}>(a pdf, a word file, or the text itself.)</StageDirection>
            </View>

            {pending ? (
              <Working />
            ) : error ? (
              <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 36 }}>
                <StageDirection numberOfLines={4}>({(error instanceof RehearsalApiError || error instanceof Error ? error.message : 'it could not be read.').toLowerCase()})</StageDirection>
                {error instanceof RehearsalApiError && error.gated ? (
                  <PrimaryPill label="See Premium" onPress={() => router.push('/paywall')} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
                ) : (
                  <PrimaryPill label="Try again" variant="outline" onPress={() => { upload.reset(); paste.reset(); }} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
                )}
              </Animated.View>
            ) : mode === 'doors' ? (
              <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={{ marginTop: 30, gap: 14 }}>
                <Door cap="FROM FILES" title="A file on this phone." line="(pdf, word or text. or share one to Ghost Light from Mail.)" onPress={pick} tilt={-0.4} />
                <Door cap="PASTE" title="The text itself." line="(from a message, an email, anywhere.)" onPress={() => { Haptics.selectionAsync().catch(() => {}); setMode('paste'); }} tilt={0.4} />
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 26 }}>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Title (optional)"
                  placeholderTextColor={c.mutedForeground}
                  selectionColor={c.accentText}
                  style={{ fontFamily: SANS, fontSize: 16, color: c.foreground, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider }}
                />
                <TextInput
                  value={text}
                  onChangeText={setText}
                  multiline
                  autoFocus
                  placeholder={'HAMLET: To be, or not to be...\nOPHELIA: My lord?'}
                  placeholderTextColor={c.mutedForeground}
                  selectionColor={c.accentText}
                  textAlignVertical="top"
                  style={{ marginTop: 14, minHeight: 220, fontFamily: MONO, fontSize: 14, lineHeight: 21, color: c.foreground, padding: 14, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}
                />
                <StageDirection style={{ marginTop: 10 }} numberOfLines={2}>(a name, a colon, the line. it finds the rest.)</StageDirection>
                <View style={{ marginTop: 16, flexDirection: 'row', gap: 12 }}>
                  <PrimaryPill label="Read it" onPress={sendText} disabled={text.trim().length < 40} />
                  <PrimaryPill label="A file instead" variant="outline" onPress={() => setMode('doors')} />
                </View>
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Door({ cap, title, line, onPress, tilt }: { cap: string; title: string; line: string; onPress: () => void; tilt: number }) {
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <PaperCard rotate={tilt} shadow={6} style={{ padding: 18 }}>
          <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 9, letterSpacing: 1.3, color: c.paperMuted }}>{cap}</Text>
          <Text style={{ marginTop: 6, fontFamily: SERIF, fontSize: 26, lineHeight: 30, color: c.paperInk }}>{title}</Text>
          <Text style={{ marginTop: 6, fontFamily: MONO_I, fontSize: 13, lineHeight: 19, color: c.paperMuted }}>{line}</Text>
        </PaperCard>
      )}
    </Pressable>
  );
}

/** While the server reads: the steps as stage directions, one at a time. */
function Working() {
  const { colors: c } = useTheme();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(STEPS.length - 1, s + 1)), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ marginTop: 60, alignItems: 'center' }}>
      <ActivityIndicator color={c.mutedForeground} />
      <Animated.View key={step} entering={FadeIn.duration(300)}>
        <StageDirection style={{ marginTop: 16 }}>({STEPS[step]})</StageDirection>
      </Animated.View>
    </View>
  );
}
