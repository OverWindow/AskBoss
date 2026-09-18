import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
export async function rateLimitPlugin(app:FastifyInstance){await app.register(rateLimit,{max:60,timeWindow:"1 minute",keyGenerator:(request)=>request.cookies.hr_session??request.ip,errorResponseBuilder:()=>({error:{code:"RATE_LIMIT",message:"요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."}})});}
