import type { FastifyPluginAsync } from "fastify";
import { store } from "../repositories/index.js";
import { jobs } from "../services/jobs.js";
import { requireSession } from "../services/session.js";
import { HttpError } from "../utils/http.js";
export const jobRoutes:FastifyPluginAsync=async(app)=>{app.get("/jobs/:jobId",async(request)=>{const s=await requireSession(request);const job=await store.getJob(s.id,(request.params as any).jobId);if(!job)throw new HttpError(404,"작업을 찾을 수 없습니다.");jobs.resume(job);return {job};});};
