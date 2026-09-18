import type { FastifyPluginAsync } from "fastify";
import { handleSchema, profileSchema } from "@askboss/shared";
import { store } from "../repositories";
import { requireSession } from "../services/session";
import { parse } from "../utils/validation";
export const profileRoutes:FastifyPluginAsync=async(app)=>{
  app.get("/profile",async(request)=>{const s=await requireSession(request);return {profile:await store.getProfile(s.id)};});
  app.put("/profile",async(request)=>{const s=await requireSession(request);const body=parse(profileSchema,request.body);if(!(await store.isHandleAvailable(body.handle,s.id)))return {error:{code:"HANDLE_TAKEN",message:"이미 사용 중인 사용자 ID입니다."}};return {profile:await store.upsertProfile(s.id,body)};});
  app.get("/profile/handle-availability",async(request)=>{const s=await requireSession(request);const handle=parse(handleSchema,(request.query as any)?.handle);return {available:await store.isHandleAvailable(handle,s.id)};});
};
