import * as SQLite from 'expo-sqlite';

import type { Gender, Monologue, SourceType, Tone } from '../data/monologues';

/**
 * Offline copies of saved monologues (spec §6 — a paid feature, so it must be
 * real, not a wish). When a paid actor saves a piece we mirror the whole thing
 * — full text and all — into on-device SQLite, so their shelf and their reading
 * survive a plane, a subway, a green room with no signal. The server stays the
 * source of truth; this is a durable cache that the Saves and Read screens fall
 * back to when the network isn't there.
 */

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('ghostlight.db').then(async (d) => {
      await d.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS saved_monologues (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          source TEXT NOT NULL,
          author TEXT NOT NULL,
          character TEXT NOT NULL,
          age_range TEXT NOT NULL,
          gender TEXT NOT NULL,
          tone TEXT NOT NULL,
          source_type TEXT NOT NULL,
          duration INTEGER NOT NULL,
          overdone_score INTEGER NOT NULL,
          excerpt TEXT NOT NULL,
          full_text TEXT,
          saved_at INTEGER NOT NULL
        );
      `);
      return d;
    });
  }
  return dbPromise;
}

interface Row {
  id: string;
  title: string;
  source: string;
  author: string;
  character: string;
  age_range: string;
  gender: string;
  tone: string;
  source_type: string;
  duration: number;
  overdone_score: number;
  excerpt: string;
  full_text: string | null;
}

function rowToMonologue(r: Row): Monologue {
  return {
    id: r.id,
    title: r.title,
    source: r.source,
    author: r.author,
    character: r.character,
    ageRange: r.age_range,
    gender: r.gender as Gender,
    tone: r.tone as Tone,
    sourceType: r.source_type as SourceType,
    duration: r.duration,
    overdoneScore: r.overdone_score,
    excerpt: r.excerpt,
    fullText: r.full_text ?? undefined,
  };
}

export async function saveOffline(m: Monologue): Promise<void> {
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO saved_monologues
      (id, title, source, author, character, age_range, gender, tone, source_type,
       duration, overdone_score, excerpt, full_text, saved_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      m.id, m.title, m.source, m.author, m.character, m.ageRange, m.gender, m.tone,
      m.sourceType, m.duration, m.overdoneScore, m.excerpt, m.fullText ?? null, Date.now(),
    ],
  );
}

export async function removeOffline(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM saved_monologues WHERE id = ?', [id]);
}

export async function listOffline(): Promise<Monologue[]> {
  const d = await db();
  const rows = await d.getAllAsync<Row>('SELECT * FROM saved_monologues ORDER BY saved_at DESC');
  return rows.map(rowToMonologue);
}

export async function getOffline(id: string): Promise<Monologue | null> {
  const d = await db();
  const row = await d.getFirstAsync<Row>('SELECT * FROM saved_monologues WHERE id = ?', [id]);
  return row ? rowToMonologue(row) : null;
}
