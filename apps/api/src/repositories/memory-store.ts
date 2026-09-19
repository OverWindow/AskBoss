import { randomUUID } from "node:crypto";
import { DEFAULT_PERSONAL_BOSS_BASE_PROMPT, DEFAULT_TRANSLATION_EXAMPLES, type AdminDashboard, type AdminJobSummary, type AdminOperation, type AdminSessionSummary, type BossPersona, type ChatMessageKind, type GlobalBossDefaults, type HrDashboard, type PersonalBossDefaults, type TranslationArchiveDetail, type TranslationExamplesSettings } from "../shared.js";
import type { AdminLoginAttempt, AdminSessionRecord, AnalyticsEventInput, BossRecord, ChatMessageRecord, ChatThreadRecord, CompanyResearch, EvidenceRecord, GlobalEvidenceRecord, GlobalUploadIntentRecord, JobRecord, SessionRecord, SurveyAnswerRecord, TranslationArchiveRecord, TranslationRecord, UploadIntentRecord, UserProfile } from "../types.js";
import type { CreateBossInput, Store, UpdateGlobalBossInput } from "./store.js";
import { safeJobFailureReason, summarizeJobFailures } from "../utils/admin-safety.js";
import { computeTopRepeatedPhrases } from "../utils/hr-aggregation.js";
import { buildActualResponseEvidence } from "../utils/actual-response.js";
import { encodeArchiveCursor, type ArchiveCursor } from "../utils/archive-cursor.js";

const globalPersona: BossPersona = {
  summary: "한국 회사에서 흔히 볼 수 있는 중간관리자형의 가상 공통 페르소나입니다.",
  communication: { tone: "약간 무뚝뚝하지만 악의적이지 않음", messageLength: "짧음", directness: 68, formality: 62 },
  reporting: { preferredLength: "결론부터 간결하게", preferredStructure: ["결론", "현재 상태", "다음 행동"], frequentChecks: ["일정", "진행률"] },
  decisionMaking: { speed: "보통", riskTolerance: "낮음", autonomyPreference: "중간" },
  management: { hierarchyPreference: "중간", feedbackStyle: "실무 중심", deadlineSensitivity: "높음" },
  recurringPatterns: ["결론을 먼저 확인함", "진행 상황을 중간에 점검함"], recurringPhrases: ["그래서 결론이 뭐지?", "이거 언제 되나?"],
  humorStyle: "가끔 아재개그", uncertainty: ["특정 실제 인물을 모델링하지 않은 기본값"], traits: [],
};

const globalBoss: BossRecord = {
  id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", status: "READY", sessionId: null, alias: "모두의 상사", avatarKey: "boss-male-01",
  jobFunction: null, yearsOfServiceBand: null, rank: "팀장", companyName: null, ageBand: 40, hierarchyScore: 55,
  companyResearch: null, persona: globalPersona, pki: null, personaError: null, expiresAt: null,
  personaVersion: 1,
};

