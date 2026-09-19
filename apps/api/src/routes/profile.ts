import type { FastifyPluginAsync } from "fastify";
import { profileSchema } from "../shared.js";
import { store } from "../repositories/index.js";
import { requireSession } from "../services/session.js";
import { parse } from "../utils/validation.js";
export const profileRoutes:FastifyPluginAsync=async(app)=>{
  app.get("/profile",async(request)=>{const s=await requireSession(request);return {profile:await store.getProfile(s.id)};});
  app.put("/profile",async(request)=>{const s=await requireSession(request);const body=parse(profileSchema,request.body);return {profile:await store.upsertProfile(s.id,body)};});
};
