import postgres, { type Sql } from "postgres";
import type { AdminDashboard, AdminJobSummary, AdminOperation, AdminSessionSummary, Boss, CompanyResearch, UserProfile } from "../shared.js";
import type { AdminLoginAttempt, AdminSessionRecord, AnalyticsEventInput, BossRecord, ChatMessageRecord, ChatThreadRecord, EvidenceRecord, JobRecord, SessionRecord, SurveyAnswerRecord, TranslationRecord, UploadIntentRecord } from "../types.js";
import type { CreateBossInput, Store } from "./store.js";
import { MemoryStore } from "./memory-store.js";
import { safeJobFailureReason, summarizeJobFailures } from "../utils/admin-safety.js";
import { toIsoTimestamp } from "../utils/database.js";

const camelSession = (r: any): SessionRecord => ({ id: r.id, tokenHash: r.token_hash, createdAt: r.created_at.toISOString(), lastSeenAt: r.last_seen_at.toISOString(), expiresAt: r.expires_at.toISOString() });
const camelBoss = (r: any): BossRecord => ({
  id: r.id, scope: r.scope, status: r.status, sessionId: r.session_id, alias: r.alias, avatarKey: r.avatar_key, jobFunction: r.job_function,
  yearsOfServiceBand: r.years_of_service_band, rank: r.rank, companyName: r.company_name, ageBand: r.age_band, hierarchyScore: r.hierarchy_score,
  genderBalanceScore: r.gender_balance_score, companyResearch: r.company_research, persona: r.persona_profile, pki: r.pki_breakdown,
  personaError: r.persona_error, expiresAt: r.expires_at?.toISOString() ?? null,
});
const camelEvidence = (r: any): EvidenceRecord => ({ id: r.id, bossId: r.boss_id, sessionId: r.session_id, type: r.type, status: r.status, rawText: r.raw_text, storagePath: r.storage_path, parsedData: r.parsed_data, observedAt: r.observed_at?.toISOString() ?? null, createdAt: r.created_at.toISOString(), expiresAt: r.expires_at.toISOString(), errorMessage: r.error_message });
const camelJob = (r: any): JobRecord => ({ id: r.id, sessionId: r.session_id, bossId: r.boss_id, type: r.type, status: r.status, payload: r.payload, result: r.result, errorMessage: r.error_message, attempts: r.attempts, maxAttempts: r.max_attempts, leaseUntil: r.lease_until?.toISOString() ?? null, retryOf: r.retry_of ?? null, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() });
const camelAdminSession = (r: any): AdminSessionRecord => ({ id: r.id, tokenHash: r.token_hash, ipHash: r.ip_hash, createdAt: toIsoTimestamp(r.created_at ?? r.createdAt, "admin_sessions.created_at"), lastSeenAt: toIsoTimestamp(r.last_seen_at ?? r.lastSeenAt, "admin_sessions.last_seen_at"), expiresAt: toIsoTimestamp(r.expires_at ?? r.expiresAt, "admin_sessions.expires_at") });

