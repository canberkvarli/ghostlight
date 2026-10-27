import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { GhostLight } from './GhostLight';
import { TAB_BAR_SPACE } from './TabBar';
import { SCRIPTS_KEY, useScriptProgress, useScripts } from '../hooks/useScenePartner';
import { aboutLeft } from '../lib/scriptSteps';
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

  const open = () => {
    const id = done?.id ?? reading?.id;
    Haptics.selectionAsync().catch(() => {});
    setDone(null);
    if (id) router.navigate({ pathname: '/rehearse', params: { script: String(id) } });
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
    </Animated.View>
  );
}
