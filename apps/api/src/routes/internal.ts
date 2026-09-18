import type { FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";
import { bearer, HttpError } from "../utils/http.js";
import { jobs } from "../services/jobs.js";
import { cleanup } from "../services/cleanup.js";
import { store } from "../repositories/index.js";
export const internalRoutes:FastifyPluginAsync=async(app)=>{
  const guard=(request:any)=>{if(bearer(request)!==env.CRON_SECRET)throw new HttpError(401,"인증이 필요합니다.");};
  app.get("/internal/jobs/run",async(request)=>{guard(request);return {processed:await jobs.runPending(10)};});
  app.get("/internal/cleanup",async(request)=>{guard(request);return cleanup();});
  app.get("/internal/analytics/rollup",async(request)=>{guard(request);return {rolledUp:await store.rollupAnalytics()};});
};
