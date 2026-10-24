import { Text, View } from 'react-native';

import { colors } from '../theme/tokens';
import { mediumPalette } from '../theme/medium';
import { OVERDONE_THRESHOLD, type Monologue } from '../data/monologues';

/**
 * The marks in the margin.
 *
 * A stack of sides comes back from a reader covered in these — a tick beside the
 * one to take in, a note saying everybody brings it. They are the same four
 * marks the web app prints, so an actor who uses both sees one vocabulary:
 *
 *   best pick            orange fill, cream type  — the top row only
 *   your lane            gel fill, ink type       — matches the actor's own casting
 *   everyone brings this ink fill, cream type     — replaces the old "overdone" badge
 *   classical / film / … outlined                 — where the piece comes from
 *
 * Courier 10, uppercase, tracked. They are annotations on a page, not chrome, so
 * they never take the app's sans.
 */

export type MarkKind = 'best' | 'lane' | 'over' | 'source';

export interface MarkSpec {
  label: string;
  kind: MarkKind;
  /** Source marks only: the house whose ink they are drawn in. */
  tint?: string;
}

/**
 * Where a piece comes from, in the catalogue's own words.
 *
 * Film and TV are certain, the poster table says so. A play says nothing.
 */
export function sourceTag(item: Monologue): string | null {
  if (item.sourceType === 'film') return 'film';
  if (item.sourceType === 'tv') return 'tv';
  // A play carries no era. The catalogue's "classical" and "contemporary"
  // were dropped from the cards on 25 Oct 2026: the house is mostly the
  // canon, so the mark said the same thing on nearly every card and the
  // few it did not fit were filed wrong more often than right.
  return null;
}

/**
 * The marks a given row has earned, in reading order.
 *
 * `first` is the index-0 row and nothing else — "best pick" means the one at the
 * top of what came back, so putting it on two cards would make it mean nothing.
 * `lane` is opt-in: it needs the actor's own casting to compare against, and
 * until the profile is wired that is simply absent rather than assumed.
 */
export function marksFor(
  item: Monologue,
  { first = false, lane = false }: { first?: boolean; lane?: boolean } = {},
): MarkSpec[] {
  const out: MarkSpec[] = [];
  if (first) out.push({ label: 'best pick', kind: 'best' });
  if (lane) out.push({ label: 'your lane', kind: 'lane' });
  if (item.overdoneScore >= OVERDONE_THRESHOLD) {
    out.push({ label: 'everyone brings this', kind: 'over' });
  }
  const tag = sourceTag(item);
  if (tag) {
    out.push({
      label: tag,
      kind: 'source',
      tint: mediumPalette(item.sourceType === 'play' ? 'theatre' : 'screen', true).tagInk,
    });
  }
  return out;
}

export function Mark({ spec }: { spec: MarkSpec }) {
  const { label, kind, tint } = spec;

  const skin =
    kind === 'best'
      ? { bg: colors.primaryDeep, fg: '#fbf7ef', bd: colors.primaryDeep }
      : kind === 'lane'
        ? { bg: colors.yellow, fg: colors.ink, bd: colors.ink }
        : kind === 'over'
          ? { bg: colors.ink, fg: '#f3eee6', bd: colors.ink }
          : { bg: 'transparent', fg: tint ?? colors.primary, bd: tint ?? colors.primary };

  // A source tag is a label, not a button: plain type, no edge round it.
  const plain = kind === 'source' || kind === undefined;
  return (
    <View
      style={plain ? { paddingVertical: 2 } : {
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: skin.bd,
        backgroundColor: skin.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: 'CourierPrime_400Regular',
          fontSize: 10,
          lineHeight: 14,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: skin.fg,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The row of them. `gap` is a real style — Uniwind drops `gap-*` (AGENTS.md).
 *
 * It wraps, and the card reserves two lines for it: "everyone brings this" plus
 * a source tag is wider than a phone at 10pt Courier, and a mark that falls off
 * the right edge of the paper is worse than one that takes a second line.
 */
export function MarkRow({ marks, style }: { marks: MarkSpec[]; style?: object }) {
  if (marks.length === 0) return null;
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, style]}>
      {marks.map((m) => (
        <Mark key={`${m.kind}:${m.label}`} spec={m} />
      ))}
    </View>
  );
}
