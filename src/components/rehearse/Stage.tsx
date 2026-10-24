import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { RehearsalLine, ScenePayload } from '../../rehearsal/contract';
import type { Snapshot } from '../../rehearsal/engine';
import { sameCharacter } from '../../rehearsal/contract';
import { Line, type Speaking, type When } from './Line';

interface Props {
  scene: ScenePayload['scene'];
  lines: RehearsalLine[];
  actor: string;
  snapshot: Snapshot | null;
  paused: boolean;
  /** Start the run at this line. Absent while it cannot jump (not begun, or over). */
  onJump?: (line: number) => void;
  /** Begun but not yet sounding: the first line's light glows while it gets ready. */
  warming?: boolean;
}

/** Fraction of the stage height where the live line is held: the pool of light. */
const EYE_LINE = 0.28;
/** After the actor scrolls by hand, the script stays where they put it this long. */
const HANDS_OFF_MS = 3500;
const NO_WORDS = new Set<number>();

/**
 * The script, full bleed, in the light. The live line sits in the pool at the
 * eye line once it moves, and on your own line it is the row you are reading
 * that is held there, so a long speech slides up under the light as you go
 * through it. The script starts at the top, with no room above the first
 * line. Every other line is a target: a tap starts the run there. Scrolling
 * by hand to find a line is left alone for a few seconds, then the script
 * follows the run again on its next move.
 *
 * Each line's top is measured on the wrapper the scroll view lays out, not
 * on the line inside it, which only ever knew it sat at the top of its
 * wrapper: that was why the script never moved.
 */
export function Stage({ scene, lines, actor, snapshot, paused, onJump, warming = false }: Props) {
  const { height } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const tops = useRef(new Map<number, number>());
  const handsOn = useRef(0);
  const placed = useRef(false);
  // Before Begin, with no part chosen, nothing is live: the script is simply there.
  const current = snapshot?.lineIndex ?? (actor ? 0 : -1);
  // The row of the live line the actor is on, as a height from its top; 0 on a partner line.
  const [cursor, setCursor] = useState(0);
  useEffect(() => { setCursor(0); }, [current]);
  const onCursor = useCallback((y: number) => { setCursor(prev => (Math.abs(prev - y) < 1 ? prev : y)); }, []);

  const follow = useCallback((animated: boolean) => {
    const top = tops.current.get(current);
    if (top === undefined) return;
    if (placed.current && Date.now() - handsOn.current < HANDS_OFF_MS) return;
    scroller.current?.scrollTo({ y: Math.max(0, top + cursor - height * EYE_LINE), animated });
    placed.current = true;
  }, [current, cursor, height]);

  useEffect(() => { follow(placed.current); }, [follow]);

  const state = snapshot?.state;
  const speakingFor = (mine: boolean): Speaking =>
    paused ? 'held' : warming || state === 'ready' ? 'warming' : mine ? 'listening' : 'sounding';

  return (
    <ScrollView
      ref={scroller}
      onScrollBeginDrag={() => { handsOn.current = Date.now(); }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16 }}
    >
      <View style={{ height: 8 }} />
      {lines.map((line, i) => {
        const mine = sameCharacter(line.character, actor);
        const when: When = line.index < current ? 'past' : line.index === current ? 'live' : 'next';
        const jump = onJump && line.index !== current ? () => { handsOn.current = 0; onJump(line.index); } : undefined;
        const yours = mine && when === 'live';
        return (
          <Animated.View
            key={line.index}
            entering={FadeIn.delay(Math.min(i, 8) * 50).duration(320)}
            onLayout={e => { tops.current.set(line.index, e.nativeEvent.layout.y); if (line.index === current) follow(false); }}
          >
            <Line
              line={line}
              mine={mine}
              when={when}
              speaking={when === 'live' ? speakingFor(mine) : undefined}
              heard={mine ? snapshot?.heard.get(line.index) ?? NO_WORDS : undefined}
              at={yours ? snapshot?.read.position ?? 0 : undefined}
              onJump={jump}
              onCursor={yours ? onCursor : undefined}
            />
          </Animated.View>
        );
      })}
      <View style={{ height: height * (1 - EYE_LINE) }} />
    </ScrollView>
  );
}
