import type { FastifyPluginAsync } from "fastify";
import { evidenceSchema } from "@askboss/shared";
import { store } from "../repositories";
import { requireSession, sessionExpiry } from "../services/session";
import { jobs } from "../services/jobs";
import { HttpError } from "../utils/http";
import { parse } from "../utils/validation";
import { storage } from "../services/storage";
export const evidenceRoutes:FastifyPluginAsync=async(app)=>{
  app.get("/bosses/:bossId/evidence",async(request)=>{const s=await requireSession(request);const bossId=(request.params as any).bossId;if(!(await store.getBoss(s.id,bossId)))throw new HttpError(404,"상사를 찾을 수 없습니다.");return {evidence:await store.listEvidence(s.id,bossId)};});
  app.post("/bosses/:bossId/evidence",{config:{rateLimit:{max:20,timeWindow:"1 minute"}}},async(request,reply)=>{const s=await requireSession(request);const bossId=(request.params as any).bossId;const boss=await store.getBoss(s.id,bossId);if(!boss||boss.scope==="GLOBAL")throw new HttpError(404,"상사를 찾을 수 없습니다.");const body=parse(evidenceSchema,request.body);let storagePath:string|null=null;let type:string=body.type;if(body.type!=="TEXT"){const intent=await store.getUploadIntent(s.id,body.uploadIntentId);if(!intent||intent.bossId!==bossId||intent.completedAt)throw new HttpError(400,"유효하지 않은 업로드입니다.");if(!(await storage.verify(intent.storagePath,intent.sizeBytes,intent.contentType)))throw new HttpError(400,"업로드된 파일을 확인할 수 없습니다.","UPLOAD_MISMATCH");storagePath=intent.storagePath;type=intent.contentType==="text/plain"?"TXT":"IMAGE";await store.completeUploadIntent(s.id,intent.id);}const evidence=await store.createEvidence({bossId,sessionId:s.id,type,status:"PENDING",rawText:body.type==="TEXT"?body.rawText:null,storagePath,parsedData:null,observedAt:null,expiresAt:sessionExpiry()});const job=await jobs.enqueue({sessionId:s.id,bossId,type:"EVIDENCE_EXTRACT",payload:{evidenceId:evidence.id}});return reply.code(202).send({evidence,jobId:job.id});});
};
