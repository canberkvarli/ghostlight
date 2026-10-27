import type { Href } from 'expo-router';

/**
 * Why the paywall came up. Rides on `paywall_shown` as `trigger`, so the
 * dashboard can say which moment converts, and the paywall itself says it back
 * in one line, so the actor reads what they just did rather than a pitch.
 *
 * The earned moments: the fourth read of the day, the second run of the month,
 * the second script, the end of a Run it preview. The rest are the actor
 * asking for it (the curtain's "the week", Account, Settings) or a quiet lock
 * they tapped (copying, a filter).
 */
export type PaywallTrigger =
  | 'read_limit'
  | 'run_limit'
  | 'script_limit'
  | 'run_it'
  | 'curtain'
  | 'account'
  | 'copy'
  | 'filter';

/** The paywall, opened for a reason. */
export function paywallHref(trigger: PaywallTrigger): Href {
  return { pathname: '/paywall', params: { why: trigger } } as Href;
}

/** The line under the title, in the actor's terms. Null where the title is enough. */
export const WHY_LINE: Partial<Record<PaywallTrigger, string>> = {
  read_limit: '(that was three tonight. tomorrow brings three more.)',
  run_limit: '(one run with the partner is free each month.)',
  script_limit: '(one script of your own is free.)',
  run_it: '(the whole speech, run with you, every night.)',
  copy: '(copying the words comes with the whole stage.)',
};

export function asTrigger(value: unknown): PaywallTrigger | null {
  const v = typeof value === 'string' ? value : null;
  return v && ['read_limit', 'run_limit', 'script_limit', 'run_it', 'curtain', 'account', 'copy', 'filter'].includes(v)
    ? (v as PaywallTrigger)
    : null;
}
