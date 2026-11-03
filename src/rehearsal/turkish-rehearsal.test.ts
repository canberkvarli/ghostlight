/**
 * Carried from actorrise lib/turkish-rehearsal.test.ts (2026-11-03), less the web's
 * spoken "line!" call and its monologue matcher, which the app does not have.
 *
 * Turkish rehearsal, end to end through the pure parts: the language rule, the
 * matcher, the "line!" call, the script and the drawn words. Real Turkish
 * text, with the letters that broke it (ç ğ ı ö ş ü, I/İ) and a transcript the
 * way a recogniser hands it back.
 *
 * Every Turkish case has an English twin that must come out as it always did.
 */
import { describe, expect, it } from 'vitest';
import { normWords, tokenize, wordsMatch, wordMatchScore } from './word-match';
import { liveRead, lineWords } from './live-read';
import { buildScript } from './script';
import { displayRuns } from './display-words';
import { detectSpeechLang, lineCallWord, recognitionLocale, speechLang } from './speech-language';
import type { RehearsalLine } from './contract';

/** The English normaliser as it was before Turkish (commit 3c2cc3f), verbatim. */
function oldNormWords(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―−-]+/g, ' ')
    .replace(/([.!?;:,])([a-z0-9])/gi, '$1 $2')
    .replace(/['‘’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const HAMLET = 'Olmak ya da olmamak, işte bütün mesele bu.';
const CAGLA = 'Şirin, kadın dediğin evde oturmaz; ışıkları kapat da çık.';
const SIRIN = 'Hâlâ mı ağlıyorsun? Gözlerini sil, İsmail ağabey geliyor.';

describe('the rehearsal language', () => {
  it('comes from a code, defaulting to English', () => {
    expect(speechLang('tr')).toBe('tr');
    expect(speechLang('tr-TR')).toBe('tr');
    expect(speechLang('en')).toBe('en');
    expect(speechLang(undefined)).toBe('en');
    expect(speechLang('de')).toBe('en');
    expect(recognitionLocale('tr')).toBe('tr-TR');
    expect(recognitionLocale('en')).toBe('en-US');
    expect(lineCallWord('tr')).toBe('replik');
    expect(lineCallWord('en')).toBe('line');
  });

  it('is read off a script that does not say', () => {
    expect(detectSpeechLang([HAMLET, CAGLA, SIRIN, 'Ben de gelmiyorum, değil mi?'].join(' '))).toBe('tr');
    expect(detectSpeechLang('To be, or not to be, that is the question. Herr Müller says Göring was here, and Şirin too.')).toBe('en');
    expect(detectSpeechLang('')).toBe('en');
  });
});

describe('normalising Turkish', () => {
  it('keeps the Turkish letters as letters', () => {
    expect(normWords('Kadın', 'tr')).toBe('kadın');
    expect(tokenize(CAGLA, 'tr')).toEqual(['şirin', 'kadın', 'dediğin', 'evde', 'oturmaz', 'ışıkları', 'kapat', 'da', 'çık']);
  });

  it('lowercases I and İ the Turkish way', () => {
    expect(normWords('IŞIK', 'tr')).toBe('ışık');
    expect(normWords('İSMAİL', 'tr')).toBe('ismail');
    // A transcript lowercased somewhere the English way carries a stray dot.
    expect(normWords('i̇smai̇l', 'tr')).toBe('ismail');
  });

  it('folds the circumflex and drops the suffix apostrophe', () => {
    expect(normWords('Hâlâ', 'tr')).toBe('hala');
    expect(normWords("Hamlet'in Danimarka'da", 'tr')).toBe('hamletin danimarkada');
  });

  it('leaves English exactly as it was, Turkish letters and all', () => {
    const corpus = [
      'Twenty-four.', "I've got to talk.We can't", 'Kadın', 'IŞIK İSMAİL', 'café naïve Señor',
      "Hamlet'in", '— (beat) “Yes,” she said…', 'O, that this too too solid flesh would melt',
    ];
    for (const s of corpus) expect(normWords(s)).toBe(oldNormWords(s));
    expect(tokenize('Kadın')).toEqual(['kad', 'n']); // the old split, still English's
  });
});

describe('matching Turkish words', () => {
  it('forgives a transcriber that drops the marks', () => {
    expect(wordsMatch('kadın', 'kadin', 'tr')).toBe(true);
    expect(wordsMatch('çok', 'cok', 'tr')).toBe(true);
    expect(wordsMatch('ışıkları', 'isiklari', 'tr')).toBe(true);
    expect(wordsMatch('ağlıyorsun', 'aglıyorsun', 'tr')).toBe(true);
  });

  it('does not join different words', () => {
    expect(wordsMatch('kız', 'kaz', 'tr')).toBe(false);
    expect(wordsMatch('evde', 'oturmaz', 'tr')).toBe(false);
  });

  it('reads numerals the Turkish way', () => {
    expect(wordMatchScore('Yirmi dört saat.', '24 saat', 'tr')).toBe(1);
    expect(wordMatchScore('Yüz yıl.', '100 yıl', 'tr')).toBe(1);
    expect(wordMatchScore('Twenty-four hours.', '24 hours')).toBe(1);
  });
});

describe('a Turkish line read live', () => {
  it('follows the actor word by word to the end', () => {
    const words = lineWords(CAGLA, 'tr');
    let read = liveRead(words, 'Şirin kadın dediğin', undefined, 'tr');
    expect(read.position).toBe(3);
    read = liveRead(words, 'Şirin kadın dediğin evde oturmaz ışıkları kapat da çık', read, 'tr');
    expect(read.lastWordMatched).toBe(true);
    expect(read.position).toBe(words.length);
  });

  it('follows a transcript with the marks dropped', () => {
    const read = liveRead(lineWords(SIRIN, 'tr'), 'hala mi agliyorsun gozlerini sil ismail agabey geliyor', undefined, 'tr');
    expect(read.lastWordMatched).toBe(true);
    expect(read.score).toBe(1);
  });

  it('was deaf to it before: the English matcher cannot finish the line', () => {
    // Identical text mangles the same way on both sides ("kad n" = "kad n"),
    // so the old matcher only held up while the transcript matched letter for
    // letter. A recogniser that writes it any other way lost the line.
    const heard = 'hala mi agliyorsun gozlerini sil ismail agabey geliyor';
    const english = liveRead(lineWords(SIRIN), heard);
    const turkish = liveRead(lineWords(SIRIN, 'tr'), heard, undefined, 'tr');
    expect(turkish.score).toBe(1);
    expect(english.lastWordMatched && english.score === 1).toBe(false);
    expect(tokenize('kadın')).toEqual(['kad', 'n']);
  });
});

describe('real transcripts', () => {
  /* What gpt-live-transcribe gave back on 2026-11-03 for these three lines,
     spoken by the Gemini partner voice and streamed through a live session
     with languages ["tr"]. Note "abi" for the written "ağabey". */
  const heard: [string, string][] = [
    [HAMLET, 'Olmak ya da olmamak. İşte bütün mesele bu.'],
    [CAGLA, 'Şirin, kadın dediğin evde oturmaz, ışıkları kapat da çık.'],
    [SIRIN, 'Hâlâ mı ağlıyorsun? Gözlerini sil, İsmail abi geliyor.'],
  ];
  it('each one reaches the end of its line', () => {
    for (const [line, transcript] of heard) {
      const read = liveRead(lineWords(line, 'tr'), transcript, undefined, 'tr');
      expect(read.lastWordMatched).toBe(true);
      expect(read.position).toBe(lineWords(line, 'tr').length);
    }
  });
});

describe('a Turkish scene', () => {
  const lines: RehearsalLine[] = [
    { index: 0, character: 'ŞİRİN', text: SIRIN, direction: null },
    { index: 1, character: 'ÇAĞLA', text: CAGLA, direction: null },
  ];

  it('tokenises the actor lines in Turkish and asks for Turkish names', () => {
    const script = buildScript(lines, 'ÇAĞLA', 'tr');
    expect(script.lang).toBe('tr');
    const turn = script.turns.find(t => t.kind === 'actor');
    expect(turn && turn.kind === 'actor' && turn.words).toEqual(tokenize(CAGLA, 'tr'));
    expect(turn && turn.kind === 'actor' && turn.keywords).toEqual(expect.arrayContaining(['Şirin', 'Çağla', 'İsmail']));
  });

  it('an English scene is built as it always was', () => {
    const en: RehearsalLine[] = [
      { index: 0, character: 'BEN', text: 'Where were you?', direction: null },
      { index: 1, character: 'ANNA', text: 'Out with Marcus.', direction: null },
    ];
    expect(buildScript(en, 'ANNA')).toEqual(buildScript(en, 'ANNA', 'en'));
    expect(buildScript(en, 'ANNA')).not.toHaveProperty('lang');
    const turn = buildScript(en, 'ANNA').turns[1];
    expect(turn.kind === 'actor' && turn.keywords).toEqual(['Ben', 'Anna', 'Where', 'Out', 'Marcus']);
  });

  it('draws one word per matcher token', () => {
    for (const text of [HAMLET, CAGLA, SIRIN, 'Kadın-erkek, yirmi-dört.']) {
      const runs = displayRuns(text, 'tr');
      expect(runs.length).toBe(lineWords(text, 'tr').length);
    }
    expect(displayRuns(CAGLA, 'tr').map(r => r.word)).toEqual(CAGLA.split(' '));
  });
});

