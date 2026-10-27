import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, FadeIn, FadeOut, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { GhostLight } from '../src/components/GhostLight';
import { StageDirection } from '../src/components/StageDirection';
import { BackHeader } from '../src/components/BackHeader';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { PaperCard } from '../src/components/PaperCard';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useCancelExtraction, useScriptFromText, useScriptProgress, useUploadScript } from '../src/hooks/useScenePartner';
import type { ScriptDetail } from '../src/api/rehearsal';
import { RehearsalApiError, getScript } from '../src/api/rehearsal';
import { track } from '../src/lib/analytics';
import { useGoBack } from '../src/lib/nav';
import { SCRIPT_STEPS, aboutLeft, stepOf } from '../src/lib/scriptSteps';
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
  // Sent: the server reads it on its own time and the sheet follows along.
  const [readingId, setReadingId] = useState<number | null>(null);
  const [readFailure, setReadFailure] = useState<string | null>(null);
  const reading = useScriptProgress(readingId, 1500);
  const stop = useCancelExtraction();
  const pending = upload.isPending || paste.isPending || readingId !== null;
  const error = upload.error ?? paste.error;
  const started = useRef(false);

  const arrived = (script: ScriptDetail, door: 'files' | 'share' | 'paste') => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    track('app_sides_added', { how: door, ok: true, characters: script.num_characters });
    // The sheet is put away first and the scene opens over the Scene room,
    // so its X comes back to the room, not to a page the room's stack had.
    if (router.canGoBack()) router.back();
    setTimeout(() => {
      router.navigate({ pathname: '/rehearse', params: { script: String(script.id) } });
      if (script.scenes.length === 1) router.push({ pathname: '/play/[id]', params: { id: String(script.scenes[0].id), from: 'script' } });
    }, 280);
  };
  const failed = (door: 'files' | 'share' | 'paste') => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    track('app_sides_added', { how: door, ok: false, characters: 0 });
  };

  // The map: which step the server is on, as it reads the script aloud.
  const [step, setStep] = useState(0);
  const onStep = (raw: string) => { const n = stepOf(raw); if (n !== null) setStep(s => Math.max(s, n)); };

  // The server took it: read already (the same file again) opens at once,
  // anything else is followed until it settles.
  const taken = (s: ScriptDetail, door: 'files' | 'share' | 'paste') => {
    if (s.processing_status === 'completed') { arrived(s, door); return; }
    setStep(1);
    setReadingId(s.id);
  };
  const settled = useRef<number | null>(null);
  useEffect(() => {
    const p = reading.data;
    if (!p || readingId === null) return;
    if (p.step) onStep(p.step);
    if (settled.current === readingId) return;
    if (p.status === 'completed') {
      settled.current = readingId;
      getScript(readingId).then((d) => { setReadingId(null); arrived(d, how); }).catch(() => { setReadingId(null); goBack(); });
    } else if (p.status === 'failed') {
      settled.current = readingId;
      setReadingId(null);
      setReadFailure(p.error ?? 'it could not be read.');
      failed(how);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading.data, readingId]);
  // Gone from the server (stopped from the shelf, or deleted): nothing to follow.
  useEffect(() => {
    if (reading.error instanceof RehearsalApiError && reading.error.status === 404) { setReadingId(null); setStep(0); }
  }, [reading.error]);

  const sendFile = (file: { uri: string; name: string; mimeType?: string }, door: 'files' | 'share') => {
    setHow(door);
    setStep(0);
    setReadFailure(null);
    upload.mutate({ ...file, title: title.trim() || undefined }, { onSuccess: s => taken(s, door), onError: () => failed(door) });
  };

  // Leave it reading: the row on the shelf says how it is going.
  const leave = () => { Haptics.selectionAsync().catch(() => {}); goBack(); };
  // Stop it: off the shelf, the upload given back, the doors again.
  const halt = () => {
    const id = readingId;
    if (id === null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    settled.current = id;
    setReadingId(null);
    setStep(0);
    stop.mutate(id);
    upload.reset(); paste.reset();
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
    setReadFailure(null);
    paste.mutate({ text: body, title: title.trim() || undefined }, { onSuccess: s => taken(s, 'paste'), onError: () => failed('paste') });
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
              <TheMap
                step={step}
                sending={readingId === null}
                left={reading.data?.estimate_seconds != null && reading.data.elapsed_seconds != null ? reading.data.estimate_seconds - reading.data.elapsed_seconds : null}
                onLeave={leave}
                onStop={halt}
              />
            ) : error || readFailure ? (
              <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 36 }}>
                <StageDirection numberOfLines={4}>({readFailure ? readFailure.toLowerCase().replace(/\.$/, '') + '.' : inWords(error)})</StageDirection>
                {!readFailure && error instanceof RehearsalApiError && error.gated ? (
                  <PrimaryPill label="See Premium" onPress={() => router.push('/paywall')} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
                ) : (
                  <PrimaryPill label="Try again" variant="outline" onPress={() => { upload.reset(); paste.reset(); setReadFailure(null); }} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
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
function TheMap({ step, sending, left, onLeave, onStop }: { step: number; sending: boolean; left: number | null; onLeave: () => void; onStop: () => void }) {
  const { colors: c } = useTheme();
  const total = SCRIPT_STEPS.length;
  const i = Math.max(0, Math.min(step, total - 1));
  const label = SCRIPT_STEPS[i].replace(/\.$/, '');
  const words = label.charAt(0).toUpperCase() + label.slice(1);
  // The rule fills a step at a time, each move over half a second.
  const frac = useSharedValue(0);
  useEffect(() => { frac.value = withTiming((i + 0.5) / total, { duration: 520, easing: Easing.out(Easing.cubic) }); }, [i, total, frac]);
  const fill = useAnimatedStyle(() => ({ width: `${frac.value * 100}%` }));
  return (
    <View style={{ marginTop: 44, alignItems: 'center', paddingHorizontal: 6 }}>
      <GhostLight size={36} />
      <View style={{ height: 80, justifyContent: 'center', alignSelf: 'stretch', marginTop: 26 }}>
        <Animated.View key={i} entering={FadeIn.duration(380)} exiting={FadeOut.duration(220)} style={{ position: 'absolute', left: 0, right: 0 }}>
          <Text numberOfLines={2} style={{ textAlign: 'center', fontFamily: SERIF, fontSize: 30, lineHeight: 36, letterSpacing: -0.4, color: c.foreground }}>{words}</Text>
        </Animated.View>
      </View>
      <View style={{ alignSelf: 'stretch', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: c.divider, overflow: 'hidden' }}>
          <Animated.View style={[fill, { height: 3, backgroundColor: c.accentText }]} />
        </View>
        <Text style={{ fontFamily: SANS_B, fontSize: 11, letterSpacing: 1.4, color: c.accentText }}>{i + 1} OF {total}</Text>
      </View>
      <StageDirection numberOfLines={2} style={{ marginTop: 20, textAlign: 'center' }}>{sending ? '(sending the file.)' : `(${aboutLeft(left)})`}</StageDirection>
      {sending ? null : (
        <Animated.View entering={FadeIn.duration(260)} style={{ marginTop: 22, alignItems: 'center' }}>
          {/* Not a Close button: leaving is safe, so the page says so and the way out is the one in the corner. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: c.panel, borderWidth: 1, borderColor: c.border }}>
            <Ionicons name="walk-outline" size={16} color={c.accentText} />
            <Text style={{ flexShrink: 1, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: c.foreground }}>Go anywhere. It keeps reading, and you'll be told when it's in.</Text>
          </View>
          <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 22 }}>
            <Pressable onPress={onLeave} hitSlop={10} accessibilityRole="button" accessibilityLabel="Look around while it reads">
              <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.foreground }}>Look around</Text>
            </Pressable>
            <Text style={{ color: c.chevron }}>·</Text>
            <Pressable onPress={onStop} hitSlop={10} accessibilityRole="button" accessibilityLabel="Stop reading this script">
              <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.accentText }}>Stop</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
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
