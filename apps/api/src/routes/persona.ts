import type { FastifyPluginAsync } from "fastify";
import { store } from "../repositories/index.js";
import { requireSession } from "../services/session.js";
import { jobs } from "../services/jobs.js";
import { HttpError } from "../utils/http.js";
export const personaRoutes:FastifyPluginAsync=async(app)=>{
  app.post("/bosses/:bossId/persona/rebuild",{config:{rateLimit:{max:20,timeWindow:"1 minute"}}},async(request,reply)=>{const s=await requireSession(request);const bossId=(request.params as any).bossId;const boss=await store.getBoss(s.id,bossId);if(!boss||boss.scope==="GLOBAL")throw new HttpError(404,"상사를 찾을 수 없습니다.");const job=await jobs.enqueue({sessionId:s.id,bossId,type:"PERSONA_REBUILD",payload:{}});return reply.code(202).send({jobId:job.id});});
  app.get("/bosses/:bossId/persona",async(request)=>{const s=await requireSession(request);const boss=await store.getBoss(s.id,(request.params as any).bossId);if(!boss)throw new HttpError(404,"상사를 찾을 수 없습니다.");return {persona:boss.persona,status:boss.status,error:boss.personaError};});
  app.get("/bosses/:bossId/pki",async(request)=>{const s=await requireSession(request);const boss=await store.getBoss(s.id,(request.params as any).bossId);if(!boss)throw new HttpError(404,"상사를 찾을 수 없습니다.");return {pki:boss.pki,isGlobal:boss.scope==="GLOBAL"};});
};
