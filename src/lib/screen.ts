import { supabase } from './supabase';
import type { Gender, Monologue, SourceType, Tone } from '../data/monologues';

/**
 * The Screen house (Film & TV), read straight from Supabase.
 *
 * Stage pieces go through the FastAPI search; screen pieces come from here —
 * `monologues` joined to `plays` (for the medium) and `film_tv_references` (for
 * the poster, year and rating). This is the one place the app talks to the
 * database directly, by design (the toggle is a browse-by-poster experience and
 * the metadata isn't on the mobile API yet).
 *
 * The full-text read still routes through the API by id, so the server paywall
 * and read-counter stay authoritative — this only feeds the browsing list.
 */

export interface ScreenFilters {
  // `null` is allowed so the API's SearchParams can be passed straight through.
  q?: string | null;
  gender?: string | null;
  age_range?: string | null;
  tone?: string | null;
  max_duration?: number | null;
}

function normGender(value: string | null): Gender {
  const g = (value ?? '').toLowerCase();
  if (g.includes('female') || g === 'f' || g === 'woman') return 'female';
  if (g.includes('male') || g === 'm' || g === 'man') return 'male';
  return 'any';
}

function normTone(value: string | null): Tone {
  const t = (value ?? '').toLowerCase();
  if (t.includes('comed')) return 'comedic';
  if (t.includes('serio') || t.includes('tragicomic')) return 'seriocomic';
  return 'dramatic';
}

function firstTwoLines(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n');
}

interface Row {
  id: number;
  title: string;
  character_name: string;
  character_gender: string | null;
  character_age_range: string | null;
  tone: string | null;
  estimated_duration_seconds: number | null;
  overdone_score: number | null;
  text: string;
  plays: {
    source_type: string | null;
    author: string | null;
    film_tv_references: {
      title: string | null;
      year: number | null;
      type: string | null;
      imdb_rating: number | null;
      poster_url: string | null;
    } | null;
  } | null;
}

export async function searchScreen(
  filters: ScreenFilters = {},
  limit = 60,
): Promise<Monologue[]> {
  let q = supabase
    .from('monologues')
    .select(
      `id, title, character_name, character_gender, character_age_range, tone,
       estimated_duration_seconds, overdone_score, text,
       plays!inner ( source_type, author,
         film_tv_references!inner ( title, year, type, imdb_rating, poster_url ) )`,
    )
    .in('plays.source_type', ['film', 'tv'])
    .not('plays.film_tv_references.poster_url', 'is', null);

  if (filters.gender && filters.gender !== 'any') {
    q = q.ilike('character_gender', `%${filters.gender}%`);
  }
  if (filters.age_range) q = q.ilike('character_age_range', `%${filters.age_range}%`);
  if (filters.tone) q = q.ilike('tone', `%${filters.tone}%`);
  if (filters.max_duration) q = q.lte('estimated_duration_seconds', filters.max_duration);
  if (filters.q?.trim()) {
    const term = filters.q.trim().replace(/[%,]/g, ' ');
    q = q.or(`title.ilike.%${term}%,character_name.ilike.%${term}%,text.ilike.%${term}%`);
  }

  // Least-overdone first — the same instinct as the stage list.
  q = q.order('overdone_score', { ascending: true, nullsFirst: false }).limit(limit);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Row[];
  return rows
    .filter((r) => r.plays?.film_tv_references?.poster_url)
    .map((r) => {
      const f = r.plays!.film_tv_references!;
      const source: SourceType = r.plays!.source_type === 'film' ? 'film' : 'tv';
      return {
        id: String(r.id),
        title: r.title,
        source: f.title ?? '—',
        author: f.year ? String(f.year) : (r.plays!.author ?? '—'),
        character: r.character_name,
        ageRange: r.character_age_range ?? '—',
        gender: normGender(r.character_gender),
        tone: normTone(r.tone),
        sourceType: source,
        duration: r.estimated_duration_seconds ?? 0,
        overdoneScore: Math.round((r.overdone_score ?? 0) * 100),
        excerpt: firstTwoLines(r.text),
        fullText: r.text,
        posterUrl: f.poster_url ?? undefined,
        year: f.year ?? undefined,
        imdbRating: f.imdb_rating ?? undefined,
      } satisfies Monologue;
    });
}
