import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openReviewImmediately, mergeAdmittedEdits} from '../src/reviewOpening';
import type {Edit, Store} from '../src/model';
const edit: Edit = {id: 'en:10:11', wiki: 'en', title: 'Example', editor: 'Editor', comment: '',
  delta: 1, time: 1, oldRev: 10, newRev: 11, source: 'wiki', before: '', after: ''};
const row = {id: 'db-id', wiki: 'enwiki', old_rev: 10, new_rev: 11, page_id: 12,
  title: 'Example', editor: 'Editor', comment: '', delta: 1, occurred_at: '2026-10-08T00:00:00Z',
  status: 'unclaimed', version: 1};
const store = (): Store => ({edits: [edit], members: [], claims: [], audit: []});

test('review opens before saving finishes and merges the returned edit', async () => {
  let complete!: (rows: any[]) => void;
  const saving = new Promise<any[]>(resolve => {complete = resolve;});
  const steps: string[] = [];
  let saved: any[] = [];
  const opened = openReviewImmediately([edit], () => {steps.push('open');}, async () => {
    steps.push('save'); return saving;
  }, rows => {steps.push('merge'); saved = rows;});
  assert.deepEqual(steps, ['open', 'save']);
  complete([row]); await opened;
  assert.deepEqual(steps, ['open', 'save', 'merge']);
  assert.deepEqual(saved, [row]);
});

test('already saved edits open without admission or a workspace refresh', async () => {
  let opened = false;
  await openReviewImmediately([{...edit, backendId: 'db-id'}], () => {opened = true;},
    async () => {throw Error('Unexpected submission');}, () => {throw Error('Unexpected merge');});
  assert.equal(opened, true);
});

test('saving failures leave the review open and do not mark it saved', async () => {
  let opened = false;
  await assert.rejects(openReviewImmediately([edit], () => {opened = true;},
    async () => {throw Error('Network unavailable');}, () => {throw Error('Unexpected merge');}), /Network unavailable/);
  assert.equal(opened, true);
});

test('background admission preserves content and unrelated workspace data', () => {
  const original = store();
  original.edits = [{...edit, before: 'old text', after: 'new text', contentStatus: 'ready'},
    {...edit, id: 'other'}];
  original.claims = [{editId: 'other', owner: 'reviewer', outcome: 'claimed', reason: '', claimedAt: 1}];
  const merged = mergeAdmittedEdits(original, [row]);
  assert.equal(merged.edits[0].backendId, 'db-id');
  assert.equal(merged.edits[0].pageId, 12);
  assert.equal(merged.edits[0].before, 'old text');
  assert.equal(merged.edits[0].after, 'new text');
  assert.equal(merged.edits[0].contentStatus, 'ready');
  assert.deepEqual(merged.claims, original.claims);
  assert.equal(merged.edits[1], original.edits[1]);
  assert.equal(original.edits[0].backendId, undefined);
});

test('an already claimed admission response updates ownership without duplication', () => {
  const merged = mergeAdmittedEdits(store(), [{...row, status: 'claimed', owner_id: 'other-reviewer',
    claimed_at: '2026-10-08T00:00:00Z'}]);
  assert.equal(merged.claims[0].owner, 'other-reviewer');
  assert.equal(merged.claims[0].editId, edit.id);
  assert.equal(mergeAdmittedEdits(merged, [row]).claims.length, 0);
  assert.equal(mergeAdmittedEdits(merged, [row]).edits.length, 1);
});


test('an older admission response cannot undo a confirmed claim', () => {
  const original = {edits:[],claims:[],members:[],audit:[]} as Store;
  const fresh = {id:'db-id',wiki:'enwiki',old_rev:10,new_rev:20,page_id:42,title:'Mars',editor:'Editor',comment:'',delta:0,occurred_at:new Date().toISOString(),admitted_at:new Date().toISOString(),version:2,status:'claimed',owner_id:'reviewer',reason:'',return_reason:''};
  const claimed = mergeAdmittedEdits(original,[fresh]);
  const merged = mergeAdmittedEdits(claimed,[{...fresh,version:1,status:'unclaimed',owner_id:null}]);
  assert.equal(merged.edits[0].version,2);
  assert.equal(merged.claims[0].owner,'reviewer');
});
