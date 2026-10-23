import { Text, View } from 'react-native';

import type { Monologue } from '../data/monologues';
import { clothFor, SCREEN_BLOCK } from './PieceCover';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO = 'CourierPrime_400Regular';

/**
 * The cover of a play that has no picture: cloth, the title set large in
 * the serif, the playwright under it. The
 * cover of an old acting edition, which is what a stranger is being handed.
 * Type and colour only, so it is sharp at any size; the line drawings it
 * replaces were small pictures scaled up, and looked it.
 */
export function Cover({ item, height, screen = false }: { item: Pick<Monologue, 'source' | 'title' | 'author' | 'year' | 'sourceType'>; height: number; screen?: boolean }) {
  const cloth = screen ? SCREEN_BLOCK : clothFor(item);
  const title = (item.source || item.title || '').trim();
  const long = title.length;
  // The title fills the cover: short names large, long names smaller, two to four lines.
  const size = long <= 12 ? 54 : long <= 22 ? 44 : long <= 34 ? 36 : 30;
  const ink = screen ? '#ede8f7' : '#f0ebdc';
  return (
    <View style={{ height, backgroundColor: cloth, paddingHorizontal: 24, paddingTop: 26 }}>
      {/* Everything sits in the top half: the lower half of the picture fades into the paper, and words there would fade with it. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.6, color: ink, opacity: 0.6 }}>{screen ? 'SCREEN' : 'A PLAY'}</Text>
        {item.year ? <Text style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.6, color: ink, opacity: 0.6 }}>{String(item.year)}</Text> : null}
      </View>
      <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7} style={{ marginTop: 22, fontFamily: SERIF, fontSize: size, lineHeight: size * 1.02, letterSpacing: -0.4, color: ink }}>
        {title}
      </Text>
      {item.author ? (
        <Text numberOfLines={1} style={{ marginTop: 10, fontFamily: SERIF_I, fontSize: 18, color: ink, opacity: 0.8 }}>{item.author}</Text>
      ) : null}
    </View>
  );
}
