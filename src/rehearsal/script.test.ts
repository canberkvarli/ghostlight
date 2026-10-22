import { describe, expect, it } from 'vitest';
import { buildScript } from './script';
import type { RehearsalLine } from './contract';

const L = (index: number, character: string, text: string, direction: string | null = null): RehearsalLine =>
  ({ index, character, text, direction });

const LINES = [L(0, 'BEN', 'Where were you?'), L(1, 'BEN', 'I waited.'), L(2, 'ANNA', 'Out. Twenty-four hours.'),
  L(3, 'MAID', 'Dinner, madam.'), L(4, 'ANNA', 'Go.')];

describe('buildScript', () => {
  it('groups consecutive partner lines into one beat', () => {
    const s = buildScript(LINES, 'ANNA');
    expect(s.turns.map(t => t.kind)).toEqual(['partner', 'actor', 'partner', 'actor']);
    expect(s.turns[0].kind === 'partner' && s.turns[0].lineIndices).toEqual([0, 1]);
  });
  it('actor turns carry tokenised words', () => {
    const s = buildScript(LINES, 'anna');
    const t = s.turns[1];
    expect(t.kind === 'actor' && t.words).toEqual(['out', 'twenty', 'four', 'hours']);
  });
  it('maps any line index to its turn', () => {
    const s = buildScript(LINES, 'ANNA');
    expect(s.turnOfLine[1]).toBe(0);
    expect(s.turnOfLine[4]).toBe(3);
  });
  it('keywords for an actor turn are the proper nouns in the scene plus the line words', () => {
    const s = buildScript(LINES, 'ANNA');
    const t = s.turns[1];
    expect(t.kind === 'actor' && t.keywords).toContain('Anna');
    expect(t.kind === 'actor' && t.keywords).toContain('Ben');
  });
  it('after the actor\'s last line, the trailing beat is only its first line (the cue response)', () => {
    // Prod: FRANCISCO's last line was L16 and L17..L59 played as one 10-minute beat.
    const lines = [...LINES, L(5, 'BEN', 'And?'), L(6, 'MAID', 'Nothing.'), L(7, 'BEN', 'Then good night.')];
    const s = buildScript(lines, 'ANNA');
    const last = s.turns.at(-1)!;
    expect(last.kind === 'partner' && last.lineIndices).toEqual([5]);
    expect(s.turns).toHaveLength(5);
    expect(s.turnOfLine[7]).toBe(4);
  });
  it('leading partner lines before the actor\'s first line are untouched', () => {
    const s = buildScript(LINES, 'ANNA');
    expect(s.turns[0].kind === 'partner' && s.turns[0].lineIndices).toEqual([0, 1]);
    const t = buildScript(LINES, 'NOBODY');
    expect(t.turns).toHaveLength(1);
    expect(t.turns[0].kind === 'partner' && t.turns[0].lineIndices).toEqual([0, 1, 2, 3, 4]);
  });
});
