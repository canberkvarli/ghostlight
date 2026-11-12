import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { GhostLight } from '../src/components/GhostLight';
import { PaperCard } from '../src/components/PaperCard';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useHouseList, useTonight } from '../src/hooks/useTonight';
import { formatDuration, type Monologue } from '../src/data/monologues';
import { track } from '../src/lib/analytics';
import { PLAYS_KEY, type Plays } from '../src/lib/plays';
import type { Medium } from '../src/theme/medium';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const MONO = 'CourierPrime_400Regular';
const MONO_B = 'CourierPrime_700Bold';

export type FirstRoom = 'audition' | 'script' | 'tonight';

/** Where the welcome's first answer leads. */
export function roomFor(workingOn: string | null | undefined): FirstRoom {
  if (workingOn === 'audition') return 'audition';
  if (workingOn === 'role' || workingOn === 'class') return 'script';
  return 'tonight';
}

/**
 * The first night: the room the welcome's first answer opens.
 *
 * An audition asks for the date and hands it to the audition form, already
 * filled in. A role or a class asks for the script and opens the sides door.
 * Keeping sharp gets one speech picked from what they play. Each has a quiet
 * way past to Search, so nobody is held here. Nothing is sold on this screen.
 */
export default function FirstNight() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const { room: raw } = useLocalSearchParams<{ room?: string }>();
  const room: FirstRoom = raw === 'audition' || raw === 'script' ? raw : 'tonight';

  useEffect(() => { track('first_night_shown', { room }); }, [room]);

  const go = (action: string, href: Href) => {
    Haptics.selectionAsync().catch(() => {});
    track('first_night_action', { room, action });
    router.replace(href);
  };
  const past = (action: string) => go(action, '/search');

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}>
          <View style={{ width: 60 }} />
          <GhostLight size={18} />
          <Pressable onPress={() => past('skip')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip to Search" style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.foreground }}>Skip</Text>
          </Pressable>
        </View>
        <Animated.View entering={FadeIn.duration(360)} style={{ flex: 1, paddingHorizontal: 24, paddingTop: 10 }}>
          {room === 'audition' ? <AuditionRoom go={go} past={past} />
            : room === 'script' ? <ScriptRoom go={go} past={past} />
            : <TonightRoom go={go} past={past} />}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

type RoomProps = { go: (action: string, href: Href) => void; past: (action: string) => void };

function Head({ big, lit, line }: { big: string; lit: string; line: string }) {
  const { colors: c } = useTheme();
  return (
    <>
      <Text style={{ fontFamily: SERIF, fontSize: 42, lineHeight: 48, letterSpacing: -0.8, color: c.foreground }}>
        {big}{'\n'}<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{lit}</Text>
      </Text>
      <Text style={{ marginTop: 10, fontFamily: SANS, fontSize: 14.5, lineHeight: 20, color: c.mutedForeground }}>{line}</Text>
    </>
  );
}

function Quiet({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={{ minHeight: 44, marginTop: 6, alignItems: 'center', justifyContent: 'center' }}>
      <StageDirection>({label})</StageDirection>
    </Pressable>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ height: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1.5, borderColor: on ? c.accentText : c.border, backgroundColor: on ? c.panel : 'transparent', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.foreground }}>{label}</Text>
    </Pressable>
  );
}

/** Ten in the morning, `days` from today. */
function dayAt(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d;
}

/** The next given weekday after today, at ten. 5 is Friday. */
function nextWeekday(weekday: number, minDays: number): Date {
  const d = dayAt(minDays);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}

function AuditionRoom({ go, past }: RoomProps) {
  const { colors: c } = useTheme();
  const options = useMemo(() => [
    { key: 'tomorrow', label: 'Tomorrow', when: dayAt(1) },
    { key: 'week', label: 'This week', when: nextWeekday(5, 2) },
    { key: 'next', label: 'Next week', when: nextWeekday(2, 6) },
  ], []);
  const [picked, setPicked] = useState<string | null>(null);
  const when = options.find(o => o.key === picked)?.when;

  return (
    <>
      <Head big="When is" lit="the audition?" line="I count the days down and tell you what to run each night." />
      <View style={{ marginTop: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(o => (
          <Chip key={o.key} label={o.label} on={picked === o.key} onPress={() => { Haptics.selectionAsync().catch(() => {}); setPicked(picked === o.key ? null : o.key); }} />
        ))}
        <Chip label="Pick a date" on={false} onPress={() => go('date_by_hand', '/audition')} />
      </View>
      <PaperCard shadow={6} rotate={-0.6} style={{ marginTop: 26, padding: 18 }}>
        <Text style={{ fontFamily: MONO_B, fontSize: 17, color: c.paperInk }}>Got the casting email?</Text>
        <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 14, lineHeight: 20, color: c.paperBody }}>
          Paste it and I fill in the date, the room and what to bring.
        </Text>
        <PrimaryPill label="Paste the email" variant="outline" height={44} block style={{ marginTop: 14 }}
          onPress={() => go('paste_email', { pathname: '/audition', params: { paste: '1' } } as Href)} />
      </PaperCard>
      <View style={{ flex: 1 }} />
      <PrimaryPill label="Put it on my board" block height={54} disabled={!when}
        style={{ opacity: when ? 1 : 0.5 }}
        onPress={() => { if (when) go(`date_${picked}`, { pathname: '/audition', params: { when: when.toISOString() } } as Href); }} />
      <Quiet label="nothing booked yet. take me to search." onPress={() => past('no_audition')} />
    </>
  );
}

