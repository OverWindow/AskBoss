import type { AdminDashboard, AdminJobSummary, AdminOperation, AdminPersonalBossPage, AdminSessionPage, ChatMessageCoaching, ChatMessageKind, HrDashboard, TranslationArchiveDetail, TranslationArchiveSummary } from "../shared.js";
import type { AdminAiPromptSettings, AdminLoginAttempt, AdminSessionRecord, AnalyticsEventInput, BossRecord, ChatMessageRecord, ChatThreadRecord, CompanyResearch, EvidenceRecord, GlobalBossDefaults, GlobalEvidenceRecord, GlobalUploadIntentRecord, JobRecord, PersonalBossDefaults, SessionRecord, SurveyAnswerRecord, TranslationExamplesSettings, TranslationRecord, UploadIntentRecord, UserProfile } from "../types.js";
import type { ArchiveCursor } from "../utils/archive-cursor.js";
import type { ChatCursor } from "../utils/chat-cursor.js";

export interface CreateBossInput {
  alias: string; avatarKey: string; jobFunction: string; yearsOfServiceBand: string; rank: string; companyName: string;
  ageBand: number; hierarchyScore: number; companyResearch?: CompanyResearch | null;
}

export interface UpdateGlobalBossInput {
  alias?: string;
  avatarKey?: string;
  jobFunction?: string | null;
  yearsOfServiceBand?: string | null;
  rank?: string | null;
  companyName?: string | null;
  ageBand?: number | null;
  hierarchyScore?: number | null;
  companyResearch?: CompanyResearch | null;
}

export interface AdminPersonalBossPromptContext {
  boss: BossRecord;
  profile: UserProfile | null;
  sessionId: string;
  chatMessageCount: number;
  thread: {
    conversationSummary: string | null;
    previousMessages: ChatMessageRecord[];
    latestQuestion: ChatMessageRecord;
  } | null;
}

export interface ChatMessageCoachingContext {
  conversationSummary: string | null;
  previousMessages: ChatMessageRecord[];
  message: ChatMessageRecord;
}

