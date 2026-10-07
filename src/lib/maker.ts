import { Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';

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
 * Ask for a rating.
 *
 * `inApp` uses the system sheet, which is right for the backstage note: one
 * tap, no context switch. Apple rations that sheet and may silently not show
 * it, which is fine for a nudge and wrong for a button someone deliberately
 * pressed in Account, so the explicit path goes to the App Store page instead.
 */
export async function rateGhostLight({ inApp }: { inApp: boolean }): Promise<void> {
  if (inApp) {
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
        return;
      }
    } catch {
      // Fall through to the store page.
    }
  }
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
