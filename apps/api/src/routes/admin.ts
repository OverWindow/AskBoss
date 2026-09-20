import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { adminAiPromptSettingsSchema, adminGlobalBossDefaultsSchema, adminGlobalBossPatchSchema, adminGlobalUploadSignSchema, adminJobStatusSchema, adminLoginSchema, adminPersonalBossDefaultsSchema, adminTranslationExamplesSchema, evidenceSchema, MAX_IMAGE_EVIDENCE_PER_BOSS, surveyAnswersSchema, UPLOAD_LIMITS } from "../shared.js";
import { store } from "../repositories/index.js";
import { cleanup } from "../services/cleanup.js";
import { getAdminCredits } from "../services/ai/credits.js";
import { ai } from "../services/ai/index.js";
import { adminSourceKey, assertAdminOrigin, loginAdmin, logoutAdmin, optionalAdmin, requireAdmin } from "../services/admin-auth.js";
import { jobs } from "../services/jobs.js";
import { storage } from "../services/storage.js";
import { HttpError } from "../utils/http.js";
import { parse } from "../utils/validation.js";
import { buildGlobalBossPromptPreview } from "../services/global-boss-prompt-preview.js";
import { buildPersonalBossPromptPreview } from "../services/personal-boss-prompt-preview.js";
import { getBossPromptContext } from "../services/boss-prompt-context.js";

const maskId = (id: string | null) => id ? `${id.slice(0, 8)}…${id.slice(-4)}` : null;
const cursor = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
const GLOBAL_BOSS_ID = "00000000-0000-4000-8000-000000000001";
const idParamSchema = z.object({ id: z.string().uuid() });
const companyResearchInputSchema = z.object({ companyName: z.string().trim().min(1).max(120) });
const adminSessionPageSchema = z.coerce.number().int().min(1).max(100_000).default(1);
const requireAdminMutation = async (request: Parameters<typeof assertAdminOrigin>[0]) => { assertAdminOrigin(request); await requireAdmin(request); };

function isLegacyAdminOperationConstraint(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const databaseError = error as { code?: unknown; constraint_name?: unknown };
  return databaseError.code === "23514" && databaseError.constraint_name === "admin_operations_type_check";
}

