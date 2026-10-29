/** What the actor plays, from the welcome's second question: which house Search opens on, and the age they are seen for. */
export const PLAYS_KEY = 'ghostlight:plays.v1';
export type Plays = { house: 'stage' | 'screen' | 'both' | null; age: string | null };
