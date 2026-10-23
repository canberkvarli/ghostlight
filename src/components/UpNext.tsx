import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import type { Audition } from '../api/auditions';
import type { LatestRun } from '../api/rehearsal';
import { useAuditions } from '../hooks/useAuditions';
import { useLatestRun } from '../hooks/useScenePartner';
import { track } from '../lib/analytics';
import { clockLabel, daysUntil } from '../lib/when';
import { useTheme } from '../theme/ThemeContext';
import { StageDirection } from './StageDirection';

const SERIF = 'InstrumentSerif_400Regular';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const CAP = 'CourierPrime_700Bold';

/**
 * Under the search field: one card of what is up next, at most two rows. The
 * next audition, which opens its file in the Board; the scene you left
 * unfinished, with how far you got and Resume, which goes straight into the
 * rehearsal. Only the rows with something in them, and no card at all when
 * neither has.
 */
export function UpNext({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const { data: auditions } = useAuditions(isAuthenticated);
  const { data: latest } = useLatestRun(isAuthenticated);
  const next = (isAuthenticated ? auditions ?? [] : [])
    .filter((a) => a.scope === 'upcoming')
    .sort((a, b) => (a.when ? Date.parse(a.when) : Infinity) - (b.when ? Date.parse(b.when) : Infinity))[0];
  const scene = isAuthenticated ? latest ?? null : null;
  if (!next && !scene) return null;
  return (
    <View>
      <StageDirection style={{ marginBottom: 10 }}>(up next.)</StageDirection>
      <View style={{ borderRadius: 14, borderWidth: 2, borderColor: c.ink, backgroundColor: c.card, overflow: 'hidden' }}>
        {next ? <AuditionRow a={next} onPress={() => { Haptics.selectionAsync().catch(() => {}); track('app_home_row', { row: 'next' }); router.push({ pathname: '/prep', params: { id: String(next.id) } }); }} /> : null}
        {next && scene ? <View style={{ height: 1, backgroundColor: c.divider }} /> : null}
        {scene ? <SceneRow r={scene} onPress={() => { Haptics.selectionAsync().catch(() => {}); track('app_rehearse_opened', { from: 'home' }); router.push({ pathname: '/rehearse/[id]', params: { id: String(scene.scene_id), from: 'home', go: '1' } }); }} /> : null}
      </View>
    </View>
  );
}

function AuditionRow({ a, onPress }: { a: Audition; onPress: () => void }) {
  const { colors: c } = useTheme();
  const d = a.when ? new Date(a.when) : null;
  const due = a.kind === 'self_tape';
  const days = a.when ? daysUntil(a.when) : null;
  const when = a.when ? (days === 0 ? `today, ${clockLabel(a.when)}` : days === 1 ? `tomorrow, ${clockLabel(a.when)}` : `${clockLabel(a.when)} · in ${days} days`) : 'no date yet';
  const kind = a.kind === 'self_tape' ? 'Self-tape' : a.kind === 'virtual' ? 'Virtual' : 'In the room';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${a.project}, ${when}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 14, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 52, alignItems: 'center', borderRightWidth: 1, borderRightColor: c.paperRule, paddingRight: 12 }}>
        <Text style={{ fontFamily: CAP, fontSize: 10, letterSpacing: 1.4, color: c.accentText }}>{d ? (due ? 'DUE' : d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()) : 'TBD'}</Text>
        <Text style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 34, color: c.paperInk }}>{d ? String(d.getDate()) : '·'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 25, color: c.paperInk }}>
          {a.project}{a.role ? <Text style={{ color: c.paperMuted }}>{` — ${a.role}`}</Text> : null}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: SANS, fontSize: 13, color: c.paperMuted }}>{kind} · {when}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.accentText} />
    </Pressable>
  );
}

function SceneRow({ r, onPress }: { r: LatestRun; onPress: () => void }) {
  const { colors: c } = useTheme();
  const progress = r.line_count > 0 ? Math.min(1, (r.line_index + 1) / r.line_count) : 0;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Pick up ${r.title}, line ${r.line_index + 1} of ${r.line_count}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 14, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 52, alignItems: 'center' }}>
        <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', fontSize: 30, lineHeight: 34, color: c.paperInk }}>&amp;</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: SANS, fontSize: 15, color: c.paperInk }}>
          Pick up <Text style={{ fontFamily: SANS_B }}>{r.title}</Text>
        </Text>
        <View style={{ marginTop: 8, height: 4, borderRadius: 2, backgroundColor: c.paperRule, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: 4, backgroundColor: c.primary }} />
        </View>
      </View>
      <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.accentText }}>Resume</Text>
    </Pressable>
  );
}
