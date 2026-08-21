import type { SearchParams } from '../api/client';

/**
 * The filter chips on the search home. Not dropdowns — a row of stage-direction
 * chips in lowercase Courier italic (spec §5, Step 2). Each maps to one search
 * query param. Within a group the selection is single (you are one gender on the
 * form, one age band), so tapping a chip replaces its group-mate.
 */

export type FilterGroup = 'gender' | 'age_range' | 'tone' | 'max_duration';

export interface FilterChip {
  group: FilterGroup;
  /** The lit label, e.g. "(under 2 min.)". */
  label: string;
  /** The value handed to the search param. `max_duration` is seconds. */
  value: string;
}

export const FILTER_CHIPS: FilterChip[] = [
  { group: 'gender', label: '(female.)', value: 'female' },
  { group: 'gender', label: '(male.)', value: 'male' },
  { group: 'age_range', label: '(teens.)', value: 'teens' },
  { group: 'age_range', label: '(20s.)', value: '20s' },
  { group: 'age_range', label: '(30s.)', value: '30s' },
  { group: 'age_range', label: '(40s+.)', value: '40s+' },
  { group: 'tone', label: '(comedic.)', value: 'comedic' },
  { group: 'tone', label: '(dramatic.)', value: 'dramatic' },
  { group: 'max_duration', label: '(under 1 min.)', value: '60' },
  { group: 'max_duration', label: '(under 2 min.)', value: '120' },
];

/** A chip is identified by its group+value; that pair is its selection key. */
export function chipKey(chip: FilterChip): string {
  return `${chip.group}:${chip.value}`;
}

/** Fold the current selection down to the query params the API takes. */
export function selectionToParams(selected: Record<FilterGroup, string | undefined>): SearchParams {
  const params: SearchParams = {};
  if (selected.gender) params.gender = selected.gender;
  if (selected.age_range) params.age_range = selected.age_range;
  if (selected.tone) params.tone = selected.tone;
  if (selected.max_duration) params.max_duration = Number(selected.max_duration);
  return params;
}
