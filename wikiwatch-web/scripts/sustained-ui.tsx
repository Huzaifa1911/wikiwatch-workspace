// Runs actual production feed/diff components in a DOM harness, not a browser.
// External services and team data are never used. Run explicitly with:
// node --expose-gc --max-old-space-size=384 --import tsx scripts/sustained-ui.tsx 600
import {JSDOM} from 'jsdom';
import React from 'react';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dom = new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','Element','Node','NodeFilter','DocumentFragment','MutationObserver','HTMLInputElement','HTMLTextAreaElement','HTMLButtonElement','HTMLFormElement','HTMLOptionElement','HTMLSelectElement','Event','MouseEvent','CustomEvent','KeyboardEvent','getComputedStyle','localStorage','sessionStorage','StorageEvent']) Object.defineProperty(globalThis,key,{value:(dom.window as any)[key],configurable:true,writable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
(globalThis as any).ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;
dom.window.HTMLElement.prototype.setPointerCapture=function(){};
dom.window.HTMLElement.prototype.releasePointerCapture=function(){};
const {render,cleanup,act,fireEvent,screen}=await import('@testing-library/react');
const {Feed}=await import('../src/App');
const {DiffViewer}=await import('../src/DiffViewer');
const {observe}=await import('../src/model');
const {mergeFeedRows}=await import('../src/feedState');
const seconds=Number(process.argv[2]||600);
if(seconds<120)throw Error('Use at least 120 seconds for this soak test.');
const template={wiki:'en',title:'Load article',editor:'Load editor',comment:'Load metadata',delta:50,time:Date.now()-60000,before:'',after:'',source:'wiki' as const,contentStatus:'unloaded' as const};
let store:any={edits:Array.from({length:9000},(_,i)=>({...template,id:'saved-'+i,backendId:'db-'+i,pageId:i+1})),claims:[],members:[{id:'reviewer',name:'Load reviewer',email:'reviewer@example.org',role:'patroller',active:true}],audit:[],observations:[],arrivals:0};
const before=Array.from({length:5000},(_,i)=>`Line ${i}: original article content.`).join('\n');
const diffEdit={...template,id:'diff',title:'Load diff',before,after:before.replace('Line 2500: original','Line 2500: changed'),contentStatus:'ready' as const};
function Screen(){return <><Feed store={{...store,edits:[...store.edits].sort((a:any,b:any)=>b.time-a.time)}} role="patroller" actor="reviewer" act={()=>true} offline={false} onOpen={()=>{}} mode="wiki"/><DiffViewer edit={{...diffEdit,version:iterations+1}}/></>}
let iterations=0,received=0,peakRss=0,peakHeap=0,maxNodes=0;
const timings:number[]=[],samples:any[]=[];
const begin=performance.now();
const view=render(<Screen/>);
await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100))});
if(process.argv[3]==='follow')fireEvent.click(screen.getByRole('button',{name:'Follow live'}));
for(;performance.now()-begin<seconds*1000;iterations++){
 const step=performance.now();
 const incoming=Array.from({length:500},(_,i)=>({...template,id:'event-'+(received+i),pageId:10000+received+i,time:Date.now()}));
 received+=incoming.length;
 store={...store,edits:mergeFeedRows(store.edits,incoming),observations:observe(store.observations,incoming),arrivals:received};
 await act(async()=>{view.rerender(<Screen/>)});
 timings.push(performance.now()-step);
 const memory=process.memoryUsage();peakRss=Math.max(peakRss,memory.rss);peakHeap=Math.max(peakHeap,memory.heapUsed);
 maxNodes=Math.max(maxNodes,document.querySelectorAll('*').length);
 assert.ok(store.edits.length<=9200);
 assert.ok(store.observations.length<=10183);
 assert.equal(store.observations.reduce((sum:number,row:any)=>sum+row.count,0),received);
 if(iterations%5===0){
   (globalThis as any).gc?.();const retained=process.memoryUsage();
   const sample={elapsed_seconds:Math.round((performance.now()-begin)/1000),rss_mib:retained.rss/1048576,retained_heap_mib:retained.heapUsed/1048576,observations:store.observations.length,rows:store.edits.length,nodes:document.querySelectorAll('*').length};samples.push(sample);
   if(iterations%30===0)console.log(JSON.stringify({...sample,received}));
 }
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,1000-(performance.now()-step))));
}
const percentile=(values:number[],fraction:number)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*fraction)-1)];
const first=samples.filter(row=>row.elapsed_seconds<=60).map(row=>row.retained_heap_mib);
const last=samples.filter(row=>row.elapsed_seconds>=seconds-60).map(row=>row.retained_heap_mib);
const growth=percentile(last,.5)-percentile(first,.5);
const checks={bounded_rows:store.edits.length<=9200,bounded_observations:store.observations.length<=10183,counts_preserved:store.observations.reduce((sum:number,row:any)=>sum+row.count,0)===received,heap_growth_under_32_mib:growth<32,dom_nodes_under_5000:maxNodes<5000,merge_and_render_p95_under_100_ms:percentile(timings,.95)<100};
const report={following_live:process.argv[3]==='follow',environment:'Node/JSDOM: production Feed, DiffViewer, observe and mergeFeedRows; no browser layout/paint measurement',duration_seconds:(performance.now()-begin)/1000,received_events:received,initial_shared_edits:9000,events_per_batch:500,peak_rss_mib:peakRss/1048576,peak_heap_mib:peakHeap/1048576,retained_heap_growth_mib:growth,merge_and_render_p50_ms:percentile(timings,.5),merge_and_render_p95_ms:percentile(timings,.95),merge_and_render_max_ms:Math.max(...timings),maximum_dom_nodes:maxNodes,checks,samples};
writeFileSync(process.argv[4]||'../wikiwatch-backend/docs/ui-load-test-results.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
cleanup();dom.window.close();
process.exit(Object.values(checks).every(Boolean)?0:1);
