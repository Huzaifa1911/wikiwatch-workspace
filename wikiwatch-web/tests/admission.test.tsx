import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eventToEdit, resolveAdmissionEdits} from '../src/wiki';
import {backend} from '../src/backend';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const liveEvent = JSON.parse(readFileSync(new URL('./live-event.json', import.meta.url), 'utf8'));
const liveEdit = () => eventToEdit(liveEvent)!;

test('a recorded real stream event without page_id resolves before backend submission', async () => {
  const edit = liveEdit();
  assert.equal(edit.pageId, undefined);
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('w/api.php')) {
      const params = new URL(url).searchParams;
      assert.equal(params.get('revids'), String(edit.newRev));
      assert.equal(params.get('rvprop'), 'ids');
      return Response.json({query: {pages: [{pageid: 123, revisions: [{revid: edit.newRev}]}]}});
    }
    assert.ok(url.endsWith('/edits/admit'));
    const body = JSON.parse(String(init?.body));
    assert.equal(body.edits[0].page_id, 123);
    assert.equal(body.edits[0].new_rev, edit.newRev);
    return Response.json({data: [{id: 'saved-edit'}]});
  };
  assert.deepEqual(await backend.admit([edit]), [{id: 'saved-edit'}]);
  assert.equal(calls.length, 2);
  assert.equal(edit.pageId, undefined);
});

test('snapshot events with page IDs require no Wikipedia lookup', async () => {
  globalThis.fetch = async () => { throw Error('Unexpected lookup'); };
  const edit = {...liveEdit(), pageId: 123};
  assert.deepEqual(await resolveAdmissionEdits([edit]), [edit]);
});

test('demo edits remain blocked before network requests', async () => {
  globalThis.fetch = async () => { throw Error('Unexpected request'); };
  await assert.rejects(backend.admit([{...liveEdit(), source: 'fixture'}]), /Only a real Wikipedia revision/);
});

test('unresolvable revisions are not submitted to the backend', async () => {
  let count = 0;
  globalThis.fetch = async (input) => {
    count++;
    assert.ok(String(input).includes('w/api.php'));
    return Response.json({query: {pages: []}});
  };
  await assert.rejects(backend.admit([liveEdit()]), /could not resolve revision/);
  assert.equal(count, 1);
});

test('multiple missing page IDs share a single metadata lookup', async () => {
  let count = 0;
  globalThis.fetch = async (input) => {
    count++;
    assert.equal(new URL(String(input)).searchParams.get('revids'), '101|102');
    return Response.json({query: {pages: [{pageid: 123, revisions: [{revid: 101}, {revid: 102}]}]}});
  };
  const resolved = await resolveAdmissionEdits([{...liveEdit(), newRev: 101}, {...liveEdit(), newRev: 102}]);
  assert.deepEqual(resolved.map(edit => edit.pageId), [123, 123]);
  assert.equal(count, 1);
});
