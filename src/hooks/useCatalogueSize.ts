import { useQuery } from '@tanstack/react-query';

import { getCatalogueCount } from '../api/client';

/**
 * How big the library is, for the one line on the paywall that says so.
 * The count comes off the database stats route: the search endpoint's
 * `total` is the size of the page it drew, which is how the paywall once
 * promised "all 1". Cached for a day; nobody needs it fresher.
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
      return (await getCatalogueCount(signal)) ?? CATALOGUE_FALLBACK;
    },
  });

  const total = data ?? CATALOGUE_FALLBACK;
  return { total, label: roundedCatalogue(total) };
}
