import { describe, expect, it } from 'vitest';

import { actsIn, addAct, changes, groupByAct, layoutOf, moveTo, removeScene, renameAct, renameScene, settle, tidy, toRows, type LayoutRow, type LayoutScene } from './script-layout';

const sc = (id: number, act: string | null, title = `Scene ${id}`): LayoutScene => ({ id, title, act });
const SERIES = [sc(1, 'Episode 1: Pilot'), sc(2, 'Episode 1: Pilot'), sc(3, 'Episode 2'), sc(4, 'Episode 2')];
const shape = (rows: LayoutRow[]) => rows.map(r => (r.kind === 'head' ? `# ${r.act}` : r.scene.id));

describe('groupByAct', () => {
  it('keeps each heading once, where it first comes', () => {
    const g = groupByAct([sc(1, 'Act 1'), sc(2, 'Act 2'), sc(3, 'act  1')]);
    expect(g.map(x => [x.act, x.scenes.map(s => s.id)])).toEqual([['Act 1', [1, 3]], ['Act 2', [2]]]);
  });
  it('is one group with no heading when there are none', () => {
    expect(groupByAct([sc(1, null), sc(2, '  ')])).toEqual([{ act: null, scenes: [sc(1, null), sc(2, '  ')] }]);
  });
});

describe('toRows and layoutOf', () => {
  it('round-trips', () => {
    const rows = toRows(SERIES);
    expect(shape(rows)).toEqual(['# Episode 1: Pilot', 1, 2, '# Episode 2', 3, 4]);
    expect(layoutOf(rows)).toEqual(SERIES.map(s => ({ id: s.id, act: s.act })));
  });
});

describe('a drag', () => {
  it('refiles a scene under the heading it lands below', () => {
    const rows = toRows(SERIES);
    // Scene 2 dropped under Episode 2.
    const dragged = [rows[0], rows[1], rows[3], rows[2], rows[4], rows[5]];
    const out = settle(dragged);
    expect(layoutOf(out).find(x => x.id === 2)?.act).toBe('Episode 2');
  });
  it('a scene dragged above every heading has none', () => {
    const rows = toRows(SERIES);
    const out = settle([rows[2], ...rows.filter((_, i) => i !== 2)]);
    expect(layoutOf(out)[0]).toEqual({ id: 2, act: null });
  });
});

describe('moveTo', () => {
  it('puts the scene at the end of that act', () => {
    expect(shape(moveTo(toRows(SERIES), 1, 'Episode 2'))).toEqual(['# Episode 1: Pilot', 2, '# Episode 2', 3, 4, 1]);
  });
  it('a new name becomes a heading at the bottom', () => {
    const out = moveTo(toRows(SERIES), 4, 'Episode 3');
    expect(shape(out)).toEqual(['# Episode 1: Pilot', 1, 2, '# Episode 2', 3, '# Episode 3', 4]);
    expect(actsIn(out)).toEqual(['Episode 1: Pilot', 'Episode 2', 'Episode 3']);
  });
  it('no heading puts it at the top', () => {
    expect(shape(moveTo(toRows(SERIES), 3, null))).toEqual([3, '# Episode 1: Pilot', 1, 2, '# Episode 2', 4]);
  });
});

describe('renameAct', () => {
  it('renames a heading and its scenes follow', () => {
    const rows = toRows(SERIES);
    const out = renameAct(rows, rows[3].key, 'Episode 2: Fallout');
    expect(layoutOf(out).filter(x => x.act === 'Episode 2: Fallout').map(x => x.id)).toEqual([3, 4]);
  });
  it('renamed to one already there, the two become one', () => {
    const rows = toRows(SERIES);
    const out = renameAct(rows, rows[3].key, 'episode 1: pilot');
    expect(shape(out)).toEqual(['# Episode 1: Pilot', 1, 2, 3, 4]);
  });
  it('an empty name changes nothing', () => {
    const rows = toRows(SERIES);
    expect(renameAct(rows, rows[0].key, '  ')).toBe(rows);
  });
});

describe('the rest', () => {
  it('adds a heading once, and tidy drops an empty one', () => {
    const rows = addAct(toRows(SERIES), 'Episode 3');
    expect(addAct(rows, 'episode 3')).toBe(rows);
    expect(shape(tidy(rows))).toEqual(['# Episode 1: Pilot', 1, 2, '# Episode 2', 3, 4]);
  });
  it('renames and removes a scene', () => {
    const rows = removeScene(renameScene(toRows(SERIES), 1, '  The  ramparts '), 4);
    expect(rows.find(r => r.kind === 'scene' && r.scene.id === 1)).toMatchObject({ scene: { title: 'The ramparts' } });
    expect(layoutOf(rows).map(x => x.id)).toEqual([1, 2, 3]);
  });
});

describe('changes', () => {
  it('is nothing when nothing moved', () => {
    expect(changes(SERIES, toRows(SERIES))).toEqual({ deleted: [], renamed: [], layout: null });
  });
  it('names the deletes, the renames and the new layout', () => {
    let rows = toRows(SERIES);
    rows = removeScene(rows, 2);
    rows = renameScene(rows, 3, 'Cold open');
    rows = moveTo(rows, 1, 'Episode 2');
    const c = changes(SERIES, rows);
    expect(c.deleted).toEqual([2]);
    expect(c.renamed).toEqual([{ id: 3, title: 'Cold open' }]);
    expect(c.layout).toEqual([{ id: 3, act: 'Episode 2' }, { id: 4, act: 'Episode 2' }, { id: 1, act: 'Episode 2' }]);
  });
  it('a delete alone sends no layout', () => {
    expect(changes(SERIES, removeScene(toRows(SERIES), 4)).layout).toBeNull();
  });
});
