import type { Monologue as ApiMonologue } from '../api/client';
import type { Gender, Monologue, SourceType, Tone } from './monologues';

/**
 * The list and the read screen speak in the fixture `Monologue` shape. The API
 * speaks `MonologueResponse` (character_name, play_title, estimated_duration…).
 * This is the one place those two vocabularies meet, so the card never learns
 * the server's field names and swapping fixtures for the API stays a one-import
 * change (spec §5, Step 3).
 */

function normalizeGender(value: string | null): Gender {
  const g = (value ?? '').toLowerCase();
  if (g.includes('female') || g === 'f' || g === 'woman') return 'female';
  if (g.includes('male') || g === 'm' || g === 'man') return 'male';
  return 'any';
}

function normalizeTone(value: string | null): Tone {
  const t = (value ?? '').toLowerCase();
  if (t.includes('comed')) return 'comedic';
  if (t.includes('serio') || t.includes('tragicomic')) return 'seriocomic';
  return 'dramatic';
}

function normalizeSourceType(category: string | null): SourceType {
  const c = (category ?? '').toLowerCase();
  if (c.includes('film') || c.includes('movie')) return 'film';
  if (c.includes('tv') || c.includes('television') || c.includes('series')) return 'tv';
  return 'play';
}

/** First two lines of the speech — what the card shows in Courier. */
function firstTwoLines(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n');
}

export function apiToMonologue(m: ApiMonologue): Monologue {
  return {
    id: String(m.id),
    title: m.title,
    source: m.play_title,
    author: m.author,
    character: m.character_name,
    ageRange: m.character_age_range ?? '—',
    gender: normalizeGender(m.character_gender),
    tone: normalizeTone(m.tone),
    sourceType: normalizeSourceType(m.category),
    duration: m.estimated_duration_seconds,
    // The API scores overdone-ness 0–1; the card and its badge think in 0–100.
    overdoneScore: Math.round((m.overdone_score ?? 0) * 100),
    excerpt: firstTwoLines(m.text),
    fullText: m.text,
    // `paywalled` is newer than the committed OpenAPI snapshot; read defensively.
    paywalled: (m as { paywalled?: boolean }).paywalled ?? false,
  };
}
