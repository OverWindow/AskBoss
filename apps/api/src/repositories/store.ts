import type { AdminDashboard, AdminJobSummary, AdminOperation, AdminSessionSummary } from "@askboss/shared";
import type { AdminLoginAttempt, AdminSessionRecord, AnalyticsEventInput, BossRecord, ChatMessageRecord, ChatThreadRecord, CompanyResearch, EvidenceRecord, JobRecord, SessionRecord, SurveyAnswerRecord, TranslationRecord, UploadIntentRecord, UserProfile } from "../types.js";

export interface CreateBossInput {
  alias: string; avatarKey: string; jobFunction: string; yearsOfServiceBand: string; rank: string; companyName: string;
  ageBand: number; hierarchyScore: number; genderBalanceScore: number; companyResearch?: CompanyResearch | null;
}

export interface Store {
  createSession(tokenHash: string, expiresAt: string): Promise<SessionRecord>;
  findSession(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  getProfile(sessionId: string): Promise<UserProfile | null>;
  isHandleAvailable(handle: string, sessionId?: string): Promise<boolean>;
  upsertProfile(sessionId: string, profile: UserProfile): Promise<UserProfile>;
  listBosses(sessionId: string): Promise<BossRecord[]>;
  getBoss(sessionId: string, bossId: string): Promise<BossRecord | null>;
  createBoss(sessionId: string, input: CreateBossInput, expiresAt: string): Promise<BossRecord>;
  updateBoss(sessionId: string, bossId: string, patch: Partial<CreateBossInput> & Record<string, unknown>): Promise<BossRecord>;
  setBossPersona(sessionId: string, bossId: string, persona: unknown, pki: unknown): Promise<void>;
  setBossStatus(sessionId: string, bossId: string, status: BossRecord["status"], error?: string | null): Promise<void>;
  deleteBoss(sessionId: string, bossId: string): Promise<void>;
  getCompanyResearch(normalizedName: string): Promise<CompanyResearch | null>;
  saveCompanyResearch(normalizedName: string, result: CompanyResearch): Promise<void>;
  createUploadIntent(input: Omit<UploadIntentRecord, "id" | "completedAt">): Promise<UploadIntentRecord>;
  getUploadIntent(sessionId: string, id: string): Promise<UploadIntentRecord | null>;
  completeUploadIntent(sessionId: string, id: string): Promise<void>;
  createEvidence(input: Omit<EvidenceRecord, "id" | "createdAt">): Promise<EvidenceRecord>;
  getEvidence(sessionId: string, id: string): Promise<EvidenceRecord | null>;
  listEvidence(sessionId: string, bossId: string): Promise<EvidenceRecord[]>;
  updateEvidence(sessionId: string, id: string, patch: Partial<EvidenceRecord>): Promise<void>;
  upsertSurveyAnswers(sessionId: string, bossId: string, answers: SurveyAnswerRecord[]): Promise<void>;
  listSurveyAnswers(sessionId: string, bossId: string): Promise<SurveyAnswerRecord[]>;
  createJob(input: Pick<JobRecord, "sessionId" | "bossId" | "type" | "payload">): Promise<JobRecord>;
  getJob(sessionId: string, id: string): Promise<JobRecord | null>;
  claimJob(id: string): Promise<JobRecord | null>;
  listRunnableJobs(limit: number): Promise<JobRecord[]>;
  completeJob(id: string, result: unknown): Promise<void>;
  failJob(id: string, error: string, retry: boolean): Promise<void>;
  retryJob(id: string): Promise<JobRecord | null>;
  getOrCreateThread(sessionId: string, bossId: string, threadId: string | undefined, expiresAt: string): Promise<ChatThreadRecord>;
  addChatMessage(threadId: string, role: ChatMessageRecord["role"], content: string): Promise<ChatMessageRecord>;
  listChatMessages(sessionId: string, bossId: string, cursor?: string, limit?: number): Promise<{ threadId: string | null; messages: ChatMessageRecord[]; nextCursor: string | null }>;
  updateThreadSummary(threadId: string, summary: string): Promise<void>;
  createTranslation(input: Omit<TranslationRecord, "id" | "createdAt" | "feedback">): Promise<TranslationRecord>;
  setTranslationFeedback(sessionId: string, id: string, feedback: "GOOD" | "BAD"): Promise<void>;
  listMonologues(sessionId: string, bossId: string, limit: number): Promise<string[]>;
  addMonologue(sessionId: string, bossId: string, content: string): Promise<void>;
  trackAnalytics(subjectHash: string, input: AnalyticsEventInput): Promise<void>;
  getHrDashboard(): Promise<any>;
  rollupAnalytics(): Promise<number>;
  cleanupExpired(): Promise<{ sessions: number; uploads: string[] }>;
  createAdminSession(tokenHash: string, ipHash: string, expiresAt: string): Promise<AdminSessionRecord>;
  findAdminSession(tokenHash: string): Promise<AdminSessionRecord | null>;
  deleteAdminSession(tokenHash: string): Promise<void>;
  getAdminLoginAttempt(ipHash: string): Promise<AdminLoginAttempt | null>;
  recordAdminLoginFailure(ipHash: string): Promise<AdminLoginAttempt>;
  clearAdminLoginFailures(ipHash: string): Promise<void>;
  getAdminDashboard(): Promise<AdminDashboard>;
  listAdminSessions(cursor?: string, limit?: number): Promise<{ items: AdminSessionSummary[]; nextCursor: string | null }>;
  listAdminJobs(status?: string, cursor?: string, limit?: number): Promise<{ items: AdminJobSummary[]; nextCursor: string | null }>;
  recordAdminOperation(type: AdminOperation["type"], status: AdminOperation["status"], detail: AdminOperation["detail"]): Promise<AdminOperation>;
}
