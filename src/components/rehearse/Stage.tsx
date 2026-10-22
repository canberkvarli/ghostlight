import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

import type { RehearsalLine } from '../../rehearsal/contract';
import type { Snapshot } from '../../rehearsal/engine';
import { sameCharacter } from '../../rehearsal/contract';
import { Line, type Speaking, type When } from './Line';

interface Props {
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
const EYE_LINE = 0.38;
/** After the actor scrolls by hand, the script stays where they put it this long. */
const HANDS_OFF_MS = 3500;
const NO_WORDS = new Set<number>();

/**
 * The script, full bleed, in the light. The live line sits in the pool at the
 * eye line and the text moves under it. Above and below, the page falls off
 * into the house. Every other line is a target: a tap starts the run there.
 * Scrolling by hand to find a line is left alone for a few seconds, then the
 * script follows the run again on its next move.
 */
export function Stage({ lines, actor, snapshot, paused, onJump, warming = false }: Props) {
  const { height } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const tops = useRef(new Map<number, number>());
  const handsOn = useRef(0);
  const placed = useRef(false);
  const current = snapshot?.lineIndex ?? 0;
  const next = snapshot?.read.position ?? 0;

  const follow = useCallback((animated: boolean) => {
    const top = tops.current.get(current);
    if (top === undefined) return;
    if (placed.current && Date.now() - handsOn.current < HANDS_OFF_MS) return;
    scroller.current?.scrollTo({ y: Math.max(0, top - height * EYE_LINE), animated });
    placed.current = true;
  }, [current, height]);

  useEffect(() => { follow(placed.current); }, [follow, next]);

  const state = snapshot?.state;
  const speakingFor = (mine: boolean): Speaking =>
    paused ? 'held' : warming || state === 'ready' ? 'warming' : mine ? 'listening' : 'sounding';

  return (
    <ScrollView
      ref={scroller}
      onScrollBeginDrag={() => { handsOn.current = Date.now(); }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12 }}
    >
      <View style={{ height: height * EYE_LINE }} />
      {lines.map(line => {
        const mine = sameCharacter(line.character, actor);
        const when: When = line.index < current ? 'past' : line.index === current ? 'live' : 'next';
        const jump = onJump && line.index !== current ? () => { handsOn.current = 0; onJump(line.index); } : undefined;
        return (
          <Line
            key={line.index}
            line={line}
            mine={mine}
            when={when}
            speaking={when === 'live' ? speakingFor(mine) : undefined}
            heard={mine ? snapshot?.heard.get(line.index) ?? NO_WORDS : undefined}
            at={mine && when === 'live' ? next : undefined}
            onJump={jump}
            onLayout={e => { tops.current.set(line.index, e.nativeEvent.layout.y); if (line.index === current) follow(false); }}
          />
        );
      })}
      <View style={{ height: height * (1 - EYE_LINE) }} />
    </ScrollView>
  );
}
