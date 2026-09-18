import { describe,expect,it,vi } from "vitest";
import type { BossPersona } from "@askboss/shared";
import { calculatePki } from "../src/services/pki";

const persona:BossPersona={summary:"",communication:{tone:"",messageLength:"",directness:50,formality:50},reporting:{preferredLength:"",preferredStructure:[],frequentChecks:[]},decisionMaking:{speed:"",riskTolerance:"",autonomyPreference:""},management:{hierarchyPreference:"",feedbackStyle:"",deadlineSensitivity:""},recurringPatterns:[],recurringPhrases:[],humorStyle:null,uncertainty:[],traits:[]};
describe("calculatePki",()=>{
  it("returns zero without evidence or traits",()=>{expect(calculatePki([],persona)).toEqual({completeness:0,evidenceReliability:0,diversity:0,freshness:0,score:0});});
  it("caps every component and computes deterministically",()=>{vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));const categories=["업무 지시","보고 및 피드백","일정 관리","의사결정","일상 소통"];const evidence=categories.map((category,index)=>({id:`e${index}`,bossId:"b",sessionId:"s",type:"TEXT",status:"READY",rawText:"x",storagePath:null,parsedData:{observations:[{category,contextQuality:1,observedAt:"2026-01-15T00:00:00Z"}]},observedAt:"2026-01-15T00:00:00Z",createdAt:"2026-01-15T00:00:00Z",expiresAt:"2026-01-16T00:00:00Z"}));const result=calculatePki(evidence as any,{...persona,traits:[{key:"t",label:"t",value:"high",confidence:1,evidenceIds:["e0","e1","e2"]}]});expect(result.completeness).toBe(20);expect(result.evidenceReliability).toBe(100);expect(result.freshness).toBe(100);expect(result.score).toBeGreaterThanOrEqual(64);expect(result.score).toBeLessThanOrEqual(65);vi.useRealTimers();});
});
