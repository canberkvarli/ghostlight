import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { StageDirection } from './StageDirection';
import { PrimaryPill } from './PrimaryPill';
import { rowTitle, type MapGroup, type MapRow } from '../rehearsal/scene-map';
import { useTheme } from '../theme/ThemeContext';
import { useL } from '../i18n';

const CAP = 'CourierPrime_700Bold';
const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';

/**
 * The script as a map: every scene the quick read found, under its act or
 * episode, each with a box. Built scenes are ticked and locked; a scene with
 * one speaker is dimmed, because there is no other part for me to read.
 */
export function SceneMap({ groups, picked, onToggle, building, onBuild, note }: {
  groups: MapGroup[];
  picked: ReadonlySet<number>;
  onToggle: (index: number) => void;
  building: boolean;
  onBuild: () => void;
  /** A line under the button: what the plan allows. */
  note?: string | null;
}) {
  const { colors: c } = useTheme();
  const L = useL();
  const n = picked.size;
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 26 }}>
      <StageDirection numberOfLines={2}>{L('(tick the scenes you want. I build only those.)', '(istediğin sahneleri işaretle. sadece onları hazırlarım.)')}</StageDirection>
      <View style={{ marginTop: 10 }}>
        {groups.map((g, gi) => (
          <View key={`${g.act ?? ''}-${gi}`}>
            {g.act ? (
              <View style={{ marginTop: gi === 0 ? 8 : 20, marginBottom: 2, flexDirection: 'row', alignItems: 'baseline', gap: 8 }} accessibilityRole="header">
                <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: CAP, fontSize: 10.5, letterSpacing: 1.4, color: c.accentText }}>{g.act.toUpperCase()}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 11, color: c.mutedForeground }}>{g.rows.length}</Text>
              </View>
            ) : null}
            {g.rows.map(r => <Row key={r.scan.index} row={r} on={r.locked === 'built' || picked.has(r.scan.index)} onToggle={onToggle} />)}
          </View>
        ))}
      </View>
      <PrimaryPill
        label={building ? L('Sending', 'Gönderiliyor') : n === 1 ? L('Build this scene', 'Bu sahneyi hazırla') : L(`Build ${n} scenes`, `${n} sahneyi hazırla`)}
        onPress={onBuild}
        disabled={n === 0 || building}
        style={{ marginTop: 22, alignSelf: 'flex-start' }}
      />
      {note ? <StageDirection numberOfLines={2} style={{ marginTop: 10 }}>{note}</StageDirection> : null}
    </Animated.View>
  );
}

function Row({ row, on, onToggle }: { row: MapRow; on: boolean; onToggle: (index: number) => void }) {
  const { colors: c } = useTheme();
  const L = useL();
  const s = row.scan;
  const solo = row.locked === 'solo';
  const built = row.locked === 'built';
  const who = s.characters.slice(0, 3).join(', ');
  const aside = built ? L('(on your shelf.)', '(rafında.)')
    : solo ? L(`(only ${s.characters[0]} speaks. I need two parts.)`, `(sadece ${s.characters[0]} konuşuyor. iki rol gerekir.)`)
    : who ? `(${who.toLowerCase()} · ${L(`${s.line_count} lines`, `${s.line_count} replik`)}.)` : L(`(${s.line_count} lines.)`, `(${s.line_count} replik.)`);
  const box = (
    <View style={{
      width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
      borderColor: on ? c.accentText : c.border, backgroundColor: on ? c.accentText : 'transparent',
    }}>
      {on ? <Ionicons name={built ? 'lock-closed' : 'checkmark'} size={built ? 11 : 15} color={c.background} /> : null}
    </View>
  );
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingVertical: 8, opacity: solo ? 0.45 : built ? 0.7 : 1 }}>
      {solo ? <View style={{ width: 22, height: 22 }} /> : box}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ fontFamily: SANS, fontSize: 15, lineHeight: 21, color: c.foreground }}>{rowTitle(s)}</Text>
        <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: MONO_I, fontSize: 12, color: c.mutedForeground }}>{aside}</Text>
      </View>
    </View>
  );
  if (row.locked) return <View accessibilityState={{ disabled: true, checked: built }}>{body}</View>;
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onToggle(s.index); }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={rowTitle(s)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}
