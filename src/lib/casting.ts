import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { SHEET_GROUPS, type FilterChip, type Selection } from '../data/filters';
import type { Medium } from '../theme/medium';

/**
 * Who you play: the casting profile on the You screen. Four facts an actor
 * carries into every search (gender, playing age, the key they are usually
 * cast in, and which house), kept on the phone and handed to the search
 * room as its starting filters, so a search starts where the actor is
 * unless they change it.
 *
 * The phone, not the server: the web's actor profile stores age as "25-35"
 * and gender as "Male", a different alphabet from the search filters, and a
 * lossy translation in both directions would quietly rewrite a profile the
 * actor typed on the web. The search is the point of this, and the search
 * speaks the filter chips' values, so the profile is kept in those.
 */
export interface Casting {
  gender?: string;
  age_range?: string;
  tone?: string;
  medium?: Medium;
}

const KEY = 'ghostlight:casting.v1';
const QUERY_KEY = ['casting'] as const;

/** The groups the profile is drawn from, with the chips the filter sheet already has. */
export const CASTING_GROUPS: { key: keyof Casting; title: string; chips: FilterChip[] }[] = [
  { key: 'gender', title: '(you play.)', chips: SHEET_GROUPS.find(g => g.group === 'gender')?.chips ?? [] },
  { key: 'age_range', title: '(your age, on stage.)', chips: SHEET_GROUPS.find(g => g.group === 'age_range')?.chips ?? [] },
  { key: 'tone', title: '(your key.)', chips: SHEET_GROUPS.find(g => g.group === 'tone')?.chips ?? [] },
  {
    key: 'medium',
    title: '(your house.)',
    chips: [
      { group: 'gender', label: '(stage.)', value: 'theatre' },
      { group: 'gender', label: '(screen.)', value: 'screen' },
    ],
  },
];

export async function loadCasting(): Promise<Casting> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as Casting;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

export async function saveCasting(c: Casting): Promise<void> {
  const clean: Casting = {};
  if (c.gender) clean.gender = c.gender;
  if (c.age_range) clean.age_range = c.age_range;
  if (c.tone) clean.tone = c.tone;
  if (c.medium) clean.medium = c.medium;
  await AsyncStorage.setItem(KEY, JSON.stringify(clean));
}

/** The label the chips print for a stored value, "(male.)" for 'male'. */
export function castingLabel(key: keyof Casting, value: string | undefined): string | null {
  if (!value) return null;
  const chip = CASTING_GROUPS.find(g => g.key === key)?.chips.find(ch => ch.value === value);
  return chip?.label ?? `(${value}.)`;
}

/** Everything the profile says, in the order the chips sit on the card. */
export function castingChips(c: Casting): { key: keyof Casting; label: string }[] {
  return CASTING_GROUPS
    .map(g => ({ key: g.key, label: castingLabel(g.key, c[g.key]) }))
    .filter((x): x is { key: keyof Casting; label: string } => x.label !== null);
}

/**
 * The search's starting filters, from the profile. Tone is a premium filter,
 * so a free actor's key stays on the card and off the search: handing the
 * search a locked filter would route their first tap to the paywall.
 */
export function castingToSelection(c: Casting, paid: boolean): Partial<Selection> {
  const sel: Partial<Selection> = {};
  if (c.gender) sel.gender = c.gender;
  if (c.age_range) sel.age_range = c.age_range;
  if (c.tone && paid) sel.tone = c.tone;
  return sel;
}

export function useCasting(): { casting: Casting; loaded: boolean; set: (c: Casting) => Promise<void> } {
  const qc = useQueryClient();
  const { data, isFetched } = useQuery({ queryKey: QUERY_KEY, queryFn: loadCasting, staleTime: Infinity, gcTime: Infinity });
  const set = useCallback(
    async (c: Casting) => {
      qc.setQueryData(QUERY_KEY, c);
      await saveCasting(c);
    },
    [qc],
  );
  return { casting: data ?? {}, loaded: isFetched, set };
}
