import { useMemo } from 'react';
import { Image, Text, View } from 'react-native';

import { colors } from '../theme/tokens';
import { Sketch } from './Sketches';
import type { Monologue } from '../data/monologues';

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
 *      year small at the head, a serif device in the middle, the short title at
 *      the foot. Deliberately drawn rather than geometric; a plain coloured
 *      rectangle with a letter in it reads as a missing asset, which is exactly
 *      what the old shelf looked like.
 *
 * The cloth colour and the device are hashed from the work's title, so a play
 * has the same cover everywhere in the app and across launches — the shelf is
 * recognisable by colour before it is readable by title.
 */

/** Deep bound-cloth colours. None of them are the stage, the gel or the paper. */
const CLOTH = ['#193b26', '#531b19', '#152e4e', '#4f3005', '#342b44', '#123b3c'];
/** Printer's devices, set in the serif. Not emoji — these must take a font. */
const DEVICES = ['❦', '✦', '⁂', '❧', '✻', '❖'];

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
  const { cloth, device } = useMemo(() => {
    const h = hash(key);
    return { cloth: CLOTH[h % CLOTH.length], device: DEVICES[(h >> 3) % DEVICES.length] };
  }, [key]);

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
        <Text
          style={{
            fontFamily: 'InstrumentSerif_400Regular_Italic',
            fontSize: Math.round(height * 0.29),
            lineHeight: Math.round(height * 0.32),
            color: ink,
          }}
        >
          {device}
        </Text>
        <Text
          numberOfLines={2}
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
