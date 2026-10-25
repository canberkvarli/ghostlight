/**
 * The reader, opened from outside the rooms: the curtain's deck, the widget
 * or a reminder for a stranger. The same page as the rooms' reader, but at
 * the root of the app, so "back" is the curtain and not a room the stranger
 * has no key to. A shared route pushed from the root used to land in
 * whichever room expo-router picked, and back went to that room's door.
 */
export { default } from '../(tabs)/(search,book,board,scene)/read/[id]';