async function recordPersonalBossPromptView(detail: Record<string, number | string | boolean | null>) {
  try {
    await store.recordAdminOperation("PERSONAL_BOSS_PROMPT_VIEW", "SUCCEEDED", detail);
  } catch (error) {
    if (!isLegacyAdminOperationConstraint(error)) throw error;
    await store.recordAdminOperation("PERSONAL_BOSS_DEFAULTS_UPDATE", "SUCCEEDED", {
      ...detail,
      action: "PERSONAL_BOSS_PROMPT_VIEW",
      compatibilityAudit: true,
    });
  }
}

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
  app.get("/admin/personal-bosses", async (request, reply) => {
    await requireAdmin(request);
    const query = request.query as Record<string, unknown>;
    const page = parse(adminSessionPageSchema, query.page);
    reply.header("cache-control", "no-store");
    return store.listAdminPersonalBosses(page, 20);
  });
  app.get("/admin/personal-bosses/:id/prompt-preview", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    await requireAdmin(request);
    const { id } = parse(idParamSchema, request.params);
    const context = await store.getAdminPersonalBossPromptContext(id);
    if (!context) throw new HttpError(404, "개인 상사를 찾을 수 없습니다.", "BOSS_NOT_FOUND");
    const [evidence, survey, promptContext, prompts] = await Promise.all([
      store.listEvidence(context.sessionId, context.boss.id),
      store.listSurveyAnswers(context.sessionId, context.boss.id),
      getBossPromptContext(context.boss, context.sessionId),
      store.getAiPromptSettings(),
    ]);
    if (!promptContext.globalBoss) throw new HttpError(500, "모두의 상사 프롬프트 기반을 찾을 수 없습니다.", "PROMPT_CONTEXT_MISSING");
    const preview = buildPersonalBossPromptPreview({
      context,
      evidence,
      survey,
      basePrompt: promptContext.basePrompt,
      globalBoss: promptContext.globalBoss,
      personaInstruction: prompts.onboarding.personaGeneration,
    });
    await recordPersonalBossPromptView({
      bossId: maskId(context.boss.id)!,
      personaVersion: context.boss.personaVersion ?? 0,
      chatMessageCount: context.chatMessageCount,
      hasChatPrompt: preview.chat.status === "AVAILABLE",
    });
    reply.header("cache-control", "no-store");
    return preview;
  });
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
  app.get("/admin/global-boss-defaults", async (request) => {
    await requireAdmin(request);
    return store.getGlobalBossDefaults();
  });
  app.put("/admin/global-boss-defaults", async (request) => {
    await requireAdminMutation(request);
    const { prompt } = parse(adminGlobalBossDefaultsSchema, request.body);
    const settings = await store.updateGlobalBossDefaults(prompt);
    await store.recordAdminOperation("GLOBAL_BOSS_DEFAULTS_UPDATE", "SUCCEEDED", { enabled: Boolean(prompt), promptLength: prompt.length });
    return settings;
  });
  app.get("/admin/global-boss/prompt-preview", async (request) => {
    await requireAdmin(request);
    const [boss, defaults] = await Promise.all([store.getGlobalBoss(), store.getGlobalBossDefaults()]);
    return buildGlobalBossPromptPreview(boss, defaults.prompt);
  });
  app.get("/admin/translation-examples", async (request) => {
    await requireAdmin(request);
    return store.getTranslationExamples();
  });
  app.put("/admin/translation-examples", async (request) => {
    await requireAdminMutation(request);
    const { examples } = parse(adminTranslationExamplesSchema, request.body);
    const settings = await store.updateTranslationExamples(examples);
    await store.recordAdminOperation("TRANSLATION_EXAMPLES_UPDATE", "SUCCEEDED", {
      exampleCount: examples.length,
      totalLength: examples.reduce((sum, example) => sum + example.length, 0),
    });
    return settings;
  });
  app.get("/admin/ai-prompt-settings", async (request) => {
    await requireAdmin(request);
    return store.getAiPromptSettings();
  });
  app.put("/admin/ai-prompt-settings", async (request) => {
    await requireAdminMutation(request);
    const settings = parse(adminAiPromptSettingsSchema, request.body);
    const previous = await store.getAiPromptSettings();
    const changedKeys = [
      previous.translation !== settings.translation ? "translation" : null,
      previous.translationReplyStyles.some((style: string, index: number) => style !== settings.translationReplyStyles[index]) ? "translationReplyStyles" : null,
      previous.onboarding.companyResearch !== settings.onboarding.companyResearch ? "companyResearch" : null,
      previous.onboarding.evidenceExtraction !== settings.onboarding.evidenceExtraction ? "evidenceExtraction" : null,
      previous.onboarding.surveyGeneration !== settings.onboarding.surveyGeneration ? "surveyGeneration" : null,
      previous.onboarding.personaGeneration !== settings.onboarding.personaGeneration ? "personaGeneration" : null,
    ].filter((key): key is string => Boolean(key));
    const saved = await store.updateAiPromptSettings(settings);
    if (changedKeys.includes("companyResearch")) await store.clearCompanyResearchCache();
    await store.recordAdminOperation("AI_PROMPT_SETTINGS_UPDATE", "SUCCEEDED", {
      changedCount: changedKeys.length,
      changedKeys: changedKeys.join(","),
      totalLength: settings.translation.length + settings.translationReplyStyles.reduce((sum, style) => sum + style.length, 0) + Object.values(settings.onboarding).reduce((sum, prompt) => sum + prompt.length, 0),
    });
    return saved;
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
    try{const prompts=await store.getAiPromptSettings();const research=await ai.researchCompany(companyName,prompts.onboarding.companyResearch);await store.saveCompanyResearch(key,research);return {research,cached:false};}catch{return {research:null,cached:false,warning:"회사 정보를 찾지 못했습니다."};}
  });
  app.post("/admin/global-boss/uploads/sign",{config:{rateLimit:{max:20,timeWindow:"1 minute"}}},async(request)=>{
    await requireAdminMutation(request);const body=parse(adminGlobalUploadSignSchema,request.body);const limit=body.contentType==="text/plain"?UPLOAD_LIMITS.text:UPLOAD_LIMITS.image;if(body.size>limit)throw new HttpError(413,"파일 크기 제한을 초과했습니다.","FILE_TOO_LARGE");
    if(body.contentType!=="text/plain"&&(await store.listGlobalEvidence()).filter((item)=>item.type==="IMAGE").length>=MAX_IMAGE_EVIDENCE_PER_BOSS)throw new HttpError(409,`이미지는 상사별로 최대 ${MAX_IMAGE_EVIDENCE_PER_BOSS}장까지 등록할 수 있습니다.`,"IMAGE_LIMIT_EXCEEDED");
    const path=storage.globalPath(GLOBAL_BOSS_ID,body.fileName,body.contentType);const intent=await store.createGlobalUploadIntent({bossId:GLOBAL_BOSS_ID,storagePath:path,originalName:body.fileName,contentType:body.contentType,sizeBytes:body.size,expiresAt:new Date(Date.now()+10*60_000).toISOString()});const signed=await storage.createSignedUpload(path);return {upload:{intentId:intent.id,path,...signed,expiresIn:600}};
  });
  app.post("/admin/global-boss/evidence",{config:{rateLimit:{max:20,timeWindow:"1 minute"}}},async(request,reply)=>{
    await requireAdminMutation(request);const body=parse(evidenceSchema,request.body);let storagePath:string|null=null;let sourceName:string|null="붙여넣기";let type:"TEXT"|"TXT"|"IMAGE"=body.type;
    if(body.type!=="TEXT"){const intent=await store.getGlobalUploadIntent(body.uploadIntentId);if(!intent||intent.bossId!==GLOBAL_BOSS_ID||intent.completedAt)throw new HttpError(400,"유효하지 않은 업로드입니다.");if(!(await storage.verify(intent.storagePath,intent.sizeBytes,intent.contentType)))throw new HttpError(400,"업로드된 파일을 확인할 수 없습니다.","UPLOAD_MISMATCH");storagePath=intent.storagePath;sourceName=intent.originalName;type=intent.contentType==="text/plain"?"TXT":"IMAGE";await store.completeGlobalUploadIntent(intent.id);}
    const input={bossId:GLOBAL_BOSS_ID,type,status:"PENDING" as const,sourceName,rawText:body.type==="TEXT"?body.rawText:null,storagePath,parsedData:null,observedAt:null,errorMessage:null};const evidence=type==="IMAGE"?await store.createGlobalImageEvidenceWithLimit({...input,type:"IMAGE"},MAX_IMAGE_EVIDENCE_PER_BOSS):await store.createGlobalEvidence(input);if(!evidence){if(storagePath)await storage.remove([storagePath]);throw new HttpError(409,`이미지는 상사별로 최대 ${MAX_IMAGE_EVIDENCE_PER_BOSS}장까지 등록할 수 있습니다.`,"IMAGE_LIMIT_EXCEEDED");}const job=await jobs.enqueue({sessionId:null,bossId:GLOBAL_BOSS_ID,type:"EVIDENCE_EXTRACT",payload:{ownerScope:"GLOBAL",evidenceId:evidence.id}});await store.recordAdminOperation("GLOBAL_BOSS_UPDATE","SUCCEEDED",{action:"evidence_add",evidenceId:maskId(evidence.id)!});return reply.code(202).send({evidence:{...evidence,storagePath:undefined},jobId:job.id});
  });
  app.delete("/admin/global-boss/evidence/:id",async(request,reply)=>{
    await requireAdminMutation(request);const {id}=parse(idParamSchema,request.params);const evidence=await store.getGlobalEvidence(id);if(!evidence)throw new HttpError(404,"관찰 자료를 찾을 수 없습니다.");if(evidence.storagePath)await storage.remove([evidence.storagePath]);await store.deleteGlobalEvidence(id);await store.recordAdminOperation("GLOBAL_BOSS_UPDATE","SUCCEEDED",{action:"evidence_delete",evidenceId:maskId(id)!});return reply.code(204).send();
  });
  app.post("/admin/global-boss/survey/generate",{config:{rateLimit:{max:10,timeWindow:"1 minute"}}},async(request)=>{await requireAdminMutation(request);const [boss,prompts]=await Promise.all([store.getGlobalBoss(),store.getAiPromptSettings()]);return {questions:await ai.generateSurvey(boss,prompts.onboarding.surveyGeneration)};});
  app.put("/admin/global-boss/survey/answers",async(request)=>{
    await requireAdminMutation(request);const body=parse(surveyAnswersSchema,request.body);await store.upsertGlobalSurveyAnswers(body.answers);const parsedData={observations:body.answers.map(answer=>({category:String(answer.questionSnapshot.category??"일상 소통"),summary:`${String(answer.questionSnapshot.situation??"")} / ${answer.selectedOption??answer.freeText??""}`,observedAt:new Date().toISOString(),contextQuality:.65,messages:[]}))};const existing=(await store.listGlobalEvidence()).find(item=>item.type==="SURVEY");if(existing)await store.updateGlobalEvidence(existing.id,{status:"READY",parsedData,observedAt:new Date().toISOString(),errorMessage:null});else await store.createGlobalEvidence({bossId:GLOBAL_BOSS_ID,type:"SURVEY",status:"READY",sourceName:"관리자 설문",rawText:null,storagePath:null,parsedData,observedAt:new Date().toISOString(),errorMessage:null});await store.recordAdminOperation("GLOBAL_BOSS_UPDATE","SUCCEEDED",{action:"survey",answers:body.answers.length});return {saved:true};
  });
  app.post("/admin/global-boss/persona/rebuild",{config:{rateLimit:{max:5,timeWindow:"15 minutes"}}},async(request,reply)=>{
    await requireAdminMutation(request);const evidence=await store.listGlobalEvidence();if(evidence.some(item=>item.status==="PENDING"||item.status==="PROCESSING"))throw new HttpError(409,"처리 중인 관찰 자료가 있습니다.","EVIDENCE_PROCESSING");const job=await jobs.enqueue({sessionId:null,bossId:GLOBAL_BOSS_ID,type:"PERSONA_REBUILD",payload:{ownerScope:"GLOBAL"}});return reply.code(202).send({jobId:job.id});
  });
  app.get("/admin/sessions", async (request) => {
    await requireAdmin(request);
    const query = request.query as Record<string, unknown>;
    const page = parse(adminSessionPageSchema, query.page);
    const result = await store.listAdminSessions(page, 20);
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
  app.get("/admin/jobs/:id",async(request)=>{await requireAdmin(request);const {id}=parse(idParamSchema,request.params);const job=await store.getJobById(id);if(!job)throw new HttpError(404,"Job을 찾을 수 없습니다.");jobs.resume(job);return {job:{id:job.id,type:job.type,status:job.status,attempts:job.attempts,maxAttempts:job.maxAttempts,errorMessage:job.errorMessage,result:job.result,createdAt:job.createdAt,updatedAt:job.updatedAt}};});

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
