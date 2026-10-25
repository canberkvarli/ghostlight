import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, FadeIn, FadeOut, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { BackHeader } from '../src/components/BackHeader';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { PaperCard } from '../src/components/PaperCard';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useScriptFromText, useUploadScript } from '../src/hooks/useScenePartner';
import type { ScriptDetail } from '../src/api/rehearsal';
import { RehearsalApiError } from '../src/api/rehearsal';
import { track } from '../src/lib/analytics';
import { useGoBack } from '../src/lib/nav';
import { SCRIPT_STEPS, stepOf } from '../src/lib/scriptSteps';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';

/** Any file: the server reads it by its bytes and says so if it cannot. */
const SANS_B = 'BricolageGrotesque_600SemiBold';
const TYPES = '*/*';
const EXT_OF: Record<string, string> = { 'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'text/plain': 'txt', 'text/rtf': 'rtf', 'application/rtf': 'rtf', 'text/markdown': 'md' };
/**
 * What went wrong, in the phone's words. The server's 400s are already
 * sentences ("File too large (max 10MB)"); a dead network and the uploader's
 * own refusals are not.
 */
function inWords(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (e instanceof RehearsalApiError) {
    if (e.gated) return m.toLowerCase();
    if (e.status === 400) return m.toLowerCase();
    if (e.status === 401 || e.status === 403) return 'sign in first, then send it again.';
    if (e.status === 413) return 'that file is too big. under 10 mb, please.';
    if (e.status >= 500) return 'the house is dark for a moment. try again.';
  }
  if (/network|timed out|offline/i.test(m)) return 'no signal. try again when there is one.';
  if (/formdata|unsupported|blob/i.test(m)) return 'that file could not be sent. a pdf, a word file or plain text will.';
  return 'it could not be read. a pdf, a word file or plain text will.';
}

/** A name the server can read: the picker's, or one made from the type when the name has no extension. */
function named(name: string | null | undefined, mimeType?: string | null): string {
  const n = (name ?? '').trim();
  if (n.includes('.')) return n;
  const ext = mimeType ? EXT_OF[mimeType] : undefined;
  return `${n || 'sides'}.${ext ?? 'txt'}`;
}


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

  // The map: which step the server is on, as it reads the script aloud.
  const [step, setStep] = useState(0);
  const onStep = (raw: string) => { const n = stepOf(raw); if (n !== null) setStep(s => Math.max(s, n)); };

  const sendFile = (file: { uri: string; name: string; mimeType?: string }, door: 'files' | 'share') => {
    setHow(door);
    setStep(0);
    upload.mutate({ ...file, title: title.trim() || undefined, onStep }, { onSuccess: s => arrived(s, door), onError: () => failed(door) });
  };

  // From the share sheet or "Open in": the file is already chosen.
  useEffect(() => {
    if (!uri || started.current) return;
    started.current = true;
    sendFile({ uri, name: named(name ?? uri.split('/').pop()) }, 'share');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const pick = async () => {
    Haptics.selectionAsync().catch(() => {});
    let res: DocumentPicker.DocumentPickerResult;
    try {
      res = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: false });
    } catch {
      // The picker would not come up (it was still closing, or the phone refused): the door stays a door.
      return;
    }
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    sendFile({ uri: a.uri, name: named(a.name, a.mimeType), mimeType: a.mimeType ?? undefined }, 'files');
  };

  const sendText = () => {
    const body = text.trim();
    if (body.length < 40) return;
    Haptics.selectionAsync().catch(() => {});
    setHow('paste');
    setStep(0);
    paste.mutate({ text: body, title: title.trim() || undefined, onStep }, { onSuccess: s => arrived(s, 'paste'), onError: () => failed('paste') });
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
              <StageDirection numberOfLines={2} style={{ marginTop: 6 }}>(any file with the words in it, or the text itself.)</StageDirection>
            </View>

            {pending ? (
              <TheMap step={step} />
            ) : error ? (
              <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 36 }}>
                <StageDirection numberOfLines={4}>({inWords(error)})</StageDirection>
                {error instanceof RehearsalApiError && error.gated ? (
                  <PrimaryPill label="See Premium" onPress={() => router.push('/paywall')} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
                ) : (
                  <PrimaryPill label="Try again" variant="outline" onPress={() => { upload.reset(); paste.reset(); }} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
                )}
              </Animated.View>
            ) : mode === 'doors' ? (
              <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={{ marginTop: 30, gap: 14 }}>
                <Door cap="FROM FILES" title="A file on this phone." line="(pdf, word, text, whatever you were sent. or share it to Ghost Light from Mail.)" onPress={pick} tilt={-0.4} />
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
/**
 * The map. The server reads the script aloud as it goes and the phone draws
 * the same few steps the website does: the ones done ticked, the one it is
 * on breathing, the rest waiting. Honest to the second: nothing here is a
 * timer.
 */
function TheMap({ step }: { step: number }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: 36 }}>
      <StageDirection>(reading your sides.)</StageDirection>
      <View style={{ marginTop: 16, gap: 2 }}>
        {SCRIPT_STEPS.map((label, i) => {
          const done = i < step;
          const on = i === step;
          return (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}>
              <View style={{ width: 22, alignItems: 'center' }}>
                {done ? (
                  <Ionicons name="checkmark" size={15} color={c.accentText} />
                ) : on ? (
                  <Breath color={c.accentText} />
                ) : (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.divider }} />
                )}
              </View>
              <Text style={{ fontFamily: on ? SANS_B : SANS, fontSize: 15, lineHeight: 21, color: on ? c.foreground : done ? c.mutedForeground : c.chevron }}>{label.replace(/\.$/, '')}</Text>
            </View>
          );
        })}
      </View>
      <StageDirection style={{ marginTop: 18 }}>(a long script takes a minute. stay on the page.)</StageDirection>
    </View>
  );
}

/** The dot beside the step it is on: it breathes. */
function Breath({ color }: { color: string }) {
  const k = useSharedValue(0);
  useEffect(() => { k.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true); return () => cancelAnimation(k); }, [k]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.75 + 0.45 * k.value }], opacity: 0.55 + 0.45 * k.value }));
  return <Animated.View style={[{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }, style]} />;
}
