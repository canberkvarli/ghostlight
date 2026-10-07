import { searchMonologues, type Monologue as ApiMonologue } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import type { Monologue, SourceType } from '../data/monologues';

/**
 * The Screen house (Film & TV).
 *
 * This used to query Supabase directly — `monologues` joined to `plays` and
 * `film_tv_references` — because the poster, year and rating were not on the
 * mobile API. That was a hole, not a shortcut. The select included `text`, so
 * every Film & TV search pulled the full words of sixty monologues with no
 * entitlement check whatsoever, and it did it with the publishable key that
 * ships inside the app. Anyone who pulled that key out of the binary could read
 * the catalogue without an account, a read, or a subscription. The reading
 * screen was never the leak; this list was.
 *
 * It now goes through the same FastAPI search the stage house uses, which
 * withholds the words server-side when a free reader is out of reads. The last
 * field keeping it on Supabase was the release year, and the API returns that
 * now too.
 *
 * With this gone, nothing in the app reads a content table directly, which is
 * what makes it safe to turn RLS on for `monologues`, `plays` and
 * `film_tv_references`. Do not turn it on until this has shipped in a *binary*
 * — an over-the-air update only reaches an installed app on its second launch,
 * so anyone still running the old bundle would find Film & TV simply empty.
 */

export interface ScreenFilters {
  // `null` is allowed so the API's SearchParams can be passed straight through.
  q?: string | null;
  gender?: string | null;
  age_range?: string | null;
  tone?: string | null;
  emotion?: string | null;
  max_duration?: number | null;
  /** Max overdone score 0–1 — freshness. Lower hides the well-worn pieces. */
  max_overdone_score?: number | null;
}

// normGender, normTone and firstTwoLines used to live here, duplicating what
// adapt.ts already does for every other list in the app. They went with the
// hand-rolled Supabase row mapping; apiToMonologue does all three now.

/**
 * `year` is newer than the committed OpenAPI snapshot, so read it defensively —
 * the same treatment `paywalled` gets in adapt.ts. Once `npm run api:types` has
 * been run against a deployed backend this can become `m.year`.
 */
function releaseYear(m: ApiMonologue): number | undefined {
  return (m as { year?: number | null }).year ?? undefined;
}

export async function searchScreen(
  filters: ScreenFilters = {},
  limit = 60,
  signal?: AbortSignal,
): Promise<Monologue[]> {
  const res = await searchMonologues(
    {
      ...filters,
      // The endpoint splits this on commas; the Screen house is both mediums.
      source_type: 'film,tv',
      // Freshness is a filter the reader chooses, not a default we impose. The
      // stage list works the same way.
      exclude_overdone: false,
      limit,
    },
    signal,
  );

  return res.results
    // Browse-by-poster means a card without a poster is a hole in the grid, not
    // a row with a missing image.
    .filter((m) => m.poster_url)
    // A known film/TV ingest defect: a few dozen rows carry a doubled-letter,
    // paren-suffixed character_name ("Aallii )"). Hide them rather than show
    // garbage — a clean row for the same piece usually exists. The real fix is
    // cleaning those rows in the database.
    .filter((m) => !(m.character_name ?? '').includes(')'))
    .map((m) => ({
      ...apiToMonologue(m),
      // apiToMonologue derives sourceType from `category`, which is a stage
      // notion. Here the medium is authoritative and comes from the play.
      sourceType: (m.source_type === 'film' ? 'film' : 'tv') as SourceType,
      // A film has a year where a play has a playwright, and the card shows
      // whichever it has in the same slot.
      author: releaseYear(m) ? String(releaseYear(m)) : m.author,
      posterUrl: m.poster_url ?? undefined,
      year: releaseYear(m),
      imdbRating: m.imdb_rating ?? undefined,
    }))
    // Least-overdone first, the same instinct as the stage list. The old
    // Supabase query ordered in the database; the API orders by relevance, so
    // the sort moves here rather than disappearing. One page of sixty.
    .sort((a, b) => a.overdoneScore - b.overdoneScore);
}

/**
 * The poster at the size a results card actually draws it. The card is 62pt
 * wide, 186px on a 3x phone, so TMDB's w185 is the match; the stored URL is
 * often the full-size one, which is most of a megabyte per row and is why the
 * lineup used to fill in one poster at a time. Any URL that isn't a TMDB size
 * path passes through untouched.
 */
export function posterThumb(url: string): string {
  return url.replace(/(image\.tmdb\.org\/t\/p\/)(original|w\d+)\//, '$1w185/');
}
