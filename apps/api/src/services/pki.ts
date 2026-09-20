import { OBSERVATION_CATEGORIES, type PkiBreakdown, type ReadableBossPersona } from "../shared.js";
import type { EvidenceRecord, GlobalEvidenceRecord } from "../types.js";

const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const daysSince=(date:string)=>Math.max(0,(Date.now()-Date.parse(date))/86_400_000);
export const PKI_FRESHNESS_DECAY_DAYS=730;

export function calculatePki(evidence:Array<EvidenceRecord | GlobalEvidenceRecord>,persona:ReadableBossPersona):PkiBreakdown {
  const ready=evidence.filter((item)=>item.status==="READY");
  const observations=ready.flatMap((item)=>(item.parsedData?.observations??[]).map((observation:any)=>({...observation,evidenceId:item.id,fallbackDate:item.observedAt??item.createdAt})));
  const counts=OBSERVATION_CATEGORIES.map((category)=>observations.filter((o)=>o.category===category).length);
  const c=counts.reduce((sum,count)=>sum+Math.min(count/5,1),0)/5;
  const qByEvidence=new Map(ready.map((item)=>[item.id,Number(item.parsedData?.observations?.[0]?.contextQuality??0.5)]));
  const e=persona.traits.length ? persona.traits.reduce((sum,trait)=>{ const ids=[...new Set(trait.evidenceIds)]; const q=ids.length ? ids.reduce((s,id)=>s+(qByEvidence.get(id)??0.5),0)/ids.length : 0; return sum+Math.min(ids.length/3,1)*clamp(q); },0)/persona.traits.length : 0;
  const weeks=new Set(observations.map((o)=>{const d=new Date(o.observedAt??o.fallbackDate); const first=new Date(Date.UTC(d.getUTCFullYear(),0,1)); return `${d.getUTCFullYear()}-${Math.floor((+d-+first)/604_800_000)}`;}));
  const types=new Set(observations.map((o)=>o.category)); const d=0.5*Math.min(weeks.size/4,1)+0.5*Math.min(types.size/5,1);
  const freshness=OBSERVATION_CATEGORIES.map((category)=>{ const dates=observations.filter((o)=>o.category===category).map((o)=>o.observedAt??o.fallbackDate).filter(Boolean).sort().reverse(); return dates[0]?Math.exp(-daysSince(dates[0])/PKI_FRESHNESS_DECAY_DAYS):0; }).reduce((a,b)=>a+b,0)/5;
  const round=(value:number)=>Math.round(clamp(value)*100); const score=Math.round(35*c+30*e+20*d+15*freshness);
  return {completeness:round(c),evidenceReliability:round(e),diversity:round(d),freshness:round(freshness),score:Math.max(0,Math.min(100,score))};
}