function ScriptRoom({ go, past }: RoomProps) {
  const { colors: c } = useTheme();
  const line = (who: string, words: string, you = false) => (
    <View>
      <Text style={{ fontFamily: MONO_B, fontSize: 13.5, lineHeight: 21, color: you ? c.paperInk : c.paperMuted }}>
        {who}{you ? <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontWeight: '400', color: c.accentText }}> (you.)</Text> : null}
      </Text>
      {you ? (
        <Text style={{ fontFamily: MONO, fontSize: 13.5, lineHeight: 21, color: '#15110f' }}>
          <Text style={{ backgroundColor: '#f2e22b' }}> {words} </Text>
        </Text>
      ) : (
        <Text style={{ fontFamily: MONO, fontSize: 13.5, lineHeight: 21, color: c.paperMuted }}>{words}</Text>
      )}
    </View>
  );
  const door = (icon: 'document-text-outline' | 'clipboard-outline', label: string, action: string, which: 'files' | 'paste') => (
    <Pressable onPress={() => go(action, { pathname: '/sides', params: { door: which } } as Href)} accessibilityRole="button"
      style={({ pressed }) => ({ flex: 1, height: 76, borderRadius: 16, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.75 : 1 })}>
      <Ionicons name={icon} size={20} color={c.accentText} />
      <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.foreground }}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <Head big="Bring" lit="your script." line="You say your lines. I read everyone else, out loud." />
      <PaperCard shadow={6} rotate={0.7} style={{ marginTop: 24, padding: 18, gap: 12 }}>
        {line('MEDVEDENKO', 'Why do you always wear black?')}
        {line('MASHA', 'I am in mourning for my life. I am unhappy.', true)}
        {line('MEDVEDENKO', "Why? I don't understand. You are in good health.")}
      </PaperCard>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {door('document-text-outline', 'A file', 'script_file', 'files')}
        {door('clipboard-outline', 'Paste it', 'script_paste', 'paste')}
      </View>
      <Quiet label="nothing on you? run one of mine." onPress={() => go('guided', '/demo')} />
      <Quiet label="take me to search." onPress={() => past('no_script')} />
    </>
  );
}

function TonightRoom({ go, past }: RoomProps) {
  const { colors: c } = useTheme();
  const [medium, setMedium] = useState<Medium>('theatre');
  const [plays, setPlays] = useState<Plays | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(PLAYS_KEY)
      .then((v) => { if (!v) return; const p = JSON.parse(v) as Plays; setPlays(p); if (p.house === 'screen') setMedium('screen'); })
      .catch(() => {});
  }, []);
  const tonight = useTonight(medium);
  const shelf = useHouseList(medium);
  const pool = useMemo(() => {
    const all: Monologue[] = tonight ? [tonight, ...shelf.filter(m => m.id !== tonight.id)] : shelf;
    return all.slice(0, 12);
  }, [tonight, shelf]);
  const [at, setAt] = useState(0);
  const piece = pool.length ? pool[at % pool.length] : null;

  const told = [plays?.house === 'screen' ? 'screen' : plays?.house === 'stage' ? 'stage' : null, plays?.age ? `your ${plays.age.toLowerCase()}` : null].filter(Boolean).join(', ');

  return (
    <>
      <Head big="Tonight's" lit="piece." line={told ? `Picked from what you told me: ${told}.` : 'One speech to start on. Two minutes, give or take.'} />
      {piece ? (
        <Pressable onPress={() => go('open', { pathname: '/read/[id]', params: { id: piece.id, medium } } as Href)} accessibilityRole="button" accessibilityLabel={`Open ${piece.character}, from ${piece.source}`}>
          <PaperCard key={piece.id} shadow={6} rotate={-0.8} style={{ marginTop: 26, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: MONO_B, fontSize: 21, lineHeight: 24, color: c.paperInk }}>{piece.character}</Text>
              <Text style={{ fontFamily: SANS_B, fontSize: 12, color: c.paperMuted }}>{formatDuration(piece.duration)}</Text>
            </View>
            <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: MONO, fontSize: 12.5, lineHeight: 17, color: c.paperMuted }}>
              {piece.source}{piece.author ? `, ${piece.author}` : ''}
            </Text>
            <View style={{ marginVertical: 14, height: 1.5, backgroundColor: c.paperInk }} />
            <Text numberOfLines={6} style={{ fontFamily: MONO, fontSize: 14, lineHeight: 22, color: c.paperBody }}>{`“${piece.excerpt}”`}</Text>
          </PaperCard>
        </Pressable>
      ) : (
        <View style={{ marginTop: 26, height: 260, alignItems: 'center', justifyContent: 'center' }}>
          <StageDirection>(finding one.)</StageDirection>
        </View>
      )}
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <PrimaryPill label="Read it" block height={54} disabled={!piece}
            onPress={() => { if (piece) go('open', { pathname: '/read/[id]', params: { id: piece.id, medium } } as Href); }} />
        </View>
        <PrimaryPill label="Another" variant="outline" height={54} disabled={pool.length < 2}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); track('first_night_action', { room: 'tonight', action: 'another' }); setAt(a => a + 1); }} />
      </View>
      <Quiet label="I know what I want. search." onPress={() => past('search')} />
    </>
  );
}
