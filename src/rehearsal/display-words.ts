// Carried from actorrise lib/rehearsal (commit 9e3414b9). Pure; keep in step with the web,
// the server's line contract and journal are shared.

/**
 * The words of a line as they are drawn, one chunk per matcher token, so the
 * heard index `i` from `liveRead` lights the word the actor actually said.
 *
 * The matcher (`lineWords` → `tokenize`) splits on hyphens and dashes, on
 * sentence punctuation glued to the next word ("talk.We"), and on anything
 * that is not a-z or 0-9; it drops apostrophes. A whitespace chunk can
 * therefore hold zero tokens ("—"), one ("I've") or several ("Twenty-four").
 * Punctuation stays attached to its word; a chunk with no tokens joins the
 * word before it (or the one after, at the start of a line).
 */
import { lineWords } from './live-read';

export interface DisplayWord {
  word: string;
  /** Draw a space after this word. False inside a split chunk ("Twenty-|four"). */
  gap: boolean;
}

/** Split a chunk where a token starts after a separator: "Twenty-four," → "Twenty-", "four,". */
const TOKEN_START = /(?<=[^a-z0-9'‘’`])(?=[a-z0-9])/i;

export function displayRuns(text: string): DisplayWord[] {
  const out: DisplayWord[] = [];
  let prefix = ''; // tokenless chunks before the first word
  for (const chunk of text.split(/\s+/).filter(Boolean)) {
    const n = lineWords(chunk).length;
    if (n === 0) {
      const last = out[out.length - 1];
      if (last) last.word += ' ' + chunk;
      else prefix += chunk + ' ';
      continue;
    }
    let pieces = n === 1 ? [chunk] : mergeEmpty(chunk.split(TOKEN_START));
    if (pieces.length !== n) pieces = [chunk, ...Array<string>(n - 1).fill('')];
    pieces.forEach((p, i) => out.push({ word: p, gap: i === pieces.length - 1 }));
    if (prefix) { out[out.length - pieces.length].word = prefix + out[out.length - pieces.length].word; prefix = ''; }
  }
  if (prefix) return [{ word: prefix.trim(), gap: false }];
  if (out.length) out[out.length - 1].gap = false;
  return out;
}

/** Pieces with no token ("(" before "Twenty") are glued onto the next piece. */
function mergeEmpty(pieces: string[]): string[] {
  const out: string[] = [];
  let carry = '';
  for (const p of pieces) {
    if (lineWords(p).length === 0) { carry += p; continue; }
    out.push(carry + p);
    carry = '';
  }
  if (carry && out.length) out[out.length - 1] += carry;
  return out;
}

export function displayWords(text: string): string[] {
  return displayRuns(text).map(r => r.word);
}
