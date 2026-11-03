/**
 * The language now, with no native imports, so pure modules (src/rehearsal,
 * their vitest tests) can say a string in it. src/i18n/index.ts decides the
 * language (the phone, the Settings switch) and publishes it here.
 */
export type Locale = 'en' | 'tr';

let current: Locale = 'en';
const listeners = new Set<() => void>();

export function currentLocale(): Locale {
  return current;
}

export function publishLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

export function subscribeLocale(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** One string in the language now, outside React. */
export function pick(en: string, tr: string): string {
  return current === 'tr' ? tr : en;
}

/**
 * Lowercase for display, in the app's language. Stage directions lowercase
 * error text and names; plain toLowerCase turns "İ" into "i̇" (an i and a
 * stray dot) and "I" into "i", both wrong in Turkish. English is unchanged.
 */
export function lower<T extends string | null | undefined>(s: T): T {
  if (!s) return s;
  return (current === 'tr' ? s.toLocaleLowerCase('tr-TR') : s.toLowerCase()) as T;
}
