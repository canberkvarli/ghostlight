import { describe, expect, it } from 'vitest';
import { TurnItems } from './turn-items';

describe('TurnItems', () => {
  it('deltas of one item accumulate', () => {
    const t = new TurnItems();
    expect(t.delta('a', 'Out.')).toBe(true);
    expect(t.delta('a', ' Twenty')).toBe(true);
    expect(t.text()).toBe('Out. Twenty');
  });

  it('a late delta from a retired item is dropped', () => {
    const t = new TurnItems();
    t.delta('a', 'Out.');
    t.endTurn();
    expect(t.delta('a', ' Twenty')).toBe(false);
    expect(t.text()).toBe('');
  });

  it('completed for the current item replaces only that item', () => {
    const t = new TurnItems();
    t.delta('a', 'out twenny');
    t.delta('b', 'four hours');
    expect(t.completed('a', 'Out. Twenty')).toBe(true);
    expect(t.text()).toBe('Out. Twenty four hours');
  });

  it('completed for a retired item is dropped', () => {
    const t = new TurnItems();
    t.delta('a', 'out');
    t.endTurn();
    t.delta('b', 'go');
    expect(t.completed('a', 'Out. Twenty-four hours.')).toBe(false);
    expect(t.text()).toBe('go');
  });

  it('two items in one turn join in arrival order', () => {
    const t = new TurnItems();
    t.delta('b', 'first');
    t.delta('a', 'second');
    t.delta('b', ' more');
    expect(t.text()).toBe('first more second');
  });

  it('events without an id are accepted and never retired', () => {
    const t = new TurnItems();
    expect(t.delta(undefined, 'one')).toBe(true);
    expect(t.endTurn()).toBe(true);
    expect(t.delta(undefined, 'two')).toBe(true);
    expect(t.completed('', 'Two.')).toBe(true);
    expect(t.text()).toBe('Two.');
  });

  it('endTurn retires everything seen in the turn and reports whether anything was heard', () => {
    const t = new TurnItems();
    expect(t.endTurn()).toBe(false);
    t.delta('a', '  ');
    expect(t.endTurn()).toBe(false); // whitespace is not words
    t.delta('b', 'x'); t.delta('c', 'y');
    expect(t.endTurn()).toBe(true);
    expect(t.text()).toBe('');
    expect(t.delta('a', 'z') || t.delta('b', 'z') || t.delta('c', 'z')).toBe(false);
  });
});
