import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { LabelledField } from '../src/components/LabelledField';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useFavorites } from '../src/hooks/useFavorites';
import { useAuditions, useCreateAudition, useDeleteAudition, useUpdateAudition } from '../src/hooks/useAuditions';
import { KIND_LABEL, attachedPiece, type AuditionDraft, type AuditionKind } from '../src/api/auditions';
import { useSession } from '../src/lib/useSession';
import { useGoBack } from '../src/lib/nav';
import { dayLabel, defaultAuditionDate, localTimeZone, timeLabel } from '../src/lib/when';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * One audition, new or being changed. A modal over the list.
 *
 * Five things: when, which project, which role, where (or the tape link), and
 * which piece from the book. The web form asks a dozen more and this one
 * deliberately does not: on a phone, between the bus and the room, the point is
 * to get the date in so the reminder exists.
 */

const KINDS: AuditionKind[] = ['in_person', 'self_tape', 'virtual'];

export default function AuditionForm() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const goBack = useGoBack('/auditions');
  const { tiltX, tiltY } = useStageMotion();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isAuthenticated } = useSession();

  const { data: auditions } = useAuditions(isAuthenticated);
  const existing = useMemo(
    () => (id ? auditions?.find((a) => String(a.id) === id) ?? null : null),
    [auditions, id],
  );
  const { data: book } = useFavorites(isAuthenticated);

  const create = useCreateAudition();
  const update = useUpdateAudition();
  const remove = useDeleteAudition();
  const busy = create.isPending || update.isPending || remove.isPending;

  const [project, setProject] = useState('');
  const [role, setRole] = useState('');
  const [kind, setKind] = useState<AuditionKind>('in_person');
  const [when, setWhen] = useState<Date>(defaultAuditionDate());
  const [place, setPlace] = useState('');
  const [pieceId, setPieceId] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  // Fill from the server row once it arrives; never overwrite what someone has
  // already started typing.
  useEffect(() => {
    if (!existing || touched) return;
    setProject(existing.project);
    setRole(existing.role ?? '');
    setKind(existing.kind);
    if (existing.when) setWhen(new Date(existing.when));
    setPlace((existing.kind === 'self_tape' ? existing.tape_link : existing.location) ?? '');
    setPieceId(attachedPiece(existing)?.monologue_id ?? null);
  }, [existing, touched]);

  const tape = kind === 'self_tape';
  const placeLabel = tape ? 'Where to send the tape (optional)' : kind === 'virtual' ? 'Meeting link (optional)' : 'Where (optional)';
  const canSave = project.trim().length > 0 && !busy;

  const onSave = () => {
    if (!canSave) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const iso = when.toISOString();
    const draft: AuditionDraft = {
      project: project.trim(),
      role: role.trim() || null,
      kind,
      tz: localTimeZone(),
      starts_at: tape ? null : iso,
      due_at: tape ? iso : null,
      location: tape ? null : place.trim() || null,
      tape_link: tape ? place.trim() || null : null,
    };
    const done = () => goBack();
    const fail = () => Alert.alert("Couldn't save", 'Check your connection and try again.');
    if (existing) {
      update.mutate({ id: existing.id, draft, monologueId: pieceId, current: existing }, { onSuccess: done, onError: fail });
    } else {
      create.mutate({ draft, monologueId: pieceId }, { onSuccess: done, onError: fail });
    }
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert('Remove this audition?', 'Its reminders go with it. You can bring it back on the website for 30 days.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          remove.mutate(existing.id, { onSuccess: () => goBack() });
        },
      },
    ]);
  };

  const pickDate = (mode: 'date' | 'time') => {
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({
      value: when,
      mode,
      onChange: (_e, d) => {
        if (d) {
          setTouched(true);
          setWhen(d);
        }
      },
    });
  };

  const label = {
    fontFamily: 'BricolageGrotesque_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: c.mutedForeground,
  };

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* A modal's own header: close on the left, the act on the right. */}
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
            <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={c.mutedForeground} />
            </Pressable>
            {existing ? (
              <Pressable onPress={onDelete} hitSlop={12} accessibilityRole="button" accessibilityLabel="Remove audition" disabled={busy}>
                <Ionicons name="trash-outline" size={20} color={c.mutedForeground} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          >
            <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 40, lineHeight: 46, letterSpacing: -0.6, color: c.foreground }}>
              {existing ? 'Change ' : 'Next '}
              <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>
                {existing ? 'it.' : 'up.'}
              </Text>
            </Text>
            <StageDirection style={{ marginTop: 6 }}>
              {existing ? '(the reminders move with it.)' : "(we'll remind you the night before.)"}
            </StageDirection>

            {/* Kind: three words in a row, the chosen one in ink. */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 28 }}>
              {KINDS.map((k) => {
                const on = k === kind;
                return (
                  <Pressable
                    key={k}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setTouched(true);
                      setKind(k);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{
                      paddingHorizontal: 14,
                      height: 36,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: on ? c.foreground : c.border,
                      backgroundColor: on ? c.foreground : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, color: on ? c.background : c.foreground }}>
                      {KIND_LABEL[k]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <LabelledField
              label="Project"
              value={project}
              onChangeText={(t) => {
                setTouched(true);
                setProject(t);
              }}
              autoCapitalize="words"
              returnKeyType="next"
              style={{ marginTop: 22 }}
            />
            <LabelledField
              label="Role (optional)"
              value={role}
              onChangeText={(t) => {
                setTouched(true);
                setRole(t);
              }}
              autoCapitalize="words"
              returnKeyType="next"
              style={{ marginTop: 10 }}
            />

            {/* When. iOS draws its compact pickers inline; Android opens a dialog. */}
            <Text style={[label, { marginTop: 26 }]}>{tape ? 'Tape due' : 'When'}</Text>
            {Platform.OS === 'ios' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginLeft: -8 }}>
                <DateTimePicker
                  value={when}
                  mode="date"
                  display="compact"
                  minimumDate={new Date()}
                  themeVariant={c.isLight ? 'light' : 'dark'}
                  accentColor={c.accentText}
                  onChange={(_e, d) => {
                    if (d) {
                      setTouched(true);
                      setWhen(d);
                    }
                  }}
                />
                <DateTimePicker
                  value={when}
                  mode="time"
                  display="compact"
                  themeVariant={c.isLight ? 'light' : 'dark'}
                  accentColor={c.accentText}
                  onChange={(_e, d) => {
                    if (d) {
                      setTouched(true);
                      setWhen(d);
                    }
                  }}
                />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <WhenChip label={dayLabel(when.toISOString())} onPress={() => pickDate('date')} />
                <WhenChip label={timeLabel(when.toISOString())} onPress={() => pickDate('time')} />
              </View>
            )}

            <LabelledField
              label={placeLabel}
              value={place}
              onChangeText={(t) => {
                setTouched(true);
                setPlace(t);
              }}
              autoCapitalize={tape || kind === 'virtual' ? 'none' : 'words'}
              keyboardType={tape || kind === 'virtual' ? 'url' : 'default'}
              autoCorrect={!(tape || kind === 'virtual')}
              style={{ marginTop: 16 }}
            />

            {/* The piece. Chips from the book; one at a time. */}
            <Text style={[label, { marginTop: 26 }]}>From your book</Text>
            {book && book.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 8, paddingVertical: 10, paddingRight: 24 }}
                style={{ marginHorizontal: -24, paddingHorizontal: 24 }}
              >
                {book.map((m) => {
                  const mid = Number(m.id);
                  const on = pieceId === mid;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setTouched(true);
                        setPieceId(on ? null : mid);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${m.title}, ${m.character}`}
                      style={{
                        maxWidth: 220,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 6,
                        borderWidth: 1.5,
                        borderColor: on ? c.ink : c.paperRule,
                        backgroundColor: c.paper,
                        // The chosen page sits square; the rest lean, like the shelf.
                        transform: [{ rotate: on ? '0deg' : '-0.6deg' }],
                      }}
                    >
                      <Text numberOfLines={1} style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 16, color: c.paperInk }}>
                        {m.title}
                      </Text>
                      <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: 'CourierPrime_400Regular', fontSize: 11, color: c.paperMuted }}>
                        {m.character}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <StageDirection style={{ marginTop: 10 }}>(save a piece and it can come with you.)</StageDirection>
            )}

            <PrimaryPill
              label={existing ? 'Save changes' : 'Put it on the board'}
              onPress={onSave}
              disabled={!canSave}
              block
              style={{ marginTop: 32 }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function WhenChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ paddingHorizontal: 14, height: 40, borderRadius: 999, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 14, color: c.foreground }}>{label}</Text>
    </Pressable>
  );
}
