/**
 * Taping for an audition: the Board, the audition's file and its reminder
 * all open the tape room the same way, on the audition's piece.
 *
 * A monologue opens on that monologue (and its cut). A scene, or no piece
 * yet, opens on no script: the room cannot read the other part until the
 * reader comes (CAN-28), and the actor's own sides still tape.
 */
import type { Href } from 'expo-router';

import { attachedPiece, type Audition } from '../api/auditions';
import { FREE_TAPE } from './takes';

export function tapeHref(a: Audition): Href {
  const piece = attachedPiece(a);
  const id = piece?.monologue_id != null ? String(piece.monologue_id) : FREE_TAPE;
  const name = piece?.monologue_id != null ? piece.character ?? '' : '';
  return { pathname: '/tape/[id]', params: { id, audition: String(a.id), name } } as Href;
}

/** A self-tape that is sent: no more nudges before it is due. */
export function tapeSent(a: Pick<Audition, 'kind' | 'status'>): boolean {
  return a.kind === 'self_tape' && a.status === 'submitted';
}
