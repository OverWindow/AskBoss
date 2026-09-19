import type { FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";
import { store } from "../repositories/index.js";
import { HttpError } from "../utils/http.js";
import { ai } from "../services/ai/index.js";
import { toPlainText } from "../utils/plain-text.js";
export const hrRoutes:FastifyPluginAsync=async(app)=>{
  const data=async()=>{if(!env.HR_DEMO_MODE)throw new HttpError(404,"페이지를 찾을 수 없습니다.");return store.getHrDashboard();};
  app.get("/hr/overview",async()=>{const d=await data();return {overview:d.overview,includesDemo:d.includesDemo};});
  app.get("/hr/usage/by-rank-gap",async()=>({data:(await data()).rankGap}));
  app.get("/hr/usage/by-age-gap",async()=>({data:(await data()).ageGap}));
  app.get("/hr/topics",async()=>({data:(await data()).topics}));
  app.get("/hr/summary",async()=>{const aggregates=await data();return {summary:toPlainText(await ai.generateHrSummary(aggregates))};});
  app.get("/hr/dashboard",async()=>data());
};
