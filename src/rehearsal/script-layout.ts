/**
 * The actor's own map of a script: the scenes in their order, each under its
 * act or episode, as they put it right when the reader got it wrong.
 *
 * Drawn as one flat list of headings and scenes, because that is what a drag
 * moves through: a scene belongs to the heading above it, so dropping it
 * under another heading refiles it. Pure, so every move is tested.
 */

export interface LayoutScene { id: number; title: string; act: string | null }

export type LayoutRow =
  | { kind: 'head'; key: string; act: string }
  | { kind: 'scene'; key: string; scene: LayoutScene };

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
/** A heading as kept: one space between words, empty as none. */
export const cleanAct = (s: string | null | undefined) => (s ?? '').split(/\s+/).filter(Boolean).join(' ') || null;

let heads = 0;
const headKey = () => `h${++heads}`;

/**
 * A script's scenes in groups, each heading once, where it first comes. A
 * scene built later under an act that is already there joins that act rather
 * than starting a second one at the bottom. No headings at all is one group.
 */
export function groupByAct<T extends { act: string | null }>(scenes: T[]): { act: string | null; scenes: T[] }[] {
  const out: { act: string | null; scenes: T[] }[] = [];
  for (const sc of scenes) {
    const act = cleanAct(sc.act);
    let g = out.find(x => norm(x.act) === norm(act));
    if (!g) { g = { act, scenes: [] }; out.push(g); }
    g.scenes.push(sc);
  }
  return out;
}

/** The flat list the editor draws: each heading, then its scenes. */
export function toRows(scenes: LayoutScene[]): LayoutRow[] {
  return groupByAct(scenes).flatMap(g => [
    ...(g.act ? [{ kind: 'head' as const, key: headKey(), act: g.act }] : []),
    ...g.scenes.map(s => ({ kind: 'scene' as const, key: `s${s.id}`, scene: { ...s, act: g.act } })),
  ]);
}

/** Each scene with the heading above it, in order: what the server is sent. */
export function layoutOf(rows: LayoutRow[]): { id: number; act: string | null }[] {
  let act: string | null = null;
  const out: { id: number; act: string | null }[] = [];
  for (const r of rows) {
    if (r.kind === 'head') act = r.act;
    else out.push({ id: r.scene.id, act });
  }
  return out;
}

/** The rows after a drag, with every scene's act read off the heading above it again. */
export function settle(rows: LayoutRow[]): LayoutRow[] {
  let act: string | null = null;
  return rows.map(r => {
    if (r.kind === 'head') { act = r.act; return r; }
    return r.scene.act === act ? r : { ...r, scene: { ...r.scene, act } };
  });
}

/** The acts in the order drawn, for "move to". */
export function actsIn(rows: LayoutRow[]): string[] {
  return rows.flatMap(r => (r.kind === 'head' ? [r.act] : []));
}

/** Put one scene at the end of an act; a name not there yet becomes a heading at the bottom. */
export function moveTo(rows: LayoutRow[], sceneId: number, act: string | null): LayoutRow[] {
  const row = rows.find(r => r.kind === 'scene' && r.scene.id === sceneId);
  if (!row) return rows;
  const want = cleanAct(act);
  const rest = rows.filter(r => r !== row);
  if (want === null) {
    // No heading: above the first heading, after whatever is already there.
    const firstHead = rest.findIndex(r => r.kind === 'head');
    const at = firstHead === -1 ? rest.length : firstHead;
    return settle([...rest.slice(0, at), row, ...rest.slice(at)]);
  }
  const h = rest.findIndex(r => r.kind === 'head' && norm(r.act) === norm(want));
  if (h === -1) return settle([...rest, { kind: 'head', key: headKey(), act: want }, row]);
  let end = h + 1;
  while (end < rest.length && rest[end].kind === 'scene') end++;
  return settle([...rest.slice(0, end), row, ...rest.slice(end)]);
}

/**
 * Rename a heading. Renamed to one that is already there, the two become one:
 * this heading's scenes join the end of the other.
 */
export function renameAct(rows: LayoutRow[], key: string, to: string): LayoutRow[] {
  const name = cleanAct(to);
  const i = rows.findIndex(r => r.key === key && r.kind === 'head');
  if (i === -1 || !name) return rows;
  const other = rows.findIndex((r, j) => j !== i && r.kind === 'head' && norm(r.act) === norm(name));
  if (other === -1) return settle(rows.map(r => (r.key === key && r.kind === 'head' ? { ...r, act: name } : r)));
  let end = i + 1;
  while (end < rows.length && rows[end].kind === 'scene') end++;
  const moving = rows.slice(i + 1, end) as Extract<LayoutRow, { kind: 'scene' }>[];
  let out = [...rows.slice(0, i), ...rows.slice(end)];
  for (const m of moving) out = moveTo([...out, m], m.scene.id, name);
  return out;
}

/** A heading added at the bottom, for scenes to be dragged or moved under. */
export function addAct(rows: LayoutRow[], name: string): LayoutRow[] {
  const act = cleanAct(name);
  if (!act || rows.some(r => r.kind === 'head' && norm(r.act) === norm(act))) return rows;
  return [...rows, { kind: 'head', key: headKey(), act }];
}

export function renameScene(rows: LayoutRow[], sceneId: number, title: string): LayoutRow[] {
  const t = title.split(/\s+/).filter(Boolean).join(' ');
  if (!t) return rows;
  return rows.map(r => (r.kind === 'scene' && r.scene.id === sceneId ? { ...r, scene: { ...r.scene, title: t } } : r));
}

export function removeScene(rows: LayoutRow[], sceneId: number): LayoutRow[] {
  return rows.filter(r => !(r.kind === 'scene' && r.scene.id === sceneId));
}

/** Headings with nothing under them, dropped: what is saved and what the shelf shows. */
export function tidy(rows: LayoutRow[]): LayoutRow[] {
  return rows.filter((r, i) => r.kind === 'scene' || rows[i + 1]?.kind === 'scene');
}

/** What changed against the scenes as they came: the calls to make, in the order to make them. */
export function changes(before: LayoutScene[], rows: LayoutRow[]): {
  deleted: number[];
  renamed: { id: number; title: string }[];
  layout: { id: number; act: string | null }[] | null;
} {
  const kept = layoutOf(rows);
  const now = new Map(rows.flatMap(r => (r.kind === 'scene' ? [[r.scene.id, r.scene] as const] : [])));
  const deleted = before.filter(s => !now.has(s.id)).map(s => s.id);
  const renamed = before.flatMap(s => {
    const n = now.get(s.id);
    return n && n.title !== s.title ? [{ id: s.id, title: n.title }] : [];
  });
  const was = before.filter(s => now.has(s.id)).map(s => ({ id: s.id, act: cleanAct(s.act) }));
  const same = was.length === kept.length && was.every((w, i) => w.id === kept[i].id && norm(w.act) === norm(kept[i].act));
  return { deleted, renamed, layout: same ? null : kept };
}
