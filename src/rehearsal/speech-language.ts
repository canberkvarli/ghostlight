// Carried from actorrise (Turkish rehearsal, 2026-11-03). Pure; keep in step with the web.

/**
 * The language a rehearsal is spoken in.
 *
 * Decided by the script, never by the UI locale: an actor on the English UI
 * can rehearse a Turkish Hamlet. The server says (`language` on the scene
 * payload and on a monologue, from plays.language or, for an uploaded script,
 * from its words); `detectSpeechLang` is the same rule for text the client
 * holds on its own (a community script in the Green Room).
 *
 * Everything that hears the actor takes this: the browser recogniser
 * (`recognitionLocale`), the live transcriber, and the matcher (word-match.ts).
 */

export type SpeechLang = 'en' | 'tr';

/** A supported code, or English. "tr-TR", "TR" → "tr"; anything unknown → "en". */
export function speechLang(code?: string | null): SpeechLang {
  const base = (code ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return base === 'tr' ? 'tr' : 'en';
}

/** The BCP 47 tag a browser SpeechRecognition wants. */
export function recognitionLocale(lang: SpeechLang): string {
  return lang === 'tr' ? 'tr-TR' : 'en-US';
}

/*
 * Letters only Turkish writes among the scripts we see. ö and ü are left out:
 * German names carry them in English plays. Kept in step with
 * backend/app/services/rehearsal/language.py.
 */
const TURKISH_ONLY = /[ıİğĞşŞ]/g;
const TURKISH_WORDS = new Set(
  ('ve bir bu da de ne ben sen o biz siz onlar değil mi mu mı mü için ile gibi ' +
    'ama çok var yok şey diye bana sana beni seni benim senin neden nasıl şimdi ' +
    'evet hayır').split(' '),
);
const MIN_LETTERS = 40;
const MIN_TURKISH_LETTER_SHARE = 0.01;
const MIN_TURKISH_WORD_SHARE = 0.08;

/** "tr" when the text is plainly Turkish, else "en". Strict: English never flips. */
export function detectSpeechLang(text: string): SpeechLang {
  const s = text ?? '';
  const letters = (s.match(/\p{L}/gu) ?? []).length;
  if (letters < MIN_LETTERS) return 'en';
  if ((s.match(TURKISH_ONLY) ?? []).length / letters < MIN_TURKISH_LETTER_SHARE) return 'en';
  const words = (s.match(/\p{L}+/gu) ?? []).map(w => w.toLocaleLowerCase('tr-TR'));
  if (!words.length) return 'en';
  const common = words.filter(w => TURKISH_WORDS.has(w)).length;
  return common / words.length >= MIN_TURKISH_WORD_SHARE ? 'tr' : 'en';
}

/** The word an actor says to call for a line, as the hint prints it. */
export function lineCallWord(lang: SpeechLang): string {
  return lang === 'tr' ? 'replik' : 'line';
}
