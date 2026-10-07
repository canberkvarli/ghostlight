import { useMemo } from 'react';
import { Image, Text, View } from 'react-native';

import { colors } from '../theme/tokens';
import { Sketch } from './Sketches';
import type { Monologue } from '../data/monologues';
import { sketchFor } from '../lib/sketchFor';

/**
 * The spine of the thing the speech came out of.
 *
 * A row of titles is a row of words; a row of covers is a shelf. Three cases,
 * in the order the design cares about them:
 *
 *   1. **Film & TV with a poster** — the poster IS the artwork. Cover-fit, a 3pt
 *      corner, an ink rule and a hard 2pt ink block behind it. No glow, no tint:
 *      the one image in the app that was made by someone else is left alone.
 *   2. **Film & TV without one** — the drawn clapperboard. Only ever a fallback.
 *   3. **A play** — a cloth-bound cover: one deep colour keyed to the work, the
 *      year small at the head, a theme sketch in the middle (skull, rose,
 *      dagger, crown, jester or masks, from `sketchFor`), the short title at
 *      the foot. Deliberately drawn rather than geometric; a plain coloured
 *      rectangle with a letter in it reads as a missing asset, which is exactly
 *      what the old shelf looked like.
 *
 * The cloth colour is hashed from the work's title and the sketch is read from
 * its themes, so a play has the same cover everywhere in the app and across launches; the shelf is
 * recognisable by colour before it is readable by title.
 */

/** Deep bound-cloth colours. None of them are the stage, the gel or the paper. */
const CLOTH = ['#193b26', '#531b19', '#152e4e', '#4f3005', '#342b44', '#123b3c'];
/**
 * The gel, for a sketch on cloth. Same yellow as `colors.yellow`, written with
 * its alpha so the Sketch's light-scheme swap (yellow to deep accent, meant for
 * cream) leaves it alone: the cloth is dark in both schemes.
 */
const GEL_ON_CLOTH = `${colors.yellow}ff`;

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function PieceCover({
  item,
  width = 46,
  height = 66,
}: {
  item: Monologue;
  width?: number;
  height?: number;
}) {
  const screen = item.sourceType === 'film' || item.sourceType === 'tv';
  const key = item.source || item.title;
  const cloth = useMemo(() => CLOTH[hash(key) % CLOTH.length], [key]);
  const theme = sketchFor(item);

  const frame = {
    width,
    height,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.ink,
    overflow: 'hidden' as const,
  };

  // The hard block, drawn rather than shadowed — see PaperCard on why RN cannot
  // give us an unblurred offset.
  const block = (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 2,
        top: 2,
        width,
        height,
        borderRadius: 3,
        backgroundColor: colors.ink,
      }}
    />
  );

  if (screen && item.posterUrl) {
    return (
      <View style={{ width, height }}>
        {block}
        <View style={[frame, { backgroundColor: '#1f1332' }]}>
          <Image
            source={{ uri: item.posterUrl }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>
      </View>
    );
  }

  if (screen) {
    return (
      <View style={{ width, height }}>
        {block}
        <View style={[frame, { backgroundColor: '#1f1332', alignItems: 'center', justifyContent: 'center' }]}>
          <Sketch
            name="clapper"
            size={Math.round(width * 0.78)}
            stroke="#ede8f7"
            accent="#bd8bff"
            weight={2.2}
          />
        </View>
      </View>
    );
  }

  const ink = '#f0ebdc';
  return (
    <View style={{ width, height }}>
      {block}
      <View
        style={[
          frame,
          {
            backgroundColor: cloth,
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: Math.max(4, Math.round(height * 0.09)),
            paddingHorizontal: 4,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: 'CourierPrime_400Regular',
            fontSize: Math.max(6, Math.round(height * 0.105)),
            letterSpacing: 1.2,
            color: ink,
            opacity: 0.6,
          }}
        >
          {item.year ?? ''}
        </Text>
        <Sketch
          name={theme}
          size={Math.round(Math.min(width * 0.6, height * 0.38))}
          stroke={ink}
          accent={GEL_ON_CLOTH}
          weight={2.4}
        />
        {/* A cover is 38pt of usable width, which is eleven characters a line.
            Most plays fit in two; "The Importance of Being Earnest" does not,
            and a cover reading "The Importance of Bein…" is a printing error,
            not a design. It sets smaller instead. */}
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.62}
          style={{
            textAlign: 'center',
            fontFamily: 'InstrumentSerif_400Regular',
            fontSize: Math.max(7, Math.round(height * 0.12)),
            lineHeight: Math.max(8, Math.round(height * 0.135)),
            color: ink,
          }}
        >
          {item.source}
        </Text>
      </View>
    </View>
  );
}
