import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { adminGlobalBossPatchSchema, adminGlobalUploadSignSchema, adminJobStatusSchema, adminLoginSchema, adminPersonalBossDefaultsSchema, evidenceSchema, surveyAnswersSchema, UPLOAD_LIMITS } from "../shared.js";
import { store } from "../repositories/index.js";
import { cleanup } from "../services/cleanup.js";
import { getAdminCredits } from "../services/ai/credits.js";
import { ai } from "../services/ai/index.js";
import { adminSourceKey, assertAdminOrigin, loginAdmin, logoutAdmin, optionalAdmin, requireAdmin } from "../services/admin-auth.js";
import { jobs } from "../services/jobs.js";
import { storage } from "../services/storage.js";
import { HttpError } from "../utils/http.js";
import { parse } from "../utils/validation.js";

const maskId = (id: string | null) => id ? `${id.slice(0, 8)}…${id.slice(-4)}` : null;
const cursor = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
const GLOBAL_BOSS_ID = "00000000-0000-4000-8000-000000000001";
const idParamSchema = z.object({ id: z.string().uuid() });
const companyResearchInputSchema = z.object({ companyName: z.string().trim().min(1).max(120) });
const requireAdminMutation = async (request: Parameters<typeof assertAdminOrigin>[0]) => { assertAdminOrigin(request); await requireAdmin(request); };

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/auth", async (request) => {
    const session = await optionalAdmin(request);
    return session ? { authenticated: true, expiresAt: session.expiresAt } : { authenticated: false, expiresAt: null };
  });

  app.post("/admin/login", { config: { rateLimit: { max: 5, timeWindow: "15 minutes", keyGenerator: adminSourceKey } } }, async (request, reply) => {
    assertAdminOrigin(request);
    const body = parse(adminLoginSchema, request.body);
    return loginAdmin(request, reply, body.password);
  });

  app.post("/admin/logout", async (request, reply) => {
    assertAdminOrigin(request);
    await requireAdmin(request);
    await logoutAdmin(request, reply);
    return { authenticated: false };
  });

  app.get("/admin/dashboard", async (request) => { await requireAdmin(request); return store.getAdminDashboard(); });
  app.get("/admin/credits", async (request) => { await requireAdmin(request); return getAdminCredits(); });
  app.get("/admin/personal-boss-defaults", async (request) => {
    await requireAdmin(request);
    return store.getPersonalBossDefaults();
  });
  app.put("/admin/personal-boss-defaults", async (request) => {
    await requireAdminMutation(request);
    const { prompt } = parse(adminPersonalBossDefaultsSchema, request.body);
    const settings = await store.updatePersonalBossDefaults(prompt);
    await store.recordAdminOperation("PERSONAL_BOSS_DEFAULTS_UPDATE", "SUCCEEDED", { enabled: Boolean(prompt), promptLength: prompt.length });
    return settings;
  });
  app.get("/admin/global-boss", async (request) => {
    await requireAdmin(request);
    const [boss,evidence,surveyAnswers]=await Promise.all([store.getGlobalBoss(),store.listGlobalEvidence(),store.listGlobalSurveyAnswers()]);
    return {boss,evidence:evidence.map(({storagePath:_,...item})=>item),surveyAnswers};
  });
  app.patch("/admin/global-boss", async (request) => {
    await requireAdminMutation(request);
    const body=parse(adminGlobalBossPatchSchema,request.body);
    if("companyName" in body&&!("companyResearch" in body))body.companyResearch=null;
    const boss=await store.updateGlobalBoss(body);
    await store.recordAdminOperation("GLOBAL_BOSS_UPDATE","SUCCEEDED",{action:"metadata",bossId:boss.id});
    return {boss};
  });
  app.post("/admin/global-boss/company-research",{config:{rateLimit:{max:5,timeWindow:"1 minute"}}},async(request)=>{
    await requireAdminMutation(request);
    const {companyName}=parse(companyResearchInputSchema,request.body);
    const key=companyName.normalize("NFKC").toLocaleLowerCase("ko");const cached=await store.getCompanyResearch(key);if(cached)return {research:cached,cached:true};
    try{const research=await ai.researchCompany(companyName);await store.saveCompanyResearch(key,research);return {research,cached:false};}catch{return {research:null,cached:false,warning:"회사 정보를 찾지 못했습니다."};}
  });
  app.post("/admin/global-boss/uploads/sign",{config:{rateLimit:{max:20,timeWindow:"1 minute"}}},async(request)=>{
    await requireAdminMutation(request);const body=parse(adminGlobalUploadSignSchema,request.body);const limit=body.contentType==="text/plain"?UPLOAD_LIMITS.text:UPLOAD_LIMITS.image;if(body.size>limit)throw new HttpError(413,"파일 크기 제한을 초과했습니다.","FILE_TOO_LARGE");
    const path=storage.globalPath(GLOBAL_BOSS_ID,body.fileName,body.contentType);const intent=await store.createGlobalUploadIntent({bossId:GLOBAL_BOSS_ID,storagePath:path,originalName:body.fileName,contentType:body.contentType,sizeBytes:body.size,expiresAt:new Date(Date.now()+10*60_000).toISOString()});const signed=await storage.createSignedUpload(path);return {upload:{intentId:intent.id,path,...signed,expiresIn:600}};
  });
  app.post("/admin/global-boss/evidence",{config:{rateLimit:{max:20,timeWindow:"1 minute"}}},async(request,reply)=>{
    await requireAdminMutation(request);const body=parse(evidenceSchema,request.body);let storagePath:string|null=null;let sourceName:string|null="붙여넣기";let type:"TEXT"|"TXT"|"IMAGE"=body.type;
    if(body.type!=="TEXT"){const intent=await store.getGlobalUploadIntent(body.uploadIntentId);if(!intent||intent.bossId!==GLOBAL_BOSS_ID||intent.completedAt)throw new HttpError(400,"유효하지 않은 업로드입니다.");if(!(await storage.verify(intent.storagePath,intent.sizeBytes,intent.contentType)))throw new HttpError(400,"업로드된 파일을 확인할 수 없습니다.","UPLOAD_MISMATCH");storagePath=intent.storagePath;sourceName=intent.originalName;type=intent.contentType==="text/plain"?"TXT":"IMAGE";await store.completeGlobalUploadIntent(intent.id);}
    const evidence=await store.createGlobalEvidence({bossId:GLOBAL_BOSS_ID,type,status:"PENDING",sourceName,rawText:body.type==="TEXT"?body.rawText:null,storagePath,parsedData:null,observedAt:null,errorMessage:null});const job=await jobs.enqueue({sessionId:null,bossId:GLOBAL_BOSS_ID,type:"EVIDENCE_EXTRACT",payload:{ownerScope:"GLOBAL",evidenceId:evidence.id}});await store.recordAdminOperation("GLOBAL_BOSS_UPDATE","SUCCEEDED",{action:"evidence_add",evidenceId:maskId(evidence.id)!});return reply.code(202).send({evidence:{...evidence,storagePath:undefined},jobId:job.id});
  });
  app.delete("/admin/global-boss/evidence/:id",async(request,reply)=>{
    await requireAdminMutation(request);const {id}=parse(idParamSchema,request.params);const evidence=await store.getGlobalEvidence(id);if(!evidence)throw new HttpError(404,"관찰 자료를 찾을 수 없습니다.");if(evidence.storagePath)await storage.remove([evidence.storagePath]);await store.deleteGlobalEvidence(id);await store.recordAdminOperation("GLOBAL_BOSS_UPDATE","SUCCEEDED",{action:"evidence_delete",evidenceId:maskId(id)!});return reply.code(204).send();
  });
  app.post("/admin/global-boss/survey/generate",{config:{rateLimit:{max:10,timeWindow:"1 minute"}}},async(request)=>{await requireAdminMutation(request);return {questions:await ai.generateSurvey(await store.getGlobalBoss())};});
  app.put("/admin/global-boss/survey/answers",async(request)=>{
    await requireAdminMutation(request);const body=parse(surveyAnswersSchema,request.body);await store.upsertGlobalSurveyAnswers(body.answers);const parsedData={observations:body.answers.map(answer=>({category:String(answer.questionSnapshot.category??"일상 소통"),summary:`${String(answer.questionSnapshot.situation??"")} / ${answer.selectedOption??answer.freeText??""}`,observedAt:new Date().toISOString(),contextQuality:.65,messages:[]}))};const existing=(await store.listGlobalEvidence()).find(item=>item.type==="SURVEY");if(existing)await store.updateGlobalEvidence(existing.id,{status:"READY",parsedData,observedAt:new Date().toISOString(),errorMessage:null});else await store.createGlobalEvidence({bossId:GLOBAL_BOSS_ID,type:"SURVEY",status:"READY",sourceName:"관리자 설문",rawText:null,storagePath:null,parsedData,observedAt:new Date().toISOString(),errorMessage:null});await store.recordAdminOperation("GLOBAL_BOSS_UPDATE","SUCCEEDED",{action:"survey",answers:body.answers.length});return {saved:true};
  });
  app.post("/admin/global-boss/persona/rebuild",{config:{rateLimit:{max:5,timeWindow:"15 minutes"}}},async(request,reply)=>{
    await requireAdminMutation(request);const evidence=await store.listGlobalEvidence();if(evidence.some(item=>item.status==="PENDING"||item.status==="PROCESSING"))throw new HttpError(409,"처리 중인 관찰 자료가 있습니다.","EVIDENCE_PROCESSING");const job=await jobs.enqueue({sessionId:null,bossId:GLOBAL_BOSS_ID,type:"PERSONA_REBUILD",payload:{ownerScope:"GLOBAL"}});return reply.code(202).send({jobId:job.id});
  });
  app.get("/admin/sessions", async (request) => {
    await requireAdmin(request);
    const query = request.query as Record<string, unknown>;
    const result = await store.listAdminSessions(cursor(query.cursor), 20);
    return { ...result, items: result.items.map((item) => ({ ...item, id: maskId(item.id) })) };
  });
  app.get("/admin/jobs", async (request) => {
    await requireAdmin(request);
    const query = request.query as Record<string, unknown>;
    const status = query.status === undefined ? undefined : adminJobStatusSchema.safeParse(query.status);
    if (status && !status.success) throw new HttpError(400, "유효하지 않은 Job 상태입니다.");
    const result = await store.listAdminJobs(status?.data, cursor(query.cursor), 20);
    return result;
  });
  app.get("/admin/jobs/:id",async(request)=>{await requireAdmin(request);const {id}=parse(idParamSchema,request.params);const job=await store.getJobById(id);if(!job)throw new HttpError(404,"Job을 찾을 수 없습니다.");return {job:{id:job.id,type:job.type,status:job.status,errorMessage:job.errorMessage,result:job.result,createdAt:job.createdAt,updatedAt:job.updatedAt}};});

  app.post("/admin/jobs/:id/retry", async (request, reply) => {
    assertAdminOrigin(request); await requireAdmin(request);
    const id = (request.params as { id: string }).id;
    const job = await store.retryJob(id);
    if (!job) throw new HttpError(404, "재시도할 수 있는 실패 Job을 찾지 못했습니다.");
    await store.recordAdminOperation("JOB_RETRY", "SUCCEEDED", { originalJob: maskId(id)!, newJob: maskId(job.id)! });
    jobs.defer(jobs.process(job.id));
    return reply.code(202).send({ job: { id: maskId(job.id), status: job.status } });
  });

  app.post("/admin/maintenance/cleanup", async (request) => {
    assertAdminOrigin(request); await requireAdmin(request);
    try { const result = await cleanup(); await store.recordAdminOperation("CLEANUP", "SUCCEEDED", { sessions: result.sessions, uploads: result.uploads.length }); return result; }
    catch (error) { await store.recordAdminOperation("CLEANUP", "FAILED", { error: "operation_failed" }); throw error; }
  });
  app.post("/admin/maintenance/rollup", async (request) => {
    assertAdminOrigin(request); await requireAdmin(request);
    try { const rolledUp = await store.rollupAnalytics(); await store.recordAdminOperation("ANALYTICS_ROLLUP", "SUCCEEDED", { rolledUp }); return { rolledUp }; }
    catch (error) { await store.recordAdminOperation("ANALYTICS_ROLLUP", "FAILED", { error: "operation_failed" }); throw error; }
  });
  app.post("/admin/maintenance/prune-meaningless-sessions", async (request, reply) => {
    assertAdminOrigin(request); await requireAdmin(request);
    try {
      const result = await store.pruneMeaninglessSessions();
      if (result.storagePaths.length) await storage.remove(result.storagePaths);
      await store.recordAdminOperation("MEANINGLESS_SESSIONS_PRUNE", "SUCCEEDED", { deletedSessionCount: result.deleted, deletedStoragePathCount: result.storagePaths.length });
      return reply.code(200).send({ deletedSessionCount: result.deleted, deletedStoragePaths: result.storagePaths });
    }
    catch (error) {
      await store.recordAdminOperation("MEANINGLESS_SESSIONS_PRUNE", "FAILED", { error: "operation_failed" });
      throw error;
    }
  });
};
