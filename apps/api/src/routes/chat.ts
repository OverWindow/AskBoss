import type { FastifyPluginAsync } from "fastify";
import { chatInputSchema } from "@askboss/shared";
import { store } from "../repositories";
import { requireSession, sessionExpiry } from "../services/session";
import { ai } from "../services/ai";
import { track } from "../services/analytics";
import { HttpError } from "../utils/http";
import { parse } from "../utils/validation";

const keywords=(text:string)=>["보고","일정","마감","야근","메신저","피드백","회의","자료","실수","확인"].filter((word)=>text.includes(word));
export const chatRoutes:FastifyPluginAsync=async(app)=>{
  app.get("/bosses/:bossId/chat",async(request)=>{const s=await requireSession(request);const bossId=(request.params as any).bossId;const query=request.query as any;return store.listChatMessages(s.id,bossId,query.cursor,Math.min(Number(query.limit)||50,100));});
  app.post("/bosses/:bossId/chat",{config:{rateLimit:{max:20,timeWindow:"1 minute"}}},async(request,reply)=>{
    const s=await requireSession(request);const bossId=(request.params as any).bossId;const body=parse(chatInputSchema,request.body);const [boss,profile]=await Promise.all([store.getBoss(s.id,bossId),store.getProfile(s.id)]);if(!boss)throw new HttpError(404,"상사를 찾을 수 없습니다.");
    const thread=await store.getOrCreateThread(s.id,bossId,body.threadId,sessionExpiry());const userMessage=await store.addChatMessage(thread.id,"user",body.message);
    reply.hijack();reply.raw.statusCode=200;reply.raw.setHeader("content-type","text/event-stream; charset=utf-8");reply.raw.setHeader("cache-control","no-cache, no-transform");reply.raw.setHeader("connection","keep-alive");reply.raw.write(`event: meta\ndata: ${JSON.stringify({threadId:thread.id,messageId:userMessage.id})}\n\n`);
    try{const content=await ai.chatWithBoss({profile,boss,summary:thread.conversationSummary,messages:[...thread.messages,userMessage].slice(-20),message:body.message});const chunks=content.match(/.{1,12}/gu)??[content];for(const chunk of chunks)reply.raw.write(`event: delta\ndata: ${JSON.stringify({text:chunk})}\n\n`);const saved=await store.addChatMessage(thread.id,"assistant",content);await track(s.id,"CHAT",profile,boss,{topicKeywords:keywords(body.message)});reply.raw.write(`event: done\ndata: ${JSON.stringify({message:saved})}\n\n`);}catch(error){reply.raw.write(`event: error\ndata: ${JSON.stringify({message:error instanceof Error?error.message:"대화 생성 실패"})}\n\n`);}finally{reply.raw.end();}
  });
};
