// Carried from actorrise lib/rehearsal (commit 9e3414b9). Pure; keep in step with the web,
// the server's line contract and journal are shared.

/**
 * A scene, from the actor's side of it.
 *
 * Consecutive partner lines become one beat so they play as one continuous
 * thing, not two clips with a seam. Actor lines carry their words, tokenised
 * once here so the page and the matcher cannot disagree about what a word is.
 *
 * Once the actor has said their last line, the scene is over for them: the
 * partner answers the cue and the run ends. The trailing beat keeps only its
 * first line. Without that, a part that leaves early (FRANCISCO, Hamlet I.i,
 * gone at L16 of 60) sat through ten minutes of everybody else.
 */
import { lineWords } from './live-read';
import type { SpeechLang } from './speech-language';
import { type RehearsalLine, sameCharacter } from './contract';

export interface PartnerTurn { kind: 'partner'; index: number; lineIndices: number[] }
export interface ActorTurn { kind: 'actor'; index: number; lineIndex: number; words: string[]; keywords: string[] }
export type Turn = PartnerTurn | ActorTurn;

export interface Script {
  lines: RehearsalLine[];
  actor: string;
  turns: Turn[];
  /** line index → turn index */
  turnOfLine: number[];
  /** What the scene is spoken in: the matcher, the call word and the keywords follow it. English when absent. */
  lang?: SpeechLang;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

/** Turkish title case: "ŞİRİN" → "Şirin", not "Şi̇ri̇n". */
function titleCaseTurkish(s: string) {
  return s.toLocaleLowerCase('tr-TR').replace(/(^|\s)\S/g, c => c.toLocaleUpperCase('tr-TR'));
}

/** A capitalised word of three letters or more, by language. Turkish capitals are Ç Ğ İ Ö Ş Ü too. */
function capitalised(text: string, lang: SpeechLang): string[] {
  if (lang === 'tr') return text.match(/(?<![\p{L}\p{N}])\p{Lu}\p{Ll}{2,}(?![\p{L}\p{N}])/gu) ?? [];
  return text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
}

/** Character names and capitalised words the transcriber would otherwise mangle. */
function sceneKeywords(lines: RehearsalLine[], lang: SpeechLang): string[] {
  const names = new Set<string>();
  for (const l of lines) names.add(lang === 'tr' ? titleCaseTurkish(l.character) : titleCase(l.character));
  for (const l of lines) {
    for (const w of capitalised(l.text, lang)) names.add(w);
  }
  return [...names].slice(0, 60);
}

export function buildScript(lines: RehearsalLine[], actor: string, lang: SpeechLang = 'en'): Script {
  const turns: Turn[] = [];
  const turnOfLine: number[] = [];
  const shared = sceneKeywords(lines, lang);
  for (const line of lines) {
    const mine = sameCharacter(line.character, actor);
    const last = turns[turns.length - 1];
    if (mine) {
      const words = lineWords(line.text, lang);
      const own = [...new Set(capitalised(line.text, lang))];
      turns.push({ kind: 'actor', index: turns.length, lineIndex: line.index, words,
        keywords: [...new Set([...shared, ...own])].slice(0, 100) });
    } else if (last && last.kind === 'partner') {
      last.lineIndices.push(line.index);
    } else {
      turns.push({ kind: 'partner', index: turns.length, lineIndices: [line.index] });
    }
    turnOfLine[line.index] = turns.length - 1;
  }
  const tail = turns[turns.length - 1];
  if (tail?.kind === 'partner' && turns.some(t => t.kind === 'actor')) tail.lineIndices.length = 1;
  return lang === 'en' ? { lines, actor, turns, turnOfLine } : { lines, actor, turns, turnOfLine, lang };
}
