import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApiActivity, apiActivity, withApiActivity} from '../src/apiActivity';
import {backend} from '../src/backend';
import {wikiRequest} from '../src/wiki';

function clock(t: any) {t.mock.timers.enable({apis: ['setTimeout', 'Date']});}

test('quick requests never flash a loader', t => {
  clock(t); const activity = createApiActivity();
  const end = activity.begin(); t.mock.timers.tick(100); end();
  t.mock.timers.tick(1000); assert.equal(activity.getSnapshot(), false);
});

test('overlapping requests keep one loader active until all finish', t => {
  clock(t); const activity = createApiActivity(); const changes: boolean[] = [];
  activity.subscribe(() => changes.push(activity.getSnapshot()));
  const finishFirst = activity.begin(), finishSecond = activity.begin();
  t.mock.timers.tick(180); assert.deepEqual(changes, [true]);
  finishFirst(); finishFirst(); t.mock.timers.tick(500);
  assert.equal(activity.getSnapshot(), true);
  finishSecond(); t.mock.timers.tick(120);
  assert.deepEqual(changes, [true, false]);
});

test('loader holds its minimum duration and bridges chained calls', t => {
  clock(t); const activity = createApiActivity(); const changes: boolean[] = [];
  activity.subscribe(() => changes.push(activity.getSnapshot()));
  const first = activity.begin(); t.mock.timers.tick(180); first();
  t.mock.timers.tick(100); const second = activity.begin();
  t.mock.timers.tick(300); assert.deepEqual(changes, [true]);
  second(); t.mock.timers.tick(119); assert.equal(activity.getSnapshot(), true);
  t.mock.timers.tick(1); assert.deepEqual(changes, [true, false]);
});

test('request errors release activity so loader cannot remain stuck', async t => {
  clock(t);
  let fail!: (error: Error) => void;
  const request = withApiActivity(() => new Promise((_, reject) => {fail = reject;}));
  const rejected = assert.rejects(request, /network failure/);
  t.mock.timers.tick(180); assert.equal(apiActivity.getSnapshot(), true);
  fail(Error('network failure')); await rejected;
  t.mock.timers.tick(300); assert.equal(apiActivity.getSnapshot(), false);
});

test('backend and Wikipedia requests share activity and release it after abort', async t => {
  clock(t); const original = globalThis.fetch;
  let completeBackend!: (response: Response) => void;
  globalThis.fetch = (input, init) => {
    if (String(input).includes('w/api.php')) return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true});
    });
    return new Promise(resolve => {completeBackend = resolve;});
  };
  try {
    const controller = new AbortController();
    const first = backend.request('/test', {auth: false});
    const second = wikiRequest('en', {action: 'query', prop: 'revisions', revids: '1'}, controller.signal);
    const rejected = assert.rejects(second, /Aborted/);
    await Promise.resolve();
    t.mock.timers.tick(180); assert.equal(apiActivity.getSnapshot(), true);
    completeBackend(Response.json({data: {ok: true}})); await first;
    t.mock.timers.tick(300); assert.equal(apiActivity.getSnapshot(), true);
    controller.abort(); await rejected;
    t.mock.timers.tick(120); assert.equal(apiActivity.getSnapshot(), false);
  } finally {globalThis.fetch = original;}
});
