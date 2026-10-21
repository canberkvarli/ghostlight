import { Platform } from 'react-native';

import type { Monologue } from '../data/monologues';
import { pickTonight } from '../hooks/useTonight';
import type { Medium } from '../theme/medium';

/**
 * The home screen widget's half of the bargain. The widget (targets/widget)
 * cannot fetch; it reads a week of picks the app leaves in the shared App
 * Group, one piece per local day, the same piece the ticket and the evening
 * knock name because it is the same function on the same shelf. The widget
 * turns the page at each midnight on its own and only needs the app opened
 * once a week to stay in speeches.
 *
 * The native module that writes to the group ships with the build that has the
 * widget. On a build without it the require throws, so it is loaded lazily and
 * a failure is silence, never a crash on the home.
 */

export const APP_GROUP = 'group.com.actorrise.ghostlight';
const KEY = 'tonight';
const DAYS = 8;

let lastWritten = '';

function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function syncWidget(list: Monologue[], medium: Medium): void {
  if (Platform.OS !== 'ios' || list.length === 0) return;
  const now = new Date();
  const days = [];
  for (let k = 0; k < DAYS; k++) {
    const d = new Date(now);
    d.setDate(d.getDate() + k);
    const m = pickTonight(list, medium, d);
    if (!m) continue;
    days.push({
      day: localDay(d),
      id: m.id,
      character: m.character,
      source: m.source,
      excerpt: m.excerpt.slice(0, 480),
      seconds: m.duration ?? 0,
      house: medium,
    });
  }
  if (days.length === 0) return;
  const json = JSON.stringify({ days });
  if (json === lastWritten) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExtensionStorage } = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
    new ExtensionStorage(APP_GROUP).set(KEY, json);
    ExtensionStorage.reloadWidget();
    lastWritten = json;
  } catch {
    // No widget in this build. The home does not care.
  }
}
