import type { FastifyPluginAsync } from "fastify";
import { bossInputSchema } from "../shared.js";
import { store } from "../repositories/index.js";
import { requireSession, sessionExpiry } from "../services/session.js";
import { HttpError } from "../utils/http.js";
import { parse } from "../utils/validation.js";
import { storage } from "../services/storage.js";
export const bossRoutes:FastifyPluginAsync=async(app)=>{
  app.get("/bosses",async(request)=>{const s=await requireSession(request);return {bosses:await store.listBosses(s.id)};});
  app.post("/bosses",async(request,reply)=>{const s=await requireSession(request);const body=parse(bossInputSchema,request.body);const boss=await store.createBoss(s.id,body as any,sessionExpiry());return reply.code(201).send({boss});});
  app.get("/bosses/:bossId",async(request)=>{const s=await requireSession(request);const boss=await store.getBoss(s.id,(request.params as any).bossId);if(!boss)throw new HttpError(404,"상사를 찾을 수 없습니다.","BOSS_NOT_FOUND");return {boss};});
  app.patch("/bosses/:bossId",async(request)=>{const s=await requireSession(request);const body=parse(bossInputSchema.partial(),request.body);return {boss:await store.updateBoss(s.id,(request.params as any).bossId,body as any)};});
  app.delete("/bosses/:bossId",async(request,reply)=>{const s=await requireSession(request);const bossId=(request.params as any).bossId;const boss=await store.getBoss(s.id,bossId);if(!boss||boss.scope!=="SESSION")throw new HttpError(404,"상사를 찾을 수 없습니다.","BOSS_NOT_FOUND");const paths=await store.listBossStoragePaths(s.id,bossId);await storage.remove(paths);await store.deleteBoss(s.id,bossId);return reply.code(204).send();});
};
