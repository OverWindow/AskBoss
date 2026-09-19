import type { Boss, BossPersona, BossSurveyQuestion, CompanyResearch, TranslationResult, UserProfile } from "../../shared.js";
import type { ChatMessageRecord, EvidenceRecord, GlobalEvidenceRecord, SurveyAnswerRecord } from "../../types.js";

export interface BossChatInput {
  profile: UserProfile | null;
  boss: Boss;
  basePrompt?: string;
  globalPersona?: BossPersona | null;
  sessionCalibration?: unknown[];
  summary: string | null;
  messages: ChatMessageRecord[];
  message: string;
}

export interface PersonaBuildInput {
  profile: UserProfile | null;
  boss: Boss;
  evidence: Array<EvidenceRecord | GlobalEvidenceRecord>;
  survey: SurveyAnswerRecord[];
  basePrompt?: string;
  globalBoss?: Boss;
  promptInstruction?: string;
}

export interface AiService {
  researchCompany(name: string, promptInstruction?: string): Promise<CompanyResearch>;
  extractEvidence(input: { content: string; kind: string; promptInstruction?: string }): Promise<{ observations: any[] }>;
  buildPersona(input: PersonaBuildInput): Promise<BossPersona>;
  generateSurvey(boss: Boss, promptInstruction?: string): Promise<BossSurveyQuestion[]>;
  streamChatWithBoss(input: BossChatInput, signal?: AbortSignal): AsyncIterable<string>;
  streamSimulatedBossReaction(input: { profile: UserProfile | null; boss: Boss; inputText: string; reply: string; channel: string; basePrompt?: string; globalBoss?: Boss; sessionCalibration?: unknown[] }, signal?: AbortSignal): AsyncIterable<string>;
  translateBossMessage(input: { profile: UserProfile | null; boss: Boss; inputText: string; channel: string; basePrompt?: string; globalBoss?: Boss; sessionCalibration?: unknown[]; promptInstruction?: string }, signal?: AbortSignal): Promise<TranslationResult>;
  generateMonologue(input: { boss: Boss; previous: string[]; basePrompt?: string; globalBoss?: Boss; sessionCalibration?: unknown[] }): Promise<string>;
  generateHrSummary(data: unknown): Promise<string>;
  health(): Promise<{ ok: boolean; available: string[]; missing: string[]; mode: "live" | "demo" }>;
}
