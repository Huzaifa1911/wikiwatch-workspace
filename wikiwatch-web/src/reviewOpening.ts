import type {Edit, Store} from './model';
import {serverStore} from './backend';

export const MAX_REVIEW_BATCH = 20;

// Navigate before any network request; the review loads content independently.
export async function openReviewImmediately(
  edits: Edit[], navigate: () => void,
  admit: (edits: Edit[]) => Promise<any[]>, applySaved: (rows: any[]) => void,
) {
  navigate();
  const unsaved = edits.filter(edit => !edit.backendId);
  if (unsaved.length) applySaved(await admit(unsaved));
}

export function mergeAdmittedEdits(store: Store, rows: any[]): Store {
  const versions = new Map(store.edits.map(edit => [edit.backendId, edit.version || 0]));
  const shared = serverStore(rows.filter(row => row.version >= (versions.get(row.id) || 0)), [], []);
  const saved = new Map(shared.edits.map(edit => [edit.id, edit]));
  const existing = new Set(store.edits.map(edit => edit.id));
  return {
    ...store,
    boardCounts: undefined,
    workload: undefined,
    edits: [
      ...store.edits.map(edit => {
        const admitted = saved.get(edit.id);
        return admitted ? {...edit, ...admitted, before: edit.before, after: edit.after,
          contentStatus: edit.contentStatus} : edit;
      }),
      ...shared.edits.filter(edit => !existing.has(edit.id)),
    ],
    claims: [...store.claims.filter(claim => !saved.has(claim.editId)), ...shared.claims],
  };
}
