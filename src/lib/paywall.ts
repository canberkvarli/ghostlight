import type { Href } from 'expo-router';

import { pick } from '../i18n/pick';

/**
 * Why the paywall came up. Rides on `paywall_shown` as `trigger`, so the
 * dashboard can say which moment converts, and the paywall itself says it back
 * in one line, so the actor reads what they just did rather than a pitch.
 *
 * The earned moments: the fourth read of the day, the second run of the month,
 * the second script, the end of a Run it preview. The rest are the actor
 * asking for it (the curtain's "the week", Account, Settings) or a quiet lock
 * they tapped (copying, a filter). `welcome` is the end of the three questions,
 * before the first night's room.
 */
export type PaywallTrigger =
  | 'read_limit'
  | 'run_limit'
  | 'script_limit'
  | 'scene_limit'
  | 'run_it'
  | 'curtain'
  | 'account'
  | 'copy'
  | 'filter'
  | 'tape_mark'
  | 'welcome';

/** The paywall, opened for a reason. */
export function paywallHref(trigger: PaywallTrigger): Href {
  return { pathname: '/paywall', params: { why: trigger } } as Href;
}

/**
 * The line under the title, in the actor's terms. Null where the title is enough.
 * Getters, so each line is read in the language of the moment it is shown.
 */
export const WHY_LINE: Partial<Record<PaywallTrigger, string>> = {
  get read_limit() { return pick('(three tonight. three more tomorrow.)', '(bu gece üç. yarın üç daha.)'); },
  get run_limit() { return pick('(one partner run a month is free.)', '(ayda bir partner provası ücretsiz.)'); },
  get script_limit() { return pick('(one script of your own is free.)', '(kendi metinlerinden biri ücretsiz.)'); },
  get scene_limit() { return pick('(one scene of each script is free. the rest come with the whole stage.)', '(her metinden bir sahne ücretsiz. gerisi sahnenin tamamıyla gelir.)'); },
  get run_it() { return pick('(the whole speech, run with you.)', '(monoloğun tamamı, seninle.)'); },
  get copy() { return pick('(copying comes with the whole stage.)', '(kopyalama, sahnenin tamamıyla gelir.)'); },
  get welcome() { return pick('(everything, from your first night.)', '(her şey, ilk geceden itibaren.)'); },
  get tape_mark() { return pick('(your tapes, saved clean.)', '(kayıtların, filigransız.)'); },
};

export function asTrigger(value: unknown): PaywallTrigger | null {
  const v = typeof value === 'string' ? value : null;
  return v && ['read_limit', 'run_limit', 'script_limit', 'scene_limit', 'run_it', 'curtain', 'account', 'copy', 'filter', 'tape_mark', 'welcome'].includes(v)
    ? (v as PaywallTrigger)
    : null;
}
