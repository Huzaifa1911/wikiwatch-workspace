import {observe,type Store} from './model';
export type ActivityBin={time:number,end:number,count:number,en:number,ar:number,ja:number,partial:boolean,current:boolean,coveredSeconds:number,available:boolean};
// Observation records are minute buckets. Do not exclude a bucket merely because
// the connection started part-way through that minute.
export function activityData(store:Store,minutes:number,live:boolean,now=Date.now()){
 const minute=60000,requestedStart=Math.floor((now-minutes*minute)/minute)*minute,sessionStart=store.observationStart??requestedStart;
 const start=live?Math.max(requestedStart,Math.floor(sessionStart/minute)*minute):requestedStart;
 const end=Math.floor(now/minute)*minute+minute;
 const step=live?(end-start<=15*minute?minute:5*minute):minutes*minute/12;
 const observations=(store.observations??observe([],store.edits,now)).filter(o=>o.time>=start&&o.time<end);
 const bins:ActivityBin[]=Array.from({length:Math.max(1,Math.ceil((end-start)/step))},(_,i)=>{const from=start+i*step,to=Math.min(end,from+step),observedStart=Math.max(from,live?sessionStart:from),observedEnd=Math.min(now,to);let covered=Math.max(0,observedEnd-observedStart);for(const g of store.gaps||[]){covered-=Math.max(0,Math.min(observedEnd,g.end??now)-Math.max(observedStart,g.start))}covered=Math.max(0,covered);const counts={en:0,ar:0,ja:0};for(const o of observations.filter(o=>o.time>=from&&o.time<to)){if(o.wiki in counts)counts[o.wiki as keyof typeof counts]+=o.count}const count=counts.en+counts.ar+counts.ja;return {time:from,end:to,count,...counts,partial:live&&covered<to-from,current:to>now,coveredSeconds:covered/1000,available:!live||covered>0||count>0}});
 return {bins,observations,start,total:bins.reduce((n,b)=>n+b.count,0),coveredSeconds:bins.reduce((n,b)=>n+b.coveredSeconds,0),step};
}
