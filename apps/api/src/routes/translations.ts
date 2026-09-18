import type { FastifyPluginAsync } from "fastify";
import { feedbackSchema, translationInputSchema } from "@askboss/shared";
import { store } from "../repositories";
import { requireSession, sessionExpiry } from "../services/session";
import { ai } from "../services/ai";
import { track } from "../services/analytics";
import { HttpError } from "../utils/http";
import { parse } from "../utils/validation";
const topics=(text:string)=>["보고","일정","마감","야근","메신저","피드백","회의","자료","실수","확인"].filter((word)=>text.includes(word));
export const translationRoutes:FastifyPluginAsync=async(app)=>{
  app.post("/bosses/:bossId/translate",{config:{rateLimit:{max:20,timeWindow:"1 minute"}}},async(request)=>{const s=await requireSession(request);const body=parse(translationInputSchema,request.body);const bossId=(request.params as any).bossId;const [boss,profile]=await Promise.all([store.getBoss(s.id,bossId),store.getProfile(s.id)]);if(!boss)throw new HttpError(404,"상사를 찾을 수 없습니다.");const result=await ai.translateBossMessage({profile,boss,...body});const row=await store.createTranslation({sessionId:s.id,bossId,inputText:body.inputText,channel:body.channel,result,expiresAt:sessionExpiry()});await track(s.id,"TRANSLATE",profile,boss,{topicKeywords:topics(body.inputText)});return {translationId:row.id,result};});
  app.post("/translations/:translationId/feedback",async(request)=>{const s=await requireSession(request);const body=parse(feedbackSchema,request.body);await store.setTranslationFeedback(s.id,(request.params as any).translationId,body.feedback);return {saved:true};});
};
