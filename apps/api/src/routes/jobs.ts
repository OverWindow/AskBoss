import type { FastifyPluginAsync } from "fastify";
import { store } from "../repositories";
import { requireSession } from "../services/session";
import { HttpError } from "../utils/http";
export const jobRoutes:FastifyPluginAsync=async(app)=>{app.get("/jobs/:jobId",async(request)=>{const s=await requireSession(request);const job=await store.getJob(s.id,(request.params as any).jobId);if(!job)throw new HttpError(404,"작업을 찾을 수 없습니다.");return {job};});};
