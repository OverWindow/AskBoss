import postgres, { type Sql } from "postgres";
import type { AdminAiPromptSettings, AdminDashboard, AdminJobSummary, AdminOperation, AdminPersonalBossPage, AdminSessionPage, AdminSessionSummary, Boss, ChatMessageCoaching, ChatMessageKind, CompanyResearch, HrDashboard, TranslationArchiveBranch, TranslationArchiveDetail, TranslationArchiveSummary, TranslationExamples, UserProfile } from "../shared.js";
import type { AdminLoginAttempt, AdminSessionRecord, AnalyticsEventInput, BossRecord, ChatMessageRecord, ChatThreadRecord, EvidenceRecord, GlobalEvidenceRecord, GlobalUploadIntentRecord, JobRecord, SessionRecord, SurveyAnswerRecord, TranslationRecord, UploadIntentRecord } from "../types.js";
import type { AdminPersonalBossPromptContext, ChatMessageCoachingContext, CreateBossInput, Store, UpdateGlobalBossInput } from "./store.js";
import { safeJobFailureReason, summarizeJobFailures } from "../utils/admin-safety.js";
import { toIsoTimestamp } from "../utils/database.js";
import { computeSurfaceActualGap } from "../utils/hr-aggregation.js";
import { buildActualResponseEvidence } from "../utils/actual-response.js";
import { encodeChatCursor, InvalidChatCursorError, type ChatCursor } from "../utils/chat-cursor.js";
import { encodeArchiveCursor, type ArchiveCursor } from "../utils/archive-cursor.js";
import { getMockHrDashboard } from "../services/hr-mock.js";