export class PostgresStore implements Store {
  private sql: Sql;
  private demo = new MemoryStore();
  constructor(url: string) {
    this.sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      connection: {
        application_name: "askboss-api",
        statement_timeout: 30_000,
        lock_timeout: 5_000,
      },
    });
  }

  async createSession(tokenHash: string, expiresAt: string) { const [r] = await this.sql`insert into sessions (token_hash, expires_at) values (${tokenHash}, ${expiresAt}) returning *`; return camelSession(r!); }
  async findSession(tokenHash: string) { const [r] = await this.sql`select * from sessions where token_hash=${tokenHash} and expires_at > now()`; return r ? camelSession(r) : null; }
  async touchSession(id: string) { await this.sql`update sessions set last_seen_at=now() where id=${id} and last_seen_at<now()-interval '1 minute'`; }
  async deleteSession(id: string) { await this.sql`delete from sessions where id=${id}`; }
  async getProfile(sessionId: string) { const [r] = await this.sql`select * from user_profiles where session_id=${sessionId}`; return r ? { handle: r.handle, ageBand: r.age_band, yearsOfServiceBand: r.years_of_service_band, rank: r.rank, entryPath: r.entry_path, weaknesses: r.weaknesses } : null; }
  async isHandleAvailable(handle: string, sessionId?: string) { const [r] = sessionId ? await this.sql`select count(*)::int as count from user_profiles where lower(handle)=lower(${handle}) and session_id<>${sessionId}` : await this.sql`select count(*)::int as count from user_profiles where lower(handle)=lower(${handle})`; return r!.count === 0; }
  async upsertProfile(sessionId: string, p: UserProfile) {
    const [r] = await this.sql`insert into user_profiles (session_id,handle,age_band,years_of_service_band,rank,entry_path,weaknesses)
      values (${sessionId},${p.handle},${p.ageBand},${p.yearsOfServiceBand},${p.rank},${p.entryPath},${p.weaknesses})
      on conflict (session_id) do update set handle=excluded.handle,age_band=excluded.age_band,years_of_service_band=excluded.years_of_service_band,rank=excluded.rank,entry_path=excluded.entry_path,weaknesses=excluded.weaknesses,updated_at=now() returning *`;
    return { handle: r!.handle, ageBand: r!.age_band, yearsOfServiceBand: r!.years_of_service_band, rank: r!.rank, entryPath: r!.entry_path, weaknesses: r!.weaknesses };
  }
  async listBosses(sessionId: string) { const rows = await this.sql`select * from bosses where scope='GLOBAL' or (session_id=${sessionId} and expires_at>now()) order by case when scope='GLOBAL' then 0 else 1 end, created_at`; return rows.map(camelBoss); }
  async getBoss(sessionId: string, bossId: string) { const [r] = await this.sql`select * from bosses where id=${bossId} and (scope='GLOBAL' or (session_id=${sessionId} and expires_at>now()))`; return r ? camelBoss(r) : null; }
  async createBoss(sessionId: string, b: CreateBossInput, expiresAt: string) {
    const [r] = await this.sql`insert into bosses (scope,status,session_id,alias,avatar_key,job_function,years_of_service_band,rank,company_name,age_band,hierarchy_score,gender_balance_score,company_research,expires_at)
      values ('SESSION','DRAFT',${sessionId},${b.alias},${b.avatarKey},${b.jobFunction},${b.yearsOfServiceBand},${b.rank},${b.companyName},${b.ageBand},${b.hierarchyScore},${b.genderBalanceScore},${this.sql.json((b.companyResearch ?? null) as any)},${expiresAt}) returning *`;
    return camelBoss(r!);
  }
  async updateBoss(sessionId: string, bossId: string, patch: Partial<CreateBossInput> & Record<string, unknown>) {
    const values: Record<string, unknown> = {};
    const map: Record<string, string> = { alias: "alias", avatarKey: "avatar_key", jobFunction: "job_function", yearsOfServiceBand: "years_of_service_band", rank: "rank", companyName: "company_name", ageBand: "age_band", hierarchyScore: "hierarchy_score", genderBalanceScore: "gender_balance_score", companyResearch: "company_research" };
    for (const [key, column] of Object.entries(map)) if (key in patch) values[column] = key === "companyResearch" ? this.sql.json(patch[key] as any) : patch[key];
    values.updated_at = new Date();
    const [r] = await this.sql`update bosses set ${this.sql(values)} where id=${bossId} and session_id=${sessionId} and scope='SESSION' returning *`;
    if (!r) throw new Error("상사를 찾을 수 없습니다."); return camelBoss(r);
  }
  async setBossPersona(sessionId: string, bossId: string, persona: unknown, pki: any) { await this.sql`update bosses set persona_profile=${this.sql.json(persona as any)},pki_score=${pki.score},pki_breakdown=${this.sql.json(pki)},status='READY',persona_error=null,persona_built_at=now(),persona_version=persona_version+1,updated_at=now() where id=${bossId} and session_id=${sessionId}`; }
  async setBossStatus(sessionId: string, bossId: string, status: Boss["status"], error: string | null = null) { await this.sql`update bosses set status=${status},persona_error=${error},updated_at=now() where id=${bossId} and session_id=${sessionId}`; }
  async deleteBoss(sessionId: string, bossId: string) { await this.sql`delete from bosses where id=${bossId} and session_id=${sessionId} and scope='SESSION'`; }
  async getCompanyResearch(name: string) { const [r] = await this.sql`select result from company_research_cache where normalized_name=${name} and expires_at>now()`; return (r?.result as CompanyResearch) ?? null; }
  async saveCompanyResearch(name: string, result: CompanyResearch) { await this.sql`insert into company_research_cache (normalized_name,company_name,result,expires_at) values (${name},${result.companyName},${this.sql.json(result as any)},now()+interval '7 days') on conflict(normalized_name) do update set result=excluded.result,company_name=excluded.company_name,created_at=now(),expires_at=excluded.expires_at`; }
  async createUploadIntent(i: Omit<UploadIntentRecord, "id" | "completedAt">) { const [r] = await this.sql`insert into upload_intents(session_id,boss_id,storage_path,original_name,content_type,size_bytes,expires_at) values(${i.sessionId},${i.bossId},${i.storagePath},${i.originalName},${i.contentType},${i.sizeBytes},${i.expiresAt}) returning *`; return { id:r!.id,sessionId:r!.session_id,bossId:r!.boss_id,storagePath:r!.storage_path,originalName:r!.original_name,contentType:r!.content_type,sizeBytes:r!.size_bytes,completedAt:null,expiresAt:r!.expires_at.toISOString() }; }
  async getUploadIntent(sessionId: string, id: string) { const [r] = await this.sql`select * from upload_intents where id=${id} and session_id=${sessionId} and expires_at>now()`; return r ? { id:r.id,sessionId:r.session_id,bossId:r.boss_id,storagePath:r.storage_path,originalName:r.original_name,contentType:r.content_type,sizeBytes:r.size_bytes,completedAt:r.completed_at?.toISOString() ?? null,expiresAt:r.expires_at.toISOString() } : null; }
  async completeUploadIntent(sessionId: string, id: string) { await this.sql`update upload_intents set completed_at=now() where id=${id} and session_id=${sessionId}`; }
  async createEvidence(i: Omit<EvidenceRecord, "id" | "createdAt">) { const [r] = await this.sql`insert into boss_evidence(boss_id,session_id,type,status,raw_text,storage_path,parsed_data,observed_at,expires_at) values(${i.bossId},${i.sessionId},${i.type},${i.status},${i.rawText},${i.storagePath},${this.sql.json(i.parsedData)},${i.observedAt},${i.expiresAt}) returning *`; return camelEvidence(r); }
  async getEvidence(sessionId: string, id: string) { const [r] = await this.sql`select * from boss_evidence where id=${id} and session_id=${sessionId}`; return r ? camelEvidence(r) : null; }
  async listEvidence(sessionId: string, bossId: string) { const rows = await this.sql`select * from boss_evidence where session_id=${sessionId} and boss_id=${bossId} order by created_at`; return rows.map(camelEvidence); }
  async updateEvidence(sessionId: string, id: string, patch: Partial<EvidenceRecord>) {
    const values: Record<string, unknown> = {}; const map: Record<string,string> = { status:"status",rawText:"raw_text",storagePath:"storage_path",parsedData:"parsed_data",observedAt:"observed_at",errorMessage:"error_message" };
    for (const [key,column] of Object.entries(map)) if (key in patch) values[column] = key === "parsedData" ? this.sql.json((patch as any)[key]) : (patch as any)[key];
    if (Object.keys(values).length) await this.sql`update boss_evidence set ${this.sql(values)} where id=${id} and session_id=${sessionId}`;
  }
  async upsertSurveyAnswers(sessionId: string, bossId: string, answers: SurveyAnswerRecord[]) { await this.sql.begin(async (sql) => { for (const a of answers) await sql`insert into boss_survey_answers(boss_id,session_id,question_id,question_snapshot,selected_option,free_text) values(${bossId},${sessionId},${a.questionId},${sql.json(a.questionSnapshot as any)},${a.selectedOption},${a.freeText}) on conflict(boss_id,question_id) do update set question_snapshot=excluded.question_snapshot,selected_option=excluded.selected_option,free_text=excluded.free_text,created_at=now()`; }); }
  async listSurveyAnswers(sessionId: string, bossId: string) { const rows = await this.sql`select * from boss_survey_answers where session_id=${sessionId} and boss_id=${bossId} order by created_at`; return rows.map((r:any) => ({ questionId:r.question_id,questionSnapshot:r.question_snapshot,selectedOption:r.selected_option,freeText:r.free_text })); }
  async createJob(i: Pick<JobRecord,"sessionId"|"bossId"|"type"|"payload">) { const [r] = await this.sql`insert into ai_jobs(session_id,boss_id,type,payload) values(${i.sessionId},${i.bossId},${i.type},${this.sql.json(i.payload)}) returning *`; return camelJob(r); }
  async getJob(sessionId: string, id: string) { const [r] = await this.sql`select * from ai_jobs where id=${id} and session_id=${sessionId}`; return r ? camelJob(r) : null; }
  async claimJob(id: string) { const [r] = await this.sql`update ai_jobs set status='RUNNING',attempts=attempts+1,lease_until=now()+interval '2 minutes',updated_at=now() where id=${id} and (status='PENDING' or (status='RUNNING' and lease_until<=now())) returning *`; return r ? camelJob(r) : null; }
  async listRunnableJobs(limit: number) { const rows = await this.sql`select * from ai_jobs where status='PENDING' or (status='RUNNING' and lease_until<=now()) order by created_at limit ${limit}`; return rows.map(camelJob); }
  async completeJob(id: string, result: unknown) { await this.sql`update ai_jobs set status='SUCCEEDED',result=${this.sql.json(result as any)},error_message=null,lease_until=null,completed_at=now(),updated_at=now() where id=${id}`; }
  async failJob(id: string, error: string, retry: boolean) { await this.sql`update ai_jobs set status=case when ${retry} and attempts<max_attempts then 'PENDING' else 'FAILED' end,error_message=${error},lease_until=null,updated_at=now() where id=${id}`; }
  async retryJob(id: string) { const [original] = await this.sql`select * from ai_jobs where id=${id} and status='FAILED'`; if (!original) return null; const [r] = await this.sql`insert into ai_jobs(session_id,boss_id,type,payload,retry_of) values(${original.session_id},${original.boss_id},${original.type},${this.sql.json(original.payload)},${original.id}) returning *`; return camelJob(r); }
  async getOrCreateThread(sessionId: string, bossId: string, threadId: string | undefined, expiresAt: string) {
    let r:any; if (threadId) [r] = await this.sql`select * from chat_threads where id=${threadId} and session_id=${sessionId} and boss_id=${bossId} and expires_at>now()`;
    if (!r) [r] = await this.sql`insert into chat_threads(session_id,boss_id,expires_at) values(${sessionId},${bossId},${expiresAt}) returning *`;
    const messages = await this.sql`select * from chat_messages where thread_id=${r.id} order by created_at desc limit 20`;
    return { id:r.id,sessionId:r.session_id,bossId:r.boss_id,conversationSummary:r.conversation_summary,messages:messages.reverse().map((m:any)=>({id:m.id,role:m.role,content:m.content,createdAt:m.created_at.toISOString()})),createdAt:r.created_at.toISOString(),expiresAt:r.expires_at.toISOString() } as ChatThreadRecord;
  }
  async addChatMessage(threadId: string, role: ChatMessageRecord["role"], content: string) { const [r] = await this.sql`insert into chat_messages(thread_id,role,content) values(${threadId},${role},${content}) returning *`; return { id:r!.id,role:r!.role,content:r!.content,createdAt:r!.created_at.toISOString() }; }
  async listChatMessages(sessionId: string, bossId: string, cursor?: string, limit=50) {
    const [thread] = await this.sql`select * from chat_threads where session_id=${sessionId} and boss_id=${bossId} order by created_at desc limit 1`; if (!thread) return { threadId:null,messages:[],nextCursor:null };
    const rows = cursor ? await this.sql`select * from chat_messages where thread_id=${thread.id} and created_at<${cursor} order by created_at desc limit ${limit+1}` : await this.sql`select * from chat_messages where thread_id=${thread.id} order by created_at desc limit ${limit+1}`;
    const hasMore=rows.length>limit; const messages=rows.slice(0,limit).reverse().map((r:any)=>({id:r.id,role:r.role,content:r.content,createdAt:r.created_at.toISOString()})); return {threadId:thread.id,messages,nextCursor:hasMore ? messages[0]?.createdAt ?? null:null};
  }
  async updateThreadSummary(threadId: string, summary: string) { await this.sql`update chat_threads set conversation_summary=${summary},summarized_through=now() where id=${threadId}`; }
  async createTranslation(i: Omit<TranslationRecord,"id"|"createdAt"|"feedback">) { const [r]=await this.sql`insert into translation_requests(session_id,boss_id,input_text,channel,result,expires_at) values(${i.sessionId},${i.bossId},${i.inputText},${i.channel},${this.sql.json(i.result as any)},${i.expiresAt}) returning *`; return {id:r!.id,sessionId:r!.session_id,bossId:r!.boss_id,inputText:r!.input_text,channel:r!.channel,result:r!.result,feedback:r!.feedback,createdAt:r!.created_at.toISOString(),expiresAt:r!.expires_at.toISOString()}; }
  async setTranslationFeedback(sessionId: string,id:string,feedback:"GOOD"|"BAD") { await this.sql`update translation_requests set feedback=${feedback} where id=${id} and session_id=${sessionId}`; }
  async listMonologues(sessionId:string,bossId:string,limit:number) { const rows=await this.sql`select content from monologue_history where session_id=${sessionId} and boss_id=${bossId} order by created_at desc limit ${limit}`; return rows.map((r:any)=>r.content); }
  async addMonologue(sessionId:string,bossId:string,content:string) { await this.sql`insert into monologue_history(session_id,boss_id,content) values(${sessionId},${bossId},${content})`; }
  async trackAnalytics(subjectHash:string,i:AnalyticsEventInput) { await this.sql`insert into analytics_events(anonymous_subject_hash,event_type,feature,user_age_band,boss_age_band,rank_gap_bucket,age_gap_bucket,topic_keywords,persona_confidence_bucket,is_demo,expires_at) values(${subjectHash},${i.eventType},${i.feature},${i.userAgeBand??null},${i.bossAgeBand??null},${i.rankGapBucket??null},${i.ageGapBucket??null},${i.topicKeywords??[]},${i.personaConfidenceBucket??null},${i.isDemo??false},now()+interval '31 days')`; }
  async getHrDashboard() {
    const [total] = await this.sql`select count(*)::int value,count(distinct anonymous_subject_hash)::int subjects from analytics_events where expires_at>now()`;
    if (!total?.value) return this.demo.getHrDashboard();
    const rank=await this.sql`select rank_gap_bucket label,count(*)::int value from analytics_events where expires_at>now() group by rank_gap_bucket having count(distinct anonymous_subject_hash)>=5 order by label`;
    const age=await this.sql`select age_gap_bucket label,count(*)::int value from analytics_events where expires_at>now() group by age_gap_bucket having count(distinct anonymous_subject_hash)>=5 order by label`;
    const time=await this.sql`select extract(hour from occurred_at)::int label,count(*)::int value from analytics_events where expires_at>now() group by 1 having count(distinct anonymous_subject_hash)>=5 order by 1`;
    const topics=await this.sql`select keyword text,count(*)::int value from analytics_events cross join unnest(topic_keywords) keyword where expires_at>now() group by keyword having count(distinct anonymous_subject_hash)>=5 order by value desc limit 30`;
    return {includesDemo:false,overview:{totalUses:total.value,activeSubjects:total.subjects,topFeature:"TRANSLATE",summary:"최근 31일간 재식별할 수 없는 집계만 표시합니다."},topics,rankGap:rank,ageGap:age,byTime:time.map((r:any)=>({label:`${r.label}시`,value:r.value}))};
  }
  async rollupAnalytics(){
    const dimensions=[
      this.sql`select occurred_at::date aggregate_date,'rank_gap' dimension,coalesce(rank_gap_bucket,'UNKNOWN') dimension_value,feature,count(*)::int event_count,count(distinct anonymous_subject_hash)::int distinct_subject_count,is_demo from analytics_events where occurred_at<date_trunc('day',now()) group by 1,3,4,7 having count(distinct anonymous_subject_hash)>=5`,
      this.sql`select occurred_at::date aggregate_date,'age_gap' dimension,coalesce(age_gap_bucket,'UNKNOWN') dimension_value,feature,count(*)::int event_count,count(distinct anonymous_subject_hash)::int distinct_subject_count,is_demo from analytics_events where occurred_at<date_trunc('day',now()) group by 1,3,4,7 having count(distinct anonymous_subject_hash)>=5`,
      this.sql`select occurred_at::date aggregate_date,'hour' dimension,extract(hour from occurred_at)::text dimension_value,feature,count(*)::int event_count,count(distinct anonymous_subject_hash)::int distinct_subject_count,is_demo from analytics_events where occurred_at<date_trunc('day',now()) group by 1,3,4,7 having count(distinct anonymous_subject_hash)>=5`,
    ];
    let count=0;for(const query of dimensions){const rows=await query;for(const r of rows){await this.sql`insert into analytics_daily_aggregates(aggregate_date,dimension,dimension_value,feature,event_count,distinct_subject_count,is_demo) values(${r.aggregate_date},${r.dimension},${r.dimension_value},${r.feature},${r.event_count},${r.distinct_subject_count},${r.is_demo}) on conflict(aggregate_date,dimension,dimension_value,feature,is_demo) do update set event_count=excluded.event_count,distinct_subject_count=excluded.distinct_subject_count`;count++;}}return count;
  }
  async cleanupExpired() {
    const uploads=await this.sql`select storage_path from upload_intents where expires_at<=now() and completed_at is null union select e.storage_path from boss_evidence e join sessions s on s.id=e.session_id where s.expires_at<=now() and e.storage_path is not null`;
    const sessions=await this.sql`delete from sessions where expires_at<=now() returning id`;
    await this.sql`delete from upload_intents where expires_at<=now()`; await this.sql`delete from analytics_events where expires_at<=now()`; await this.sql`delete from company_research_cache where expires_at<=now()`; await this.sql`delete from admin_sessions where expires_at<=now()`; await this.sql`delete from admin_login_attempts where updated_at<now()-interval '24 hours'`;
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
    const [uploads] = await this.sql`select count(*)::int expired_incomplete from upload_intents where completed_at is null and expires_at<=now()`;
    const featureRows = await this.sql`select feature,count(*)::int value from analytics_events where occurred_at>=now()-interval '24 hours' group by feature order by value desc`;
    const operationRows = await this.sql`select * from admin_operations order by created_at desc limit 10`;
    const failureRows = await this.sql`select error_message from ai_jobs where status='FAILED'`;
    return { generatedAt:new Date().toISOString(),sessions:{total:sessions!.total,active15m:sessions!.active_15m,new24h:sessions!.new_24h,expiring1h:sessions!.expiring_1h},usage:{personalBosses:usage!.personal_bosses,chatMessages24h:usage!.chat_messages_24h,translations24h:usage!.translations_24h},jobs:{pending:jobs!.pending,running:jobs!.running,failed:jobs!.failed,oldestPendingMinutes:jobs!.oldest_pending_minutes === null ? null : Math.floor(Number(jobs!.oldest_pending_minutes)),failureReasons:summarizeJobFailures(failureRows.map((row:any)=>row.error_message))},uploads:{expiredIncomplete:uploads!.expired_incomplete},featureUsage:featureRows.map((row:any)=>({feature:row.feature,value:row.value})),recentOperations:operationRows.map((row:any)=>({id:row.id,type:row.type,status:row.status,detail:row.detail,createdAt:toIsoTimestamp(row.created_at ?? row.createdAt,"admin_operations.created_at")}))};
  }
  async listAdminSessions(cursor?: string, limit = 20) {
    const rows = await this.sql`select s.id,s.created_at as "createdAt",s.last_seen_at as "lastSeenAt",s.expires_at as "expiresAt",(select count(*)::int from bosses b where b.session_id=s.id) as "bossCount",(select count(*)::int from chat_messages m join chat_threads t on t.id=m.thread_id where t.session_id=s.id) as "chatMessageCount",(select count(*)::int from translation_requests tr where tr.session_id=s.id) as "translationCount" from sessions s where s.expires_at>now() and (${cursor ?? null}::timestamptz is null or s.created_at<${cursor ?? null}::timestamptz) order by s.created_at desc limit ${limit + 1}`;
    const hasMore = rows.length > limit;
    const items: AdminSessionSummary[] = rows.slice(0,limit).map((row:any)=>({
      id: row.id,
      createdAt: toIsoTimestamp(row.createdAt ?? row.created_at, "sessions.created_at"),
      lastSeenAt: toIsoTimestamp(row.lastSeenAt ?? row.last_seen_at, "sessions.last_seen_at"),
      expiresAt: toIsoTimestamp(row.expiresAt ?? row.expires_at, "sessions.expires_at"),
      bossCount: Number(row.bossCount ?? row.boss_count ?? 0),
      chatMessageCount: Number(row.chatMessageCount ?? row.chat_message_count ?? 0),
      translationCount: Number(row.translationCount ?? row.translation_count ?? 0),
    }));
    return {items,nextCursor:hasMore ? items.at(-1)?.createdAt ?? null:null};
  }
  async listAdminJobs(status?: string, cursor?: string, limit = 20) {
    const rows = await this.sql`select id,type,status,attempts,max_attempts,error_message,retry_of,created_at as "createdAt",updated_at as "updatedAt" from ai_jobs where (${status ?? null}::text is null or status=${status ?? null}::text) and (${cursor ?? null}::timestamptz is null or created_at<${cursor ?? null}::timestamptz) order by created_at desc limit ${limit + 1}`;
    const hasMore = rows.length > limit; const page = rows.slice(0,limit); const items: AdminJobSummary[] = page.map((row:any)=>({id:row.id,type:row.type,status:row.status,attempts:row.attempts,maxAttempts:row.max_attempts,errorMessage:safeJobFailureReason(row.error_message),retryOf:row.retry_of,createdAt:toIsoTimestamp(row.createdAt ?? row.created_at,"ai_jobs.created_at"),updatedAt:toIsoTimestamp(row.updatedAt ?? row.updated_at,"ai_jobs.updated_at")})); return {items,nextCursor:hasMore ? items.at(-1)?.createdAt ?? null:null};
  }
  async recordAdminOperation(type: AdminOperation["type"], status: AdminOperation["status"], detail: AdminOperation["detail"]) { const [r] = await this.sql`insert into admin_operations(type,status,detail) values(${type},${status},${this.sql.json(detail)}) returning *`; return {id:r!.id,type:r!.type,status:r!.status,detail:r!.detail,createdAt:toIsoTimestamp(r!.created_at ?? r!.createdAt,"admin_operations.created_at")}; }
}
