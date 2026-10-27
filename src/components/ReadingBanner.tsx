import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { GhostLight } from './GhostLight';
import { TAB_BAR_SPACE } from './TabBar';
import { SCRIPTS_KEY, useCancelExtraction, useScriptProgress, useScripts } from '../hooks/useScenePartner';
import { StageDirection } from './StageDirection';
import { SCRIPT_STEPS, aboutLeft, stepOf } from '../lib/scriptSteps';
import { useSession } from '../lib/useSession';
import { useTheme } from '../theme/ThemeContext';

/**
 * Sides being read while the actor is somewhere else in the app: a small
 * card floating over whatever room they are in, with a bar that fills and
 * about how long is left; and when it is done, the card says so with Open,
 * for a few seconds, then goes. Away from the rooms where it would be in
 * the way: the sides sheet (it has its own map), a run, the reader.
 */
const QUIET = ['sides', 'read', 'auth', 'paywall', 'curtain', 'demo', 'play', 'edit'];

export function ReadingBanner() {
  const { isAuthenticated } = useSession();
  const scripts = useScripts(isAuthenticated);
  const qc = useQueryClient();
  const router = useRouter();
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();

  const reading = (scripts.data ?? []).find((s) => !s.is_sample && s.processing_status !== 'completed' && s.processing_status !== 'failed' && s.processing_status !== 'deleted');
  const progress = useScriptProgress(reading ? reading.id : null, 3000);
  const [done, setDone] = useState<{ id: number; title: string; scenes: number } | null>(null);
  // Tapped while reading: the details, from the bottom, with a way to stop it.
  const [details, setDetails] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stop = useCancelExtraction();
  useEffect(() => { if (!reading) { setDetails(false); setStopping(false); } }, [reading]);
  const was = useRef<Map<number, string>>(new Map());
  // On the sides sheet the map says it itself; the card does not say it again after.
  const quietRef = useRef(false);

  // The shelf learns the script is in, and the card says so.
  useEffect(() => {
    const p = progress.data;
    if (!p || !reading) return;
    was.current.set(reading.id, reading.title);
    if (p.status === 'completed' || p.status === 'failed') void qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
  }, [progress.data, reading, qc]);
  useEffect(() => {
    for (const s of scripts.data ?? []) {
      const title = was.current.get(s.id);
      if (title === undefined) continue;
      if (s.processing_status === 'completed') {
        was.current.delete(s.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (!quietRef.current) setDone({ id: s.id, title: s.title || title, scenes: s.num_scenes_extracted });
      } else if (s.processing_status === 'failed' || s.processing_status === 'deleted') {
        was.current.delete(s.id);
      }
    }
  }, [scripts.data]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 7000);
    return () => clearTimeout(t);
  }, [done]);

  const leaf = segments[segments.length - 1] ?? '';
  const quiet = segments.some((s) => QUIET.includes(s)) || (segments.includes('rehearse') && leaf === '[id]');
  quietRef.current = segments.includes('sides');
  const inRoom = segments[0] === '(tabs)';
  const bottom = (inRoom ? TAB_BAR_SPACE : 16) + insets.bottom;

  const p = progress.data;
  const frac = p?.estimate_seconds && p.elapsed_seconds != null ? Math.min(0.95, Math.max(0.04, p.elapsed_seconds / p.estimate_seconds)) : 0.06;
  const left = p?.estimate_seconds != null && p.elapsed_seconds != null ? p.estimate_seconds - p.elapsed_seconds : null;
  const bar = useAnimatedStyle(() => ({ width: withTiming(`${frac * 100}%`, { duration: 900 }) }), [frac]);

  if (!isAuthenticated || quiet || (!reading && !done)) return null;

  const toShelf = (id: number | undefined) => {
    setDone(null);
    setDetails(false);
    if (id) router.navigate({ pathname: '/rehearse', params: { script: String(id) } });
  };
  const open = () => {
    Haptics.selectionAsync().catch(() => {});
    if (done) toShelf(done.id);
    else setDetails(true);
  };
  const step = p?.step ? stepOf(p.step) : null;
  const stepAt = Math.max(0, Math.min(step ?? 0, SCRIPT_STEPS.length - 1));
  const stepWords = SCRIPT_STEPS[stepAt].replace(/\.$/, '');
  const elapsed = p?.elapsed_seconds ?? null;
  const since = elapsed === null ? '' : elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${String(elapsed % 60).padStart(2, '0')}s`;
  const halt = () => {
    if (!reading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    was.current.delete(reading.id);
    stop.mutate(reading.id, { onSettled: () => { setStopping(false); setDetails(false); } });
  };

  return (
    <Animated.View entering={FadeIn.duration(260)} exiting={FadeOut.duration(220)} pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom }}>
      <Pressable onPress={open} accessibilityRole="button"
        style={{ borderRadius: 18, backgroundColor: c.ink, paddingHorizontal: 16, paddingVertical: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
        {done ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.yellow, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={17} color={c.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 14.5, color: '#f7f3ec' }}>Your sides are in.</Text>
              <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 12, color: '#b5ada3' }}>
                ({done.title}{done.scenes ? `, ${done.scenes} ${done.scenes === 1 ? 'scene' : 'scenes'}` : ''}.)
              </Text>
            </View>
            <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 14, color: c.yellow }}>Open</Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <GhostLight size={16} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 14, color: '#f7f3ec' }}>Reading {reading?.title ?? 'your sides'}</Text>
                <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 12, color: '#b5ada3' }}>({aboutLeft(left)} we will say when it is in.)</Text>
              </View>
            </View>
            <View style={{ marginTop: 10, height: 3, borderRadius: 1.5, backgroundColor: '#3a2c24', overflow: 'hidden' }}>
              <Animated.View style={[{ height: 3, backgroundColor: c.yellow }, bar]} />
            </View>
          </>
        )}
      </Pressable>

      <Modal visible={details && Boolean(reading)} transparent animationType="none" onRequestClose={() => setDetails(false)} statusBarTranslucent>
        <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,7,4,0.66)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setDetails(false)} accessibilityLabel="Close" />
          <Animated.View entering={FadeIn.duration(240).delay(40)}
            style={{ backgroundColor: c.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: c.border, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 10 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 16 }} />
            <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 11, letterSpacing: 1.6, color: c.mutedForeground }}>READING YOUR SIDES</Text>
            <Text numberOfLines={2} style={{ marginTop: 6, fontFamily: 'InstrumentSerif_400Regular', fontSize: 30, lineHeight: 34, letterSpacing: -0.4, color: c.foreground }}>{reading?.title ?? 'Your sides'}</Text>

            <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <GhostLight size={14} />
              <Text style={{ flex: 1, fontFamily: 'InstrumentSerif_400Regular_Italic', fontSize: 20, color: c.accentText }}>{stepWords.charAt(0).toUpperCase() + stepWords.slice(1)}</Text>
              <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 11, letterSpacing: 1.4, color: c.accentText }}>{stepAt + 1} OF {SCRIPT_STEPS.length}</Text>
            </View>
            <View style={{ marginTop: 12, height: 4, borderRadius: 2, backgroundColor: c.divider, overflow: 'hidden' }}>
              <Animated.View style={[{ height: 4, backgroundColor: c.accentText }, bar]} />
            </View>
            <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 12.5, color: c.mutedForeground }}>{since ? `(reading for ${since}.)` : '(just begun.)'}</Text>
              <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 12.5, color: c.mutedForeground }}>({aboutLeft(left).replace(/\.$/, '')} left.)</Text>
            </View>
            <StageDirection numberOfLines={2} style={{ marginTop: 16 }}>(it keeps reading wherever you go. you will be told when it is in.)</StageDirection>

            {stopping ? (
              <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 22, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border }}>
                <Text style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 14, lineHeight: 20, color: c.foreground }}>Stop reading it? The sides come off your shelf and the upload is given back. You can send them again any time.</Text>
                <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 20 }}>
                  <Pressable onPress={() => setStopping(false)} hitSlop={10} accessibilityRole="button">
                    <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 14.5, color: c.mutedForeground }}>Keep reading</Text>
                  </Pressable>
                  <Pressable onPress={halt} disabled={stop.isPending} accessibilityRole="button"
                    style={{ height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: '#c0392b', alignItems: 'center', justifyContent: 'center' }}>
                    {stop.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 14.5, color: '#fff' }}>Stop it</Text>}
                  </Pressable>
                </View>
              </Animated.View>
            ) : (
              <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setStopping(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Stop reading these sides">
                  <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 15, color: '#d0574b' }}>Stop reading</Text>
                </Pressable>
                <Pressable onPress={() => toShelf(reading?.id)} accessibilityRole="button"
                  style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 15, color: c.foreground }}>See the shelf</Text>
                </Pressable>
              </View>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>
    </Animated.View>
  );
}
