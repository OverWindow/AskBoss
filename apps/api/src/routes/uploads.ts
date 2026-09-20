import type { FastifyPluginAsync } from "fastify";
import { MAX_IMAGE_EVIDENCE_PER_BOSS, uploadSignSchema, UPLOAD_LIMITS } from "../shared.js";
import { store } from "../repositories/index.js";
import { requireSession } from "../services/session.js";
import { storage } from "../services/storage.js";
import { HttpError } from "../utils/http.js";
import { parse } from "../utils/validation.js";
export const uploadRoutes:FastifyPluginAsync=async(app)=>{
  app.post("/uploads/sign",async(request)=>{const s=await requireSession(request);const body=parse(uploadSignSchema,request.body);const boss=await store.getBoss(s.id,body.bossId);if(!boss||boss.scope==="GLOBAL")throw new HttpError(404,"상사를 찾을 수 없습니다.");const limit=body.contentType==="text/plain"?UPLOAD_LIMITS.text:UPLOAD_LIMITS.image;if(body.size>limit)throw new HttpError(413,"파일 크기 제한을 초과했습니다.","FILE_TOO_LARGE");if(body.contentType!=="text/plain"&&(await store.listEvidence(s.id,boss.id)).filter((item)=>item.type==="IMAGE").length>=MAX_IMAGE_EVIDENCE_PER_BOSS)throw new HttpError(409,`이미지는 상사별로 최대 ${MAX_IMAGE_EVIDENCE_PER_BOSS}장까지 등록할 수 있습니다.`,"IMAGE_LIMIT_EXCEEDED");const path=storage.path(s.id,boss.id,body.fileName,body.contentType);const intent=await store.createUploadIntent({sessionId:s.id,bossId:boss.id,storagePath:path,originalName:body.fileName,contentType:body.contentType,sizeBytes:body.size,expiresAt:new Date(Date.now()+10*60_000).toISOString()});const signed=await storage.createSignedUpload(path);return {upload:{intentId:intent.id,path,...signed,expiresIn:600}};});
};
