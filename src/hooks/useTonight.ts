import { useQuery } from '@tanstack/react-query';

import { getTrending } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import type { Monologue } from '../data/monologues';
import { searchScreen } from '../lib/screen';
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

/** The same query the trending rows read, so the two never cost two requests. */
export function useTrendingList(): Monologue[] {
  const { data } = useQuery<Monologue[]>({
    queryKey: ['trending'],
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => (await getTrending(20, signal)).map(apiToMonologue),
  });
  return data ?? [];
}

/**
 * Film & TV has no trending list: the plays' shelf is plays only. Its shelf is
 * the screen search with nothing asked of it, the same rows the results page
 * shows when you open that house without typing, so tonight's speech on
 * screen is the same for everyone too.
 */
export function useScreenShelf(): Monologue[] {
  const { data } = useQuery<Monologue[]>({
    queryKey: ['screen-shelf'],
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) => searchScreen({}, 20, signal),
  });
  return data ?? [];
}

/** The house's shelf: trending for the plays, the screen search for Film & TV. */
export function useHouseList(medium: Medium): Monologue[] {
  const trending = useTrendingList();
  const screen = useScreenShelf();
  return medium === 'screen' ? screen : trending;
}

export function useTonight(medium: Medium): Monologue | null {
  const list = useHouseList(medium);
  return pickTonight(list, medium);
}
