import { waitUntil } from "@vercel/functions";
import { store } from "../repositories";
import { ai } from "./ai";
import { storage } from "./storage";
import { calculatePki } from "./pki";

class JobService {
  async enqueue(input:Parameters<typeof store.createJob>[0]){const job=await store.createJob(input); this.defer(this.process(job.id)); return job;}
  defer(promise:Promise<unknown>){if(process.env.VERCEL){waitUntil(promise);}else{void promise.catch(()=>undefined);}}
  async process(id:string){const job=await store.claimJob(id);if(!job)return;try{if(job.type==="EVIDENCE_EXTRACT")await this.extract(job);else if(job.type==="PERSONA_REBUILD")await this.rebuild(job);else await store.completeJob(job.id,{skipped:true});}catch(error){const message=error instanceof Error?error.message:"작업 실패";await store.failJob(job.id,message,true);if(job.type==="PERSONA_REBUILD"&&job.sessionId&&job.bossId)await store.setBossStatus(job.sessionId,job.bossId,"FAILED",message);}}
  async extract(job:any){const evidence=await store.getEvidence(job.sessionId,job.payload.evidenceId);if(!evidence)throw new Error("근거를 찾을 수 없습니다.");await store.updateEvidence(job.sessionId,evidence.id,{status:"PROCESSING"});let content=evidence.rawText??"";if(evidence.storagePath){content=evidence.type==="TXT"?await storage.downloadText(evidence.storagePath):`이미지 URL: ${await storage.createSignedDownload(evidence.storagePath)}`;}const parsed=await ai.extractEvidence({content,kind:evidence.type});await store.updateEvidence(job.sessionId,evidence.id,{status:"READY",parsedData:parsed,errorMessage:null});await store.completeJob(job.id,{evidenceId:evidence.id,observations:parsed.observations.length});}
  async rebuild(job:any){const boss=await store.getBoss(job.sessionId,job.bossId);if(!boss||boss.scope==="GLOBAL")throw new Error("상사를 찾을 수 없습니다.");await store.setBossStatus(job.sessionId,job.bossId,"BUILDING");const [profile,evidence,survey]=await Promise.all([store.getProfile(job.sessionId),store.listEvidence(job.sessionId,job.bossId),store.listSurveyAnswers(job.sessionId,job.bossId)]);const persona=await ai.buildPersona({profile,boss,evidence,survey});const pki=calculatePki(evidence,persona);await store.setBossPersona(job.sessionId,job.bossId,persona,pki);await store.completeJob(job.id,{bossId:boss.id,pki});}
  async runPending(limit=5){const jobs=await store.listRunnableJobs(limit);for(const job of jobs)await this.process(job.id);return jobs.length;}
}
export const jobs=new JobService();
