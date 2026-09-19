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

/**
 * The backend's own segmentation, which beats anything we can infer.
 *
 * Roughly a third of pieces carry stage directions as plain unbracketed prose —
 * "Bane folds the papers. Looks out to the stunned crowd." — and no pattern
 * match on the raw text will ever find those reliably. The server already knows;
 * `text_segments` is typed `dialogue` / `direction` / `interjection` and is
 * populated on 8,201 of 14,418 rows.
 *
 * `interjection` is deliberately rendered as speech. Upstream it's a mixed bag:
 * on the Bane speech it covers both "Do you accept this man's resignation?"
 * (his line) and "Individuals in the crowd start shouting" (not his line). Since
 * greying a real line silently deletes it from the performance and leaving a
 * direction black merely leaves it looking odd, the tie goes to speech. The
 * mis-typing is a segmenter problem and worth fixing at the source, where it
 * would also fix the web app.
 */
function fromSegments(segs: { text: string; type: string }[]): Segment[] {
  const out: Segment[] = [];
  segs.forEach((s, i) => {
    const kind: Segment['kind'] = s.type === 'direction' ? 'direction' : 'speech';
    // A blank line around a direction, a single break between spoken pieces.
    // Segments carry no whitespace of their own, so without this the whole
    // speech runs together as one paragraph — and a direction sitting inline
    // mid-sentence is exactly as confusing as one that isn't styled at all.
    if (i > 0) {
      const prev = segs[i - 1];
      const gap = kind === 'direction' || prev.type === 'direction' ? '\n\n' : '\n';
      out.push({ text: gap, kind: 'speech' });
    }
    out.push({ text: s.text, kind });
  });
  return out;
}

export const MonologueText = memo(function MonologueText({
  body,
  segments: given,
  fontSize = 16,
  lineHeight = 27,
  style,
}: {
  body: string;
  /** The server's typed segmentation, when it has one. */
  segments?: { text: string; type: string }[];
  fontSize?: number;
  lineHeight?: number;
  style?: TextStyle;
}) {
  // Segments describe the WHOLE speech, so the caller must not pass them when
  // it's rendering the walled excerpt — that would hand over the rest of the
  // monologue for free. See the read screen, which passes them only when open.
  const segments = useMemo(
    () => (given?.length ? fromSegments(given) : splitScript(body)),
    [given, body],
  );

  // The words are always on paper, on both schemes — so they take the paper ink
  // rather than the theme's foreground. Reaching for `colors.light.*` did the
  // same thing by accident and stopped being true the moment the light scheme's
  // page and a card's page became different creams.
  return (
    <Text
      style={[
        {
          fontFamily: 'CourierPrime_400Regular',
          color: colors.paper.ink,
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
                color: colors.paper.muted,
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
              color: colors.paper.muted,
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
