import { useQuery } from '@tanstack/react-query';

import { getTonight, getTrending, type TonightDay } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import type { Monologue } from '../data/monologues';
import { searchScreen } from '../lib/screen';
import { useSession } from '../lib/useSession';
import type { Medium } from '../theme/medium';

/**
 * Tonight's speech: one piece a day, the same one for everyone, one per house.
 *
 * Picked on the phone from the trending list by the date, so there is nothing
 * to build or schedule on the server, and every phone that fetched the same
 * list lands on the same piece. The list is sorted by id first so the order it
 * arrived in does not matter. Rolls over at local midnight.
 */

export function tonightIndex(count: number, now = new Date()): number {
  const day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
  // Knuth's multiplicative hash, so consecutive days do not walk the list in order.
  return (Math.imul(day, 2654435761) >>> 0) % count;
}

export function pickTonight(list: Monologue[], medium: Medium, now = new Date()): Monologue | null {
  const house = list
    .filter((m) => (medium === 'screen' ? m.sourceType !== 'play' : m.sourceType === 'play'))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (house.length === 0) return null;
  return house[tonightIndex(house.length, now)];
}

/**
 * Both shelves wait for a session. The backend wants a user on every list, and
 * on a first launch the curtain mounts while the anonymous session is still
 * being minted: the request went out with no token, came back 401, and with
 * `retry: false` the house stayed dark for ten minutes. Signed-in phones never
 * saw it because their session was already there. So: no session, no request;
 * the query wakes the moment one exists.
 */
function useHasSession(): boolean {
  const { session } = useSession();
  return Boolean(session);
}

/** The same query the trending rows read, so the two never cost two requests. */
export function useTrendingQuery() {
  const ready = useHasSession();
  return useQuery<Monologue[]>({
    queryKey: ['trending'],
    enabled: ready,
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => (await getTrending(20, signal)).map(apiToMonologue),
  });
}

export function useTrendingList(): Monologue[] {
  return useTrendingQuery().data ?? [];
}

/**
 * Film & TV has no trending list: the plays' shelf is plays only. Its shelf is
 * the screen search with nothing asked of it, the same rows the results page
 * shows when you open that house without typing, so tonight's speech on
 * screen is the same for everyone too.
 */
export function useScreenShelfQuery() {
  const ready = useHasSession();
  return useQuery<Monologue[]>({
    queryKey: ['screen-shelf'],
    enabled: ready,
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) => searchScreen({}, 20, signal),
  });
}

export function useScreenShelf(): Monologue[] {
  return useScreenShelfQuery().data ?? [];
}

/** The house's shelf: trending for the plays, the screen search for Film & TV. */
export function useHouseList(medium: Medium): Monologue[] {
  const trending = useTrendingList();
  const screen = useScreenShelf();
  return medium === 'screen' ? screen : trending;
}

/**
 * The shelf with its state, for the one screen that is nothing but the shelf.
 * `settled` is true once the request has answered, either way, so the curtain
 * can tell "still coming" from "nothing came".
 */
export function useHouse(medium: Medium): { list: Monologue[]; settled: boolean; failed: boolean; retry: () => void } {
  const trending = useTrendingQuery();
  const screen = useScreenShelfQuery();
  const q = medium === 'screen' ? screen : trending;
  return {
    list: q.data ?? [],
    settled: q.isSuccess || q.isError,
    failed: q.isError,
    retry: () => void q.refetch(),
  };
}

/** The local calendar date the way the server keys its run: `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The server's run of tonights for a house. Public, so it does not wait for a
 * session, and kept for the day: the server's answer does not change until
 * midnight either.
 */
export function useTonightRun(medium: Medium): TonightDay[] {
  const house = medium === 'screen' ? 'screen' : 'stage';
  const { data } = useQuery<TonightDay[]>({
    queryKey: ['tonight', house],
    retry: 1,
    staleTime: 60 * 60_000,
    queryFn: ({ signal }) => getTonight(house, 8, signal),
  });
  return data ?? [];
}

/** The piece the run names for a day, or null if the run does not reach it. */
export function runPick(run: TonightDay[], day: Date): Monologue | null {
  const key = dayKey(day);
  const hit = run.find((d) => d.day === key);
  return hit ? apiToMonologue(hit.monologue) : null;
}

/**
 * Tonight's speech: the server's pick when it has answered, the phone's own
 * from the shelf when it has not. The two use the same hash of the date, so
 * on the same pool they agree; the server's pool is the one the widget shows.
 */
export function useTonight(medium: Medium): Monologue | null {
  const run = useTonightRun(medium);
  const list = useHouseList(medium);
  return runPick(run, new Date()) ?? pickTonight(list, medium);
}
