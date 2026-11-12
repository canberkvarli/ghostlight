import { describe, expect, it } from 'vitest';

import { firstPicks, groupScan, isSolo, picksOf, rowTitle, sceneAllowance, tickRoom, tickable, toggleTick, worthAsking, type ScannedScene } from './scene-map';

function row(index: number, over: Partial<ScannedScene> = {}): ScannedScene {
  return {
    index, act_label: null, scene_label: `Scene ${index + 1}`, title: null, characters: ['A', 'B'], line_count: 20,
    char_start: index * 100, char_end: index * 100 + 99, page_start: null, page_end: null, ...over,
  };
}

describe('isSolo', () => {
  it('is exactly one speaker, not an empty cast', () => {
    expect(isSolo({ characters: ['HAMLET'] })).toBe(true);
    expect(isSolo({ characters: [] })).toBe(false);
    expect(isSolo({ characters: ['A', 'B'] })).toBe(false);
  });
});

describe('groupScan', () => {
  it('puts scenes under their act in page order', () => {
    const g = groupScan([
      row(0, { act_label: 'Act 1' }), row(1, { act_label: 'Act 1' }), row(2, { act_label: 'Act 2' }),
    ]);
    expect(g.map(x => x.act)).toEqual(['Act 1', 'Act 2']);
    expect(g[0].rows.map(r => r.scan.index)).toEqual([0, 1]);
  });

  it('keeps episode headings as they are', () => {
    const g = groupScan([row(0, { act_label: 'Episode 1: Pilot' }), row(1, { act_label: 'Episode 2: Fallout' })]);
    expect(g.map(x => x.act)).toEqual(['Episode 1: Pilot', 'Episode 2: Fallout']);
  });

  it('is one flat group when there are no headings', () => {
    const g = groupScan([row(0), row(1), row(2)]);
    expect(g).toHaveLength(1);
    expect(g[0].act).toBeNull();
    expect(g[0].rows).toHaveLength(3);
  });

  it('locks built and solo rows', () => {
    const g = groupScan([row(0), row(1, { characters: ['HAMLET'] }), row(2)], [2]);
    expect(g[0].rows.map(r => r.locked)).toEqual([null, 'solo', 'built']);
    expect(tickable(g).map(s => s.index)).toEqual([0]);
  });

  it('a heading met again joins its group', () => {
    const g = groupScan([row(0, { act_label: 'Act 1' }), row(1, { act_label: 'act  1' })]);
    expect(g).toHaveLength(1);
  });
});

describe('the allowance', () => {
  it('free has one, paid none', () => {
    expect(sceneAllowance(false)).toBe(1);
    expect(sceneAllowance(true)).toBeNull();
  });

  it('counts what is built already', () => {
    expect(tickRoom(1, 0)).toBe(1);
    expect(tickRoom(1, 1)).toBe(0);
    expect(tickRoom(1, 4)).toBe(0);
    expect(tickRoom(null, 9)).toBeNull();
  });
});

describe('toggleTick', () => {
  it('refuses a second tick on free, and says why', () => {
    const a = toggleTick(new Set(), 0, 1);
    expect([...a.picked]).toEqual([0]);
    expect(a.overLimit).toBe(false);
    const b = toggleTick(a.picked, 3, 1);
    expect([...b.picked]).toEqual([0]);
    expect(b.overLimit).toBe(true);
  });

  it('unticks freely and has no cap when paid', () => {
    expect([...toggleTick(new Set([0]), 0, 1).picked]).toEqual([]);
    const p = toggleTick(toggleTick(new Set(), 0, null).picked, 1, null);
    expect([...p.picked].sort()).toEqual([0, 1]);
    expect(p.overLimit).toBe(false);
  });

  it('refuses every tick when there is no room', () => {
    expect(toggleTick(new Set(), 0, 0).overLimit).toBe(true);
  });
});

describe('firstPicks', () => {
  it('ticks the first scene that can be built', () => {
    const g = groupScan([row(0, { characters: ['X'] }), row(1), row(2)]);
    expect([...firstPicks(g, 1)]).toEqual([1]);
    expect([...firstPicks(g, null)]).toEqual([1]);
  });
  it('ticks nothing with no room', () => {
    expect([...firstPicks(groupScan([row(0)]), 0)]).toEqual([]);
  });
});

describe('picksOf', () => {
  it('hands back the picked rows in script order', () => {
    const scan = [row(0), row(1), row(2)];
    expect(picksOf(scan, new Set([2, 0])).map(s => s.index)).toEqual([0, 2]);
  });
});

describe('worthAsking', () => {
  it('needs two scenes and one buildable', () => {
    expect(worthAsking(null)).toBe(false);
    expect(worthAsking({ page_count: 1, has_structure: false, num_acts: 0, scenes: [row(0)] })).toBe(false);
    expect(worthAsking({ page_count: 1, has_structure: false, num_acts: 0, scenes: [row(0, { characters: ['A'] }), row(1, { characters: ['B'] })] })).toBe(false);
    expect(worthAsking({ page_count: 1, has_structure: true, num_acts: 1, scenes: [row(0), row(1)] })).toBe(true);
  });
});

describe('rowTitle', () => {
  it('joins a label and a different title, else whichever there is', () => {
    expect(rowTitle(row(0, { scene_label: 'Scene 1', title: 'The ramparts' }))).toBe('Scene 1: The ramparts');
    expect(rowTitle(row(0, { scene_label: 'Scene 1', title: 'scene 1' }))).toBe('Scene 1');
    expect(rowTitle(row(4, { scene_label: null, title: null }))).toBe('Scene 5');
  });
});
