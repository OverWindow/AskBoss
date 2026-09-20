import type { AdminAiPromptSettings, AdminOperation, Boss, BossPersona, ChatMessage, CompanyResearch, GlobalBossDefaults, PersonalBossDefaults, PkiBreakdown, TranslationArchiveBranch, TranslationArchiveDetail, TranslationExamplesSettings, TranslationResult, UserProfile } from "./shared.js";

export interface SessionRecord { id: string; tokenHash: string; createdAt: string; lastSeenAt: string; expiresAt: string }
export interface EvidenceRecord { id: string; bossId: string; sessionId: string; type: string; status: string; sourceName?: string | null; rawText: string | null; storagePath: string | null; parsedData: any; observedAt: string | null; createdAt: string; updatedAt?: string; expiresAt: string; errorMessage?: string | null; sourceArchiveId?: string | null }
export interface GlobalEvidenceRecord { id: string; bossId: string; type: "TEXT" | "TXT" | "IMAGE" | "SURVEY"; status: "PENDING" | "PROCESSING" | "READY" | "FAILED"; sourceName: string | null; rawText: string | null; storagePath: string | null; parsedData: any; observedAt: string | null; createdAt: string; errorMessage: string | null }
export interface SurveyAnswerRecord { questionId: string; questionSnapshot: Record<string, unknown>; selectedOption: string | null; freeText: string | null }
export interface JobRecord { id: string; sessionId: string | null; bossId: string | null; type: "EVIDENCE_EXTRACT" | "PERSONA_REBUILD" | "CHAT_SUMMARIZE"; status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED"; payload: any; result: any; errorMessage: string | null; attempts: number; maxAttempts: number; leaseUntil: string | null; retryOf: string | null; createdAt: string; updatedAt: string }
export type ChatMessageRecord = ChatMessage;
export interface ChatThreadRecord { id: string; sessionId: string; bossId: string; conversationSummary: string | null; messages: ChatMessageRecord[]; archiveId?: string | null; archiveBranchId?: string | null; createdAt: string; expiresAt: string }
export interface TranslationRecord { id: string; sessionId: string; bossId: string; inputText: string; channel: string; result: TranslationResult; feedback: "GOOD" | "BAD" | null; simulationCount: number; createdAt: string; expiresAt: string }
export interface TranslationArchiveRecord extends TranslationArchiveDetail { ownerHash: string; translationId: string | null; sourceSessionId: string | null }
export type TranslationArchiveBranchRecord = TranslationArchiveBranch;
export interface UploadIntentRecord { id: string; sessionId: string; bossId: string; storagePath: string; originalName: string; contentType: string; sizeBytes: number; completedAt: string | null; expiresAt: string }
export interface GlobalUploadIntentRecord { id: string; bossId: string; storagePath: string; originalName: string; contentType: string; sizeBytes: number; completedAt: string | null; expiresAt: string }
export interface AnalyticsEventInput { eventType: string; feature: string; userAgeBand?: number | null; bossAgeBand?: number | null; rankGapBucket?: string | null; ageGapBucket?: string | null; sameJobFunctionBucket?: string | null; userJobFunction?: string | null; bossJobFunction?: string | null; topicKeywords?: string[]; personaConfidenceBucket?: string | null; isDemo?: boolean }
export interface AdminSessionRecord { id: string; tokenHash: string; ipHash: string; createdAt: string; lastSeenAt: string; expiresAt: string }
export interface AdminLoginAttempt { ipHash: string; attempts: number; windowStartedAt: string; lockedUntil: string | null }
export interface BossRecord extends Boss { sessionId: string | null; expiresAt: string | null }
export interface PersonaBuildResult { persona: BossPersona; pki: PkiBreakdown }
export type { CompanyResearch, UserProfile };
export type { AdminOperation };
export type { AdminAiPromptSettings, GlobalBossDefaults, PersonalBossDefaults, TranslationExamplesSettings };
