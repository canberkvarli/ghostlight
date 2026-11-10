import { type RehearsalLine, sameCharacter } from './contract';

/**
 * The part that speaks first. A first scene is offered only as its opener
 * (Canberk, 2026-11-10): actors stall when their first move is answering a
 * stranger. The server names it (`opens`, the speaker of line 0); an older
 * server does not, so the speaker of the first line stands in, from the
 * scene's lines or from the parts' first-line indexes. Null when neither
 * says, and the picker asks for the part as it used to.
 */
export function openerOf(
  scene: { opens?: string | null; characters: { name: string; first_line: number | null }[] },
  lines?: RehearsalLine[] | null,
): string | null {
  const named = (who: string | null | undefined) =>
    who ? scene.characters.find(ch => sameCharacter(ch.name, who))?.name ?? null : null;
  const fromServer = named(scene.opens);
  if (fromServer) return fromServer;
  if (lines?.length) {
    const first = lines.reduce((a, b) => (b.index < a.index ? b : a));
    const fromLines = named(first.character);
    if (fromLines) return fromLines;
  }
  const known = scene.characters.filter(ch => ch.first_line !== null && ch.first_line !== undefined);
  if (known.length) return known.reduce((a, b) => ((b.first_line as number) < (a.first_line as number) ? b : a)).name;
  return null;
}

/** The part a guided run plays: the server's, which is the one it logs; the local pick only when the answer names none. */
export function playedPart(opened: { character?: string | null }, local: string): string {
  return opened.character?.trim() ? opened.character : local;
}