function publicArchive(row: TranslationArchiveRecord): TranslationArchiveDetail {
  return structuredClone({
    id: row.id,
    boss: row.boss,
    inputText: row.inputText,
    channel: row.channel,
    result: row.result,
    lastCopiedReplyIndex: row.lastCopiedReplyIndex,
    actualResponse: row.actualResponse,
    branchCount: row.branches.length,
    branches: row.branches,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class MemoryStore implements Store {
  sessions = new Map<string, SessionRecord>();
  profiles = new Map<string, UserProfile>();
  bosses = new Map<string, BossRecord>([[globalBoss.id, globalBoss]]);
  company = new Map<string, { result: CompanyResearch; expiresAt: number }>();
  uploads = new Map<string, UploadIntentRecord>();
  evidence = new Map<string, EvidenceRecord>();
  globalEvidence = new Map<string, GlobalEvidenceRecord>();
  globalUploads = new Map<string, GlobalUploadIntentRecord>();
  globalSurveys = new Map<string, SurveyAnswerRecord>();
  surveys = new Map<string, SurveyAnswerRecord[]>();
  jobs = new Map<string, JobRecord>();
  threads = new Map<string, ChatThreadRecord>();
  translations = new Map<string, TranslationRecord>();
  archives = new Map<string, TranslationArchiveRecord>();
  monologues = new Map<string, string[]>();
  analytics: Array<AnalyticsEventInput & { subjectHash: string; occurredAt: string }> = [];
  adminSessions = new Map<string, AdminSessionRecord>();
  adminAttempts = new Map<string, AdminLoginAttempt>();
  adminOperations: AdminOperation[] = [];
  personalBossDefaults: PersonalBossDefaults = { prompt: DEFAULT_PERSONAL_BOSS_BASE_PROMPT, updatedAt: new Date().toISOString() };
  globalBossDefaults: GlobalBossDefaults = { prompt: "", updatedAt: null };
  translationExamples: TranslationExamplesSettings = { examples: [...DEFAULT_TRANSLATION_EXAMPLES], updatedAt: null };

  async createSession(tokenHash: string, expiresAt: string) { const now = new Date().toISOString(); const row = { id: randomUUID(), tokenHash, createdAt: now, lastSeenAt: now, expiresAt }; this.sessions.set(tokenHash, row); return row; }
  async findSession(tokenHash: string) { const row = this.sessions.get(tokenHash); return row && Date.parse(row.expiresAt) > Date.now() ? row : null; }
  async touchSession(id: string) { for (const row of this.sessions.values()) if (row.id === id) row.lastSeenAt = new Date().toISOString(); }
  async deleteSession(id: string) {
    for (const [key, row] of this.sessions) if (row.id === id) this.sessions.delete(key);
    this.profiles.delete(id);
    const bossIds=[...this.bosses.values()].filter((row)=>row.sessionId===id).map((row)=>row.id);
    for (const bossId of bossIds) { this.bosses.delete(bossId); this.surveys.delete(bossId); }
    for (const [key, row] of this.evidence) if (row.sessionId === id) this.evidence.delete(key);
    for (const [key, row] of this.threads) if (row.sessionId === id) {
      const archive = row.archiveId ? this.archives.get(row.archiveId) : null;
      const branch = archive?.branches.find((item) => item.id === row.archiveBranchId);
      if (branch?.status === "ACTIVE") { branch.status = "SUPERSEDED"; branch.updatedAt = new Date().toISOString(); }
      this.threads.delete(key);
    }
    for (const archive of this.archives.values()) if (archive.sourceSessionId === id) { archive.sourceSessionId = null; archive.translationId = null; }
    for (const [key,row] of this.translations) if (row.sessionId===id) this.translations.delete(key);
    for (const [key,row] of this.uploads) if (row.sessionId===id) this.uploads.delete(key);
    for (const [key,row] of this.jobs) if (row.sessionId===id) this.jobs.delete(key);
    for (const bossId of bossIds) this.monologues.delete(`${id}:${bossId}`);
  }
  async getProfile(sessionId: string) { return this.profiles.get(sessionId) ?? null; }
  async isHandleAvailable(handle: string, sessionId?: string) { return ![...this.profiles].some(([id, profile]) => id !== sessionId && profile.handle.toLocaleLowerCase("ko") === handle.toLocaleLowerCase("ko")); }
  async upsertProfile(sessionId: string, profile: UserProfile) { this.profiles.set(sessionId, structuredClone(profile)); return profile; }
  async listBosses(sessionId: string) { return [...this.bosses.values()].filter((row) => row.scope === "GLOBAL" || row.sessionId === sessionId).sort((a, b) => a.scope === "GLOBAL" ? -1 : b.scope === "GLOBAL" ? 1 : a.alias.localeCompare(b.alias, "ko")); }
  async getBoss(sessionId: string, bossId: string) { const row = this.bosses.get(bossId); return row && (row.scope === "GLOBAL" || row.sessionId === sessionId) ? row : null; }
  async createBoss(sessionId: string, input: CreateBossInput, expiresAt: string) {
    const row: BossRecord = { id: randomUUID(), scope: "SESSION", status: "DRAFT", sessionId, ...input, companyResearch: input.companyResearch ?? null, persona: null, pki: null, personaError: null, personaVersion: 0, expiresAt };
    this.bosses.set(row.id, row); return row;
  }
  async updateBoss(sessionId: string, bossId: string, patch: Partial<CreateBossInput> & Record<string, unknown>) { const row = await this.getBoss(sessionId, bossId); if (!row || row.scope === "GLOBAL") throw new Error("상사를 찾을 수 없습니다."); Object.assign(row, patch); return row; }
  async setBossPersona(sessionId: string, bossId: string, persona: any, pki: any) { const row = await this.getBoss(sessionId, bossId); if (!row || row.scope === "GLOBAL") throw new Error("상사를 찾을 수 없습니다."); Object.assign(row, { persona, pki, status: "READY", personaError: null }); }
  async setBossStatus(sessionId: string, bossId: string, status: BossRecord["status"], error: string | null = null) { const row = await this.getBoss(sessionId, bossId); if (!row || row.scope === "GLOBAL") throw new Error("상사를 찾을 수 없습니다."); row.status = status; row.personaError = error; }
  async deleteBoss(sessionId: string, bossId: string) {
    const row = await this.getBoss(sessionId, bossId);
    if (!row || row.scope === "GLOBAL") throw new Error("상사를 찾을 수 없습니다.");
    this.bosses.delete(bossId);
    for (const [key, upload] of this.uploads) if (upload.sessionId === sessionId && upload.bossId === bossId) this.uploads.delete(key);
    for (const [key, evidence] of this.evidence) if (evidence.sessionId === sessionId && evidence.bossId === bossId) this.evidence.delete(key);
    this.surveys.delete(bossId);
    for (const [key, job] of this.jobs) if (job.sessionId === sessionId && job.bossId === bossId) this.jobs.delete(key);
    for (const [key, thread] of this.threads) if (thread.sessionId === sessionId && thread.bossId === bossId) this.threads.delete(key);
    for (const [key, translation] of this.translations) if (translation.sessionId === sessionId && translation.bossId === bossId) this.translations.delete(key);
    await this.deleteArchivesForBoss(bossId);
    this.monologues.delete(`${sessionId}:${bossId}`);
  }
  async getGlobalBoss() { return this.bosses.get(globalBoss.id)!; }
  async updateGlobalBoss(patch: UpdateGlobalBossInput) { const row = await this.getGlobalBoss(); Object.assign(row, patch); return row; }
  async setGlobalBossPersona(persona: unknown, pki: unknown) { const row = await this.getGlobalBoss(); Object.assign(row, { persona, pki, status: "READY", personaError: null, personaVersion: (row.personaVersion ?? 0) + 1 }); }
  async getCompanyResearch(name: string) { const hit = this.company.get(name); return hit && hit.expiresAt > Date.now() ? hit.result : null; }
  async saveCompanyResearch(name: string, result: CompanyResearch) { this.company.set(name, { result, expiresAt: Date.now() + 7 * 86_400_000 }); }
  async createUploadIntent(input: Omit<UploadIntentRecord, "id" | "completedAt">) { const row = { ...input, id: randomUUID(), completedAt: null }; this.uploads.set(row.id, row); return row; }
  async getUploadIntent(sessionId: string, id: string) { const row = this.uploads.get(id); return row?.sessionId === sessionId && Date.parse(row.expiresAt) > Date.now() ? row : null; }
  async completeUploadIntent(sessionId: string, id: string) { const row = await this.getUploadIntent(sessionId, id); if (!row) throw new Error("업로드 정보를 찾을 수 없습니다."); row.completedAt = new Date().toISOString(); }
  async listBossStoragePaths(sessionId: string, bossId: string) {
    return [...new Set([
      ...[...this.uploads.values()].filter((row) => row.sessionId === sessionId && row.bossId === bossId).map((row) => row.storagePath),
      ...[...this.evidence.values()].filter((row) => row.sessionId === sessionId && row.bossId === bossId && row.storagePath).map((row) => row.storagePath!),
    ])];
  }
  async createGlobalUploadIntent(input: Omit<GlobalUploadIntentRecord, "id" | "completedAt">) { const row = { ...input, id: randomUUID(), completedAt: null }; this.globalUploads.set(row.id, row); return row; }
  async getGlobalUploadIntent(id: string) { const row = this.globalUploads.get(id); return row && Date.parse(row.expiresAt) > Date.now() ? row : null; }
  async completeGlobalUploadIntent(id: string) { const row = await this.getGlobalUploadIntent(id); if (!row) throw new Error("업로드 정보를 찾을 수 없습니다."); row.completedAt = new Date().toISOString(); }
  async createEvidence(input: Omit<EvidenceRecord, "id" | "createdAt">) { const now = new Date().toISOString(); const row = { ...input, id: randomUUID(), createdAt: now, updatedAt: input.updatedAt ?? now, sourceArchiveId: input.sourceArchiveId ?? null }; this.evidence.set(row.id, row); return row; }
  async getEvidence(sessionId: string, id: string) { const row = this.evidence.get(id); return row?.sessionId === sessionId ? row : null; }
  async listEvidence(sessionId: string, bossId: string) { return [...this.evidence.values()].filter((row) => row.sessionId === sessionId && row.bossId === bossId); }
  async updateEvidence(sessionId: string, id: string, patch: Partial<EvidenceRecord>) { const row = await this.getEvidence(sessionId, id); if (!row) throw new Error("근거를 찾을 수 없습니다."); Object.assign(row, patch); }
  async createGlobalEvidence(input: Omit<GlobalEvidenceRecord, "id" | "createdAt">) { const row = { ...input, id: randomUUID(), createdAt: new Date().toISOString() }; this.globalEvidence.set(row.id, row); return row; }
  async getGlobalEvidence(id: string) { return this.globalEvidence.get(id) ?? null; }
  async listGlobalEvidence() { return [...this.globalEvidence.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async updateGlobalEvidence(id: string, patch: Partial<GlobalEvidenceRecord>) { const row = await this.getGlobalEvidence(id); if (!row) throw new Error("근거를 찾을 수 없습니다."); Object.assign(row, patch); }
  async deleteGlobalEvidence(id: string) { this.globalEvidence.delete(id); }
  async upsertSurveyAnswers(sessionId: string, bossId: string, answers: SurveyAnswerRecord[]) { const boss = await this.getBoss(sessionId, bossId); if (!boss || boss.scope === "GLOBAL") throw new Error("상사를 찾을 수 없습니다."); this.surveys.set(bossId, structuredClone(answers)); }
  async listSurveyAnswers(sessionId: string, bossId: string) { const boss = await this.getBoss(sessionId, bossId); return boss ? this.surveys.get(bossId) ?? [] : []; }
  async upsertGlobalSurveyAnswers(answers: SurveyAnswerRecord[]) { for (const answer of answers) this.globalSurveys.set(answer.questionId, structuredClone(answer)); }
  async listGlobalSurveyAnswers() { return [...this.globalSurveys.values()]; }
  async createJob(input: Pick<JobRecord, "sessionId" | "bossId" | "type" | "payload">) { const now = new Date().toISOString(); const row: JobRecord = { ...input, id: randomUUID(), status: "PENDING", result: null, errorMessage: null, attempts: 0, maxAttempts: 3, leaseUntil: null, retryOf: null, createdAt: now, updatedAt: now }; this.jobs.set(row.id, row); return row; }
  async getJob(sessionId: string, id: string) { const row = this.jobs.get(id); return row?.sessionId === sessionId ? row : null; }
  async getJobById(id: string) { return this.jobs.get(id) ?? null; }
  async claimJob(id: string) { const row = this.jobs.get(id); if (!row || !(["PENDING", "RUNNING"].includes(row.status)) || (row.status === "RUNNING" && row.leaseUntil && Date.parse(row.leaseUntil) > Date.now())) return null; row.status = "RUNNING"; row.attempts += 1; row.leaseUntil = new Date(Date.now() + 2 * 60_000).toISOString(); row.updatedAt = new Date().toISOString(); return row; }
  async listRunnableJobs(limit: number) { return [...this.jobs.values()].filter((row) => row.status === "PENDING" || (row.status === "RUNNING" && row.leaseUntil && Date.parse(row.leaseUntil) <= Date.now())).slice(0, limit); }
  async completeJob(id: string, result: unknown) { const row = this.jobs.get(id); if (row) Object.assign(row, { status: "SUCCEEDED", result, errorMessage: null, leaseUntil: null, updatedAt: new Date().toISOString() }); }
  async failJob(id: string, error: string, retry: boolean) { const row = this.jobs.get(id); if (row) Object.assign(row, { status: retry && row.attempts < row.maxAttempts ? "PENDING" : "FAILED", errorMessage: error, leaseUntil: null, updatedAt: new Date().toISOString() }); }
  async retryJob(id: string) { const original = this.jobs.get(id); if (!original || original.status !== "FAILED") return null; const job = await this.createJob({ sessionId: original.sessionId, bossId: original.bossId, type: original.type, payload: structuredClone(original.payload) }); job.retryOf = original.id; return job; }
  async getOrCreateThread(sessionId: string, bossId: string, threadId: string | undefined, expiresAt: string) { if (threadId) { const hit = this.threads.get(threadId); if (hit?.sessionId === sessionId && hit.bossId === bossId) return hit; } const active = [...this.threads.values()].find((row) => row.sessionId === sessionId && row.bossId === bossId); if (active) return active; const row: ChatThreadRecord = { id: randomUUID(), sessionId, bossId, conversationSummary: null, messages: [], archiveId: null, archiveBranchId: null, createdAt: new Date().toISOString(), expiresAt }; this.threads.set(row.id, row); return row; }
  async replaceChatWithSimulation(sessionId: string, bossId: string, archiveId: string, replyIndex: number, source: string, reply: string, expiresAt: string) { const archive = this.archives.get(archiveId); if (!archive || archive.sourceSessionId !== sessionId) throw new Error("아카이브를 찾을 수 없습니다."); await this.resetChat(sessionId, bossId); archive.updatedAt = new Date().toISOString(); const usesActualResponse = archive.actualResponse?.replyIndex === replyIndex; const now = new Date().toISOString(); const branch = { id: randomUUID(), kind: usesActualResponse ? "ACTUAL" as const : "PREDICTED" as const, status: "ACTIVE" as const, replyIndex, messages: [] as ChatMessageRecord[], createdAt: now, updatedAt: now }; archive.branches.unshift(branch); const thread: ChatThreadRecord = { id: randomUUID(), sessionId, bossId, conversationSummary: null, messages: [], archiveId, archiveBranchId: branch.id, createdAt: now, expiresAt }; this.threads.set(thread.id, thread); const sourceMessage = await this.addChatMessage(thread.id, "assistant", source, "SIMULATION_SOURCE"); const replyMessage = await this.addChatMessage(thread.id, "user", reply, "SIMULATION_REPLY"); const messages = [sourceMessage, replyMessage]; if (usesActualResponse) messages.push(await this.addChatMessage(thread.id, "assistant", archive.actualResponse!.content, "ACTUAL_RESPONSE")); return { threadId: thread.id, archiveId, messages, usesActualResponse }; }
  async resetChat(sessionId: string, bossId: string) { for (const [id, thread] of this.threads) if (thread.sessionId === sessionId && thread.bossId === bossId) { const archive = thread.archiveId ? this.archives.get(thread.archiveId) : null; const branch = archive?.branches.find((item) => item.id === thread.archiveBranchId); if (branch && branch.status === "ACTIVE") { branch.status = "SUPERSEDED"; branch.updatedAt = new Date().toISOString(); } this.threads.delete(id); } }
  async addChatMessage(threadId: string, role: ChatMessageRecord["role"], content: string, kind: ChatMessageKind = "CHAT") { const row: ChatMessageRecord = { id: randomUUID(), role, content, kind, createdAt: new Date().toISOString() }; const thread = this.threads.get(threadId); if (!thread) throw new Error("대화를 찾을 수 없습니다."); thread.messages.push(row); const archive = thread.archiveId ? this.archives.get(thread.archiveId) : null; const branch = archive?.branches.find((item) => item.id === thread.archiveBranchId); if (branch) { branch.messages.push(structuredClone(row)); branch.updatedAt = row.createdAt; archive!.updatedAt = row.createdAt; } return row; }
  async listChatMessages(sessionId: string, bossId: string, cursor?: string, limit = 50) { const thread = [...this.threads.values()].find((row) => row.sessionId === sessionId && row.bossId === bossId); if (!thread) return { threadId: null, archiveId: null, messages: [], nextCursor: null }; const filtered = cursor ? thread.messages.filter((message) => message.createdAt < cursor) : thread.messages; const messages = filtered.slice(-limit); return { threadId: thread.id, archiveId: thread.archiveId ?? null, messages, nextCursor: filtered.length > limit ? messages[0]?.createdAt ?? null : null }; }
  async updateThreadSummary(threadId: string, summary: string) { const row = this.threads.get(threadId); if (row) row.conversationSummary = summary; }
  async createTranslation(input: Omit<TranslationRecord, "id" | "createdAt" | "feedback" | "simulationCount">) { const row: TranslationRecord = { ...input, id: randomUUID(), feedback: null, simulationCount: 0, createdAt: new Date().toISOString() }; this.translations.set(row.id, row); return row; }
  async createTranslationWithArchive(input: Omit<TranslationRecord, "id" | "createdAt" | "feedback" | "simulationCount">, ownerHash: string, boss: BossRecord) { const translation = await this.createTranslation(input); const now = translation.createdAt; const archive: TranslationArchiveRecord = { id: randomUUID(), ownerHash, translationId: translation.id, sourceSessionId: input.sessionId, boss: { id: boss.id, alias: boss.alias, avatarKey: boss.avatarKey, scope: boss.scope }, inputText: input.inputText, channel: input.channel, result: structuredClone(input.result), lastCopiedReplyIndex: null, actualResponse: null, branchCount: 0, branches: [], createdAt: now, updatedAt: now }; this.archives.set(archive.id, archive); return { translation, archive: publicArchive(archive) }; }
  async getTranslation(sessionId: string, id: string) { const row = this.translations.get(id); return row?.sessionId === sessionId && Date.parse(row.expiresAt) > Date.now() ? row : null; }
  async getArchiveByTranslation(sessionId: string, translationId: string) { const row = [...this.archives.values()].find((item) => item.translationId === translationId && item.sourceSessionId === sessionId); return row ? publicArchive(row) : null; }
  async listArchives(ownerHash: string, cursor?: ArchiveCursor, limit = 20) { const cursorRow = cursor ? this.archives.get(cursor.id) : undefined; const rows = [...this.archives.values()].filter((item) => item.ownerHash === ownerHash && (!cursor || (cursorRow?.ownerHash === ownerHash && (item.createdAt < cursorRow.createdAt || (item.createdAt === cursorRow.createdAt && item.id < cursorRow.id))))).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)); const page = rows.slice(0, limit); return { items: page.map(({ branches, ownerHash: _ownerHash, translationId: _translationId, sourceSessionId: _sourceSessionId, result: _result, ...item }) => ({ ...structuredClone(item), branchCount: branches.length })), nextCursor: rows.length > limit && page.length ? encodeArchiveCursor({ id: page.at(-1)!.id }) : null }; }
  async getArchive(ownerHash: string, archiveId: string) { const row = this.archives.get(archiveId); return row?.ownerHash === ownerHash ? publicArchive(row) : null; }
  async setArchiveSelectedReply(ownerHash: string, archiveId: string, replyIndex: number) { const row = this.archives.get(archiveId); if (!row || row.ownerHash !== ownerHash || !row.result.replies[replyIndex]) return null; row.lastCopiedReplyIndex = replyIndex; row.updatedAt = new Date().toISOString(); return publicArchive(row); }
  async upsertArchiveActualResponse(ownerHash: string, sessionId: string, archiveId: string, content: string, expiresAt: string) { const archive = this.archives.get(archiveId); if (!archive || archive.ownerHash !== ownerHash) return null; const now = new Date().toISOString(); const replyIndex = archive.actualResponse?.replyIndex ?? archive.lastCopiedReplyIndex; const replyText = archive.actualResponse?.replyText ?? (replyIndex === null ? null : archive.result.replies[replyIndex]?.text ?? null); archive.actualResponse = { content, replyIndex, replyText, updatedAt: now }; archive.updatedAt = now; const boss = await this.getBoss(sessionId, archive.boss.id); let application: "NEXT_PERSONA_REBUILD" | "SESSION_CALIBRATION" | "ARCHIVE_ONLY" = "ARCHIVE_ONLY"; if (boss) { application = boss.scope === "GLOBAL" ? "SESSION_CALIBRATION" : "NEXT_PERSONA_REBUILD"; const existing = [...this.evidence.values()].find((item) => item.sessionId === sessionId && item.sourceArchiveId === archiveId && item.type === "FEEDBACK"); const observedAt = existing?.observedAt ?? now; const built = buildActualResponseEvidence(archive.inputText, replyText, content, observedAt); if (existing) Object.assign(existing, built, { updatedAt: now, status: "READY" }); else await this.createEvidence({ bossId: boss.id, sessionId, type: "FEEDBACK", status: "READY", rawText: built.rawText, storagePath: null, parsedData: built.parsedData, observedAt, expiresAt, errorMessage: null, sourceArchiveId: archiveId }); }
    const active = [...this.threads.values()].find((thread) => thread.sessionId === sessionId && thread.archiveId === archiveId); let activeChat: { threadId: string; archiveId: string; messages: ChatMessageRecord[] } | null = null; if (active) { const oldBranch = archive.branches.find((item) => item.id === active.archiveBranchId); const activeReplyIndex = replyIndex ?? oldBranch?.replyIndex ?? 0; await this.resetChat(sessionId, active.bossId); const branch = { id: randomUUID(), kind: "ACTUAL" as const, status: "ACTIVE" as const, replyIndex: activeReplyIndex, messages: [] as ChatMessageRecord[], createdAt: now, updatedAt: now }; archive.branches.unshift(branch); const thread: ChatThreadRecord = { id: randomUUID(), sessionId, bossId: active.bossId, conversationSummary: null, messages: [], archiveId, archiveBranchId: branch.id, createdAt: now, expiresAt }; this.threads.set(thread.id, thread); await this.addChatMessage(thread.id, "assistant", archive.inputText, "SIMULATION_SOURCE"); await this.addChatMessage(thread.id, "user", archive.result.replies[activeReplyIndex]!.text, "SIMULATION_REPLY"); await this.addChatMessage(thread.id, "assistant", content, "ACTUAL_RESPONSE"); activeChat = { threadId: thread.id, archiveId, messages: structuredClone(thread.messages) }; }
    archive.branchCount = archive.branches.length; return { archive: publicArchive(archive), activeChat, application }; }
  async deleteArchivesForBoss(bossId: string) { for (const [id, archive] of this.archives) if (archive.boss.id === bossId) this.archives.delete(id); }
  async setTranslationFeedback(sessionId: string, id: string, feedback: "GOOD" | "BAD") { const row = this.translations.get(id); if (!row || row.sessionId !== sessionId) throw new Error("번역 결과를 찾을 수 없습니다."); row.feedback = feedback; }
  async incrementTranslationSimulation(sessionId: string, id: string) { const row = await this.getTranslation(sessionId,id); if (!row) throw new Error("번역 결과를 찾을 수 없습니다."); row.simulationCount += 1; }
  async listMonologues(sessionId: string, bossId: string, limit: number) { return (this.monologues.get(`${sessionId}:${bossId}`) ?? []).slice(-limit); }
  async addMonologue(sessionId: string, bossId: string, content: string) { const key = `${sessionId}:${bossId}`; const values = this.monologues.get(key) ?? []; values.push(content); this.monologues.set(key, values.slice(-10)); }
  async trackAnalytics(subjectHash: string, input: AnalyticsEventInput) { this.analytics.push({ ...input, subjectHash, occurredAt: new Date().toISOString() }); }
  async getHrDashboard(): Promise<HrDashboard> {
    const sameJobCounts = new Map<string, number>();
    for (const row of this.analytics) {
      const bucket = row.sameJobFunctionBucket;
      if (bucket === "SAME" || bucket === "DIFF") {
        sameJobCounts.set(bucket, (sameJobCounts.get(bucket) ?? 0) + 1);
      }
    }
    const sameJobFunctionDistribution = ([
      { bucket: "SAME" as const, count: sameJobCounts.get("SAME") ?? 0 },
      { bucket: "DIFF" as const, count: sameJobCounts.get("DIFF") ?? 0 },
    ] as { bucket: "SAME" | "DIFF"; count: number }[]).filter((item) => item.count > 0);
    const topRepeatedPhrases=computeTopRepeatedPhrases([...this.translations.values()].flatMap((row)=>Array.from({length:row.simulationCount},()=>({inputText:row.inputText}))));
    if (this.analytics.length) {
      const group = (key:"rankGapBucket"|"ageGapBucket") => [...this.analytics.reduce((map,row) => { const label=row[key]; if(label)map.set(label,(map.get(label)??0)+1); return map; },new Map<string,number>())].map(([label,value])=>({label,value}));
      const topicCounts=this.analytics.reduce((map,row)=>{for(const topic of row.topicKeywords??[])map.set(topic,(map.get(topic)??0)+1);return map;},new Map<string,number>());
      const featureCounts=this.analytics.reduce((map,row)=>map.set(row.feature,(map.get(row.feature)??0)+1),new Map<string,number>());
      const topFeature=[...featureCounts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]??"-";
      return {includesDemo:this.analytics.some(row=>Boolean(row.isDemo)),overview:{totalUses:this.analytics.length,activeSubjects:new Set(this.analytics.map(row=>row.subjectHash)).size,topFeature,summary:"최근 31일간의 익명 집계입니다."},topics:[...topicCounts].map(([text,value])=>({text,value})).sort((a,b)=>b.value-a.value).slice(0,30),rankGap:group("rankGapBucket"),ageGap:group("ageGapBucket"),sameJobFunctionDistribution,surfaceActualGapRate:null,topRepeatedPhrases};
    }
    return {
      includesDemo: true,
      overview: { totalUses: 500 + this.analytics.length, activeSubjects: 84, topFeature: "TRANSLATE", summary: "최근 사용자는 모호한 업무 지시와 보고 타이밍을 가장 자주 확인했습니다. 직급 차이가 큰 그룹에서는 답변 추천 사용이 상대적으로 높았습니다." },
      topics: [{ text: "보고", value: 82 }, { text: "일정", value: 71 }, { text: "마감", value: 62 }, { text: "피드백", value: 55 }, { text: "회의", value: 44 }, { text: "메신저", value: 39 }, { text: "연차", value: 31 }, { text: "실수", value: 28 }],
      rankGap: [{ label: "0", value: 48 }, { label: "1단계", value: 96 }, { label: "2단계", value: 154 }, { label: "3단계+", value: 202 }],
      ageGap: [{ label: "0~5년", value: 73 }, { label: "6~10년", value: 118 }, { label: "11~20년", value: 191 }, { label: "20년+", value: 118 }],
      sameJobFunctionDistribution,
      surfaceActualGapRate: 0,
      topRepeatedPhrases,
    };
  }
  async rollupAnalytics(){return 0;}
  async cleanupExpired() { const now = Date.now(); const expired = [...this.sessions.values()].filter((row) => Date.parse(row.expiresAt) <= now); const sessionUploads = [...this.uploads.values()].filter((row) => Date.parse(row.expiresAt) <= now && !row.completedAt); const globalUploads = [...this.globalUploads.values()].filter((row) => Date.parse(row.expiresAt) <= now && !row.completedAt); const uploads = [...sessionUploads, ...globalUploads].map((row) => row.storagePath); for (const session of expired) await this.deleteSession(session.id); for (const row of sessionUploads) this.uploads.delete(row.id); for (const row of globalUploads) this.globalUploads.delete(row.id); for (const [key,row] of this.adminSessions) if (Date.parse(row.expiresAt) <= now) this.adminSessions.delete(key); return { sessions: expired.length, uploads }; }

  async createAdminSession(tokenHash: string, ipHash: string, expiresAt: string) { const now = new Date().toISOString(); const row: AdminSessionRecord = { id: randomUUID(), tokenHash, ipHash, createdAt: now, lastSeenAt: now, expiresAt }; this.adminSessions.set(tokenHash, row); return row; }
  async findAdminSession(tokenHash: string) { const row = this.adminSessions.get(tokenHash); if (!row || Date.parse(row.expiresAt) <= Date.now()) return null; row.lastSeenAt = new Date().toISOString(); return row; }
  async deleteAdminSession(tokenHash: string) { this.adminSessions.delete(tokenHash); }
  async getAdminLoginAttempt(ipHash: string) { return this.adminAttempts.get(ipHash) ?? null; }
  async recordAdminLoginFailure(ipHash: string) {
    const now = Date.now(); const existing = this.adminAttempts.get(ipHash); const reset = !existing || Date.parse(existing.windowStartedAt) < now - 15 * 60_000;
    const attempts = reset ? 1 : existing.attempts + 1; const row: AdminLoginAttempt = { ipHash, attempts, windowStartedAt: reset ? new Date(now).toISOString() : existing.windowStartedAt, lockedUntil: attempts >= 5 ? new Date(now + 15 * 60_000).toISOString() : existing?.lockedUntil ?? null };
    this.adminAttempts.set(ipHash, row); return row;
  }
  async clearAdminLoginFailures(ipHash: string) { this.adminAttempts.delete(ipHash); }
  async getAdminDashboard(): Promise<AdminDashboard> {
    const now = Date.now(); const day = now - 86_400_000; const live = [...this.sessions.values()].filter((row) => Date.parse(row.expiresAt) > now);
    const counts = { pending: 0, running: 0, failed: 0 }; for (const job of this.jobs.values()) { if (job.status === "PENDING") counts.pending++; if (job.status === "RUNNING") counts.running++; if (job.status === "FAILED") counts.failed++; }
    const pending = [...this.jobs.values()].filter((job) => job.status === "PENDING").sort((a,b) => a.createdAt.localeCompare(b.createdAt))[0];
    const featureUsage = [...this.analytics.filter((row) => Date.parse(row.occurredAt) >= day).reduce((map,row) => map.set(row.feature,(map.get(row.feature) ?? 0) + 1),new Map<string,number>())].map(([feature,value]) => ({ feature, value }));
    const failureReasons = summarizeJobFailures([...this.jobs.values()].filter((job) => job.status === "FAILED").map((job) => job.errorMessage));
    return { generatedAt: new Date(now).toISOString(), sessions: { total: live.length, active15m: live.filter((row) => Date.parse(row.lastSeenAt) >= now - 15 * 60_000).length, new24h: live.filter((row) => Date.parse(row.createdAt) >= day).length, expiring1h: live.filter((row) => Date.parse(row.expiresAt) <= now + 60 * 60_000).length }, usage: { personalBosses: [...this.bosses.values()].filter((row) => row.scope === "SESSION").length, chatMessages24h: [...this.threads.values()].flatMap((row) => row.messages).filter((row) => Date.parse(row.createdAt) >= day).length, translations24h: [...this.translations.values()].filter((row) => Date.parse(row.createdAt) >= day).length }, jobs: { ...counts, oldestPendingMinutes: pending ? Math.floor((now - Date.parse(pending.createdAt)) / 60_000) : null, failureReasons }, uploads: { expiredIncomplete: [...this.uploads.values(), ...this.globalUploads.values()].filter((row) => !row.completedAt && Date.parse(row.expiresAt) <= now).length }, featureUsage, recentOperations: this.adminOperations.slice(-10).reverse() };
  }
  async listAdminSessions(cursor?: string, limit = 20) {
    const rows = [...this.sessions.values()].filter((row) => Date.parse(row.expiresAt) > Date.now() && (!cursor || row.createdAt < cursor)).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); const page = rows.slice(0,limit);
    const items: AdminSessionSummary[] = page.map((row) => ({ id: row.id, createdAt: row.createdAt, lastSeenAt: row.lastSeenAt, expiresAt: row.expiresAt, bossCount: [...this.bosses.values()].filter((boss) => boss.sessionId === row.id).length, chatMessageCount: [...this.threads.values()].filter((thread) => thread.sessionId === row.id).reduce((sum,thread) => sum + thread.messages.length,0), translationCount: [...this.translations.values()].filter((translation) => translation.sessionId === row.id).length }));
    return { items, nextCursor: rows.length > limit ? page.at(-1)?.createdAt ?? null : null };
  }
  async pruneMeaninglessSessions() {
    const meaningless = [...this.sessions.values()].filter((row) => {
      if (Date.parse(row.expiresAt) <= Date.now() || Date.parse(row.lastSeenAt) > Date.now()-86_400_000) return false;
      const hasProfile = this.profiles.has(row.id);
      const hasBoss = [...this.bosses.values()].some((boss) => boss.sessionId === row.id);
      const hasMessages = [...this.threads.values()].some((thread) => thread.sessionId === row.id && thread.messages.length > 0);
      const hasTranslations = [...this.translations.values()].some((translation) => translation.sessionId === row.id);
      return !hasProfile && !hasBoss && !hasMessages && !hasTranslations;
    });
    const storagePaths = [...this.evidence.values()].filter((row) => meaningless.some((session) => session.id === row.sessionId) && row.storagePath).map((row) => row.storagePath!);
    for (const session of meaningless) await this.deleteSession(session.id);
    return { deleted: meaningless.length, storagePaths };
  }
  async listAdminJobs(status?: string, cursor?: string, limit = 20) {
    const rows = [...this.jobs.values()].filter((row) => (!status || row.status === status) && (!cursor || row.createdAt < cursor)).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); const page = rows.slice(0,limit);
    const items: AdminJobSummary[] = page.map((row) => ({ id: row.id, type: row.type, status: row.status, attempts: row.attempts, maxAttempts: row.maxAttempts, errorMessage: safeJobFailureReason(row.errorMessage), retryOf: row.retryOf, createdAt: row.createdAt, updatedAt: row.updatedAt }));
    return { items, nextCursor: rows.length > limit ? page.at(-1)?.createdAt ?? null : null };
  }
  async getPersonalBossDefaults() { return structuredClone(this.personalBossDefaults); }
  async updatePersonalBossDefaults(prompt: string) { this.personalBossDefaults = { prompt, updatedAt: new Date().toISOString() }; return structuredClone(this.personalBossDefaults); }
  async getGlobalBossDefaults() { return structuredClone(this.globalBossDefaults); }
  async updateGlobalBossDefaults(prompt: string) { this.globalBossDefaults = { prompt, updatedAt: new Date().toISOString() }; return structuredClone(this.globalBossDefaults); }
  async getTranslationExamples() { return structuredClone(this.translationExamples); }
  async updateTranslationExamples(examples: TranslationExamplesSettings["examples"]) { this.translationExamples = { examples: structuredClone(examples), updatedAt: new Date().toISOString() }; return structuredClone(this.translationExamples); }
  async recordAdminOperation(type: AdminOperation["type"], status: AdminOperation["status"], detail: AdminOperation["detail"]) { const row: AdminOperation = { id: randomUUID(), type, status, detail, createdAt: new Date().toISOString() }; this.adminOperations.push(row); return row; }
}
