import { describe, expect, it } from 'vitest';
import type { RehearsalLine } from './contract';
import { openerOf, playedPart } from './opener';

const L = (index: number, character: string): RehearsalLine => ({ index, character, text: 'Words.', direction: null });
const parts = (jo: number | null, sam: number | null) => [{ name: 'JO', first_line: jo }, { name: 'SAM', first_line: sam }];

describe('openerOf', () => {
  it('is the part the server names, matched to the scene’s spelling', () => {
    expect(openerOf({ opens: 'jo', characters: parts(0, 1) })).toBe('JO');
  });

  it('ignores a name the scene does not have and falls back to the first line', () => {
    expect(openerOf({ opens: 'NOBODY', characters: parts(3, 2) }, [L(4, 'JO'), L(2, 'SAM')])).toBe('SAM');
  });

  it('without opens, is the speaker of the first line', () => {
    expect(openerOf({ characters: parts(null, null) }, [L(1, 'SAM'), L(0, 'JO')])).toBe('JO');
  });

  it('without lines, is the part whose first line comes first', () => {
    expect(openerOf({ characters: parts(1, 0) })).toBe('SAM');
  });

  it('is null when nothing says, so the part is asked for', () => {
    expect(openerOf({ characters: parts(null, null) })).toBeNull();
  });
});

describe('playedPart', () => {
  it('plays the part the server returns', () => {
    expect(playedPart({ character: 'JO' }, 'SAM')).toBe('JO');
  });
  it('falls back to the local pick when the answer names none', () => {
    expect(playedPart({}, 'SAM')).toBe('SAM');
    expect(playedPart({ character: '' }, 'SAM')).toBe('SAM');
  });
});
