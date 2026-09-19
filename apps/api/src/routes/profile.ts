import type { FastifyPluginAsync } from "fastify";
import { handleSchema, profileSchema } from "../shared.js";
import { store } from "../repositories/index.js";
import { requireSession } from "../services/session.js";
import { parse } from "../utils/validation.js";
import { HttpError } from "../utils/http.js";
export const profileRoutes:FastifyPluginAsync=async(app)=>{
  app.get("/profile",async(request)=>{const s=await requireSession(request);return {profile:await store.getProfile(s.id)};});
  app.put("/profile",async(request)=>{const s=await requireSession(request);const body=parse(profileSchema,request.body);if(!(await store.isHandleAvailable(body.handle,s.id)))throw new HttpError(409,"이미 사용 중인 사용자 ID입니다.","HANDLE_TAKEN");return {profile:await store.upsertProfile(s.id,body)};});
  app.get("/profile/handle-availability",async(request)=>{const s=await requireSession(request);const handle=parse(handleSchema,(request.query as any)?.handle);return {available:await store.isHandleAvailable(handle,s.id)};});
};
