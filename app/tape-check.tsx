/**
 * Camera check: a plain test bench for the tape room's black picture
 * (2026-11-11). Each setup adds one thing the room does, so the first one
 * that goes black names the cause. Temporary: remove once the room is fixed.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

import { TapeEar } from '../src/rehearsal/native/tape-ear';
import { track } from '../src/lib/analytics';

type Setup = { key: string; label: string; video: boolean; ear: boolean; speaker: boolean; facing: 'front' | 'back' };
const SETUPS: Setup[] = [
  { key: 'A', label: 'Photo camera, nothing else', video: false, ear: false, speaker: false, facing: 'front' },
  { key: 'B', label: 'Video camera', video: true, ear: false, speaker: false, facing: 'front' },
  { key: 'C', label: 'Video camera + speaker setting', video: true, ear: false, speaker: true, facing: 'front' },
  { key: 'D', label: 'Video camera + voice listener', video: true, ear: true, speaker: false, facing: 'front' },
  { key: 'E', label: 'All of it (the room)', video: true, ear: true, speaker: true, facing: 'front' },
  { key: 'F', label: 'Video camera, back', video: true, ear: false, speaker: false, facing: 'back' },
];

export default function TapeCheck() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [camPerm, askCam] = useCameraPermissions();
  const [micPerm, askMic] = useMicrophonePermissions();
  const [setup, setSetup] = useState<Setup>(SETUPS[0]);
  const [n, setN] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const cam = useRef<CameraView>(null);
  const ear = useRef<TapeEar | null>(null);
  const t0 = useRef(Date.now());
  const say = (s: string) => setLog((l) => [`${((Date.now() - t0.current) / 1000).toFixed(1)}s ${s}`, ...l].slice(0, 24));

  useEffect(() => {
    if (camPerm && !camPerm.granted) void askCam();
    if (micPerm && !micPerm.granted) void askMic();
  }, [camPerm, micPerm, askCam, askMic]);

  const pick = (s: Setup) => {
    ear.current?.detach(); ear.current = null;
    t0.current = Date.now();
    setLog([]);
    setSetup(s);
    setN((k) => k + 1);
  };
  useEffect(() => () => { ear.current?.detach(); }, []);

  const ready = () => {
    say('camera ready');
    if (setup.speaker) { TapeEar.speakerOut(); say('speaker setting applied'); }
    if (setup.ear) {
      setTimeout(async () => {
        if (!TapeEar.available() || !(await TapeEar.permission())) { say('listener not available'); return; }
        const e = new TapeEar({ onHeard: (h) => { if (h.words.length) say(`heard: ${h.words.slice(-3).join(' ')}`); }, onFailed: (w) => say(`listener failed: ${w}`) });
        e.attach(); e.prime([]); e.listen();
        ear.current = e;
        say('listener started');
      }, 1000);
    }
  };

  const record = async () => {
    if (!cam.current || !setup.video) { say('switch to a video setup to record'); return; }
    say('recording 3s…');
    const started = Date.now();
    const rec = cam.current.recordAsync({ maxDuration: 10, codec: 'avc1' });
    setTimeout(() => { try { cam.current?.stopRecording(); } catch { /* checked below */ } }, 3000);
    const got = await Promise.race([
      rec.then((r) => (r?.uri ? 'file' : 'empty')).catch((e) => `error: ${e instanceof Error ? e.message : String(e)}`),
      new Promise<string>((r) => setTimeout(() => r('no file after 8s'), 8000)),
    ]);
    say(`record: ${got} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    track('app_tape_check', { setup: setup.key, record: got.slice(0, 60) });
  };

  // A photo asks the session for a frame: if it is not running, the native
  // error comes back as text, which nothing else in expo-camera reports.
  const photo = async () => {
    if (!cam.current) { say('no camera'); return; }
    say('photo…');
    const got = await Promise.race([
      cam.current.takePictureAsync({ quality: 0.1, skipProcessing: true, shutterSound: false })
        .then((p) => `ok ${p?.width}x${p?.height}`)
        .catch((e) => `error: ${e instanceof Error ? e.message : String(e)}`),
      new Promise<string>((r) => setTimeout(() => r('no photo after 6s'), 6000)),
    ]);
    say(`photo: ${got}`);
    try { say(`lenses: ${JSON.stringify(await cam.current.getAvailableLensesAsync()).slice(0, 120)}`); } catch (e) { say(`lenses error: ${e instanceof Error ? e.message : String(e)}`); }
    track('app_tape_check', { setup: setup.key, record: `photo ${got}`.slice(0, 60) });
  };

  // Build 61 on: the camera's own account of itself (the patched expo-camera).
  const diagnose = async () => {
    try {
      const native = (cam.current as unknown as { _cameraRef?: { current?: { diagnose?: () => Promise<string> } } })?._cameraRef?.current;
      if (!native?.diagnose) { say('diagnose: not in this build'); return; }
      const d = await native.diagnose();
      for (const part of d.split(' | ').reverse()) say(part);
      track('app_tape_check', { setup: setup.key, record: d.slice(0, 60) });
    } catch (e) { say(`diagnose error: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const allowed = Boolean(camPerm?.granted && micPerm?.granted);
  return (
    <View style={{ flex: 1, backgroundColor: '#130b08', paddingTop: insets.top }}>
      <View style={{ height: 360, marginHorizontal: 16, marginTop: 8, borderRadius: 16, overflow: 'hidden', backgroundColor: '#333' }}>
        {allowed ? (
          <CameraView
            key={n}
            ref={cam}
            style={{ flex: 1 }}
            facing={setup.facing}
            mode={setup.video ? 'video' : 'picture'}
            onCameraReady={ready}
            onMountError={(e) => say(`mount error: ${(e as { message?: string }).message ?? 'unknown'}`)}
          />
        ) : <Text style={{ color: '#fff', padding: 20 }}>Waiting for camera and microphone permission…</Text>}
        <Text style={{ position: 'absolute', top: 10, left: 12, color: '#fff', fontSize: 15, fontWeight: '700' }}>{setup.key}: {setup.label}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <Text style={{ color: '#f7f3ec', fontSize: 14, marginBottom: 10 }}>Tap each one. Tell me which letters show your face and which are black. Then tap Record 3s on a black one.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SETUPS.map((s) => (
            <Pressable key={s.key} onPress={() => pick(s)} style={{ paddingHorizontal: 14, height: 40, borderRadius: 20, justifyContent: 'center', backgroundColor: s.key === setup.key ? '#c24e10' : 'rgba(255,255,255,0.12)' }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{s.key}</Text>
            </Pressable>
          ))}
          <Pressable onPress={diagnose} style={{ paddingHorizontal: 14, height: 40, borderRadius: 20, justifyContent: 'center', backgroundColor: '#c24e10' }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Diagnose</Text>
          </Pressable>
          <Pressable onPress={photo} style={{ paddingHorizontal: 14, height: 40, borderRadius: 20, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.25)' }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Photo test</Text>
          </Pressable>
          <Pressable onPress={record} style={{ paddingHorizontal: 14, height: 40, borderRadius: 20, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.25)' }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Record 3s</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={{ paddingHorizontal: 14, height: 40, borderRadius: 20, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Close</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: 14 }}>
          {log.map((l, i) => <Text key={i} style={{ color: '#b5ada3', fontSize: 13, fontFamily: 'Courier' }}>{l}</Text>)}
        </View>
      </ScrollView>
    </View>
  );
}
