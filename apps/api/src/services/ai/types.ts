import type { Boss, BossPersona, BossSurveyQuestion, CompanyResearch, TranslationResult, UserProfile } from "@askboss/shared";
import type { ChatMessageRecord, EvidenceRecord, SurveyAnswerRecord } from "../../types.js";

export interface BossChatInput {
  profile: UserProfile | null;
  boss: Boss;
  summary: string | null;
  messages: ChatMessageRecord[];
  message: string;
}

export interface AiService {
  researchCompany(name: string): Promise<CompanyResearch>;
  extractEvidence(input: { content: string; kind: string }): Promise<{ observations: any[] }>;
  buildPersona(input: { profile: UserProfile | null; boss: Boss; evidence: EvidenceRecord[]; survey: SurveyAnswerRecord[] }): Promise<BossPersona>;
  generateSurvey(boss: Boss): Promise<BossSurveyQuestion[]>;
  streamChatWithBoss(input: BossChatInput, signal?: AbortSignal): AsyncIterable<string>;
  translateBossMessage(input: { profile: UserProfile | null; boss: Boss; inputText: string; channel: string }, signal?: AbortSignal): Promise<TranslationResult>;
  generateMonologue(input: { boss: Boss; previous: string[] }): Promise<string>;
  generateHrSummary(data: unknown): Promise<string>;
  health(): Promise<{ ok: boolean; available: string[]; missing: string[]; mode: "live" | "demo" }>;
}