const camelSession = (r: any): SessionRecord => ({ id: r.id, tokenHash: r.token_hash, createdAt: r.created_at.toISOString(), lastSeenAt: r.last_seen_at.toISOString(), expiresAt: r.expires_at.toISOString() });
const camelBoss = (r: any): BossRecord => ({
  id: r.id, scope: r.scope, status: r.status, sessionId: r.session_id, alias: r.alias, avatarKey: r.avatar_key, jobFunction: r.job_function,
  yearsOfServiceBand: r.years_of_service_band, rank: r.rank, companyName: r.company_name, ageBand: r.age_band, hierarchyScore: r.hierarchy_score,
  companyResearch: r.company_research, persona: r.persona_profile, pki: r.pki_breakdown,
  personaError: r.persona_error, expiresAt: r.expires_at?.toISOString() ?? null,
  personaVersion: Number(r.persona_version ?? 0),
});
const camelEvidence = (r: any): EvidenceRecord => ({ id: r.id, bossId: r.boss_id, sessionId: r.session_id, type: r.type, status: r.status, rawText: r.raw_text, storagePath: r.storage_path, parsedData: r.parsed_data, observedAt: r.observed_at?.toISOString() ?? null, createdAt: r.created_at.toISOString(), updatedAt: (r.updated_at ?? r.created_at).toISOString(), expiresAt: r.expires_at.toISOString(), errorMessage: r.error_message, sourceArchiveId: r.source_archive_id ?? null });
const camelChatMessage = (r: any): ChatMessageRecord => ({
  id: r.id,
  role: r.role,
  content: r.content,
  kind: r.kind ?? "CHAT",
  coaching: r.coaching_review ?? null,
  createdAt: r.created_at.toISOString(),
});
const camelGlobalEvidence = (r: any): GlobalEvidenceRecord => ({ id:r.id,bossId:r.boss_id,type:r.type,status:r.status,sourceName:r.source_name,rawText:r.raw_text,storagePath:r.storage_path,parsedData:r.parsed_data,observedAt:r.observed_at?.toISOString()??null,createdAt:r.created_at.toISOString(),errorMessage:r.error_message??null });
const camelJob = (r: any): JobRecord => ({ id: r.id, sessionId: r.session_id, bossId: r.boss_id, type: r.type, status: r.status, payload: r.payload, result: r.result, errorMessage: r.error_message, attempts: r.attempts, maxAttempts: r.max_attempts, leaseUntil: r.lease_until?.toISOString() ?? null, retryOf: r.retry_of ?? null, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() });
const camelAdminSession = (r: any): AdminSessionRecord => ({ id: r.id, tokenHash: r.token_hash, ipHash: r.ip_hash, createdAt: toIsoTimestamp(r.created_at ?? r.createdAt, "admin_sessions.created_at"), lastSeenAt: toIsoTimestamp(r.last_seen_at ?? r.lastSeenAt, "admin_sessions.last_seen_at"), expiresAt: toIsoTimestamp(r.expires_at ?? r.expiresAt, "admin_sessions.expires_at") });
const camelArchiveSummary = (r: any): TranslationArchiveSummary => ({
  id: r.id,
  boss: r.boss_snapshot,
  inputText: r.input_text,
  channel: r.channel,
  lastCopiedReplyIndex: r.last_copied_reply_index === null ? null : Number(r.last_copied_reply_index),
  actualResponse: r.actual_response ? { content: r.actual_response, replyIndex: r.actual_reply_index === null ? null : Number(r.actual_reply_index), replyText: r.actual_reply_text, updatedAt: r.actual_response_updated_at.toISOString() } : null,
  branchCount: Number(r.branch_count ?? 0),
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

export class PostgresStore implements Store {
  private sql: Sql;
  constructor(url: string) {
    this.sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      keep_alive: 60,
      max_lifetime: 1_800,
      prepare: false,
      connection: {
        application_name: "askboss-api",
        statement_timeout: 30_000,
        lock_timeout: 5_000,
      },
    });
  }

  private async loadArchive(sql: any, row: any): Promise<TranslationArchiveDetail> {
    const branches = await sql`select * from translation_archive_branches where archive_id=${row.id} order by created_at desc`;
    const messages = branches.length ? await sql`select m.* from translation_archive_messages m where m.branch_id in ${sql(branches.map((branch: any) => branch.id))} order by m.position` : [];
    const detail = camelArchiveSummary({ ...row, branch_count: branches.length });
    return {
      ...detail,
      result: row.result,
      branches: branches.map((branch: any): TranslationArchiveBranch => ({
        id: branch.id,
        kind: branch.kind,
        status: branch.status,
        replyIndex: Number(branch.reply_index),
        messages: messages.filter((message: any) => message.branch_id === branch.id).map(camelChatMessage),
        createdAt: branch.created_at.toISOString(),
        updatedAt: branch.updated_at.toISOString(),
      })),
    };
  }

  async createSession(tokenHash: string, expiresAt: string) { const [r] = await this.sql`insert into sessions (token_hash, expires_at) values (${tokenHash}, ${expiresAt}) returning *`; return camelSession(r!); }
  async findSession(tokenHash: string) { const [r] = await this.sql`select * from sessions where token_hash=${tokenHash} and expires_at > now()`; return r ? camelSession(r) : null; }
  async touchSession(id: string) { await this.sql`update sessions set last_seen_at=now() where id=${id} and last_seen_at<now()-interval '1 minute'`; }
  async deleteSession(id: string) { await this.sql.begin(async (sql) => { await sql`update translation_archive_branches b set status='SUPERSEDED',updated_at=now() from chat_threads t where t.archive_branch_id=b.id and t.session_id=${id} and b.status='ACTIVE'`; await sql`delete from sessions where id=${id}`; }); }
  async getProfile(sessionId: string) { const [r] = await this.sql`select * from user_profiles where session_id=${sessionId}`; return r ? { handle: r.handle, ageBand: r.age_band, yearsOfServiceBand: r.years_of_service_band, rank: r.rank, jobFunction: r.job_function ?? "", entryPath: r.entry_path, weaknesses: r.weaknesses } : null; }
  async upsertProfile(sessionId: string, p: UserProfile) {
    const [r] = await this.sql`insert into user_profiles (session_id,handle,age_band,years_of_service_band,rank,job_function,entry_path,weaknesses)
      values (${sessionId},${p.handle},${p.ageBand},${p.yearsOfServiceBand},${p.rank},${p.jobFunction},${p.entryPath},${p.weaknesses})
      on conflict (session_id) do update set handle=excluded.handle,age_band=excluded.age_band,years_of_service_band=excluded.years_of_service_band,rank=excluded.rank,job_function=excluded.job_function,entry_path=excluded.entry_path,weaknesses=excluded.weaknesses,updated_at=now() returning *`;
    return { handle: r!.handle, ageBand: r!.age_band, yearsOfServiceBand: r!.years_of_service_band, rank: r!.rank, jobFunction: r!.job_function ?? "", entryPath: r!.entry_path, weaknesses: r!.weaknesses };
  }
  async listBosses(sessionId: string) { const rows = await this.sql`select * from bosses where scope='GLOBAL' or (session_id=${sessionId} and expires_at>now()) order by case when scope='GLOBAL' then 0 else 1 end, created_at`; return rows.map(camelBoss); }
  async getBoss(sessionId: string, bossId: string) { const [r] = await this.sql`select * from bosses where id=${bossId} and (scope='GLOBAL' or (session_id=${sessionId} and expires_at>now()))`; return r ? camelBoss(r) : null; }
  async createBoss(sessionId: string, b: CreateBossInput, expiresAt: string) {
    const [r] = await this.sql`insert into bosses (scope,status,session_id,alias,avatar_key,job_function,years_of_service_band,rank,company_name,age_band,hierarchy_score,company_research,expires_at)
      values ('SESSION','DRAFT',${sessionId},${b.alias},${b.avatarKey},${b.jobFunction},${b.yearsOfServiceBand},${b.rank},${b.companyName},${b.ageBand},${b.hierarchyScore},${this.sql.json((b.companyResearch ?? null) as any)},${expiresAt}) returning *`;
    return camelBoss(r!);
  }
  async updateBoss(sessionId: string, bossId: string, patch: Partial<CreateBossInput> & Record<string, unknown>) {
    const values: Record<string, unknown> = {};
    const map: Record<string, string> = { alias: "alias", avatarKey: "avatar_key", jobFunction: "job_function", yearsOfServiceBand: "years_of_service_band", rank: "rank", companyName: "company_name", ageBand: "age_band", hierarchyScore: "hierarchy_score", companyResearch: "company_research" };
    for (const [key, column] of Object.entries(map)) if (key in patch) values[column] = key === "companyResearch" ? this.sql.json(patch[key] as any) : patch[key];
    values.updated_at = new Date();
    const [r] = await this.sql`update bosses set ${this.sql(values)} where id=${bossId} and session_id=${sessionId} and scope='SESSION' returning *`;
    if (!r) throw new Error("상사를 찾을 수 없습니다."); return camelBoss(r);
  }
  async setBossPersona(sessionId: string, bossId: string, persona: unknown, pki: any) { await this.sql`update bosses set persona_profile=${this.sql.json(persona as any)},pki_score=${pki.score},pki_breakdown=${this.sql.json(pki)},status='READY',persona_error=null,persona_built_at=now(),persona_version=persona_version+1,updated_at=now() where id=${bossId} and session_id=${sessionId}`; }
  async setBossStatus(sessionId: string, bossId: string, status: Boss["status"], error: string | null = null) { await this.sql`update bosses set status=${status},persona_error=${error},updated_at=now() where id=${bossId} and session_id=${sessionId}`; }
  async deleteBoss(sessionId: string, bossId: string) { await this.sql.begin(async (sql) => { await sql`delete from translation_archives where source_boss_id=${bossId}`; await sql`delete from bosses where id=${bossId} and session_id=${sessionId} and scope='SESSION'`; }); }
  async getGlobalBoss() { const [r]=await this.sql`select * from bosses where scope='GLOBAL' order by created_at limit 1`; if(!r)throw new Error("공통 상사를 찾을 수 없습니다."); return camelBoss(r); }
  async updateGlobalBoss(patch: UpdateGlobalBossInput) {
    const values:Record<string,unknown>={}; const map:Record<string,string>={alias:"alias",avatarKey:"avatar_key",jobFunction:"job_function",yearsOfServiceBand:"years_of_service_band",rank:"rank",companyName:"company_name",ageBand:"age_band",hierarchyScore:"hierarchy_score",companyResearch:"company_research"};
    const source=patch as Record<string,unknown>;
    for(const [key,column] of Object.entries(map))if(key in source)values[column]=key==="companyResearch"&&source[key]!==null?this.sql.json(source[key] as any):source[key];
    values.updated_at=new Date(); const [r]=await this.sql`update bosses set ${this.sql(values)} where scope='GLOBAL' returning *`; if(!r)throw new Error("공통 상사를 찾을 수 없습니다."); return camelBoss(r);
  }
  async setGlobalBossPersona(persona:unknown,pki:any){await this.sql`update bosses set persona_profile=${this.sql.json(persona as any)},pki_score=${pki.score},pki_breakdown=${this.sql.json(pki)},status='READY',persona_error=null,persona_built_at=now(),persona_version=persona_version+1,updated_at=now() where scope='GLOBAL'`;}
  async getCompanyResearch(name: string) { const [r] = await this.sql`select result from company_research_cache where normalized_name=${name} and expires_at>now()`; return (r?.result as CompanyResearch) ?? null; }
  async saveCompanyResearch(name: string, result: CompanyResearch) { await this.sql`insert into company_research_cache (normalized_name,company_name,result,expires_at) values (${name},${result.companyName},${this.sql.json(result as any)},now()+interval '7 days') on conflict(normalized_name) do update set result=excluded.result,company_name=excluded.company_name,created_at=now(),expires_at=excluded.expires_at`; }
  async clearCompanyResearchCache() { await this.sql`delete from company_research_cache`; }
  async createUploadIntent(i: Omit<UploadIntentRecord, "id" | "completedAt">) { const [r] = await this.sql`insert into upload_intents(session_id,boss_id,storage_path,original_name,content_type,size_bytes,expires_at) values(${i.sessionId},${i.bossId},${i.storagePath},${i.originalName},${i.contentType},${i.sizeBytes},${i.expiresAt}) returning *`; return { id:r!.id,sessionId:r!.session_id,bossId:r!.boss_id,storagePath:r!.storage_path,originalName:r!.original_name,contentType:r!.content_type,sizeBytes:r!.size_bytes,completedAt:null,expiresAt:r!.expires_at.toISOString() }; }
  async getUploadIntent(sessionId: string, id: string) { const [r] = await this.sql`select * from upload_intents where id=${id} and session_id=${sessionId} and expires_at>now()`; return r ? { id:r.id,sessionId:r.session_id,bossId:r.boss_id,storagePath:r.storage_path,originalName:r.original_name,contentType:r.content_type,sizeBytes:r.size_bytes,completedAt:r.completed_at?.toISOString() ?? null,expiresAt:r.expires_at.toISOString() } : null; }
  async completeUploadIntent(sessionId: string, id: string) { await this.sql`update upload_intents set completed_at=now() where id=${id} and session_id=${sessionId}`; }
  async listBossStoragePaths(sessionId: string, bossId: string) {
    const rows = await this.sql`
      select storage_path from upload_intents where session_id=${sessionId} and boss_id=${bossId}
      union
      select storage_path from boss_evidence where session_id=${sessionId} and boss_id=${bossId} and storage_path is not null
    `;
    return rows.map((row:any) => row.storage_path as string);
  }
  async createGlobalUploadIntent(i:Omit<GlobalUploadIntentRecord,"id"|"completedAt">){const [r]=await this.sql`insert into global_boss_upload_intents(boss_id,storage_path,original_name,content_type,size_bytes,expires_at) values(${i.bossId},${i.storagePath},${i.originalName},${i.contentType},${i.sizeBytes},${i.expiresAt}) returning *`;return {id:r!.id,bossId:r!.boss_id,storagePath:r!.storage_path,originalName:r!.original_name,contentType:r!.content_type,sizeBytes:r!.size_bytes,completedAt:null,expiresAt:r!.expires_at.toISOString()};}
  async getGlobalUploadIntent(id:string){const [r]=await this.sql`select * from global_boss_upload_intents where id=${id} and expires_at>now()`;return r?{id:r.id,bossId:r.boss_id,storagePath:r.storage_path,originalName:r.original_name,contentType:r.content_type,sizeBytes:r.size_bytes,completedAt:r.completed_at?.toISOString()??null,expiresAt:r.expires_at.toISOString()}:null;}
  async completeGlobalUploadIntent(id:string){await this.sql`update global_boss_upload_intents set completed_at=now() where id=${id}`;}
  async createEvidence(i: Omit<EvidenceRecord, "id" | "createdAt">) { const [r] = await this.sql`insert into boss_evidence(boss_id,session_id,type,status,raw_text,storage_path,parsed_data,observed_at,expires_at,source_archive_id) values(${i.bossId},${i.sessionId},${i.type},${i.status},${i.rawText},${i.storagePath},${this.sql.json(i.parsedData)},${i.observedAt},${i.expiresAt},${i.sourceArchiveId ?? null}) returning *`; return camelEvidence(r); }
  async getEvidence(sessionId: string, id: string) { const [r] = await this.sql`select * from boss_evidence where id=${id} and session_id=${sessionId}`; return r ? camelEvidence(r) : null; }
  async listEvidence(sessionId: string, bossId: string) { const rows = await this.sql`select * from boss_evidence where session_id=${sessionId} and boss_id=${bossId} order by created_at`; return rows.map(camelEvidence); }
  async updateEvidence(sessionId: string, id: string, patch: Partial<EvidenceRecord>) {
    const values: Record<string, unknown> = {}; const map: Record<string,string> = { status:"status",rawText:"raw_text",storagePath:"storage_path",parsedData:"parsed_data",observedAt:"observed_at",errorMessage:"error_message" };
    for (const [key,column] of Object.entries(map)) if (key in patch) values[column] = key === "parsedData" ? this.sql.json((patch as any)[key]) : (patch as any)[key];
    if (Object.keys(values).length) { values.updated_at = new Date(); await this.sql`update boss_evidence set ${this.sql(values)} where id=${id} and session_id=${sessionId}`; }
  }
  async createGlobalEvidence(i:Omit<GlobalEvidenceRecord,"id"|"createdAt">){const [r]=await this.sql`insert into global_boss_evidence(boss_id,type,status,source_name,raw_text,storage_path,parsed_data,error_message,observed_at) values(${i.bossId},${i.type},${i.status},${i.sourceName},${i.rawText},${i.storagePath},${this.sql.json(i.parsedData)},${i.errorMessage},${i.observedAt}) returning *`;return camelGlobalEvidence(r);}
  async getGlobalEvidence(id:string){const [r]=await this.sql`select * from global_boss_evidence where id=${id}`;return r?camelGlobalEvidence(r):null;}
  async listGlobalEvidence(){const rows=await this.sql`select * from global_boss_evidence order by created_at desc`;return rows.map(camelGlobalEvidence);}
  async updateGlobalEvidence(id:string,patch:Partial<GlobalEvidenceRecord>){const values:Record<string,unknown>={};const map:Record<string,string>={status:"status",sourceName:"source_name",rawText:"raw_text",storagePath:"storage_path",parsedData:"parsed_data",observedAt:"observed_at",errorMessage:"error_message"};for(const [key,column] of Object.entries(map))if(key in patch)values[column]=key==="parsedData"?this.sql.json((patch as any)[key]):(patch as any)[key];values.updated_at=new Date();await this.sql`update global_boss_evidence set ${this.sql(values)} where id=${id}`;}
  async deleteGlobalEvidence(id:string){await this.sql`delete from global_boss_evidence where id=${id}`;}
  async upsertSurveyAnswers(sessionId: string, bossId: string, answers: SurveyAnswerRecord[]) { await this.sql.begin(async (sql) => { for (const a of answers) await sql`insert into boss_survey_answers(boss_id,session_id,question_id,question_snapshot,selected_option,free_text) values(${bossId},${sessionId},${a.questionId},${sql.json(a.questionSnapshot as any)},${a.selectedOption},${a.freeText}) on conflict(boss_id,question_id) do update set question_snapshot=excluded.question_snapshot,selected_option=excluded.selected_option,free_text=excluded.free_text,created_at=now()`; }); }
  async listSurveyAnswers(sessionId: string, bossId: string) { const rows = await this.sql`select * from boss_survey_answers where session_id=${sessionId} and boss_id=${bossId} order by created_at`; return rows.map((r:any) => ({ questionId:r.question_id,questionSnapshot:r.question_snapshot,selectedOption:r.selected_option,freeText:r.free_text })); }
  async upsertGlobalSurveyAnswers(answers:SurveyAnswerRecord[]){await this.sql.begin(async(sql)=>{for(const a of answers)await sql`insert into global_boss_survey_answers(boss_id,question_id,question_snapshot,selected_option,free_text) values('00000000-0000-4000-8000-000000000001',${a.questionId},${sql.json(a.questionSnapshot as any)},${a.selectedOption},${a.freeText}) on conflict(boss_id,question_id) do update set question_snapshot=excluded.question_snapshot,selected_option=excluded.selected_option,free_text=excluded.free_text,updated_at=now()`;});}
  async listGlobalSurveyAnswers(){const rows=await this.sql`select * from global_boss_survey_answers order by created_at`;return rows.map((r:any)=>({questionId:r.question_id,questionSnapshot:r.question_snapshot,selectedOption:r.selected_option,freeText:r.free_text}));}
  async createJob(i: Pick<JobRecord,"sessionId"|"bossId"|"type"|"payload">) { const [r] = await this.sql`insert into ai_jobs(session_id,boss_id,type,payload) values(${i.sessionId},${i.bossId},${i.type},${this.sql.json(i.payload)}) returning *`; return camelJob(r); }
  async getJob(sessionId: string, id: string) { const [r] = await this.sql`select * from ai_jobs where id=${id} and session_id=${sessionId}`; return r ? camelJob(r) : null; }
  async getJobById(id:string){const [r]=await this.sql`select * from ai_jobs where id=${id}`;return r?camelJob(r):null;}
  async claimJob(id: string) { const [r] = await this.sql`update ai_jobs set status='RUNNING',attempts=attempts+1,lease_until=now()+interval '90 seconds',updated_at=now() where id=${id} and (status='PENDING' or (status='RUNNING' and lease_until<=now())) returning *`; return r ? camelJob(r) : null; }
  async renewJobLease(id:string){await this.sql`update ai_jobs set lease_until=now()+interval '90 seconds',updated_at=now() where id=${id} and status='RUNNING'`;}
  async deferJob(id:string){await this.sql`update ai_jobs set status='PENDING',attempts=greatest(attempts-1,0),lease_until=null,updated_at=now() where id=${id} and status='RUNNING'`;}
  async listRunnableJobs(limit: number) { const rows = await this.sql`select * from ai_jobs where status='PENDING' or (status='RUNNING' and lease_until<=now()) order by created_at limit ${limit}`; return rows.map(camelJob); }
  async completeJob(id: string, result: unknown) { await this.sql`update ai_jobs set status='SUCCEEDED',result=${this.sql.json(result as any)},error_message=null,lease_until=null,completed_at=now(),updated_at=now() where id=${id}`; }
  async failJob(id: string, error: string, retry: boolean) { await this.sql`update ai_jobs set status=case when ${retry} and attempts<max_attempts then 'PENDING' else 'FAILED' end,error_message=${error},lease_until=null,updated_at=now() where id=${id}`; }
  async retryJob(id: string) { const [original] = await this.sql`select * from ai_jobs where id=${id} and status='FAILED'`; if (!original) return null; const [r] = await this.sql`insert into ai_jobs(session_id,boss_id,type,payload,retry_of) values(${original.session_id},${original.boss_id},${original.type},${this.sql.json(original.payload)},${original.id}) returning *`; return camelJob(r); }
  async getOrCreateThread(sessionId: string, bossId: string, threadId: string | undefined, expiresAt: string) {
    let r:any; if (threadId) [r] = await this.sql`select * from chat_threads where id=${threadId} and session_id=${sessionId} and boss_id=${bossId} and expires_at>now()`;
    if (!r) [r] = await this.sql`select * from chat_threads where session_id=${sessionId} and boss_id=${bossId} and expires_at>now()`;
    if (!r) [r] = await this.sql`insert into chat_threads(session_id,boss_id,expires_at) values(${sessionId},${bossId},${expiresAt}) on conflict (session_id,boss_id) do update set expires_at=excluded.expires_at returning *`;
    const messages = await this.sql`select * from chat_messages where thread_id=${r.id} order by created_at desc,id desc limit 20`;
    return { id:r.id,sessionId:r.session_id,bossId:r.boss_id,conversationSummary:r.conversation_summary,messages:messages.reverse().map(camelChatMessage),archiveId:r.archive_id,archiveBranchId:r.archive_branch_id,createdAt:r.created_at.toISOString(),expiresAt:r.expires_at.toISOString() } as ChatThreadRecord;
  }
  async replaceChatWithSimulation(sessionId: string, bossId: string, archiveId: string, replyIndex: number, source: string, reply: string, expiresAt: string) { return this.sql.begin(async (sql) => {
    const [archive] = await sql`select * from translation_archives where id=${archiveId} and source_session_id=${sessionId} for update`; if (!archive) throw new Error("아카이브를 찾을 수 없습니다.");
    await sql`update translation_archive_branches b set status='SUPERSEDED',updated_at=now() from chat_threads t where t.archive_branch_id=b.id and t.session_id=${sessionId} and t.boss_id=${bossId} and b.status='ACTIVE'`;
    await sql`delete from chat_threads where session_id=${sessionId} and boss_id=${bossId}`;
    await sql`update translation_archives set updated_at=now() where id=${archiveId}`;
    const usesActualResponse = archive.actual_response && Number(archive.actual_reply_index) === replyIndex;
    const [branch] = await sql`insert into translation_archive_branches(archive_id,kind,status,reply_index) values(${archiveId},${usesActualResponse ? "ACTUAL" : "PREDICTED"},'ACTIVE',${replyIndex}) returning *`;
    const [thread] = await sql`insert into chat_threads(session_id,boss_id,archive_id,archive_branch_id,expires_at) values(${sessionId},${bossId},${archiveId},${branch!.id},${expiresAt}) returning *`;
    const seeds = [
      { role: "assistant" as const, content: source, kind: "SIMULATION_SOURCE" as const },
      { role: "user" as const, content: reply, kind: "SIMULATION_REPLY" as const },
      ...(usesActualResponse ? [{ role: "assistant" as const, content: String(archive.actual_response), kind: "ACTUAL_RESPONSE" as const }] : []),
    ];
    const messages: ChatMessageRecord[] = [];
    for (let position = 0; position < seeds.length; position += 1) { const seed = seeds[position]!; const [message] = await sql`insert into chat_messages(thread_id,role,content,kind) values(${thread!.id},${seed.role},${seed.content},${seed.kind}) returning *`; await sql`insert into translation_archive_messages(branch_id,role,content,kind,position,created_at) values(${branch!.id},${seed.role},${seed.content},${seed.kind},${position},${message!.created_at})`; messages.push(camelChatMessage(message)); }
    return { threadId: thread!.id, archiveId, messages, usesActualResponse: Boolean(usesActualResponse) };
  }); }
  async resetChat(sessionId: string, bossId: string) { await this.sql.begin(async (sql) => { await sql`update translation_archive_branches b set status='SUPERSEDED',updated_at=now() from chat_threads t where t.archive_branch_id=b.id and t.session_id=${sessionId} and t.boss_id=${bossId} and b.status='ACTIVE'`; await sql`delete from chat_threads where session_id=${sessionId} and boss_id=${bossId}`; }); }
  async addChatMessage(threadId: string, role: ChatMessageRecord["role"], content: string, kind: ChatMessageKind = "CHAT") { return this.sql.begin(async (sql) => { const [thread] = await sql`select * from chat_threads where id=${threadId}`; if (!thread) throw new Error("대화를 찾을 수 없습니다."); const [r] = await sql`insert into chat_messages(thread_id,role,content,kind) values(${threadId},${role},${content},${kind}) returning *`; if (thread.archive_branch_id) { const [position] = await sql`select count(*)::int value from translation_archive_messages where branch_id=${thread.archive_branch_id}`; await sql`insert into translation_archive_messages(branch_id,role,content,kind,position,created_at) values(${thread.archive_branch_id},${role},${content},${kind},${position!.value},${r!.created_at})`; await sql`update translation_archive_branches set updated_at=now() where id=${thread.archive_branch_id}`; await sql`update translation_archives set updated_at=now() where id=${thread.archive_id}`; } return camelChatMessage(r); }); }
  async getChatMessageCoachingContext(sessionId: string, bossId: string, messageId: string): Promise<ChatMessageCoachingContext | null> {
    const [target] = await this.sql`
      select m.*,t.conversation_summary
      from chat_messages m
      join chat_threads t on t.id=m.thread_id
      where m.id=${messageId} and t.session_id=${sessionId} and t.boss_id=${bossId} and t.expires_at>now()
    `;
    if (!target) return null;
    const previous = await this.sql`
      select m.* from chat_messages m
      where m.thread_id=${target.thread_id}
        and (m.created_at<${target.created_at} or (m.created_at=${target.created_at} and m.id<${target.id}))
      order by m.created_at desc,m.id desc limit 19
    `;
    return {
      conversationSummary: target.conversation_summary,
      previousMessages: previous.reverse().map(camelChatMessage),
      message: camelChatMessage(target),
    };
  }
  async setChatMessageCoaching(sessionId: string, bossId: string, messageId: string, coaching: ChatMessageCoaching) {
    const [row] = await this.sql`
      update chat_messages m set coaching_review=${this.sql.json(coaching as any)}
      from chat_threads t
      where m.id=${messageId} and m.thread_id=t.id and t.session_id=${sessionId} and t.boss_id=${bossId} and t.expires_at>now()
      returning m.*
    `;
    return row ? camelChatMessage(row) : null;
  }
  async listChatMessages(sessionId: string, bossId: string, cursor?: ChatCursor, limit=50) {
    const [thread] = await this.sql`select * from chat_threads where session_id=${sessionId} and boss_id=${bossId} order by created_at desc limit 1`; if (!thread) { if(cursor)throw new InvalidChatCursorError(); return { threadId:null,archiveId:null,messages:[],nextCursor:null }; }
    let rows;
    if (cursor) {
      const [cursorRow] = await this.sql`select id,created_at from chat_messages where id=${cursor.id} and thread_id=${thread.id}`;
      if (!cursorRow) throw new InvalidChatCursorError();
      rows = await this.sql`select * from chat_messages where thread_id=${thread.id} and (created_at<${cursorRow.created_at} or (created_at=${cursorRow.created_at} and id<${cursorRow.id})) order by created_at desc,id desc limit ${limit+1}`;
    } else {
      rows = await this.sql`select * from chat_messages where thread_id=${thread.id} order by created_at desc,id desc limit ${limit+1}`;
    }
    const hasMore=rows.length>limit;
    const messages=rows.slice(0,limit).reverse().map(camelChatMessage);
    return {threadId:thread.id,archiveId:thread.archive_id,messages,nextCursor:hasMore&&messages[0]?encodeChatCursor({id:messages[0].id}):null};
  }
  async updateThreadSummary(threadId: string, summary: string) { await this.sql`update chat_threads set conversation_summary=${summary},summarized_through=now() where id=${threadId}`; }
  async createTranslation(i: Omit<TranslationRecord,"id"|"createdAt"|"feedback"|"simulationCount">) { const [r]=await this.sql`insert into translation_requests(session_id,boss_id,input_text,channel,result,expires_at) values(${i.sessionId},${i.bossId},${i.inputText},${i.channel},${this.sql.json(i.result as any)},${i.expiresAt}) returning *`; return {id:r!.id,sessionId:r!.session_id,bossId:r!.boss_id,inputText:r!.input_text,channel:r!.channel,result:r!.result,feedback:r!.feedback,simulationCount:r!.simulation_count??0,createdAt:r!.created_at.toISOString(),expiresAt:r!.expires_at.toISOString()}; }
  async createTranslationWithArchive(i: Omit<TranslationRecord,"id"|"createdAt"|"feedback"|"simulationCount">, ownerHash: string, boss: BossRecord) { return this.sql.begin(async (sql) => { const [translationRow]=await sql`insert into translation_requests(session_id,boss_id,input_text,channel,result,expires_at) values(${i.sessionId},${i.bossId},${i.inputText},${i.channel},${sql.json(i.result as any)},${i.expiresAt}) returning *`; const [archiveRow]=await sql`insert into translation_archives(owner_hash,translation_request_id,source_session_id,source_boss_id,boss_snapshot,input_text,channel,result) values(${ownerHash},${translationRow!.id},${i.sessionId},${i.bossId},${sql.json({id:boss.id,alias:boss.alias,avatarKey:boss.avatarKey,scope:boss.scope})},${i.inputText},${i.channel},${sql.json(i.result as any)}) returning *`; const translation={id:translationRow!.id,sessionId:translationRow!.session_id,bossId:translationRow!.boss_id,inputText:translationRow!.input_text,channel:translationRow!.channel,result:translationRow!.result,feedback:translationRow!.feedback,simulationCount:translationRow!.simulation_count??0,createdAt:translationRow!.created_at.toISOString(),expiresAt:translationRow!.expires_at.toISOString()} as TranslationRecord; return { translation, archive: await this.loadArchive(sql, archiveRow) }; }); }
  async getTranslation(sessionId:string,id:string){const [r]=await this.sql`select * from translation_requests where id=${id} and session_id=${sessionId} and expires_at>now()`;return r?{id:r.id,sessionId:r.session_id,bossId:r.boss_id,inputText:r.input_text,channel:r.channel,result:r.result,feedback:r.feedback,simulationCount:r.simulation_count??0,createdAt:r.created_at.toISOString(),expiresAt:r.expires_at.toISOString()} as TranslationRecord:null;}
  async getArchiveByTranslation(sessionId: string, translationId: string) { const [row] = await this.sql`select * from translation_archives where translation_request_id=${translationId} and source_session_id=${sessionId}`; return row ? this.loadArchive(this.sql, row) : null; }
  async listArchives(ownerHash: string, cursor?: ArchiveCursor, limit=20) { const rows = await this.sql`select a.*,(select count(*)::int from translation_archive_branches b where b.archive_id=a.id) branch_count from translation_archives a where a.owner_hash=${ownerHash} and (${cursor?.id ?? null}::uuid is null or exists(select 1 from translation_archives c where c.id=${cursor?.id ?? null}::uuid and c.owner_hash=${ownerHash} and (a.created_at<c.created_at or (a.created_at=c.created_at and a.id<c.id)))) order by a.created_at desc,a.id desc limit ${limit+1}`; const page=rows.slice(0,limit); return {items:page.map(camelArchiveSummary),nextCursor:rows.length>limit&&page.length?encodeArchiveCursor({id:page.at(-1)!.id}):null}; }
  async getArchive(ownerHash: string, archiveId: string) { const [row] = await this.sql`select * from translation_archives where id=${archiveId} and owner_hash=${ownerHash}`; return row ? this.loadArchive(this.sql, row) : null; }
  async deleteArchive(ownerHash: string, archiveId: string) { const rows=await this.sql`delete from translation_archives where id=${archiveId} and owner_hash=${ownerHash} returning id`;return rows.length>0; }
  async setArchiveSelectedReply(ownerHash: string, archiveId: string, replyIndex: number) { const [row] = await this.sql`update translation_archives set last_copied_reply_index=${replyIndex},updated_at=now() where id=${archiveId} and owner_hash=${ownerHash} returning *`; return row ? this.loadArchive(this.sql, row) : null; }
  async upsertArchiveActualResponse(ownerHash: string, sessionId: string, archiveId: string, content: string, expiresAt: string) { return this.sql.begin(async (sql) => {
    const [archive] = await sql`select * from translation_archives where id=${archiveId} and owner_hash=${ownerHash} for update`; if (!archive) return null;
    const replyIndex = archive.actual_response ? archive.actual_reply_index : archive.last_copied_reply_index;
    const replyText = archive.actual_response ? archive.actual_reply_text : replyIndex === null ? null : archive.result.replies[Number(replyIndex)]?.text ?? null;
    const [updatedArchive] = await sql`update translation_archives set actual_response=${content},actual_reply_index=${replyIndex},actual_reply_text=${replyText},actual_response_updated_at=now(),updated_at=now() where id=${archiveId} returning *`;
    const [boss] = await sql`select * from bosses where id=${archive.source_boss_id} and (scope='GLOBAL' or (session_id=${sessionId} and expires_at>now()))`;
    let application: "NEXT_PERSONA_REBUILD" | "SESSION_CALIBRATION" | "ARCHIVE_ONLY" = "ARCHIVE_ONLY";
    if (boss) { application = boss.scope === "GLOBAL" ? "SESSION_CALIBRATION" : "NEXT_PERSONA_REBUILD"; const [existing] = await sql`select * from boss_evidence where session_id=${sessionId} and source_archive_id=${archiveId} and type='FEEDBACK'`; const observedAt=existing?.observed_at?.toISOString()??new Date().toISOString(); const built=buildActualResponseEvidence(archive.input_text,replyText,content,observedAt); if(existing) await sql`update boss_evidence set raw_text=${built.rawText},parsed_data=${sql.json(built.parsedData)},status='READY',error_message=null,updated_at=now() where id=${existing.id}`; else await sql`insert into boss_evidence(boss_id,session_id,type,status,raw_text,storage_path,parsed_data,observed_at,expires_at,source_archive_id) values(${boss.id},${sessionId},'FEEDBACK','READY',${built.rawText},null,${sql.json(built.parsedData)},${observedAt},${expiresAt},${archiveId})`; }
    const [active] = await sql`select * from chat_threads where session_id=${sessionId} and archive_id=${archiveId}`; let activeChat: {threadId:string;archiveId:string;messages:ChatMessageRecord[]}|null=null;
    if(active){const [oldBranch]=await sql`select * from translation_archive_branches where id=${active.archive_branch_id}`; const activeReplyIndex=replyIndex===null?Number(oldBranch?.reply_index??0):Number(replyIndex); await sql`update translation_archive_branches set status='SUPERSEDED',updated_at=now() where id=${active.archive_branch_id}`; await sql`delete from chat_threads where id=${active.id}`; const [branch]=await sql`insert into translation_archive_branches(archive_id,kind,status,reply_index) values(${archiveId},'ACTUAL','ACTIVE',${activeReplyIndex}) returning *`; const [thread]=await sql`insert into chat_threads(session_id,boss_id,archive_id,archive_branch_id,expires_at) values(${sessionId},${active.boss_id},${archiveId},${branch!.id},${expiresAt}) returning *`; const seeds=[{role:"assistant",content:archive.input_text,kind:"SIMULATION_SOURCE"},{role:"user",content:archive.result.replies[activeReplyIndex].text,kind:"SIMULATION_REPLY"},{role:"assistant",content,kind:"ACTUAL_RESPONSE"}]; const messages:ChatMessageRecord[]=[]; for(let position=0;position<seeds.length;position+=1){const seed=seeds[position]!;const [message]=await sql`insert into chat_messages(thread_id,role,content,kind) values(${thread!.id},${seed.role},${seed.content},${seed.kind}) returning *`;await sql`insert into translation_archive_messages(branch_id,role,content,kind,position,created_at) values(${branch!.id},${seed.role},${seed.content},${seed.kind},${position},${message!.created_at})`;messages.push(camelChatMessage(message));} activeChat={threadId:thread!.id,archiveId,messages};}
    return {archive:await this.loadArchive(sql,updatedArchive),activeChat,application};
  }); }
  async deleteArchivesForBoss(bossId: string) { await this.sql`delete from translation_archives where source_boss_id=${bossId}`; }
  async setTranslationFeedback(sessionId: string,id:string,feedback:"GOOD"|"BAD") { await this.sql`update translation_requests set feedback=${feedback} where id=${id} and session_id=${sessionId}`; }
  async incrementTranslationSimulation(sessionId:string,id:string) { await this.sql`update translation_requests set simulation_count=simulation_count+1 where id=${id} and session_id=${sessionId} and expires_at>now()`; }
  async listMonologues(sessionId:string,bossId:string,limit:number) { const rows=await this.sql`select content from monologue_history where session_id=${sessionId} and boss_id=${bossId} order by created_at desc limit ${limit}`; return rows.map((r:any)=>r.content); }
  async addMonologue(sessionId:string,bossId:string,content:string) { await this.sql`insert into monologue_history(session_id,boss_id,content) values(${sessionId},${bossId},${content})`; }
  async trackAnalytics(subjectHash:string,i:AnalyticsEventInput) { await this.sql`insert into analytics_events(anonymous_subject_hash,event_type,feature,user_age_band,boss_age_band,rank_gap_bucket,age_gap_bucket,same_job_function_bucket,topic_keywords,persona_confidence_bucket,is_demo,expires_at) values(${subjectHash},${i.eventType},${i.feature},${i.userAgeBand??null},${i.bossAgeBand??null},${i.rankGapBucket??null},${i.ageGapBucket??null},${i.sameJobFunctionBucket??null},${i.topicKeywords??[]},${i.personaConfidenceBucket??null},${i.isDemo??false},now()+interval '31 days')`; }
  async getHrDashboard(): Promise<HrDashboard> {
    const [total] = await this.sql`select count(*)::int value,count(distinct anonymous_subject_hash)::int subjects from analytics_events where expires_at>now() and not is_demo`;
    const rank=await this.sql<{label:string;value:number}[]>`select rank_gap_bucket label,count(*)::int value from analytics_events where expires_at>now() and not is_demo and rank_gap_bucket is not null group by rank_gap_bucket order by label`;
    const age=await this.sql<{label:string;value:number}[]>`select age_gap_bucket label,count(*)::int value from analytics_events where expires_at>now() and not is_demo and age_gap_bucket is not null group by age_gap_bucket order by label`;
    const sameJob=await this.sql<{bucket:string;count:number}[]>`select same_job_function_bucket bucket,count(*)::int count from analytics_events where expires_at>now() and not is_demo and same_job_function_bucket is not null group by same_job_function_bucket order by bucket`;
    const topics=await this.sql<{text:string;value:number}[]>`select keyword text,count(*)::int value from analytics_events cross join unnest(topic_keywords) keyword where expires_at>now() and not is_demo group by keyword order by value desc limit 30`;
    const [feature]=await this.sql`select feature,count(*)::int value from analytics_events where expires_at>now() and not is_demo group by feature order by value desc,feature limit 1`;
    const translationRows = await this.sql<{ session_id:string; input_text: string; boss_id: string; alias: string | null; plain_meaning: string; caution: string | null; gap_score:number|null }[]>`
      select t.session_id, t.input_text, t.boss_id, b.alias, t.result->>'plainMeaning' as plain_meaning, t.result->>'caution' as caution, (t.result->>'surfaceActualGapScore')::numeric as gap_score
      from translation_requests t
      left join bosses b on b.id = t.boss_id
      where t.expires_at > now()`;
    const repeatedRows = await this.sql<{ phrase: string; count: number }[]>`
      select left(input_text,160) phrase, sum(simulation_count)::int count
      from translation_requests
      where expires_at > now() and simulation_count > 0
      group by left(input_text,160)
      having sum(simulation_count) >= 2
      order by count desc
      limit 10`;
    const gap = computeSurfaceActualGap(translationRows.map((r: any) => ({
      inputText: r.input_text,
      plainMeaning: r.plain_meaning,
      caution: r.caution,
      bossId: r.boss_id,
      alias: r.alias,
      surfaceActualGapScore: r.gap_score===null?null:Number(r.gap_score),
    })));
    const sameJobFunctionDistribution = sameJob.map((r: any) => ({ bucket: r.bucket as "SAME" | "DIFF", count: r.count }));
    return {
      dataSource: "ACTUAL",
      includesDemo: false,
      overview: { totalUses: total?.value??0, activeSubjects: total?.subjects??0, topFeature: feature?.feature??"-", summary: total?.value ? "" : "아직 집계된 실제 사용자 데이터가 없습니다." },
      topics: topics.map((r: any) => ({ text: r.text, value: r.value })),
      rankGap: rank.map((r: any) => ({ label: r.label, value: r.value })),
      ageGap: age.map((r: any) => ({ label: r.label, value: r.value })),
      sameJobFunctionDistribution,
      surfaceActualGapRate: translationRows.length ? gap.rate : null,
      topRepeatedPhrases: repeatedRows.map((r: any) => ({ phrase: r.phrase, count: Number(r.count) })),
    };
  }
  async getMockHrDashboard() { return getMockHrDashboard(); }
  async rollupAnalytics(){
    const dimensions=[
      this.sql`select occurred_at::date aggregate_date,'rank_gap' dimension,coalesce(rank_gap_bucket,'UNKNOWN') dimension_value,feature,count(*)::int event_count,count(distinct anonymous_subject_hash)::int distinct_subject_count,is_demo from analytics_events where occurred_at<date_trunc('day',now()) group by 1,3,4,7`,
      this.sql`select occurred_at::date aggregate_date,'age_gap' dimension,coalesce(age_gap_bucket,'UNKNOWN') dimension_value,feature,count(*)::int event_count,count(distinct anonymous_subject_hash)::int distinct_subject_count,is_demo from analytics_events where occurred_at<date_trunc('day',now()) group by 1,3,4,7`,
      this.sql`select occurred_at::date aggregate_date,'hour' dimension,extract(hour from occurred_at)::text dimension_value,feature,count(*)::int event_count,count(distinct anonymous_subject_hash)::int distinct_subject_count,is_demo from analytics_events where occurred_at<date_trunc('day',now()) group by 1,3,4,7`,
    ];
    let count=0;for(const query of dimensions){const rows=await query;for(const r of rows){await this.sql`insert into analytics_daily_aggregates(aggregate_date,dimension,dimension_value,feature,event_count,distinct_subject_count,is_demo) values(${r.aggregate_date},${r.dimension},${r.dimension_value},${r.feature},${r.event_count},${r.distinct_subject_count},${r.is_demo}) on conflict(aggregate_date,dimension,dimension_value,feature,is_demo) do update set event_count=excluded.event_count,distinct_subject_count=excluded.distinct_subject_count`;count++;}}return count;
  }
  async cleanupExpired() {
    const uploads=await this.sql`select storage_path from upload_intents where expires_at<=now() and completed_at is null union select storage_path from global_boss_upload_intents where expires_at<=now() and completed_at is null union select e.storage_path from boss_evidence e join sessions s on s.id=e.session_id where s.expires_at<=now() and e.storage_path is not null`;
    await this.sql`update translation_archive_branches b set status='SUPERSEDED',updated_at=now() from chat_threads t join sessions s on s.id=t.session_id where t.archive_branch_id=b.id and s.expires_at<=now() and b.status='ACTIVE'`;
    const sessions=await this.sql`delete from sessions where expires_at<=now() returning id`;
    await this.sql`delete from upload_intents where expires_at<=now()`; await this.sql`delete from global_boss_upload_intents where expires_at<=now()`; await this.sql`delete from analytics_events where expires_at<=now()`; await this.sql`delete from company_research_cache where expires_at<=now()`; await this.sql`delete from admin_sessions where expires_at<=now()`; await this.sql`delete from admin_login_attempts where updated_at<now()-interval '24 hours'`;
    return {sessions:sessions.length,uploads:uploads.map((r:any)=>r.storage_path)};
  }

  async createAdminSession(tokenHash: string, ipHash: string, expiresAt: string) { const [r] = await this.sql`insert into admin_sessions(token_hash,ip_hash,expires_at) values(${tokenHash},${ipHash},${expiresAt}) returning *`; return camelAdminSession(r); }
  async findAdminSession(tokenHash: string) { const [r] = await this.sql`update admin_sessions set last_seen_at=now() where token_hash=${tokenHash} and expires_at>now() returning *`; return r ? camelAdminSession(r) : null; }
  async deleteAdminSession(tokenHash: string) { await this.sql`delete from admin_sessions where token_hash=${tokenHash}`; }
  async getAdminLoginAttempt(ipHash: string) { const [r] = await this.sql`select * from admin_login_attempts where ip_hash=${ipHash}`; return r ? { ipHash:r.ip_hash,attempts:r.attempts,windowStartedAt:r.window_started_at.toISOString(),lockedUntil:r.locked_until?.toISOString() ?? null } as AdminLoginAttempt : null; }
  async recordAdminLoginFailure(ipHash: string) {
    const existing = await this.getAdminLoginAttempt(ipHash); const now = Date.now(); const reset = !existing || Date.parse(existing.windowStartedAt) < now - 15 * 60_000; const attempts = reset ? 1 : existing.attempts + 1; const windowStartedAt = reset ? new Date(now) : new Date(existing.windowStartedAt); const lockedUntil = attempts >= 5 ? new Date(now + 15 * 60_000) : existing?.lockedUntil ? new Date(existing.lockedUntil) : null;
    const [r] = await this.sql`insert into admin_login_attempts(ip_hash,attempts,window_started_at,locked_until,updated_at) values(${ipHash},${attempts},${windowStartedAt},${lockedUntil},now()) on conflict(ip_hash) do update set attempts=excluded.attempts,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until,updated_at=now() returning *`;
    return { ipHash:r!.ip_hash,attempts:r!.attempts,windowStartedAt:r!.window_started_at.toISOString(),lockedUntil:r!.locked_until?.toISOString() ?? null } as AdminLoginAttempt;
  }
  async clearAdminLoginFailures(ipHash: string) { await this.sql`delete from admin_login_attempts where ip_hash=${ipHash}`; }
  async getAdminDashboard(): Promise<AdminDashboard> {
    // The admin page starts several authenticated requests together. Keep this
    // aggregate on one query at a time so it cannot exhaust the five-connection
    // pool while those requests are also refreshing their admin session.
    const [sessions] = await this.sql`select count(*) filter(where expires_at>now())::int total,count(*) filter(where expires_at>now() and last_seen_at>=now()-interval '15 minutes')::int active_15m,count(*) filter(where expires_at>now() and created_at>=now()-interval '24 hours')::int new_24h,count(*) filter(where expires_at>now() and expires_at<=now()+interval '1 hour')::int expiring_1h from sessions`;
    const [usage] = await this.sql`select (select count(*)::int from bosses where scope='SESSION' and expires_at>now()) personal_bosses,(select count(*)::int from chat_messages where created_at>=now()-interval '24 hours') chat_messages_24h,(select count(*)::int from translation_requests where created_at>=now()-interval '24 hours') translations_24h`;
    const [jobs] = await this.sql`select count(*) filter(where status='PENDING')::int pending,count(*) filter(where status='RUNNING')::int running,count(*) filter(where status='FAILED')::int failed,extract(epoch from (now()-min(created_at) filter(where status='PENDING')))/60 oldest_pending_minutes from ai_jobs`;
    const [uploads] = await this.sql`select (select count(*) from upload_intents where completed_at is null and expires_at<=now())::int+(select count(*) from global_boss_upload_intents where completed_at is null and expires_at<=now())::int expired_incomplete`;
    const featureRows = await this.sql`select feature,count(*)::int value from analytics_events where occurred_at>=now()-interval '24 hours' group by feature order by value desc`;
    const operationRows = await this.sql`select * from admin_operations order by created_at desc limit 10`;
    const failureRows = await this.sql`select error_message from ai_jobs where status='FAILED'`;
    return { generatedAt:new Date().toISOString(),sessions:{total:sessions!.total,active15m:sessions!.active_15m,new24h:sessions!.new_24h,expiring1h:sessions!.expiring_1h},usage:{personalBosses:usage!.personal_bosses,chatMessages24h:usage!.chat_messages_24h,translations24h:usage!.translations_24h},jobs:{pending:jobs!.pending,running:jobs!.running,failed:jobs!.failed,oldestPendingMinutes:jobs!.oldest_pending_minutes === null ? null : Math.floor(Number(jobs!.oldest_pending_minutes)),failureReasons:summarizeJobFailures(failureRows.map((row:any)=>row.error_message))},uploads:{expiredIncomplete:uploads!.expired_incomplete},featureUsage:featureRows.map((row:any)=>({feature:row.feature,value:row.value})),recentOperations:operationRows.map((row:any)=>({id:row.id,type:row.type,status:row.status,detail:row.detail,createdAt:toIsoTimestamp(row.created_at ?? row.createdAt,"admin_operations.created_at")}))};
  }
  async listAdminSessions(page = 1, limit = 20): Promise<AdminSessionPage> {
    const [count] = await this.sql`select count(*)::int total from sessions where expires_at>now()`;
    const rows = await this.sql`select s.id,s.created_at as "createdAt",s.last_seen_at as "lastSeenAt",s.expires_at as "expiresAt",(select count(*)::int from bosses b where b.session_id=s.id) as "bossCount",(select count(*)::int from chat_messages m join chat_threads t on t.id=m.thread_id where t.session_id=s.id) as "chatMessageCount",(select count(*)::int from translation_requests tr where tr.session_id=s.id) as "translationCount" from sessions s where s.expires_at>now() order by s.created_at desc,s.id desc limit ${limit} offset ${(page-1)*limit}`;
    const items: AdminSessionSummary[] = rows.map((row:any)=>({
      id: row.id,
      createdAt: toIsoTimestamp(row.createdAt ?? row.created_at, "sessions.created_at"),
      lastSeenAt: toIsoTimestamp(row.lastSeenAt ?? row.last_seen_at, "sessions.last_seen_at"),
      expiresAt: toIsoTimestamp(row.expiresAt ?? row.expires_at, "sessions.expires_at"),
      bossCount: Number(row.bossCount ?? row.boss_count ?? 0),
      chatMessageCount: Number(row.chatMessageCount ?? row.chat_message_count ?? 0),
      translationCount: Number(row.translationCount ?? row.translation_count ?? 0),
    }));
    const total=Number(count?.total??0);return {items,page,pageSize:limit,total,totalPages:Math.max(1,Math.ceil(total/limit))};
  }
  async listAdminPersonalBosses(page = 1, limit = 20): Promise<AdminPersonalBossPage> {
    const [count] = await this.sql`select count(*)::int total from bosses b join sessions s on s.id=b.session_id where b.scope='SESSION' and b.expires_at>now() and s.expires_at>now()`;
    const rows = await this.sql`
      select b.id,b.alias,b.avatar_key,b.status,b.persona_version,b.pki_score,b.expires_at,p.handle,
        count(m.id)::int chat_message_count,
        greatest(b.updated_at,coalesce(max(m.created_at),b.updated_at)) last_activity_at
      from bosses b
      join sessions s on s.id=b.session_id and s.expires_at>now()
      left join user_profiles p on p.session_id=b.session_id
      left join chat_threads t on t.session_id=b.session_id and t.boss_id=b.id and t.expires_at>now()
      left join chat_messages m on m.thread_id=t.id
      where b.scope='SESSION' and b.expires_at>now()
      group by b.id,p.handle
      order by last_activity_at desc,b.id desc
      limit ${limit} offset ${(page-1)*limit}
    `;
    const items = rows.map((row:any) => ({
      id: row.id,
      ownerHandle: row.handle ?? null,
      alias: row.alias,
      avatarKey: row.avatar_key,
      status: row.status,
      personaVersion: Number(row.persona_version ?? 0),
      pkiScore: row.pki_score === null ? null : Number(row.pki_score),
      chatMessageCount: Number(row.chat_message_count ?? 0),
      lastActivityAt: toIsoTimestamp(row.last_activity_at, "bosses.last_activity_at"),
      expiresAt: toIsoTimestamp(row.expires_at, "bosses.expires_at"),
    }));
    const total = Number(count?.total ?? 0);
    return { items, page, pageSize: limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }
  async getAdminPersonalBossPromptContext(bossId: string): Promise<AdminPersonalBossPromptContext | null> {
    const [row] = await this.sql`select b.* from bosses b join sessions s on s.id=b.session_id where b.id=${bossId} and b.scope='SESSION' and b.expires_at>now() and s.expires_at>now()`;
    if (!row?.session_id) return null;
    const boss = camelBoss(row);
    const profile = await this.getProfile(row.session_id);
    const [thread] = await this.sql`select * from chat_threads where session_id=${row.session_id} and boss_id=${bossId} and expires_at>now() limit 1`;
    if (!thread) return { boss, profile, sessionId: row.session_id, chatMessageCount: 0, thread: null };
    const [count] = await this.sql`select count(*)::int total from chat_messages where thread_id=${thread.id}`;
    const [latestQuestion] = await this.sql`select * from chat_messages where thread_id=${thread.id} and role='user' and kind='CHAT' order by created_at desc,id desc limit 1`;
    if (!latestQuestion) return { boss, profile, sessionId: row.session_id, chatMessageCount: Number(count?.total ?? 0), thread: null };
    const previous = await this.sql`select * from chat_messages where thread_id=${thread.id} and (created_at<${latestQuestion.created_at} or (created_at=${latestQuestion.created_at} and id<${latestQuestion.id})) order by created_at desc,id desc limit 19`;
    return {
      boss,
      profile,
      sessionId: row.session_id,
      chatMessageCount: Number(count?.total ?? 0),
      thread: {
        conversationSummary: thread.conversation_summary,
        previousMessages: previous.reverse().map(camelChatMessage),
        latestQuestion: camelChatMessage(latestQuestion),
      },
    };
  }
  async pruneMeaninglessSessions() {
    const rows = await this.sql`select s.id from sessions s where s.expires_at>now() and s.last_seen_at<now()-interval '24 hours' and not exists (select 1 from user_profiles p where p.session_id=s.id) and not exists (select 1 from bosses b where b.session_id=s.id) and not exists (select 1 from chat_threads t join chat_messages m on m.thread_id=t.id where t.session_id=s.id) and not exists (select 1 from translation_requests tr where tr.session_id=s.id)`;
    if (!rows.length) return { deleted: 0, storagePaths: [] };
    const ids = rows.map((r: any) => r.id);
    const paths = await this.sql`select storage_path from boss_evidence where session_id in ${this.sql(ids)} and storage_path is not null`;
    await this.sql`update translation_archive_branches b set status='SUPERSEDED',updated_at=now() from chat_threads t where t.archive_branch_id=b.id and t.session_id in ${this.sql(ids)} and b.status='ACTIVE'`;
    await this.sql`delete from sessions where id in ${this.sql(ids)}`;
    return { deleted: ids.length, storagePaths: paths.map((r: any) => r.storage_path) };
  }
  async listAdminJobs(status?: string, cursor?: string, limit = 20) {
    const rows = await this.sql`select id,type,status,attempts,max_attempts,error_message,retry_of,created_at as "createdAt",updated_at as "updatedAt" from ai_jobs where (${status ?? null}::text is null or status=${status ?? null}::text) and (${cursor ?? null}::timestamptz is null or created_at<${cursor ?? null}::timestamptz) order by created_at desc limit ${limit + 1}`;
    const hasMore = rows.length > limit; const page = rows.slice(0,limit); const items: AdminJobSummary[] = page.map((row:any)=>({id:row.id,type:row.type,status:row.status,attempts:row.attempts,maxAttempts:row.max_attempts,errorMessage:safeJobFailureReason(row.error_message),retryOf:row.retry_of,createdAt:toIsoTimestamp(row.createdAt ?? row.created_at,"ai_jobs.created_at"),updatedAt:toIsoTimestamp(row.updatedAt ?? row.updated_at,"ai_jobs.updated_at")})); return {items,nextCursor:hasMore ? items.at(-1)?.createdAt ?? null:null};
  }
  async getPersonalBossDefaults(){const [r]=await this.sql`select personal_boss_base_prompt,updated_at from app_ai_settings where id='default'`;if(!r)throw new Error("AI 기본 설정을 찾을 수 없습니다.");return {prompt:r.personal_boss_base_prompt,updatedAt:toIsoTimestamp(r.updated_at,"app_ai_settings.updated_at")};}
  async updatePersonalBossDefaults(prompt:string){const [r]=await this.sql`insert into app_ai_settings(id,personal_boss_base_prompt,updated_at) values('default',${prompt},now()) on conflict(id) do update set personal_boss_base_prompt=excluded.personal_boss_base_prompt,updated_at=now() returning *`;return {prompt:r!.personal_boss_base_prompt,updatedAt:toIsoTimestamp(r!.updated_at,"app_ai_settings.updated_at")};}
  async getGlobalBossDefaults(){const [r]=await this.sql`select global_boss_base_prompt,global_boss_prompt_updated_at from app_ai_settings where id='default'`;if(!r)throw new Error("AI 기본 설정을 찾을 수 없습니다.");return {prompt:r.global_boss_base_prompt,updatedAt:r.global_boss_prompt_updated_at?toIsoTimestamp(r.global_boss_prompt_updated_at,"app_ai_settings.global_boss_prompt_updated_at"):null};}
  async updateGlobalBossDefaults(prompt:string){const [r]=await this.sql`update app_ai_settings set global_boss_base_prompt=${prompt},global_boss_prompt_updated_at=now() where id='default' returning global_boss_base_prompt,global_boss_prompt_updated_at`;if(!r)throw new Error("AI 기본 설정을 찾을 수 없습니다.");return {prompt:r.global_boss_base_prompt,updatedAt:toIsoTimestamp(r.global_boss_prompt_updated_at,"app_ai_settings.global_boss_prompt_updated_at")};}
  async getTranslationExamples(){const [r]=await this.sql`select translation_examples,translation_examples_updated_at from app_ai_settings where id='default'`;if(!r)throw new Error("AI 기본 설정을 찾을 수 없습니다.");return {examples:r.translation_examples as TranslationExamples,updatedAt:r.translation_examples_updated_at?toIsoTimestamp(r.translation_examples_updated_at,"app_ai_settings.translation_examples_updated_at"):null};}
  async updateTranslationExamples(examples:TranslationExamples){const [r]=await this.sql`update app_ai_settings set translation_examples=${examples},translation_examples_updated_at=now() where id='default' returning translation_examples,translation_examples_updated_at`;if(!r)throw new Error("AI 기본 설정을 찾을 수 없습니다.");return {examples:r.translation_examples as TranslationExamples,updatedAt:toIsoTimestamp(r.translation_examples_updated_at,"app_ai_settings.translation_examples_updated_at")};}
  async getAiPromptSettings(){const [r]=await this.sql`select translation_prompt_instruction,translation_reply_styles,onboarding_company_prompt_instruction,onboarding_evidence_prompt_instruction,onboarding_survey_prompt_instruction,onboarding_persona_prompt_instruction,ai_prompt_settings_updated_at from app_ai_settings where id='default'`;if(!r)throw new Error("AI 프롬프트 설정을 찾을 수 없습니다.");return {translation:r.translation_prompt_instruction,translationReplyStyles:r.translation_reply_styles,onboarding:{companyResearch:r.onboarding_company_prompt_instruction,evidenceExtraction:r.onboarding_evidence_prompt_instruction,surveyGeneration:r.onboarding_survey_prompt_instruction,personaGeneration:r.onboarding_persona_prompt_instruction},updatedAt:r.ai_prompt_settings_updated_at?toIsoTimestamp(r.ai_prompt_settings_updated_at,"app_ai_settings.ai_prompt_settings_updated_at"):null} satisfies AdminAiPromptSettings;}
  async updateAiPromptSettings(settings:Omit<AdminAiPromptSettings,"updatedAt">){const [r]=await this.sql`update app_ai_settings set translation_prompt_instruction=${settings.translation},translation_reply_styles=${settings.translationReplyStyles},onboarding_company_prompt_instruction=${settings.onboarding.companyResearch},onboarding_evidence_prompt_instruction=${settings.onboarding.evidenceExtraction},onboarding_survey_prompt_instruction=${settings.onboarding.surveyGeneration},onboarding_persona_prompt_instruction=${settings.onboarding.personaGeneration},ai_prompt_settings_updated_at=now() where id='default' returning translation_prompt_instruction,translation_reply_styles,onboarding_company_prompt_instruction,onboarding_evidence_prompt_instruction,onboarding_survey_prompt_instruction,onboarding_persona_prompt_instruction,ai_prompt_settings_updated_at`;if(!r)throw new Error("AI 프롬프트 설정을 찾을 수 없습니다.");return {translation:r.translation_prompt_instruction,translationReplyStyles:r.translation_reply_styles,onboarding:{companyResearch:r.onboarding_company_prompt_instruction,evidenceExtraction:r.onboarding_evidence_prompt_instruction,surveyGeneration:r.onboarding_survey_prompt_instruction,personaGeneration:r.onboarding_persona_prompt_instruction},updatedAt:toIsoTimestamp(r.ai_prompt_settings_updated_at,"app_ai_settings.ai_prompt_settings_updated_at")};}
  async recordAdminOperation(type: AdminOperation["type"], status: AdminOperation["status"], detail: AdminOperation["detail"]) { const [r] = await this.sql`insert into admin_operations(type,status,detail) values(${type},${status},${this.sql.json(detail)}) returning *`; return {id:r!.id,type:r!.type,status:r!.status,detail:r!.detail,createdAt:toIsoTimestamp(r!.created_at ?? r!.createdAt,"admin_operations.created_at")}; }
}
