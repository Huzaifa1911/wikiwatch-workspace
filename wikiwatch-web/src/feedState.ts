import type {Edit} from './model';

// The same bounded merge is used by the workspace and the sustained UI test.
export function mergeFeedRows(existing: Edit[], incoming: Edit[], pinned = new Set<string>()): Edit[] {
  const shared = existing.filter(edit => edit.backendId);
  const rows = new Map<string, Edit>();
  for (const edit of [...shared, ...incoming.filter(edit => !edit.backendId), ...existing.filter(edit => !edit.backendId)]) {
    if (!rows.has(edit.id)) rows.set(edit.id, edit);
  }
  return [...rows.values()].filter((edit, index) => index < shared.length + 200 || pinned.has(edit.id));
}
