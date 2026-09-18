import type { FastifyPluginAsync } from "fastify";
import { ai } from "../services/ai/index.js";
export const healthRoutes:FastifyPluginAsync=async(app)=>{app.get("/health",async()=>({ok:true}));app.get("/health/ai",async(_request,reply)=>{const result=await ai.health();if(!result.ok)reply.code(503);return result;});};
