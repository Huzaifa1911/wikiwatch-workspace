import type {Edit} from './model';
import {withApiActivity} from './apiActivity';
export const WIKIS=['en','ar','ja'] as const;
export const STREAM='https://stream.wikimedia.org/v2/stream/recentchange';
const cache=new Map<string,Edit>();let tail:Promise<unknown>=Promise.resolve();
export type ApiCheck={operation:string,url:string,status:string};
function report(operation:string,url:string,status:string){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('wiki-api-check',{detail:{operation,url,status}}));}
export function apiURL(wiki:string,params:Record<string,string>){if(!WIKIS.includes(wiki as any))throw Error('Unsupported wiki.');return `https://${wiki}.wikipedia.org/w/api.php?${new URLSearchParams({format:'json',formatversion:'2',origin:'*',...params})}`;}
export async function wikiRequest(wiki:string,params:Record<string,string>,signal?:AbortSignal){const url=apiURL(wiki,params);const operation=params.prop||params.list||params.action;const run=async()=>{signal?.throwIfAborted();report(operation,url,'Loading');for(let attempt=0;attempt<3;attempt++){const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,15000);try{const response=await fetch(url,{signal:controller.signal,credentials:'omit',headers:{'Api-User-Agent':`PatrolDeskTraining/1.0 (${typeof location!=='undefined'&&location.protocol.startsWith('http')?location.origin:'browser-local frontend training prototype'})`}});if((response.status===429||response.status===503)&&attempt<2){const value=response.headers.get('Retry-After');const seconds=value?(Number(value)||Math.max(0,(Date.parse(value)-Date.now())/1000)):5*(attempt+1);report(operation,url,`Rate limited: retry in ${Math.ceil(seconds)}s`);if(seconds>60)throw Error(`Rate limited. Retry after ${Math.ceil(seconds)} seconds.`);await new Promise<void>((resolve,reject)=>{const t=setTimeout(resolve,Math.max(1000,seconds*1000));signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'))},{once:true})});continue}if(!response.ok)throw Error(`Wikipedia returned HTTP ${response.status}.`);const json=await response.json();if(json.error)throw Error(json.error.info||json.error.code);report(operation,url,'Passed');return json}catch(e){report(operation,url,signal?.aborted?'Cancelled':(e as Error).message);throw e}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}}throw Error('Request failed.')};const promise=withApiActivity(()=>tail.then(run,run));tail=promise.catch(()=>{});return promise;}
export function eventToEdit(raw:any):Edit|null{if(raw?.meta?.domain==='canary'||!['edit','new'].includes(raw?.type)||raw.namespace!==0)return null;const wiki=WIKIS.find(w=>raw.server_name===`${w}.wikipedia.org`);if(!wiki||!Number.isSafeInteger(raw.revision?.new)||raw.revision.new<=0)return null;const old=Number.isSafeInteger(raw.revision.old)?raw.revision.old:0;const newRev=raw.revision.new;return {id:`${wiki}:${old}:${newRev}`,wiki,title:String(raw.title||'Untitled'),editor:String(raw.user||'Hidden editor'),comment:String(raw.comment||''),delta:Number(raw.length?.new||0)-Number(raw.length?.old||0),time:Number(raw.timestamp)*1000,before:'',after:'',oldRev:old,newRev,pageId:raw.page_id,source:'wiki',contentStatus:'unloaded',namespace:0,bot:!!raw.bot};}
export async function recentEdits(wiki:string,signal?:AbortSignal){const json=await wikiRequest(wiki,{action:'query',list:'recentchanges',rctype:'edit|new',rcnamespace:'0',rcprop:'title|ids|timestamp|sizes|user|comment|flags',rclimit:'30'},signal);return (json.query?.recentchanges||[]).map((r:any)=>eventToEdit({type:r.type,namespace:r.ns,server_name:`${wiki}.wikipedia.org`,title:r.title,user:r.user,comment:r.comment,length:{old:r.oldlen,new:r.newlen},revision:{old:r.old_revid,new:r.revid},page_id:r.pageid,timestamp:Date.parse(r.timestamp)/1000,bot:!!r.bot})).filter(Boolean) as Edit[];}
export async function revisionPair(edit:Edit,signal?:AbortSignal):Promise<Edit>{if(edit.source!=='wiki')return edit;const cached=cache.get(edit.id);if(cached)return cached;const ids=[edit.oldRev,edit.newRev].filter(x=>!!x).join('|');const json=await wikiRequest(edit.wiki,{action:'query',prop:'revisions',revids:ids,rvprop:'ids|content|contentmodel|sha1',rvslots:'main'},signal);const revisions=(json.query?.pages||[]).flatMap((p:any)=>p.revisions||[]);function content(id:number|undefined){if(!id)return '';const revision=revisions.find((r:any)=>r.revid===id);const slot=revision?.slots?.main;if(!revision||revision.texthidden||slot?.texthidden||typeof slot?.content!=='string')throw Error('Revision content is unavailable or hidden.');if(slot.contentmodel!=='wikitext')throw Error(`Unsupported content model: ${slot.contentmodel||'unknown'}.`);return slot.content}const ready={...edit,pageId:json.query?.pages?.find((p:any)=>p.revisions?.some((r:any)=>r.revid===edit.newRev))?.pageid??edit.pageId,before:content(edit.oldRev),after:content(edit.newRev),contentStatus:'ready' as const};if(ready.before.length+ready.after.length>300000 || ready.before.split('\n').length+ready.after.split('\n').length>12000)throw Error('This revision is too large for an interactive review. Open the Wikipedia comparison to inspect it.');cache.set(edit.id,ready);if(cache.size>30)cache.delete(cache.keys().next().value!);return ready;}
export async function validateCompare(edit:Edit,signal?:AbortSignal){if(!edit.oldRev)throw Error('New page: previous content is empty; no old revision to compare.');return wikiRequest(edit.wiki,{action:'compare',fromrev:String(edit.oldRev),torev:String(edit.newRev),prop:'ids|title|diffsize'},signal)}

// Recentchange stream events can omit page IDs. Resolve them in batches only
// when an edit is submitted, rather than querying Wikipedia for every arrival.
export async function resolveAdmissionEdits(edits: Edit[]): Promise<Edit[]> {
  for (const edit of edits) {
    if (edit.source !== 'wiki' || !Number.isSafeInteger(edit.newRev) || edit.newRev! <= 0)
      throw Error('Only a real Wikipedia revision can enter the shared queue.');
  }
  const resolved = edits.map(edit => ({...edit}));
  for (const wiki of new Set(resolved.map(edit => edit.wiki))) {
    const missing = resolved.filter(edit => edit.wiki === wiki &&
      (!Number.isSafeInteger(edit.pageId) || edit.pageId! <= 0));
    for (let start = 0; start < missing.length; start += 50) {
      const batch = missing.slice(start, start + 50);
      const json = await wikiRequest(wiki, {
        action: 'query', prop: 'revisions',
        revids: [...new Set(batch.map(edit => edit.newRev))].join('|'), rvprop: 'ids',
      });
      const pageIds = new Map<number, number>();
      for (const page of json.query?.pages || []) {
        if (!Number.isSafeInteger(page.pageid) || page.pageid <= 0) continue;
        for (const revision of page.revisions || []) pageIds.set(revision.revid, page.pageid);
      }
      for (const edit of batch) {
        const pageId = pageIds.get(edit.newRev!);
        if (!pageId) throw Error(`Wikipedia could not resolve revision ${edit.newRev} to a page. It may have been deleted or hidden.`);
        edit.pageId = pageId;
      }
    }
  }
  return resolved;
}
