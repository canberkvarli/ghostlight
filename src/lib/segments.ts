/**
 * The units a piece is made of, for the cut and for running it.
 *
 * Ported line for line from the website (lib/monologueSegments.ts and
 * lib/estimateDuration.ts), because a saved cut is a pair of indices into
 * exactly this array: a cut made on the phone has to point at the same
 * sentences when the site applies it, and the other way round. Change one,
 * change the other.
 *
 * Verse keeps its lines; prose gets sentences. Almost the whole catalogue is
 * prose paragraphs with no line breaks, so splitting on newlines alone offered
 * one unit per piece and "cut" meant all or nothing.
 */

/** True only for verse: many short lines, not two or three very long ones. */
function isLineated(text: string): boolean {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 4) return false;
  const avg = lines.reduce((a, l) => a + l.length, 0) / lines.length;
  return avg <= 100;
}

/**
 * Sentence boundaries, tuned for dramatic text. Ellipses and dashes are not
 * boundaries: "I promised myself I wouldn't cry... It's just hard" is one
 * thought. A one- or two-word sentence joins the one before it.
 */
function toSentences(text: string): string[] {
  // A break after . ! or ? (plus any closing quote) when followed by space and
  // a capital, a quote, or a bracket: the start of something new. Written as a
  // marker and a split rather than a lookbehind, which Hermes may not have.
  const parts = text
    .replace(/([.!?]["'”’)]?)\s+(?=["'“‘(]?[A-Z0-9])/g, '$1\u0000')
    .split('\u0000')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const words = p.split(/\s+/).filter(Boolean).length;
    if (out.length > 0 && words <= 2) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out.length ? out : [text];
}

export function splitIntoUnits(text: string | null | undefined): string[] {
  const t = text ?? '';
  if (!t.trim()) return [];
  return isLineated(t) ? t.split('\n').filter((l) => l.trim()) : toSentences(t);
}

/**
 * The units, plus how each one meets the next: a verse line ends in a line
 * break, a prose sentence in a space, and a sentence that closed a paragraph in
 * a blank line. The page keeps its shape when it is drawn unit by unit.
 */
export interface Unit {
  text: string;
  /** What comes after this unit on the page. */
  gap: 'space' | 'line' | 'paragraph';
}

export function unitsOf(text: string | null | undefined): Unit[] {
  const t = text ?? '';
  const parts = splitIntoUnits(t);
  const verse = isLineated(t);
  let cursor = 0;
  return parts.map((text, i) => {
    const at = t.indexOf(text, cursor);
    let gap: Unit['gap'] = verse ? 'line' : 'space';
    if (at >= 0) {
      cursor = at + text.length;
      const next = parts[i + 1];
      const until = next ? t.indexOf(next, cursor) : t.length;
      const between = until >= 0 ? t.slice(cursor, until) : '';
      if (/\n\s*\n/.test(between)) gap = 'paragraph';
      else if (verse && /\n/.test(between)) gap = 'line';
    }
    return { text, gap };
  });
}

/** The units of a cut joined back into a piece of text, paragraphs kept. */
export function joinUnits(units: Unit[], from = 0, to = units.length - 1): string {
  let out = '';
  for (let i = from; i <= to && i < units.length; i++) {
    out += units[i].text;
    if (i < to) out += units[i].gap === 'paragraph' ? '\n\n' : units[i].gap === 'line' ? '\n' : ' ';
  }
  return out;
}

/** Apply a saved cut. The whole piece when no cut is set. */
export function applyCut(text: string | null | undefined, start?: number | null, end?: number | null): string {
  const full = text ?? '';
  if (start == null || end == null) return full;
  const units = unitsOf(full);
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(units.length - 1, Math.max(start, end));
  if (lo > hi) return full;
  return joinUnits(units, lo, hi);
}

/*
 * Performed-duration estimate, the server's own arithmetic (duration.py), so
 * the clock on a cut matches the estimated length the catalogue shows.
 */
const BASE_WPM = 130;
const PAUSE_ELLIPSIS = 1.0;
const PAUSE_SENTENCE_END = 0.5;
const PAUSE_PARAGRAPH = 0.8;
const PAUSE_CLAUSE = 0.2;

export function estimateSeconds(text: string): number {
  if (!text || !text.trim()) return 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return 0;
  const baseSeconds = (wordCount / BASE_WPM) * 60;
  const ellipsisCount = (text.match(/\.{3}|…/g) || []).length;
  const textNoEllipsis = text.replace(/\.{3}|…/g, '');
  const sentenceEnds = (textNoEllipsis.match(/[.!?]+/g) || []).length;
  const clauseBreaks = (text.match(/[,;:—–]/g) || []).length;
  const paragraphBreaks = (text.match(/\n\s*\n/g) || []).length;
  const singleBreaks = Math.max(0, (text.match(/\n/g) || []).length - paragraphBreaks * 2);
  const pauseSeconds =
    ellipsisCount * PAUSE_ELLIPSIS +
    sentenceEnds * PAUSE_SENTENCE_END +
    clauseBreaks * PAUSE_CLAUSE +
    paragraphBreaks * PAUSE_PARAGRAPH +
    singleBreaks * PAUSE_CLAUSE;
  return Math.max(5, Math.round(baseSeconds + pauseSeconds));
}

/** "1:45" for a duration in seconds. */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * The hints level when running a piece: the first letter of every word, the
 * rest as middots, punctuation and spacing kept so the line keeps its shape.
 * "To be, or not" becomes "T· b·, o· n··".
 */
const LETTER = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;

export function maskFirstLetters(text: string): string {
  let sawFirst = false;
  let out = '';
  for (const ch of text) {
    if (LETTER.test(ch)) {
      if (!sawFirst) {
        out += ch;
        sawFirst = true;
      } else {
        out += '·';
      }
    } else {
      out += ch;
      if (/\s/.test(ch)) sawFirst = false;
    }
  }
  return out;
}
