import type { FastifyPluginAsync } from "fastify";
import { createSession, destroySession, optionalSession } from "../services/session.js";
export const sessionRoutes:FastifyPluginAsync=async(app)=>{
  app.get("/session",async(request,reply)=>{const row=await optionalSession(request);if(!row)return reply.code(401).send({error:{code:"SESSION_REQUIRED",message:"세션이 없습니다."}});return {session:{id:row.id,expiresAt:row.expiresAt}};});
  app.post("/session",async(request,reply)=>{const existing=await optionalSession(request);if(existing)return {session:{id:existing.id,expiresAt:existing.expiresAt}};return {session:await createSession(reply)};});
  app.delete("/session",async(request,reply)=>{await destroySession(request,reply);return reply.code(204).send();});
};
