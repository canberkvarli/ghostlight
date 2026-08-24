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

/**
 * Free, inline on the search home — kept deliberately lean: who you are
 * (gender, age). Everything about *how it plays* — tone, length, emotion,
 * freshness — lives in the premium sheet.
 */
/**
 * The free home row — a smart, small set: who you are and how long. Kept to four
 * so the screen stays calm. Everything here is free; the craft filters that a
 * working actor pays for live one tap deeper (tone, emotion, freshness).
 */
export const FILTER_CHIPS: FilterChip[] = [
  chip('gender', '(female.)', 'female'),
  chip('gender', '(male.)', 'male'),
  chip('age_range', '(20s.)', '20s'),
  chip('max_duration', '(under 2 min.)', '120'),
];

export interface FilterGroupDef {
  group: FilterGroup;
  title: string;
  /**
   * Craft filters — tone, emotion, and hiding the overdone. Free users see them
   * (the value is visible) but a tap routes to the paywall rather than toggling.
   * Identity and length stay free so anyone can find parts for themselves.
   */
  premium?: boolean;
  chips: FilterChip[];
}

/**
 * Everything in the "(more filters.)" sheet, grouped under stage-direction heads.
 * Free groups first (gender / age / length — the identity basics, handoff §5),
 * then the premium craft groups.
 */
export const SHEET_GROUPS: FilterGroupDef[] = [
  {
    group: 'gender',
    title: '(who.)',
    chips: [chip('gender', '(female.)', 'female'), chip('gender', '(male.)', 'male')],
  },
  {
    group: 'age_range',
    title: '(how old.)',
    chips: [
      chip('age_range', '(teens.)', 'teens'),
      chip('age_range', '(20s.)', '20s'),
      chip('age_range', '(30s.)', '30s'),
      chip('age_range', '(40s+.)', '40s'),
    ],
  },
  {
    group: 'max_duration',
    title: '(how long.)',
    chips: [
      chip('max_duration', '(under 1 min.)', '60'),
      chip('max_duration', '(under 2 min.)', '120'),
      chip('max_duration', '(under 3 min.)', '180'),
    ],
  },
  {
    group: 'tone',
    title: '(what key.)',
    premium: true,
    chips: [
      chip('tone', '(comedic.)', 'comedic'),
      chip('tone', '(dramatic.)', 'dramatic'),
      chip('tone', '(dark.)', 'dark'),
      chip('tone', '(defiant.)', 'defiant'),
      chip('tone', '(anguished.)', 'anguished'),
      chip('tone', '(contemplative.)', 'contemplative'),
    ],
  },
  {
    group: 'emotion',
    title: '(the feeling.)',
    premium: true,
    chips: [
      chip('emotion', '(anger.)', 'anger'),
      chip('emotion', '(longing.)', 'longing'),
      chip('emotion', '(grief.)', 'sadness'),
      chip('emotion', '(fear.)', 'fear'),
      chip('emotion', '(joy.)', 'joy'),
      chip('emotion', '(despair.)', 'despair'),
      chip('emotion', '(resolve.)', 'determination'),
    ],
  },
  {
    group: 'freshness',
    title: '(how fresh.)',
    premium: true,
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

/**
 * Chip labels without the stage-direction parentheses — the filter area had too
 * many "(…)" stacked up and got noisy. `(under 2 min.)` → `under 2 min`.
 */
export function chipText(label: string): string {
  return label.replace(/^\(/, '').replace(/\.?\)$/, '');
}

const HOME_KEYS = new Set(FILTER_CHIPS.map(chipKey));

/** Active selections that aren't one of the six home chips — the "(N more.)" hint. */
export function advancedCount(sel: Selection): number {
  let n = 0;
  for (const group of Object.keys(sel) as FilterGroup[]) {
    const v = sel[group];
    if (v && !HOME_KEYS.has(`${group}:${v}`)) n += 1;
  }
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