export interface Store {
  createSession(tokenHash: string, expiresAt: string): Promise<SessionRecord>;
  findSession(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  getProfile(sessionId: string): Promise<UserProfile | null>;
  upsertProfile(sessionId: string, profile: UserProfile): Promise<UserProfile>;
  listBosses(sessionId: string): Promise<BossRecord[]>;
  getBoss(sessionId: string, bossId: string): Promise<BossRecord | null>;
  createBoss(sessionId: string, input: CreateBossInput, expiresAt: string): Promise<BossRecord>;
  updateBoss(sessionId: string, bossId: string, patch: Partial<CreateBossInput> & Record<string, unknown>): Promise<BossRecord>;
  setBossPersona(sessionId: string, bossId: string, persona: unknown, pki: unknown): Promise<void>;
  setBossStatus(sessionId: string, bossId: string, status: BossRecord["status"], error?: string | null): Promise<void>;
  deleteBoss(sessionId: string, bossId: string): Promise<void>;
  getGlobalBoss(): Promise<BossRecord>;
  updateGlobalBoss(patch: UpdateGlobalBossInput): Promise<BossRecord>;
  setGlobalBossPersona(persona: unknown, pki: unknown): Promise<void>;
  getCompanyResearch(normalizedName: string): Promise<CompanyResearch | null>;
  saveCompanyResearch(normalizedName: string, result: CompanyResearch): Promise<void>;
  clearCompanyResearchCache(): Promise<void>;
  createUploadIntent(input: Omit<UploadIntentRecord, "id" | "completedAt">): Promise<UploadIntentRecord>;
  getUploadIntent(sessionId: string, id: string): Promise<UploadIntentRecord | null>;
  completeUploadIntent(sessionId: string, id: string): Promise<void>;
  listBossStoragePaths(sessionId: string, bossId: string): Promise<string[]>;
  createGlobalUploadIntent(input: Omit<GlobalUploadIntentRecord, "id" | "completedAt">): Promise<GlobalUploadIntentRecord>;
  getGlobalUploadIntent(id: string): Promise<GlobalUploadIntentRecord | null>;
  completeGlobalUploadIntent(id: string): Promise<void>;
  createEvidence(input: Omit<EvidenceRecord, "id" | "createdAt">): Promise<EvidenceRecord>;
  createImageEvidenceWithLimit(input: Omit<EvidenceRecord, "id" | "createdAt">, limit: number): Promise<EvidenceRecord | null>;
  getEvidence(sessionId: string, id: string): Promise<EvidenceRecord | null>;
  listEvidence(sessionId: string, bossId: string): Promise<EvidenceRecord[]>;
  updateEvidence(sessionId: string, id: string, patch: Partial<EvidenceRecord>): Promise<void>;
  deleteEvidenceWithJobs(sessionId: string, bossId: string, id: string): Promise<{ evidence: EvidenceRecord; jobIds: string[] } | null>;
  createGlobalEvidence(input: Omit<GlobalEvidenceRecord, "id" | "createdAt">): Promise<GlobalEvidenceRecord>;
  createGlobalImageEvidenceWithLimit(input: Omit<GlobalEvidenceRecord, "id" | "createdAt">, limit: number): Promise<GlobalEvidenceRecord | null>;
  getGlobalEvidence(id: string): Promise<GlobalEvidenceRecord | null>;
  listGlobalEvidence(): Promise<GlobalEvidenceRecord[]>;
  updateGlobalEvidence(id: string, patch: Partial<GlobalEvidenceRecord>): Promise<void>;
  deleteGlobalEvidence(id: string): Promise<{ evidence: GlobalEvidenceRecord; jobIds: string[] } | null>;
  upsertSurveyAnswers(sessionId: string, bossId: string, answers: SurveyAnswerRecord[]): Promise<void>;
  listSurveyAnswers(sessionId: string, bossId: string): Promise<SurveyAnswerRecord[]>;
  upsertGlobalSurveyAnswers(answers: SurveyAnswerRecord[]): Promise<void>;
  listGlobalSurveyAnswers(): Promise<SurveyAnswerRecord[]>;
  createJob(input: Pick<JobRecord, "sessionId" | "bossId" | "type" | "payload">): Promise<JobRecord>;
  getJob(sessionId: string, id: string): Promise<JobRecord | null>;
  getJobById(id: string): Promise<JobRecord | null>;
  claimJob(id: string): Promise<JobRecord | null>;
  renewJobLease(id: string): Promise<void>;
  deferJob(id: string): Promise<void>;
  listRunnableJobs(limit: number): Promise<JobRecord[]>;
  completeJob(id: string, result: unknown): Promise<void>;
  failJob(id: string, error: string, retry: boolean): Promise<void>;
  retryJob(id: string): Promise<JobRecord | null>;
  getOrCreateThread(sessionId: string, bossId: string, threadId: string | undefined, expiresAt: string): Promise<ChatThreadRecord>;
  replaceChatWithSimulation(sessionId: string, bossId: string, archiveId: string, replyIndex: number, source: string, reply: string, expiresAt: string): Promise<{ threadId: string; archiveId: string; messages: ChatMessageRecord[]; usesActualResponse: boolean }>;
  resetChat(sessionId: string, bossId: string): Promise<void>;
  addChatMessage(threadId: string, role: ChatMessageRecord["role"], content: string, kind?: ChatMessageKind): Promise<ChatMessageRecord>;
  getChatMessageCoachingContext(sessionId: string, bossId: string, messageId: string): Promise<ChatMessageCoachingContext | null>;
  setChatMessageCoaching(sessionId: string, bossId: string, messageId: string, coaching: ChatMessageCoaching): Promise<ChatMessageRecord | null>;
  listChatMessages(sessionId: string, bossId: string, cursor?: ChatCursor, limit?: number): Promise<{ threadId: string | null; archiveId: string | null; messages: ChatMessageRecord[]; nextCursor: string | null }>;
  updateThreadSummary(threadId: string, summary: string): Promise<void>;
  createTranslation(input: Omit<TranslationRecord, "id" | "createdAt" | "feedback" | "simulationCount">): Promise<TranslationRecord>;
  createTranslationWithArchive(input: Omit<TranslationRecord, "id" | "createdAt" | "feedback" | "simulationCount">, ownerHash: string, boss: BossRecord): Promise<{ translation: TranslationRecord; archive: TranslationArchiveDetail }>;
  getTranslation(sessionId: string, id: string): Promise<TranslationRecord | null>;
  getArchiveByTranslation(sessionId: string, translationId: string): Promise<TranslationArchiveDetail | null>;
  listArchives(ownerHash: string, cursor?: ArchiveCursor, limit?: number): Promise<{ items: TranslationArchiveSummary[]; nextCursor: string | null }>;
  getArchive(ownerHash: string, archiveId: string): Promise<TranslationArchiveDetail | null>;
  deleteArchive(ownerHash: string, archiveId: string): Promise<boolean>;
  setArchiveSelectedReply(ownerHash: string, archiveId: string, replyIndex: number): Promise<TranslationArchiveDetail | null>;
  upsertArchiveActualResponse(ownerHash: string, sessionId: string, archiveId: string, content: string, expiresAt: string): Promise<{ archive: TranslationArchiveDetail; activeChat: { threadId: string; archiveId: string; messages: ChatMessageRecord[] } | null; application: "NEXT_PERSONA_REBUILD" | "SESSION_CALIBRATION" | "ARCHIVE_ONLY" } | null>;
  deleteArchivesForBoss(bossId: string): Promise<void>;
  setTranslationFeedback(sessionId: string, id: string, feedback: "GOOD" | "BAD"): Promise<void>;
  incrementTranslationSimulation(sessionId: string, id: string): Promise<void>;
  listMonologues(sessionId: string, bossId: string, limit: number): Promise<string[]>;
  addMonologue(sessionId: string, bossId: string, content: string): Promise<void>;
  trackAnalytics(subjectHash: string, input: AnalyticsEventInput): Promise<void>;
  getHrDashboard(): Promise<HrDashboard>;
  getMockHrDashboard(): Promise<HrDashboard>;
  rollupAnalytics(): Promise<number>;
  cleanupExpired(): Promise<{ sessions: number; uploads: string[] }>;
  createAdminSession(tokenHash: string, ipHash: string, expiresAt: string): Promise<AdminSessionRecord>;
  findAdminSession(tokenHash: string): Promise<AdminSessionRecord | null>;
  deleteAdminSession(tokenHash: string): Promise<void>;
  getAdminLoginAttempt(ipHash: string): Promise<AdminLoginAttempt | null>;
  recordAdminLoginFailure(ipHash: string): Promise<AdminLoginAttempt>;
  clearAdminLoginFailures(ipHash: string): Promise<void>;
  getAdminDashboard(): Promise<AdminDashboard>;
  listAdminSessions(page?: number, limit?: number): Promise<AdminSessionPage>;
  listAdminPersonalBosses(page?: number, limit?: number): Promise<AdminPersonalBossPage>;
  getAdminPersonalBossPromptContext(bossId: string): Promise<AdminPersonalBossPromptContext | null>;
  pruneMeaninglessSessions(): Promise<{ deleted: number; storagePaths: string[] }>;
  listAdminJobs(status?: string, cursor?: string, limit?: number): Promise<{ items: AdminJobSummary[]; nextCursor: string | null }>;
  getPersonalBossDefaults(): Promise<PersonalBossDefaults>;
  updatePersonalBossDefaults(prompt: string): Promise<PersonalBossDefaults>;
  getGlobalBossDefaults(): Promise<GlobalBossDefaults>;
  updateGlobalBossDefaults(prompt: string): Promise<GlobalBossDefaults>;
  getTranslationExamples(): Promise<TranslationExamplesSettings>;
  updateTranslationExamples(examples: TranslationExamplesSettings["examples"]): Promise<TranslationExamplesSettings>;
  getAiPromptSettings(): Promise<AdminAiPromptSettings>;
  updateAiPromptSettings(settings: Omit<AdminAiPromptSettings, "updatedAt">): Promise<AdminAiPromptSettings>;
  recordAdminOperation(type: AdminOperation["type"], status: AdminOperation["status"], detail: AdminOperation["detail"]): Promise<AdminOperation>;
}
