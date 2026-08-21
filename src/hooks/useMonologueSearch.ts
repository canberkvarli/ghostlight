import { useQuery } from '@tanstack/react-query';

import { searchMonologues, type SearchParams } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import type { Monologue } from '../data/monologues';

/**
 * The main search (spec §4, `GET /api/monologues/search`), as a react-query
 * hook. Returns the card's view-model directly so the results list never touches
 * the raw API shape.
 *
 * Enabled only once there is something to search — an empty query with no
 * filters is the discover case, which the list handles with fixtures until the
 * server-side session exists. `retry: false` because the interesting failure
 * here (401, anonymous sign-ins still disabled) will not fix itself on a retry.
 */

export interface SearchResult {
  monologues: Monologue[];
  total: number;
  correctedQuery?: string | null;
}

export function useMonologueSearch(params: SearchParams, enabled: boolean) {
  return useQuery<SearchResult>({
    queryKey: ['monologue-search', params],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const res = await searchMonologues({ limit: 30, ...params }, signal);
      return {
        monologues: res.results.map(apiToMonologue),
        total: res.total,
        correctedQuery: res.corrected_query,
      };
    },
  });
}
