import { Linking } from 'react-native';

/**
 * The person behind the app, and the ways to reach him.
 *
 * One place for the handles so the backstage note, the account screen and the
 * home-screen note never disagree about where Canberk lives.
 */

export const MAKER = {
  name: 'Canberk',
  email: 'canberk@actorrise.com',
  instagram: 'canberk.varli',
  x: 'canberkvarli',
} as const;

/** From eas.json `ascAppId`. The write-review page skips straight to the stars. */
const APP_STORE_ID = '6804278673';
const WRITE_REVIEW_URL = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;

export const INSTAGRAM_URL = `https://instagram.com/${MAKER.instagram}`;
export const X_URL = `https://x.com/${MAKER.x}`;

function open(url: string) {
  Linking.openURL(url).catch(() => {});
}

/**
 * Ask for a rating, on the App Store's write-review page.
 *
 * The system sheet (expo-store-review) is the better nudge and arrives with the
 * next binary; this build has no native module for it, so every path goes to
 * the store page, which always works. `inApp` is kept so call sites don't change.
 */
export async function rateGhostLight(_opts: { inApp: boolean }): Promise<void> {
  open(WRITE_REVIEW_URL);
}

export function openInstagram() {
  open(INSTAGRAM_URL);
}

export function openX() {
  open(X_URL);
}

export function emailMaker(subject = 'Ghost Light') {
  open(`mailto:${MAKER.email}?subject=${encodeURIComponent(subject)}`);
}
