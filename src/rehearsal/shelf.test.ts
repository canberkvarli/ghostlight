import { describe, expect, it } from 'vitest';

import type { ScriptSummary } from '../api/rehearsal';
import { findInShelf, groupShelf, shelfGenres, sortShelf } from './shelf';

const NOW = new Date('2026-10-27T12:00:00Z').getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
let next = 1;
function script(over: Partial<ScriptSummary> = {}): ScriptSummary {
  return {
    id: next++, title: 'Untitled', author: 'Someone', original_filename: 'x.pdf', file_type: 'pdf',
    processing_status: 'completed', processing_error: null, num_characters: 2, num_scenes_extracted: 3,
    characters: [], created_at: daysAgo(90), is_sample: false, first_scene_title: null, scene_titles: [],
    ...over,
  };
}

describe('groupShelf', () => {
  it('keeps a short shelf as one list', () => {
    const list = [script(), script({ last_rehearsed_at: daysAgo(1) })];
    expect(groupShelf(list, {}, NOW).grouped).toBe(false);
  });
  it('puts what was run, opened or is being read in the last fortnight on top', () => {
    const ran = script({ title: 'Ran', last_rehearsed_at: daysAgo(3) });
    const opened = script({ title: 'Opened' });
    const reading = script({ title: 'Reading', processing_status: 'processing' });
    const old = [1, 2, 3, 4].map((i) => script({ title: `Old ${i}` }));
    const { working, rest, grouped } = groupShelf([...old, ran, opened, reading], { [opened.id]: daysAgo(2) }, NOW);
    expect(grouped).toBe(true);
    expect(working.map((s) => s.title)).toEqual(['Ran', 'Opened', 'Reading']);
    expect(rest).toHaveLength(4);
  });
  it('does not split when nothing is old', () => {
    const list = Array.from({ length: 7 }, () => script({ created_at: daysAgo(1) }));
    expect(groupShelf(list, {}, NOW).grouped).toBe(false);
  });
});

describe('sortShelf', () => {
  it('sorts by what was worked on last, newest, title and scene count', () => {
    const a = script({ title: 'Beta', created_at: daysAgo(10), num_scenes_extracted: 1 });
    const b = script({ title: 'alpha', created_at: daysAgo(20), last_rehearsed_at: daysAgo(1), num_scenes_extracted: 9 });
    expect(sortShelf([a, b], 'recent', {}).map((s) => s.title)).toEqual(['alpha', 'Beta']);
    expect(sortShelf([a, b], 'newest', {}).map((s) => s.title)).toEqual(['Beta', 'alpha']);
    expect(sortShelf([a, b], 'title', {}).map((s) => s.title)).toEqual(['alpha', 'Beta']);
    expect(sortShelf([a, b], 'scenes', {}).map((s) => s.title)).toEqual(['alpha', 'Beta']);
  });
});

describe('findInShelf', () => {
  it('finds inside the script and says why', () => {
    const hamlet = script({ title: 'Hamlet', author: 'Shakespeare', characters: [{ name: 'OPHELIA' }], scene_titles: ['The Nunnery'] });
    const other = script({ title: 'Ophelia Rising' });
    const hits = findInShelf([hamlet, other], 'ophel');
    expect(hits.map((h) => h.script.title)).toEqual(['Ophelia Rising', 'Hamlet']);
    expect(hits[1].why).toBe('a part: OPHELIA');
    expect(findInShelf([hamlet], 'nunnery')[0].why).toBe('a scene: The Nunnery');
    expect(findInShelf([hamlet], 'shakes')[0].why).toBe('by Shakespeare');
  });
});

describe('shelfGenres', () => {
  it('lists the genres, the most common first', () => {
    const list = [script({ genres: ['Drama', 'Comedy'] }), script({ genres: ['Drama'] }), script({ genre: 'Thriller' })];
    expect(shelfGenres(list)).toEqual(['Drama', 'Comedy', 'Thriller']);
  });
});
