import { memo, useMemo } from 'react';
import { Text, type TextStyle } from 'react-native';

import { colors } from '../theme/tokens';

/**
 * The words of the play, set the way a script sets them.
 *
 * Everything used to render in one flat run of Courier, so `(laughing)` and
 * `PORTIA:` read as though the character were saying them out loud. That is the
 * one thing a monologue must never do: an actor scanning a page needs to see, in
 * one glance, which words are theirs to speak and which are instructions. About
 * one in nine pieces in the catalogue carries a parenthetical (1,556 of 14,418),
 * so this is not an edge case.
 *
 * Two things get lifted out:
 *
 *   - Parentheticals — `(beat)`, `(to Mary)`, `(laughing)`. Italic and grey.
 *   - Character cues — a name in caps at the head of a line, `HAMLET:`. These
 *     turn up in the scraped text of multi-voice extracts.
 *
 * The length cap on parentheticals is the whole trick. Playwrights and actors
 * both use ordinary brackets mid-sentence for asides that ARE spoken, and
 * greying those out would quietly delete words from the performance. Stage
 * directions are short — a verb, a name, a beat — so anything past 45 characters
 * is treated as speech and left alone. Wrong in the safe direction: the worst
 * case is a direction that stays black, not a line that vanishes.
 */

const MAX_DIRECTION = 45;

type Segment = { text: string; kind: 'speech' | 'direction' | 'cue' };

export function splitScript(source: string): Segment[] {
  const out: Segment[] = [];
  // Parentheticals, and a caps name + colon at the start of a line.
  const pattern = /(\([^()]{1,200}\))|(^[A-Z][A-Z .'’-]{1,24}:)/gm;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(source)) !== null) {
    if (m.index > last) out.push({ text: source.slice(last, m.index), kind: 'speech' });

    if (m[1]) {
      // Inner length, brackets excluded — a long aside is speech, not a note.
      const inner = m[1].length - 2;
      out.push({ text: m[1], kind: inner <= MAX_DIRECTION ? 'direction' : 'speech' });
    } else {
      out.push({ text: m[2], kind: 'cue' });
    }
    last = m.index + m[0].length;
  }

  if (last < source.length) out.push({ text: source.slice(last), kind: 'speech' });
  return out.length ? out : [{ text: source, kind: 'speech' }];
}

export const MonologueText = memo(function MonologueText({
  body,
  fontSize = 16,
  lineHeight = 27,
  style,
}: {
  body: string;
  fontSize?: number;
  lineHeight?: number;
  style?: TextStyle;
}) {
  const segments = useMemo(() => splitScript(body), [body]);

  return (
    <Text
      style={[
        {
          fontFamily: 'CourierPrime_400Regular',
          color: colors.light.foreground,
          fontSize,
          lineHeight,
        },
        style,
      ]}
    >
      {segments.map((seg, i) => {
        if (seg.kind === 'speech') return seg.text;
        if (seg.kind === 'direction') {
          return (
            <Text
              key={i}
              style={{
                fontFamily: 'CourierPrime_400Regular_Italic',
                color: colors.light.mutedForeground,
              }}
            >
              {seg.text}
            </Text>
          );
        }
        return (
          <Text
            key={i}
            style={{
              fontFamily: 'CourierPrime_700Bold',
              color: colors.light.mutedForeground,
              letterSpacing: 0.6,
            }}
          >
            {seg.text}
          </Text>
        );
      })}
    </Text>
  );
});
