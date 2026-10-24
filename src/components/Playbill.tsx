import { Pressable, Text, View } from 'react-native';

import type { Monologue } from '../data/monologues';
import { clock } from '../lib/segments';
import { useTheme } from '../theme/ThemeContext';
import { PaperCard } from './PaperCard';
import { PieceCover } from './PieceCover';
import { StageDirection } from './StageDirection';
import { WordArrow } from './WordArrow';

/**
 * One card of the playbill: a page of sides. The cover of the edition, the
 * line drawing on cloth that the book and the shelves use, sits at the top
 * right of the sheet with the name and the play beside it, and the speech is
 * printed under them. Nothing fades into anything: ink on paper. The deck
 * throws these; the card itself only knows how to be tapped (read it) and
 * held (share it).
 */
/** The dark between two sheets, where sheets stack. */
export const GAP = 14;

export function PlaybillCard({
  item,
  height,
  first,
  onOpen,
}: {
  item: Monologue;
  /** The card's height. */
  height: number;
  first: boolean;
  /** The "read" word at the foot. The card itself is not a button: the deck owns the tap and the hold. */
  onOpen: () => void;
}) {
  const { colors: c } = useTheme();
  // However many lines of the speech fit between the head and the foot of the
  // page, so a tall phone shows more of it and a short one is not crowded.
  const lines = Math.max(4, Math.min(9, Math.floor((height - 236) / 22)));
  return (
    <View style={{ height }} accessible accessibilityLabel={`${item.character}, from ${item.source}. Tap to read it`} accessibilityHint="Swipe right to keep it, left for another. Hold to share it as a picture">
      <View style={{ flex: 1 }}>
        <PaperCard shadow={8} wrapperStyle={{ flex: 1 }} style={{ flex: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18, justifyContent: 'space-between' }}>
          <View>
            {/* The head: who, from what, and the cover of the edition beside it. */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <StageDirection on="paper">{first ? '(tonight.)' : '(another.)'}</StageDirection>
                <Text
                  numberOfLines={2}
                  style={{ marginTop: 6, fontFamily: 'InstrumentSerif_400Regular', fontSize: 32, lineHeight: 35, letterSpacing: -0.5, color: c.paperInk }}
                >
                  {item.character}
                </Text>
                <Text
                  numberOfLines={2}
                  style={{ marginTop: 4, fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, lineHeight: 17, letterSpacing: 0.4, color: c.paperMuted }}
                >
                  {`from ${item.source}${item.author ? ` · ${item.author}` : ''}`}
                </Text>
              </View>
              <PieceCover item={item} width={66} height={94} />
            </View>
            {/* The words. */}
            <Text
              numberOfLines={lines}
              style={{ marginTop: 18, fontFamily: 'CourierPrime_400Regular', fontSize: 14.5, lineHeight: 22, color: c.paperBody }}
            >
              {item.excerpt}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: 'CourierPrime_400Regular', fontSize: 12, letterSpacing: 0.6, color: c.paperMuted }}>
              {item.duration ? clock(item.duration) : ''}
            </Text>
            <WordArrow label="read" onPress={onOpen} tint={c.accentText} />
          </View>
        </PaperCard>
      </View>
    </View>
  );
}

/**
 * A blank sheet in the same frame: what the deck shows while the house is
 * still answering, or the one line it has to say when it did not.
 */
export function BlankPage({ height, line, onPress }: { height: number; line?: string; onPress?: () => void }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ height, marginBottom: GAP }}>
      <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1 }}>
        <PaperCard shadow={onPress ? 8 : 0} wrapperStyle={{ flex: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {line ? (
            <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, letterSpacing: 0.8, color: c.paperMuted }}>{line}</Text>
          ) : null}
        </PaperCard>
      </Pressable>
    </View>
  );
}
