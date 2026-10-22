import { describe, expect, it } from 'vitest';
import { Timeline } from './timeline';

describe('Timeline', () => {
  it('reports handover as scheduled start minus last delta, in ms', () => {
    const t = new Timeline();
    t.mark('delta', 10.000);
    t.mark('delta', 10.420);
    t.mark('partner_scheduled', 10.441);
    expect(t.handoverMs()).toBe(21);
  });
  it('is null without both marks', () => {
    const t = new Timeline();
    t.mark('delta', 1);
    expect(t.handoverMs()).toBeNull();
  });
  it('resets per line', () => {
    const t = new Timeline();
    t.mark('delta', 1); t.mark('partner_scheduled', 1.1);
    t.reset();
    expect(t.handoverMs()).toBeNull();
  });
});
