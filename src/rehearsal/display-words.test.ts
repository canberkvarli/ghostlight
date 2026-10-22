import { describe, expect, it } from 'vitest';
import { lineWords } from './live-read';
import { displayRuns, displayWords } from './display-words';

describe('displayWords', () => {
  it('splits a hyphenated number so both halves can light', () => {
    expect(displayWords("Twenty-four, and I've been.")).toEqual(['Twenty-', 'four,', 'and', "I've", 'been.']);
  });

  it('draws no space inside a split chunk and none after the last word', () => {
    expect(displayRuns('Twenty-four, yes.').map(r => r.gap)).toEqual([false, true, false]);
  });

  it('attaches a lone dash to the word before it', () => {
    expect(displayWords('Wait — no.')).toEqual(['Wait —', 'no.']);
  });

  it('attaches leading punctuation to the first word', () => {
    expect(displayWords('… well, fine')).toEqual(['… well,', 'fine']);
  });

  it('splits sentence punctuation glued to the next word', () => {
    expect(displayWords('We talk.We walk')).toEqual(['We', 'talk.', 'We', 'walk']);
  });

  it('keeps a line with no words visible as one chunk', () => {
    expect(displayWords('...')).toEqual(['...']);
  });

  it('always yields one chunk per matcher token', () => {
    for (const t of [
      "Twenty-four, and I've been.", 'Wait — no.', '(beat) Well-well-well!', 'A/B testing, 3.5 times', 'naïve café', '"Go," she said.',
    ]) expect(displayWords(t)).toHaveLength(lineWords(t).length);
  });
});
