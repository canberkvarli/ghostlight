import { forwardRef, type RefObject } from 'react';
import { Image, Share, Text, View } from 'react-native';
import { ImageFormat, makeImageFromView } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';

import type { Monologue } from '../data/monologues';
import { track } from '../lib/analytics';
import { clock } from '../lib/segments';
import { colors } from '../theme/tokens';

/**
 * The share card: a piece as a picture.
 *
 * Actors post monologues to their stories the way other people post songs.
 * This is the page they would have photographed, made properly: the dark
 * stage, one sheet of paper set a touch askew on a block of gel, the cover of
 * the thing the speech came out of, the name, the first lines, and the lamp's
 * name small at the foot. Every one of them is a poster for the app that cost
 * nothing.
 *
 * It is rendered off the edge of the screen, always, with whatever piece the
 * screen is showing, and photographed on demand. 360 by 450 points is 4:5, the
 * shape a story and a feed both take without cropping; on a 3x phone that is a
 * 1080 by 1350 picture.
 *
 * Nothing here is drawn with Skia. The snapshot is a view snapshot, and a
 * Metal layer inside one can come back black, so the lamp is type and a dot,
 * and a play's cover is cloth and a title rather than the drawn sketch.
 */

export const SHARE_W = 360;
export const SHARE_H = 450;

/** Warm near-black, the stage. Dark in both schemes: this is a picture of the stage, not of the setting. */
const STAGE = '#130b08';
const CLOTH = ['#193b26', '#531b19', '#152e4e', '#4f3005', '#342b44', '#123b3c'];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export const ShareCard = forwardRef<View, { piece: Monologue }>(function ShareCard({ piece }, ref) {
  const paper = colors.paper;
  const screen = piece.sourceType !== 'play';
  const house = screen ? 'film & tv' : 'theatre';
  const cloth = CLOTH[hash(piece.source) % CLOTH.length];

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        width: SHARE_W,
        height: SHARE_H,
        backgroundColor: STAGE,
        paddingHorizontal: 26,
        paddingTop: 30,
        paddingBottom: 24,
        justifyContent: 'space-between',
      }}
    >
      {/* A pool of light behind the page, as on the stage. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: SHARE_W / 2 - 220,
          top: SHARE_H / 2 - 260,
          width: 440,
          height: 440,
          borderRadius: 220,
          backgroundColor: colors.stageGlow,
          opacity: 0.1,
        }}
      />

      <View style={{ transform: [{ rotate: '-0.8deg' }] }}>
        {/* The gel block the paper sits on, and the paper. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 5, top: 5, right: -5, bottom: -5, borderRadius: 4, backgroundColor: colors.yellow }}
        />
        <View style={{ borderRadius: 4, borderWidth: 1.5, borderColor: paper.ink, backgroundColor: paper.background, padding: 20 }}>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {screen && piece.posterUrl ? (
              <View style={{ width: 58, height: 84, borderRadius: 3, overflow: 'hidden', borderWidth: 1.5, borderColor: paper.ink }}>
                <Image source={{ uri: piece.posterUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </View>
            ) : (
              <View
                style={{
                  width: 58,
                  height: 84,
                  borderRadius: 3,
                  backgroundColor: cloth,
                  borderWidth: 1.5,
                  borderColor: paper.ink,
                  padding: 6,
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontFamily: 'CourierPrime_400Regular', fontSize: 8, letterSpacing: 1, color: colors.yellow, opacity: 0.9 }}>
                  {piece.year ? String(piece.year) : ''}
                </Text>
                <Text
                  numberOfLines={3}
                  style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 8.5, lineHeight: 11, letterSpacing: 0.6, color: paper.background }}
                >
                  {piece.source.toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
              <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 11, letterSpacing: 0.8, color: paper.muted }}>
                {`(${house}.)`}
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  marginTop: 4,
                  fontFamily: 'InstrumentSerif_400Regular',
                  fontSize: 27,
                  lineHeight: 30,
                  letterSpacing: -0.4,
                  color: paper.ink,
                }}
              >
                {piece.character}
              </Text>
              <Text
                numberOfLines={2}
                style={{ marginTop: 3, fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 12, lineHeight: 16, color: paper.muted }}
              >
                {`from ${piece.source}`}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 14, height: 1.5, backgroundColor: paper.ink }} />

          <Text
            numberOfLines={8}
            style={{ marginTop: 12, fontFamily: 'CourierPrime_400Regular', fontSize: 13.5, lineHeight: 21, color: paper.body }}
          >
            {piece.excerpt}
          </Text>

          <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: 'CourierPrime_400Regular', fontSize: 11, letterSpacing: 0.6, color: paper.muted }}>
              {piece.duration ? clock(piece.duration) : ''}
            </Text>
            <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 11, letterSpacing: 0.6, color: paper.muted }}>
              (the rest in the app.)
            </Text>
          </View>
        </View>
      </View>

      {/* The lamp's name, small, at the foot of the stage. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: colors.yellow,
            shadowColor: colors.stageGlow,
            shadowOpacity: 0.9,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
        <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 11, letterSpacing: 2.4, color: paper.background, opacity: 0.85 }}>
          GHOST LIGHT
        </Text>
        <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 11, letterSpacing: 0.6, color: colors.stageLine }}>
          monologues, on the App Store
        </Text>
      </View>
    </View>
  );
});

/**
 * Photograph the card and hand it to the share sheet. The file lives in the
 * cache, named by the piece, so sharing the same one twice writes once.
 */
export async function sharePiece(ref: RefObject<View | null>, piece: Monologue, from: 'read' | 'curtain'): Promise<void> {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  const image = await makeImageFromView(ref);
  if (!image) return;
  const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
  const file = new File(Paths.cache, `ghostlight-${piece.id}.png`);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  track('app_share', { from, medium: piece.sourceType === 'play' ? 'theatre' : 'screen' });
  await Share.share({ url: file.uri });
}
