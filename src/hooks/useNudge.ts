import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import type { Audition } from '../api/auditions';
import type { Monologue } from '../data/monologues';
import { type Candidates, dayOf, dismissNudge, type Nudge, pickNudge, syncKnocks } from '../lib/nudges';
import { pickTonight, runPick, useTonightRun } from './useTonight';

/**
 * The home's end of the nudge engine: what the ticket says today, and the
 * knocks rewritten whenever the home has fresh data. Picked on focus, not on
 * mount, because the home stays mounted under everything and the piece you
 * left changes while it is covered.
 */
export function useNudge(c: Candidates, auditions: Audition[] | undefined, trending: Monologue[]) {
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [gen, setGen] = useState(0);
  const latest = useRef(c);
  latest.current = c;
  // The server's run of tonights, so the evening knock names the piece the
  // widget is showing; the shelf's own pick stands in until it answers.
  const run = useTonightRun(c.medium);
  const inputs = [
    c.next?.id,
    c.next?.when,
    c.lastPiece?.id,
    c.lastPiece?.openedAt,
    c.lastPiece?.cutSeconds,
    c.lastPiece?.runs,
    c.lastPiece?.offBook,
    c.tonight?.id,
    c.medium,
    c.isAuthenticated,
  ].join('|');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void pickNudge(latest.current).then((n) => {
        if (alive) setNudge(n);
      });
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputs, gen]),
  );

  const dismiss = useCallback((n: Nudge) => {
    setNudge(null);
    void dismissNudge(n).then(() => setGen((g) => g + 1));
  }, []);

  useEffect(() => {
    if (trending.length === 0 && run.length === 0 && !c.lastPiece) return;
    const auditionDays = new Set<string>();
    for (const a of auditions ?? []) {
      if (a.scope !== 'upcoming' || !a.when) continue;
      const d = new Date(a.when);
      auditionDays.add(dayOf(d));
      const eve = new Date(d);
      eve.setDate(eve.getDate() - 1);
      auditionDays.add(dayOf(eve));
    }
    void syncKnocks({
      tonightFor: (day) => runPick(run, day) ?? pickTonight(trending, latest.current.medium, day),
      medium: latest.current.medium,
      lastPiece: latest.current.lastPiece,
      auditionDays,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, trending, run, auditions]);

  return { nudge, dismiss };
}
