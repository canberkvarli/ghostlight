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

/**
 * Enough of the opening to fill the card's three lines. Verse breaks are run
 * together on purpose: two short verse lines on their own lines left most of
 * the excerpt's space empty, and the card clamps the length anyway.
 */
function openingLines(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
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
    // Kept raw as well as normalised: the source tag needs to know classical
    // from contemporary, and `sourceType` has already thrown that away.
    category: m.category ?? undefined,
    // The setting, for the line above the speech. `scene_description` is the
    // richer of the two when it exists; `stage_directions` is the fallback.
    sceneNote: m.scene_description ?? m.stage_directions ?? undefined,
    duration: m.estimated_duration_seconds,
    // The API scores overdone-ness 0–1; the card and its badge think in 0–100.
    overdoneScore: Math.round((m.overdone_score ?? 0) * 100),
    excerpt: openingLines(m.text),
    segments: Array.isArray(m.text_segments) ? m.text_segments : undefined,
    fullText: m.text,
    // `paywalled` is newer than the committed OpenAPI snapshot; read defensively.
    paywalled: (m as { paywalled?: boolean }).paywalled ?? false,
    // For the theme sketch on a play's cover (src/lib/sketchFor.ts).
    themes: Array.isArray(m.themes) ? m.themes : undefined,
    emotion: m.primary_emotion ?? undefined,
    // Only the favourites route fills these; everywhere else they are absent.
    // `saved_at` is newer than the OpenAPI snapshot, so it is read defensively.
    savedAt: (m as { saved_at?: string | null }).saved_at ?? undefined,
    lastStudiedAt: m.last_studied_at ?? undefined,
    offBook: m.memorized === true ? true : undefined,
    notes: m.notes ?? undefined,
    cutStart: m.cut_start_line ?? undefined,
    cutEnd: m.cut_end_line ?? undefined,
  };
}
