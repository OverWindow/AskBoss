import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";
import { store } from "../repositories";
import { HttpError } from "../utils/http";
import { hmac, randomToken } from "../utils/security";
import { storage } from "./storage";

const COOKIE = "hr_session";
const ttl = () => new Date(Date.now() + 24 * 60 * 60_000).toISOString();

export async function createSession(reply: FastifyReply) {
  const token=randomToken(); const record=await store.createSession(hmac(token,env.SESSION_SECRET,"session"),ttl());
  reply.setCookie(COOKIE,token,{httpOnly:true,secure:env.NODE_ENV==="production",sameSite:"lax",path:"/"});
  return {id:record.id,expiresAt:record.expiresAt};
}
export async function optionalSession(request:FastifyRequest){ const token=request.cookies[COOKIE]; if(!token) return null; const row=await store.findSession(hmac(token,env.SESSION_SECRET,"session")); if(!row) return null; void store.touchSession(row.id); return row; }
export async function requireSession(request:FastifyRequest){ const row=await optionalSession(request); if(!row) throw new HttpError(401,"세션이 없거나 만료되었습니다.","SESSION_REQUIRED"); return row; }
export async function destroySession(request:FastifyRequest,reply:FastifyReply){ const row=await requireSession(request);const bosses=await store.listBosses(row.id);const evidence=(await Promise.all(bosses.filter(b=>b.scope==="SESSION").map(b=>store.listEvidence(row.id,b.id)))).flat();await storage.remove(evidence.flatMap(item=>item.storagePath?[item.storagePath]:[]));await store.deleteSession(row.id);reply.clearCookie(COOKIE,{path:"/"}); }
export function sessionExpiry(){ return ttl(); }
