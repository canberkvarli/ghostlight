import type { SearchParams } from '../api/client';

/**
 * Filters, in two tiers.
 *
 * The *quick chips* (`FILTER_CHIPS`) sit free on the search home — the basics an
 * actor needs to find anything: gender, age, a broad tone, length. Lowercase
 * Courier-italic stage directions, not dropdowns (spec §5, Step 2). One value
 * per group — you are one gender on the form, one age band.
 *
 * The *advanced groups* (`ADVANCED_GROUPS`) live behind the premium
 * "(more filters.)" sheet: the fine tone palette, emotion, and freshness (hide
 * the pieces casting directors have heard a thousand times). Same chip style,
 * just more of them, and only for subscribers.
 */

export type FilterGroup =
  | 'gender'
  | 'age_range'
  | 'tone'
  | 'emotion'
  | 'max_duration'
  | 'freshness';

export type Selection = Record<FilterGroup, string | undefined>;

export const EMPTY_SELECTION: Selection = {
  gender: undefined,
  age_range: undefined,
  tone: undefined,
  emotion: undefined,
  max_duration: undefined,
  freshness: undefined,
};

export interface FilterChip {
  group: FilterGroup;
  /** The lit label, e.g. "(under 2 min.)". */
  label: string;
  /** The value handed to the search param. `max_duration` is seconds; `freshness` is a max overdone score 0–1. */
  value: string;
}

const chip = (group: FilterGroup, label: string, value: string): FilterChip => ({ group, label, value });

/** Free, inline on the search home. */
export const FILTER_CHIPS: FilterChip[] = [
  chip('gender', '(female.)', 'female'),
  chip('gender', '(male.)', 'male'),
  chip('age_range', '(teens.)', 'teens'),
  chip('age_range', '(20s.)', '20s'),
  chip('age_range', '(30s.)', '30s'),
  chip('age_range', '(40s+.)', '40s'),
  chip('tone', '(comedic.)', 'comedic'),
  chip('tone', '(dramatic.)', 'dramatic'),
  chip('max_duration', '(under 1 min.)', '60'),
  chip('max_duration', '(under 2 min.)', '120'),
];

export interface FilterGroupDef {
  group: FilterGroup;
  title: string;
  chips: FilterChip[];
}

/** Premium, inside the "(more filters.)" sheet. */
export const ADVANCED_GROUPS: FilterGroupDef[] = [
  {
    group: 'tone',
    title: 'Tone',
    chips: [
      chip('tone', '(comedic.)', 'comedic'),
      chip('tone', '(dramatic.)', 'dramatic'),
      chip('tone', '(dark.)', 'dark'),
      chip('tone', '(defiant.)', 'defiant'),
      chip('tone', '(anguished.)', 'anguished'),
      chip('tone', '(contemplative.)', 'contemplative'),
      chip('tone', '(philosophical.)', 'philosophical'),
    ],
  },
  {
    group: 'emotion',
    title: 'Emotion',
    chips: [
      chip('emotion', '(anger.)', 'anger'),
      chip('emotion', '(longing.)', 'longing'),
      chip('emotion', '(sadness.)', 'sadness'),
      chip('emotion', '(fear.)', 'fear'),
      chip('emotion', '(joy.)', 'joy'),
      chip('emotion', '(despair.)', 'despair'),
      chip('emotion', '(determination.)', 'determination'),
      chip('emotion', '(anticipation.)', 'anticipation'),
    ],
  },
  {
    group: 'freshness',
    title: 'Freshness',
    chips: [
      chip('freshness', '(fresh.)', '0.5'),
      chip('freshness', '(hidden gems.)', '0.3'),
    ],
  },
];

/** A chip is identified by its group+value; that pair is its selection key. */
export function chipKey(c: FilterChip): string {
  return `${c.group}:${c.value}`;
}

const FREE_TONES = new Set(['comedic', 'dramatic']);

/** How many selections live only in the premium sheet — the badge on "(more filters.)". */
export function advancedCount(sel: Selection): number {
  let n = 0;
  if (sel.emotion) n += 1;
  if (sel.freshness) n += 1;
  if (sel.tone && !FREE_TONES.has(sel.tone)) n += 1;
  return n;
}

/** Fold the current selection down to the query params the API takes. */
export function selectionToParams(selected: Selection): SearchParams {
  const params: SearchParams = {};
  if (selected.gender) params.gender = selected.gender;
  if (selected.age_range) params.age_range = selected.age_range;
  if (selected.tone) params.tone = selected.tone;
  if (selected.emotion) params.emotion = selected.emotion;
  if (selected.max_duration) params.max_duration = Number(selected.max_duration);
  if (selected.freshness) params.max_overdone_score = Number(selected.freshness);
  return params;
}
