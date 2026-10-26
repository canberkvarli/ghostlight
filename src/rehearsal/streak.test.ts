import { describe, expect, it } from 'vitest';
import { streakOf } from './streak';

const at = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h);

describe('streakOf', () => {
  const now = at(2026, 10, 29, 12); // a Thursday

  it('counts days in a row ending today', () => {
    expect(streakOf([at(2026, 10, 27), at(2026, 10, 28), at(2026, 10, 29, 9)], now).days).toBe(3);
  });

  it('keeps a streak that reached yesterday when today has nothing yet', () => {
    const s = streakOf([at(2026, 10, 27), at(2026, 10, 28)], now);
    expect(s.days).toBe(2);
    expect(s.today).toBe(false);
  });

  it('breaks on a missed day', () => {
    expect(streakOf([at(2026, 10, 25), at(2026, 10, 27)], now).days).toBe(0);
  });

  it('lays out the week from Monday', () => {
    const s = streakOf([at(2026, 10, 26), at(2026, 10, 28), '2026-10-29T08:00:00'], now);
    expect(s.week).toEqual([true, false, true, true, false, false, false]);
  });

  it('ignores nothing and the future', () => {
    expect(streakOf([null, undefined, 'not a date', at(2026, 10, 30)], now).days).toBe(0);
  });
});
