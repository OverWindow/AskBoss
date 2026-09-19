import type { Boss, BossPersona, BossSurveyQuestion, CompanyResearch, TranslationResult, UserProfile } from "../../shared.js";
import type { ChatMessageRecord, EvidenceRecord, GlobalEvidenceRecord, SurveyAnswerRecord } from "../../types.js";

export interface BossChatInput {
  profile: UserProfile | null;
  boss: Boss;
  basePrompt?: string;
  globalPersona?: BossPersona | null;
  summary: string | null;
  messages: ChatMessageRecord[];
  message: string;
}

export interface AiService {
  researchCompany(name: string): Promise<CompanyResearch>;
  extractEvidence(input: { content: string; kind: string }): Promise<{ observations: any[] }>;
  buildPersona(input: { profile: UserProfile | null; boss: Boss; evidence: Array<EvidenceRecord | GlobalEvidenceRecord>; survey: SurveyAnswerRecord[]; basePrompt?: string; globalBoss?: Boss }): Promise<BossPersona>;
  generateSurvey(boss: Boss): Promise<BossSurveyQuestion[]>;
  streamChatWithBoss(input: BossChatInput, signal?: AbortSignal): AsyncIterable<string>;
  streamSimulatedBossReaction(input: { profile: UserProfile | null; boss: Boss; inputText: string; reply: string; channel: string; basePrompt?: string; globalBoss?: Boss }, signal?: AbortSignal): AsyncIterable<string>;
  translateBossMessage(input: { profile: UserProfile | null; boss: Boss; inputText: string; channel: string; basePrompt?: string; globalBoss?: Boss }, signal?: AbortSignal): Promise<TranslationResult>;
  generateMonologue(input: { boss: Boss; previous: string[]; basePrompt?: string; globalBoss?: Boss }): Promise<string>;
  generateHrSummary(data: unknown): Promise<string>;
  health(): Promise<{ ok: boolean; available: string[]; missing: string[]; mode: "live" | "demo" }>;
}
