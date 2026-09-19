import { useQuery } from '@tanstack/react-query';

import { searchMonologues } from '../api/client';

/**
 * How big the library actually is.
 *
 * The paywall used to promise "all 14,000+", typed by hand. The catalogue has
 * since grown past nineteen thousand, so the one number the offer is built on
 * was understating the product by about a third — and it would have gone on
 * being wrong, quietly, because nothing about a string literal ever tells you it
 * has expired.
 *
 * There is no dedicated count endpoint, but there does not need to be: a search
 * with no query and no filters is "everything", and the response carries `total`
 * alongside the page of results. Ask for a single row and read the total off it.
 *
 * Cached for a day and kept in the query cache besides — the number moves when
 * the ingest runs, not while someone is deciding whether to subscribe.
 */

/**
 * What to say before the network answers, and if it never does.
 *
 * Deliberately a round number BELOW the real one. An offer screen that opens on
 * a precise figure and then corrects itself looks broken; one that opens
 * understated and settles upward does not, and if the request fails the app has
 * still promised less than it delivers. Update it when it starts to embarrass.
 */
export const CATALOGUE_FALLBACK = 19000;

/** `19,240` → `19,000+`. Nobody needs the exact figure, and it moves weekly. */
export function roundedCatalogue(total: number): string {
  if (total < 1000) return String(total);
  const thousands = Math.floor(total / 1000);
  return `${thousands.toLocaleString('en-US')},000+`;
}

export function useCatalogueSize(): { total: number; label: string } {
  const { data } = useQuery({
    queryKey: ['catalogue-size'],
    retry: false,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async ({ signal }) => {
      // One row, because the rows are not the point — `total` is.
      const res = await searchMonologues({ limit: 1 }, signal);
      return typeof res.total === 'number' && res.total > 0 ? res.total : CATALOGUE_FALLBACK;
    },
  });

  const total = data ?? CATALOGUE_FALLBACK;
  return { total, label: roundedCatalogue(total) };
}
