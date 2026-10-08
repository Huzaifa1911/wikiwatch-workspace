import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeFeedRows} from '../src/feedState';
import type {Edit} from '../src/model';
const edit=(id:string):Edit=>({id,title:id,wiki:'en',editor:'Editor',comment:'',delta:0,time:0,before:'',after:''});
test('burst merging deduplicates revisions and retains shared and active reviews',()=>{
 const saved={...edit('saved'),backendId:'db-id'};
 const pinned=edit('pinned');
 const events=Array.from({length:500},(_,index)=>edit(String(index)));
 const rows=mergeFeedRows([saved,pinned], [...events,events[0]],new Set(['pinned']));
 assert.equal(rows.length,202);assert.equal(new Set(rows.map(row=>row.id)).size,202);
 assert.equal(rows[0],saved);assert.ok(rows.some(row=>row.id==='pinned'));
});
