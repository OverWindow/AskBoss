import type { FastifyPluginAsync } from "fastify";
import { surveyAnswersSchema } from "../shared.js";
import { store } from "../repositories/index.js";
import { requireSession, sessionExpiry } from "../services/session.js";
import { ai } from "../services/ai/index.js";
import { HttpError } from "../utils/http.js";
import { parse } from "../utils/validation.js";
export const surveyRoutes:FastifyPluginAsync=async(app)=>{
  app.post("/bosses/:bossId/survey/generate",{config:{rateLimit:{max:20,timeWindow:"1 minute"}}},async(request)=>{const s=await requireSession(request);const boss=await store.getBoss(s.id,(request.params as any).bossId);if(!boss||boss.scope==="GLOBAL")throw new HttpError(404,"상사를 찾을 수 없습니다.");return {questions:await ai.generateSurvey(boss)};});
  app.post("/bosses/:bossId/survey/answers",async(request)=>{const s=await requireSession(request);const bossId=(request.params as any).bossId;const body=parse(surveyAnswersSchema,request.body);await store.upsertSurveyAnswers(s.id,bossId,body.answers);const parsedData={observations:body.answers.map(answer=>({category:String(answer.questionSnapshot.category??"일상 소통"),summary:`${String(answer.questionSnapshot.situation??"")} / ${answer.selectedOption??answer.freeText??""}`,observedAt:new Date().toISOString(),contextQuality:.65,messages:[]}))};const existing=(await store.listEvidence(s.id,bossId)).find(item=>item.type==="SURVEY");if(existing)await store.updateEvidence(s.id,existing.id,{status:"READY",parsedData,observedAt:new Date().toISOString()});else await store.createEvidence({bossId,sessionId:s.id,type:"SURVEY",status:"READY",rawText:null,storagePath:null,parsedData,observedAt:new Date().toISOString(),expiresAt:sessionExpiry()});return {saved:true};});
};
