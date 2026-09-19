import type { FastifyPluginAsync } from "fastify";
import { store } from "../repositories/index.js";
import { requireSession } from "../services/session.js";
import { ai } from "../services/ai/index.js";
import { HttpError } from "../utils/http.js";
export const monologueRoutes:FastifyPluginAsync=async(app)=>{app.post("/bosses/:bossId/monologue",{config:{rateLimit:{max:20,timeWindow:"1 minute"}}},async(request)=>{const s=await requireSession(request);const bossId=(request.params as any).bossId;const boss=await store.getBoss(s.id,bossId);if(!boss)throw new HttpError(404,"상사를 찾을 수 없습니다.");const [previous,defaults]=await Promise.all([store.listMonologues(s.id,bossId,10),boss.scope==="SESSION"?store.getPersonalBossDefaults():Promise.resolve(null)]);const content=(await ai.generateMonologue({boss,previous,basePrompt:defaults?.prompt})).trim().slice(0,60);await store.addMonologue(s.id,bossId,content);return {content};});};
