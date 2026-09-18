import type { FastifyPluginAsync } from "fastify";
import { env } from "../config/env";
import { bearer, HttpError } from "../utils/http";
import { jobs } from "../services/jobs";
import { cleanup } from "../services/cleanup";
import { store } from "../repositories";
export const internalRoutes:FastifyPluginAsync=async(app)=>{
  const guard=(request:any)=>{if(bearer(request)!==env.CRON_SECRET)throw new HttpError(401,"인증이 필요합니다.");};
  app.get("/internal/jobs/run",async(request)=>{guard(request);return {processed:await jobs.runPending(10)};});
  app.get("/internal/cleanup",async(request)=>{guard(request);return cleanup();});
  app.get("/internal/analytics/rollup",async(request)=>{guard(request);return {rolledUp:await store.rollupAnalytics()};});
};
