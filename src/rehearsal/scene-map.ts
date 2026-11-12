/**
 * The map of a script before it is built: every scene the quick read found,
 * under its act or episode, in the order of the pages, each with a box.
 *
 * The phone's copy of the web's `lib/scriptMap.ts` (actorrise), cut to what
 * the sheet needs: which rows can be ticked, how many more this plan may
 * tick, and what one tap does. Pure, so the sums are tested without a phone.
 */

/** One row of the map `/api/scripts/scan` and `/scene-map` return. */
export interface ScannedScene {
  index: number;
  act_label: string | null;
  scene_label: string | null;
  title: string | null;
  characters: string[];
  line_count: number;
  char_start: number;
  char_end: number;
  page_start: number | null;
  page_end: number | null;
}

export interface ScriptScan {
  page_count: number;
  has_structure: boolean;
  num_acts: number;
  scenes: ScannedScene[];
  language?: string;
}

/**
 * ScenePartner reads the other part, so a scene needs two speakers to build.
 * Exactly one, not fewer than two: an empty cast means the quick read could
 * not parse the layout, and the full build may still find both parts.
 */
export function isSolo(scene: Pick<ScannedScene, 'characters'>): boolean {
  return scene.characters.length === 1;
}

export type Lock = 'solo' | 'built' | null;
export interface MapRow { scan: ScannedScene; locked: Lock }
export interface MapGroup { act: string | null; rows: MapRow[] }

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');

/**
 * The read laid out as the sheet draws it. Rows keep the order of the pages;
 * a new heading starts a group, and a heading met again later (an act the
 * read came back to) joins the group it already has. A script with no
 * headings at all is one group with no heading.
 */
export function groupScan(scan: ScannedScene[], built: Iterable<number> = []): MapGroup[] {
  const done = new Set(built);
  const groups: MapGroup[] = [];
  for (const row of scan) {
    const act = row.act_label?.trim() || null;
    let group = groups.find(g => norm(g.act) === norm(act));
    if (!group) { group = { act, rows: [] }; groups.push(group); }
    group.rows.push({ scan: row, locked: done.has(row.index) ? 'built' : isSolo(row) ? 'solo' : null });
  }
  return groups;
}

/** The rows the actor could tick at all, plan aside, in the order drawn. */
export function tickable(groups: MapGroup[]): ScannedScene[] {
  return groups.flatMap(g => g.rows.filter(r => r.locked === null).map(r => r.scan));
}

/**
 * How many more scenes this plan may tick on this script. null is unlimited.
 * `builtCount` is every scene the script holds already, because that is what
 * the server counts against the allowance.
 */
export function tickRoom(limit: number | null, builtCount = 0): number | null {
  if (limit == null) return null;
  return Math.max(0, limit - builtCount);
}

/** Free builds one scene of a script; paid has no cap. The server's `_scene_allowance` is the truth. */
export function sceneAllowance(isPaid: boolean): number | null {
  return isPaid ? null : 1;
}

/**
 * Tick or untick one row. `overLimit` is true when the tick was refused
 * because the plan has no room left: the moment for the paywall, not before.
 */
export function toggleTick(picked: ReadonlySet<number>, index: number, room: number | null): { picked: Set<number>; overLimit: boolean } {
  const next = new Set(picked);
  if (next.has(index)) { next.delete(index); return { picked: next, overLimit: false }; }
  if (room != null && next.size >= room) return { picked: next, overLimit: true };
  next.add(index);
  return { picked: next, overLimit: false };
}

/** What is ticked when the map opens: the first scene that can be built, if the plan has room for one. */
export function firstPicks(groups: MapGroup[], room: number | null): Set<number> {
  const first = tickable(groups)[0];
  return first && (room == null || room > 0) ? new Set([first.index]) : new Set();
}

/** The ticked rows as the server wants them, in script order. */
export function picksOf(scan: ScannedScene[], picked: ReadonlySet<number>): ScannedScene[] {
  return scan.filter(s => picked.has(s.index));
}

/** Below this there is nothing to choose between, so the sheet does not ask (as on the web). */
export const MAP_MIN_SCENES = 2;

/** Worth showing the map for: two scenes or more, and at least one of them can be built. */
export function worthAsking(scan: ScriptScan | null | undefined): boolean {
  if (!scan || scan.scenes.length < MAP_MIN_SCENES) return false;
  return scan.scenes.some(s => !isSolo(s));
}

/**
 * A row's name. The heading under its act reads without the act again:
 * "Act 1, Scene 2" under ACT 1 is "Scene 2".
 */
export function rowTitle(row: ScannedScene): string {
  const label = row.scene_label?.trim() || null;
  const title = row.title?.trim() || null;
  if (label && title && norm(label) !== norm(title)) return `${label}: ${title}`;
  return label ?? title ?? `Scene ${row.index + 1}`;
}
