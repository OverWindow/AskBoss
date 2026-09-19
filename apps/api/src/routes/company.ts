import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { store } from "../repositories/index.js";
import { requireSession } from "../services/session.js";
import { ai } from "../services/ai/index.js";
import { parse } from "../utils/validation.js";
export const companyRoutes:FastifyPluginAsync=async(app)=>{
  app.post("/company/research",{config:{rateLimit:{max:5,timeWindow:"1 minute"}}},async(request)=>{await requireSession(request);const {companyName}=parse(z.object({companyName:z.string().trim().min(1).max(120)}),request.body);const key=companyName.normalize("NFKC").toLocaleLowerCase("ko");const cached=await store.getCompanyResearch(key);if(cached)return {research:cached,cached:true};try{const prompts=await store.getAiPromptSettings();const result=await ai.researchCompany(companyName,prompts.onboarding.companyResearch);await store.saveCompanyResearch(key,result);return {research:result,cached:false};}catch{return {research:null,cached:false,warning:"회사 정보를 찾지 못했습니다. 회사 정보 없이 분석을 계속합니다."};}});
};
